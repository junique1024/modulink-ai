"use client";

/** 아두이노가 보내는 상태 한 줄 */
export interface RobotState {
  a: number; // 각도 (°)
  v: number; // 회전 속도 (°/s)
  al: 0 | 1; // 과속 경보
  t: number; // 과속 기준값 (°/s)
  m: 0 | 1; // 버저 음소거
}

export function parseState(line: string): RobotState | null {
  try {
    const o = JSON.parse(line.trim());
    if (typeof o.a !== "number" || typeof o.v !== "number") return null;
    return { a: o.a, v: o.v, al: o.al ? 1 : 0, t: Number(o.t) || 250, m: o.m ? 1 : 0 };
  } catch {
    return null;
  }
}

/* ---------------- USB 시리얼 (Web Serial: 크롬·엣지 PC) ---------------- */

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

export const serialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

export class SerialLink {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private stopped = false;

  async connect(onLine: (line: string) => void, onClose: (reason?: string) => void) {
    const serial = (navigator as unknown as { serial: { requestPort(): Promise<SerialPortLike> } }).serial;
    this.port = await serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.stopped = false;
    void this.readLoop(onLine, onClose);
  }

  private async readLoop(onLine: (l: string) => void, onClose: (r?: string) => void) {
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (this.port?.readable && !this.stopped) {
        this.reader = this.port.readable.getReader();
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (line.trim()) onLine(line);
          }
          if (buf.length > 2000) buf = "";
        }
        this.reader.releaseLock();
      }
      if (!this.stopped) onClose("연결이 끊겼어요");
    } catch (e) {
      if (!this.stopped) onClose((e as Error).message);
    }
  }

  async send(cmd: string) {
    if (!this.port?.writable) return;
    const w = this.port.writable.getWriter();
    try {
      await w.write(new TextEncoder().encode(cmd + "\n"));
    } finally {
      w.releaseLock();
    }
  }

  async disconnect() {
    this.stopped = true;
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
  }
}

/* ---------------- 실시간 중계 (MQTT over WebSocket, 공개 무료 브로커) ---------------- */

// 여러 공개 브로커에 동시에 연결 → 어느 하나만 통해도 중계됨 (학교·회사망에서 특정 포트가 막혀도 버팀)
const BROKERS = (process.env.NEXT_PUBLIC_MQTT_URL
  ? [process.env.NEXT_PUBLIC_MQTT_URL]
  : [
      "wss://broker.emqx.io:8084/mqtt",
      "wss://broker.hivemq.com:8884/mqtt",
      "wss://public:public@public.cloud.shiftr.io", // 443 포트
      "wss://test.mosquitto.org:8081/mqtt",
    ]);

const topic = (code: string, kind: "state" | "cmd") => `modulink-ai/v1/${code}/${kind}`;

type MqttClient = {
  on(ev: string, cb: (...a: unknown[]) => void): void;
  subscribe(t: string, o?: object): void;
  publish(t: string, m: string, o?: object): void;
  end(force?: boolean): void;
  connected: boolean;
};

export class RelayLink {
  private clients: MqttClient[] = [];
  private seq = 0;
  private lastSeen = new Map<string, number>();

  async open(
    code: string,
    role: "sender" | "monitor",
    handlers: { onState?: (s: RobotState) => void; onCmd?: (c: string) => void; onStatus: (s: "connecting" | "online" | "offline") => void },
  ) {
    const mqtt = (await import("mqtt")).default;
    const id = Math.random().toString(16).slice(2, 10);
    const report = () => {
      const n = this.clients.filter((c) => c.connected).length;
      handlers.onStatus(n > 0 ? "online" : "connecting");
    };
    handlers.onStatus("connecting");
    for (const url of BROKERS) {
      let c: MqttClient;
      try {
        c = mqtt.connect(url, { clientId: `modulink-${role}-${id}`, connectTimeout: 8000, reconnectPeriod: 3000, clean: true }) as unknown as MqttClient;
      } catch { continue; }
      this.clients.push(c);
      c.on("connect", () => { c.subscribe(topic(code, role === "monitor" ? "state" : "cmd"), { qos: 0 }); report(); });
      c.on("close", report);
      c.on("offline", report);
      c.on("error", () => {});
      c.on("message", (_t, payload) => {
        const text = String(payload);
        if (role === "monitor") {
          // 같은 메시지가 여러 브로커로 들어오면 한 번만 처리
          try {
            const o = JSON.parse(text);
            if (typeof o.q === "number" && o.src) {
              const prev = this.lastSeen.get(o.src) ?? -1;
              if (o.q <= prev && prev - o.q < 1000) return;
              this.lastSeen.set(o.src, o.q);
            }
          } catch {}
          const s = parseState(text);
          if (s) handlers.onState?.(s);
        } else {
          const m = /^(c_\d+):(.*)$/.exec(text);
          const key = m ? m[1] : "";
          const body = m ? m[2] : text;
          if (key) {
            const k = Number(key.split("_")[1] ?? -1);
            const prev = this.lastSeen.get("cmd") ?? -1;
            if (k >= 0 && k <= prev) return;
            if (k >= 0) this.lastSeen.set("cmd", k);
          }
          handlers.onCmd?.(body);
        }
      });
    }
  }

  private pub(t: string, m: string) {
    for (const c of this.clients) if (c.connected) c.publish(t, m, { qos: 0 });
  }

  publishState(code: string, s: RobotState) {
    this.pub(topic(code, "state"), JSON.stringify({ ...s, q: ++this.seq, src: this.src }));
  }

  publishCmd(code: string, cmd: string) {
    this.pub(topic(code, "cmd"), `c_${Date.now()}:${cmd}`);
  }

  private src = Math.random().toString(36).slice(2, 8);

  close() {
    for (const c of this.clients) { try { c.end(true); } catch {} }
    this.clients = [];
  }
}

/* ---------------- 경고음 (발표 PC에서도 소리) ---------------- */
export class Beeper {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  unlock() {
    try {
      this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      void this.ctx.resume();
    } catch {}
  }
  get ready() { return !!this.ctx && this.ctx.state === "running"; }
  start() {
    if (!this.ctx || this.osc) return;
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.osc.type = "square";
    this.osc.frequency.value = 1400;
    this.gain.gain.value = 0;
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start();
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 400; i++) this.gain.gain.setValueAtTime(i % 2 ? 0 : 0.06, t0 + i * 0.15);
  }
  stop() {
    try { this.osc?.stop(); } catch {}
    this.osc = null;
    this.gain = null;
  }
}
