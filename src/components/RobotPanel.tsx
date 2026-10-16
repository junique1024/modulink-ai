"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Beeper, parseState, RelayLink, type RobotState, SerialLink, serialSupported } from "@/features/robot/link";

type Mode = "sender" | "monitor";
type Status = "idle" | "connecting" | "online" | "offline" | "error";
interface AlarmEvent { at: number; peak: number; threshold: number }

const CODE_KEY = "modulink-ai.robot.code";
const newCode = () => String(Math.floor(1000 + Math.random() * 9000));
const STALE_MS = 2500;

/**
 * 로봇 연동 탭
 * - 송신(내 PC): USB로 연결한 아두이노 값을 읽어 화면에 표시 + 실시간 중계
 * - 모니터(발표 PC): 같은 연결 코드로 값을 받아 표시만 함
 * - 과속 경보가 오면 어느 탭에 있든 화면 전체가 빨갛게 깜빡이고 경고음
 */
export default function RobotPanel({ visible }: { visible: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [serialStatus, setSerialStatus] = useState<Status>("idle");
  const [relayStatus, setRelayStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<RobotState | null>(null);
  const [lastAt, setLastAt] = useState(0);
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<AlarmEvent[]>([]);
  const [trail, setTrail] = useState<number[]>([]);
  const [threshold, setThreshold] = useState(200);
  const [soundOn, setSoundOn] = useState(false);
  const [canSerial, setCanSerial] = useState(true);

  const serial = useRef<SerialLink | null>(null);
  const relay = useRef<RelayLink | null>(null);
  const beeper = useRef<Beeper | null>(null);
  const prevAlarm = useRef(false);
  const peak = useRef(0);
  const lastPub = useRef(0);
  const codeRef = useRef("");

  // 주기적 시계 (신호 끊김 판단용)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => { void serial.current?.disconnect(); relay.current?.close(); beeper.current?.stop(); }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 기능 확인은 마운트 후에만 가능
  useEffect(() => { setCanSerial(serialSupported()); }, []);

  const fresh = state !== null && now - lastAt < STALE_MS;
  const alarm = fresh && state?.al === 1;

  // 상태 한 건 반영 (송신·모니터 공통)
  const apply = (s: RobotState) => {
    const t = Date.now();
    setState(s);
    setLastAt(t);
    setNow(t);
    setTrail((prev) => [...prev.slice(-99), s.v]);
    if (s.al) peak.current = Math.max(peak.current, s.v);
    if (s.al && !prevAlarm.current) peak.current = s.v;
    if (!s.al && prevAlarm.current) {
      setHistory((h) => [{ at: t, peak: Math.round(peak.current), threshold: s.t }, ...h].slice(0, 20));
    }
    prevAlarm.current = !!s.al;
  };

  // 경고음
  useEffect(() => {
    if (alarm && soundOn) beeper.current?.start();
    else beeper.current?.stop();
  }, [alarm, soundOn]);

  const unlockSound = () => {
    beeper.current ??= new Beeper();
    beeper.current.unlock();
    setSoundOn(true);
  };

  /* ---------- 송신 (내 PC + 아두이노) ---------- */
  const startSender = async () => {
    setError(null);
    unlockSound();
    let c = "";
    try { c = localStorage.getItem(CODE_KEY) || ""; } catch {}
    if (!/^\d{4}$/.test(c)) c = newCode();
    try { localStorage.setItem(CODE_KEY, c); } catch {}
    setCode(c);
    codeRef.current = c;
    setMode("sender");
    setSerialStatus("connecting");
    try {
      serial.current = new SerialLink();
      await serial.current.connect(
        (line) => {
          const s = parseState(line);
          if (!s) return;
          apply(s);
          const t = Date.now();
          if (t - lastPub.current > 100 || s.al) { lastPub.current = t; relay.current?.publishState(codeRef.current, s); }
        },
        (reason) => { setSerialStatus("error"); setError(`아두이노 연결이 끊겼어요${reason ? ` (${reason})` : ""}`); },
      );
      setSerialStatus("online");
    } catch (e) {
      setSerialStatus("error");
      const msg = (e as Error).message || "";
      setError(/No port selected|cancel/i.test(msg) ? "포트를 선택하지 않았어요. 다시 [아두이노 연결]을 눌러 주세요." : `연결 실패: ${msg}`);
      return;
    }
    relay.current = new RelayLink();
    void relay.current.open(c, "sender", { onStatus: setRelayStatus });
  };

  const sendCmd = (cmd: string) => void serial.current?.send(cmd);

  /* ---------- 모니터 (발표 PC) ---------- */
  const startMonitor = (given?: string) => {
    const c = given ?? codeInput;
    if (!/^\d{4}$/.test(c)) { setError("4자리 연결 코드를 입력해 주세요."); return; }
    setError(null);
    if (!given) unlockSound();
    setCode(c);
    setMode("monitor");
    relay.current = new RelayLink();
    void relay.current.open(c, "monitor", { onStatus: setRelayStatus, onState: apply });
  };
  // QR로 들어온 경우(?watch=1234): 코드 입력 없이 바로 모니터 시작
  const startMonitorRef = useRef(startMonitor);
  useEffect(() => { startMonitorRef.current = startMonitor; });
  useEffect(() => {
    const w = new URLSearchParams(location.search).get("watch");
    if (w && /^\d{4}$/.test(w)) startMonitorRef.current(w);
  }, []);
  // 관람객용 QR (이 코드로 바로 모니터 화면이 열림)
  const [qr, setQr] = useState<{ url: string; svg: string } | null>(null);
  useEffect(() => {
    if (!code) return;
    const url = `${location.origin}/?watch=${code}#robot`;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((svg) => setQr({ url, svg }))
      .catch(() => setQr(null));
  }, [code]);

  const stopAll = async () => {
    await serial.current?.disconnect();
    relay.current?.close();
    beeper.current?.stop();
    serial.current = null;
    relay.current = null;
    setMode(null);
    setSerialStatus("idle");
    setRelayStatus("idle");
    setState(null);
    setTrail([]);
    prevAlarm.current = false;
  };

  const statusText = (s: Status) => ({ idle: "대기", connecting: "연결 중…", online: "연결됨", offline: "끊김 · 재연결 중", error: "오류" })[s];
  const speedPct = state ? Math.min(100, (state.v / Math.max(1, state.t)) * 100) : 0;

  return (
    <>
      {/* 과속 경보: 어느 탭에서든 화면 전체에 표시 */}
      {alarm && (
        <div className="robot-alarm" role="alert" aria-live="assertive">
          <div className="robot-alarm-box">
            <div className="ra-icon">⚠</div>
            <b>속도 제한 초과</b>
            <p>회전 속도 {state?.v}°/s · 기준 {state?.t}°/s<br />로봇을 정지했습니다. 천천히 조작하면 자동으로 해제됩니다.</p>
            {!soundOn && <button type="button" className="btn small" onClick={unlockSound}>경고음 켜기</button>}
          </div>
        </div>
      )}

      <section className="card robot-card" id="robot" hidden={!visible}>
        <h2>로봇 연동</h2>
        <p className="desc">USB로 연결한 ModuLink 데모 로봇(아두이노)의 상태를 실시간으로 받아, 회전 속도가 안전 기준을 넘으면 즉시 경보합니다.</p>

        {!mode && (
          <div className="robot-modes">
            <div className="rm">
              <span className="tag-s">이 PC에 로봇이 연결되어 있어요</span>
              <b>로봇 연결 (송신)</b>
              <p>USB로 꽂은 아두이노를 연결하고, 값을 다른 화면으로도 실시간 전송합니다.</p>
              <button type="button" className="btn" onClick={startSender} disabled={!canSerial}>아두이노 연결</button>
              {!canSerial && <small className="warn">이 브라우저는 USB 연결을 지원하지 않아요. PC의 크롬 또는 엣지에서 열어 주세요.</small>}
            </div>
            <div className="rm">
              <span className="tag-s">발표 화면 · 다른 PC</span>
              <b>모니터 (수신)</b>
              <p>로봇이 연결된 PC에 표시된 4자리 코드를 입력하면 같은 값을 실시간으로 봅니다.</p>
              <div className="code-row">
                <input inputMode="numeric" maxLength={4} placeholder="0000" value={codeInput} aria-label="연결 코드"
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => { if (e.key === "Enter") startMonitor(); }} />
                <button type="button" className="btn" onClick={() => startMonitor()}>모니터 시작</button>
              </div>
            </div>
          </div>
        )}
        {error && <p className="desc warn" role="alert">{error}</p>}

        {mode && (
          <>
            <div className="robot-bar">
              <span className="pill">{mode === "sender" ? "송신 · 로봇 연결 PC" : "모니터 · 수신 전용"}</span>
              <span className="code">연결 코드 <b>{code}</b></span>
              {mode === "sender" && <span className={`st ${serialStatus}`}>● 아두이노 {statusText(serialStatus)}</span>}
              <span className={`st ${relayStatus}`}>● 실시간 중계 {statusText(relayStatus)}</span>
              <span className={`st ${fresh ? "online" : "offline"}`}>● 신호 {fresh ? "수신 중" : "없음"}</span>
              <button type="button" className="link" onClick={stopAll}>연결 종료</button>
            </div>
            {mode === "sender" && <p className="hint-s">발표 PC에서 [로봇 연동] → [모니터]에 코드 <b>{code}</b>를 입력하거나, 아래 QR을 찍으면 같은 화면을 볼 수 있어요.</p>}
            {qr && (
              <div className="robot-qr">
                <div className="qr-img" aria-label="실시간 모니터 QR 코드" dangerouslySetInnerHTML={{ __html: qr.svg }} />
                <div className="qr-txt">
                  <b>휴대폰으로 함께 보기</b>
                  <span>카메라로 QR을 찍으면 코드 입력 없이 이 로봇의 실시간 상태와 경보가 바로 열립니다.</span>
                  <code>{qr.url.replace(/^https?:\/\//, "")}</code>
                </div>
              </div>
            )}

            <div className="robot-grid">
              <div className="gauge">
                <div className="g-title">서보 각도</div>
                <svg viewBox="0 0 200 120" className="dial" role="img" aria-label={`각도 ${state?.a ?? 0}도`}>
                  <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="#e8e8ed" strokeWidth="14" strokeLinecap="round" />
                  <line x1="100" y1="110" x2={100 - 72 * Math.cos(((state?.a ?? 90) * Math.PI) / 180)} y2={110 - 72 * Math.sin(((state?.a ?? 90) * Math.PI) / 180)}
                    stroke={alarm ? "#d93025" : "#0071e3"} strokeWidth="6" strokeLinecap="round" style={{ transition: "all .08s linear" }} />
                  <circle cx="100" cy="110" r="9" fill="#1d1d1f" />
                </svg>
                <div className="g-val">{fresh ? `${state?.a}°` : "—"}</div>
              </div>
              <div className="gauge">
                <div className="g-title">회전 속도</div>
                <div className={`g-big ${alarm ? "red" : speedPct > 70 ? "orange" : ""}`}>{fresh ? state?.v : "—"}<small>°/s</small></div>
                <div className="speedbar"><div style={{ width: `${speedPct}%` }} className={alarm ? "red" : speedPct > 70 ? "orange" : ""} /><span className="limit" title="기준값" /></div>
                <div className="g-sub">기준 {state?.t ?? threshold}°/s {state?.m ? "· 버저 음소거" : ""}</div>
              </div>
              <div className="gauge">
                <div className="g-title">상태</div>
                <div className={`led ${!fresh ? "off" : alarm ? "red" : "green"}`} aria-hidden />
                <div className="g-val">{!fresh ? "신호 없음" : alarm ? "과속 경보 · 정지" : "정상 운전"}</div>
              </div>
            </div>

            <div className="trail">
              <div className="g-title">최근 회전 속도 (약 10초)</div>
              <svg viewBox="0 0 400 80" preserveAspectRatio="none" role="img" aria-label="최근 회전 속도 그래프">
                {state && <line x1="0" x2="400" y1={80 - Math.min(78, (state.t / Math.max(state.t * 1.6, ...trail, 1)) * 78)} y2={80 - Math.min(78, (state.t / Math.max(state.t * 1.6, ...trail, 1)) * 78)} stroke="#d93025" strokeDasharray="4 4" strokeWidth="1.5" />}
                <polyline fill="none" stroke="#0071e3" strokeWidth="2"
                  points={trail.map((v, i) => `${(i / 99) * 400},${80 - Math.min(78, (v / Math.max((state?.t ?? 250) * 1.6, ...trail, 1)) * 78)}`).join(" ")} />
              </svg>
            </div>

            {mode === "sender" && (
              <div className="robot-ctrl">
                <label htmlFor="thr">과속 기준 <b>{threshold}°/s</b> <small>— 낮출수록 민감</small></label>
                <input id="thr" className="range" type="range" min={60} max={600} step={10} value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  onMouseUp={() => sendCmd(`T:${threshold}`)} onTouchEnd={() => sendCmd(`T:${threshold}`)} onKeyUp={() => sendCmd(`T:${threshold}`)} />
                <div className="row-btns">
                  <button type="button" className="btn gray small" onClick={() => sendCmd("X")}>경보 테스트 (2초)</button>
                  <button type="button" className="btn gray small" onClick={() => sendCmd(state?.m ? "M:0" : "M:1")}>{state?.m ? "버저 켜기" : "버저 음소거"}</button>
                  {!soundOn && <button type="button" className="btn gray small" onClick={unlockSound}>화면 경고음 켜기</button>}
                </div>
              </div>
            )}
            {mode === "monitor" && !soundOn && (
              <div className="row-btns"><button type="button" className="btn gray small" onClick={unlockSound}>화면 경고음 켜기</button></div>
            )}

            <div className="alarm-log">
              <div className="g-title">경보 이력 {history.length > 0 && <span className="count">{history.length}</span>}</div>
              {history.length === 0 ? <p className="desc">아직 경보가 없어요. 엔코더 손잡이를 빠르게 돌려 보세요.</p> : (
                <ul>{history.map((h) => {
                  const d = new Date(h.at);
                  return <li key={h.at}><b>{`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`}</b> 과속 감지 · 최고 {h.peak}°/s (기준 {h.threshold}°/s) → 자동 정지 후 해제</li>;
                })}</ul>
              )}
            </div>
          </>
        )}
        <p className="disclaimer">※ 데모용 소형 로봇(아두이노 UNO · 로터리 엔코더 · SG90 서보)입니다. 엔코더 버튼을 누르면 서보가 가운데(90°)로 돌아갑니다. 속도 제한 기준은 안전 체크리스트의 &apos;협동 운전 조건(속도·힘 제한)&apos;을 시연하기 위한 값입니다.</p>
      </section>
    </>
  );
}
