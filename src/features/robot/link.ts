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

const BROKERS = (process.env.NEXT_PUBLIC_MQTT_URL
  ? [process.env.NEXT_PUBLIC_MQTT_URL]
  : ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"]);

const topic = (code: string, kind: "state" | "cmd") => `modulink-ai/v1/${code}/${kind}`;

type MqttClient = {
  on(ev: string, cb: (...a: unknown[]) => void): void;
  subscribe(t: string, o?: object): void;
  publish(t: string, m: string, o?: object): void;
  end(force?: boolean): void;
  connected: boolean;
};

export class RelayLink {
  private client: MqttClient | null = null;
  private brokerIdx = 0;

  async open(
    code: string,
    role: "sender" | "monitor",
    handlers: { onState?: (s: RobotState) => void; onCmd?: (c: string) => void; onStatus: (s: "connecting" | "online" | "offline") => void },
  ) {
    const mqtt = (await import("mqtt")).default;
    const tryConnect = () => {
      const url = BROKERS[this.brokerIdx % BROKERS.length];
      handlers.onStatus("connecting");
      const c = mqtt.connect(url, {
        clientId: `modulink-${role}-${Math.random().toString(16).slice(2, 10)}`,
        connectTimeout: 6000,
        reconnectPeriod: 2000,
        clean: true,
      }) as unknown as MqttClient;
      this.client = c;
      let everConnected = false;
      c.on("connect", () => {
        everConnected = true;
        handlers.onStatus("online");
        c.subscribe(topic(code, role === "monitor" ? "state" : "cmd"), { qos: 0 });
      });
      c.on("message", (_t, payload) => {
        const text = String(payload);
        if (role === "monitor") {
          const s = parseState(text);
          if (s) handlers.onState?.(s);
        } else handlers.onCmd?.(text);
      });
      c.on("offline", () => handlers.onStatus("offline"));
      c.on("error", () => {
        // 첫 브로커가 막혀 있으면 다음 브로커로 전환
        if (!everConnected && BROKERS.length > 1) {
          c.end(true);
          this.brokerIdx++;
          if (this.brokerIdx < BROKERS.length * 2) setTimeout(tryConnect, 300);
        }
      });
    };
    tryConnect();
  }

  publishState(code: string, s: RobotState) {
    if (this.client?.connected) this.client.publish(topic(code, "state"), JSON.stringify(s), { qos: 0 });
  }

  publishCmd(code: string, cmd: string) {
    if (this.client?.connected) this.client.publish(topic(code, "cmd"), cmd, { qos: 0 });
  }

  close() {
    try { this.client?.end(true); } catch {}
    this.client = null;
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
