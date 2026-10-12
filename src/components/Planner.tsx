"use client";

import { useEffect, useRef, useState } from "react";
import { parseNatural } from "@/features/ai/actions";
import { INSPECTION_TEXT, type ParsedField } from "@/features/ai/parse";
import { buildChecklist } from "@/features/modules/checklist";
import { formatPayback, recommend, RULES, traceRecommend, won } from "@/features/modules/recommend";
import type { InspectionLevel, Recommendation, RobotModule, TaskInput } from "@/features/modules/types";
import AnalysisOverlay, { type AnalysisStep } from "./AnalysisOverlay";
import RoiChart from "./RoiChart";

/**
 * 단계별 표시 시간 (매번 랜덤)
 * - 전체 시간: 약 1~2.5초 사이에서 매번 다르게 → 항상 느리지 않음
 * - 단계 비중: 조합 호환 검사처럼 무거운 단계는 길게, 검토 조합이 많을수록 조금 더 길게
 * - 단계마다 ±30% 흔들림 → 매번 다른 리듬
 */
const rand = (a: number, b: number) => a + Math.random() * (b - a);
function planDurations(combos: number): number[] {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const total = reduce ? 800 : rand(1000, 2400);
  const weights = [1.0, 0.6, 0.8, 1.6 + Math.min(combos, 20) * 0.1, 0.7, 1.1].map((w) => w * rand(0.7, 1.3));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.round((w / sum) * total));
}
const sleep = (ms: number, skip: { current: boolean }) =>
  new Promise<void>((resolve) => {
    if (skip.current) return resolve();
    const t0 = Date.now();
    const tick = () => (skip.current || Date.now() - t0 >= ms ? resolve() : setTimeout(tick, 30));
    tick();
  });

export const INITIAL: TaskInput = {
  taskName: "",
  loadKg: 50,
  distanceM: 80,
  inspection: "basic",
  pickKg: 10,
  workers: 2,
  laborCost: 4500,
  replaceRate: 70,
};

const EXAMPLES = [
  "하중 50kg 물품을 A에서 B로 80m 옮긴 뒤 외관 검사까지, 작업자 2명 대체",
  "200kg 부품 상자를 100m 이송, 로봇팔로 25kg 부품을 꺼내고 치수 정밀 검사, 2교대 2명",
  "30kg 박스를 50m 옮기기만 하면 돼요, 검사는 필요 없음, 1명, 연봉 4000만원",
];

const FIELD_DEFAULT_TEXT: Record<ParsedField, (v: TaskInput) => string> = {
  loadKg: (v) => `옮기는 무게 ${v.loadKg}kg`,
  pickKg: (v) => (v.pickKg > 0 ? `로봇팔로 집는 무게 ${v.pickKg}kg` : "로봇팔 없음"),
  distanceM: (v) => `이동 거리 ${v.distanceM}m`,
  inspection: (v) => INSPECTION_TEXT[v.inspection],
  workers: (v) => `대체 인원 ${v.workers}명`,
  laborCost: (v) => `인건비 ${v.laborCost.toLocaleString("ko-KR")}만원`,
  replaceRate: (v) => `업무 대체율 ${v.replaceRate}%`,
};

type NumKey = "loadKg" | "distanceM" | "pickKg" | "workers" | "laborCost" | "replaceRate";
const LIMIT: Record<NumKey, number> = { loadKg: 5000, distanceM: 5000, pickKg: 5000, workers: 100, laborCost: 100000, replaceRate: 100 };

interface Props {
  modules: RobotModule[];
  onSave: (input: TaskInput) => Promise<void>;
  saving: boolean;
  savedKey: string | null; // 마지막으로 저장한 조건 (같은 결과 중복 저장 방지)
  onResult?: () => void; // 첫 결과가 나오면 목차의 '추천 결과'를 활성화
}

export default function Planner({ modules, onSave, saving, savedKey, onResult }: Props) {
  const [input, setInput] = useState<TaskInput>(INITIAL);
  const [result, setResult] = useState<{ rec: Recommendation; input: TaskInput } | null>(null);
  const [nl, setNl] = useState("");
  const [understood, setUnderstood] = useState<{ items: string[]; defaults: string[]; engine: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [stale, setStale] = useState(false);
  const reqId = useRef(0);
  const [analysis, setAnalysis] = useState<{ steps: AnalysisStep[]; done: number } | null>(null);
  const skipRef = useRef(false);
  const busy = parsing || analysis !== null;

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
    if (result) setStale(true); // 결과는 남기되 "다시 계산 필요" 표시
  };
  const numField = (key: NumKey) => ({
    id: key,
    name: key,
    type: "number" as const,
    inputMode: "decimal" as const,
    min: 0,
    max: LIMIT[key],
    value: Number.isFinite(input[key]) ? input[key] : 0,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, Math.min(LIMIT[key], Math.max(0, Number(e.target.value) || 0))),
  });

  const showResult = (fixed: TaskInput) => {
    setResult({ rec: recommend(fixed, modules), input: fixed });
    setStale(false);
    onResult?.();
    setTimeout(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  /** 실제 계산 단계를 순서대로 보여준 뒤 결과 표시 */
  const runRecommend = async (
    next: TaskInput,
    first: AnalysisStep = { label: "입력 조건 확인", detail: "작업 조건 7개 항목" },
    my = ++reqId.current,
    fresh = true,
    plan?: number[],
  ) => {
    const fixed = { ...next, taskName: next.taskName.trim() || "이름 없는 작업" };
    const t = traceRecommend(fixed, modules);
    const steps: AnalysisStep[] = [
      first,
      { label: "모듈 카탈로그 탐색", detail: `모듈 ${t.total}개 (주행 베이스 ${t.bases} · 로봇팔 ${t.arms} · 검사 센서 ${t.sensors})` },
      t.armNeeded
        ? { label: "로봇팔 가반 하중 필터", detail: `집는 무게 ${fixed.pickKg}kg × 안전율 ${RULES.SAFETY_MARGIN} → 후보 ${t.armCandidates}개` }
        : { label: "로봇팔 필요 여부 확인", detail: "집는 작업 없음 → 로봇팔 제외" },
      {
        label: "적재 용량 · 장착 규격 호환 검사",
        detail: `조합 ${t.combos}개 검토 → 적재 초과 ${t.rejectedCapacity}개 · 규격 불일치 ${t.rejectedMount}개 탈락`,
      },
      { label: "최저 비용 조합 선택", detail: t.feasible > 0 ? `통과한 ${t.feasible}개 중 최저가 조합` : "조건을 만족하는 조합 없음" },
      { label: "투자 회수 기간 · 안전 검토 항목 계산", detail: `대체율 ${fixed.replaceRate}% · 설치비 ${RULES.INTEGRATION_RATE * 100}% · 유지보수비 연 ${RULES.MAINTENANCE_RATE * 100}% 반영` },
    ];
    if (fresh) skipRef.current = false; // 문장 해석에서 이어질 땐 '건너뛰기' 상태 유지
    const ms = plan ?? planDurations(t.combos);
    if (fresh) {
      // 직접 입력: 첫 단계(조건 확인)도 잠깐 진행 표시
      setAnalysis({ steps, done: 0 });
      await sleep(ms[0], skipRef);
    }
    for (let i = 1; i <= steps.length; i++) {
      if (my !== reqId.current) return;
      setAnalysis({ steps, done: i });
      if (i < steps.length) await sleep(ms[i], skipRef);
    }
    await sleep(150, skipRef);
    if (my !== reqId.current) return;
    setAnalysis(null);
    showResult(fixed);
  };

  const onNatural = async (text = nl) => {
    if (!text.trim() || busy) return;
    const my = ++reqId.current;
    setParsing(true);
    skipRef.current = false;
    setAnalysis({ steps: [{ label: "요청 문장 해석" }, { label: "모듈 카탈로그 탐색" }, { label: "로봇팔 가반 하중 필터" }, { label: "적재 용량 · 장착 규격 호환 검사" }, { label: "최저 비용 조합 선택" }, { label: "투자 회수 기간 · 안전 검토 항목 계산" }], done: 0 });
    try {
      const plan = planDurations(6);
      const [r] = await Promise.all([parseNatural(text), sleep(plan[0], skipRef)]);
      if (my !== reqId.current) return; // 더 최근 요청이 있으면 무시
      // 매번 기본값에서 출발 → 이전 예시 값이 섞이지 않음
      const next: TaskInput = { ...INITIAL, ...r.patch };
      const missing = (Object.keys(FIELD_DEFAULT_TEXT) as ParsedField[]).filter((k) => r.patch[k] === undefined);
      setInput(next);
      setUnderstood({
        items: r.understood,
        defaults: missing.map((k) => FIELD_DEFAULT_TEXT[k](next)),
        engine: r.engine === "claude" ? "Claude AI 해석" : "규칙 기반 해석",
      });
      setParsing(false);
      await runRecommend(next, { label: "요청 문장 해석", detail: `${r.engine === "claude" ? "Claude AI" : "규칙 기반"} · 조건 ${r.understood.length}개 인식${missing.length ? `, ${missing.length}개는 기본값` : ""}` }, my, false, plan);
    } catch {
      setAnalysis(null);
      setUnderstood({ items: [], defaults: [], engine: "해석 실패 — 아래 입력란에 직접 입력해 주세요" });
    } finally {
      if (my === reqId.current) setParsing(false);
    }
  };

  // 첫 화면의 '예시로 체험하기' 버튼 → 예시 문장 실행
  const onNaturalRef = useRef(onNatural);
  useEffect(() => { onNaturalRef.current = onNatural; });
  useEffect(() => {
    const h = (e: Event) => {
      const ex = EXAMPLES[Number((e as CustomEvent).detail) || 0];
      setNl(ex);
      document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
      onNaturalRef.current(ex);
    };
    window.addEventListener("modulink:example", h);
    return () => window.removeEventListener("modulink:example", h);
  }, []);

  const ok = result?.rec.ok ? result.rec : null;

  return (
    <div>
      {analysis && <AnalysisOverlay steps={analysis.steps} done={analysis.done} onSkip={() => { skipRef.current = true; }} />}
      {/* 0. 말로 요청하기 */}
      <section className="card" id="ask">
        <h2>말로 요청하기</h2>
        <p className="desc">현장에서 하고 싶은 일을 평소 말투로 적으면, 조건을 채우고 바로 추천합니다.</p>
        <textarea className="nl" rows={3} maxLength={500} value={nl} aria-label="요청 문장"
          placeholder="예) 하중 50kg 물품을 A에서 B로 옮긴 뒤 외관 검사까지, 작업자 2명 대체"
          onChange={(e) => setNl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onNatural(); } }} />
        <div className="chips">
          <span className="chips-label">예시</span>
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" disabled={busy} onClick={() => { setNl(ex); onNatural(ex); }}>{ex}</button>
          ))}
        </div>
        <div className="row-btns">
          <button type="button" className="btn" disabled={busy || !nl.trim()} onClick={() => onNatural()}>
            {busy ? "계산 중…" : "조건 채우고 추천받기"}
          </button>
        </div>
        {understood && (
          <div className="understood" role="status">
            <b>이렇게 이해했어요</b> <span className="engine">{understood.engine}</span>
            <div>
              {understood.items.length
                ? understood.items.map((u) => <span key={u} className="tag">{u}</span>)
                : <span className="hint">문장에서 숫자 조건을 찾지 못해 기본값으로 계산했어요. 무게(kg)·인원(명)을 넣어 보세요.</span>}
            </div>
            {understood.defaults.length > 0 && (
              <div className="defaults">
                <span className="dlabel">문장에 없어 기본값 사용</span>
                {understood.defaults.map((d) => <span key={d} className="tag gray">{d}</span>)}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 1. 작업 조건 확인·수정 */}
      <section className="card" id="conditions">
        <h2>1. 작업 조건 확인·수정</h2>
        <p className="desc">직접 입력하거나, 위에서 채워진 값을 고친 뒤 다시 추천받을 수 있습니다.</p>
        <form className="grid" onSubmit={(e) => { e.preventDefault(); if (!busy) runRecommend(input); }}>
          <div className="full">
            <label htmlFor="taskName">작업 이름</label>
            <input id="taskName" maxLength={80} value={input.taskName} placeholder="예) 2라인 완제품 이송 후 외관 검사"
              onChange={(e) => set("taskName", e.target.value)} />
          </div>
          <div><label htmlFor="loadKg">옮기는 무게 (kg)</label><input {...numField("loadKg")} /></div>
          <div><label htmlFor="distanceM">1회 이동 거리 (m)</label><input {...numField("distanceM")} /></div>
          <div>
            <label htmlFor="inspection">외관 검사</label>
            <select id="inspection" value={input.inspection} onChange={(e) => set("inspection", e.target.value as InspectionLevel)}>
              <option value="none">필요 없음</option>
              <option value="basic">기본 검사 (찍힘·오염)</option>
              <option value="precise">정밀 검사 (치수·미세 결함)</option>
            </select>
          </div>
          <div><label htmlFor="pickKg">로봇팔로 집는 무게 (kg, 불필요 시 0)</label><input {...numField("pickKg")} /></div>
          <div><label htmlFor="workers">대체되는 작업 인원 (명)</label><input {...numField("workers")} step={0.5} /></div>
          <div><label htmlFor="laborCost">1인당 연 인건비 (만원)</label><input {...numField("laborCost")} step={100} /></div>
          <div className="full">
            <label htmlFor="replaceRate">업무 대체율: 그 인원의 업무 중 로봇이 실제로 대신하는 비율 ({input.replaceRate}%)</label>
            <input id="replaceRate" className="range" type="range" min={10} max={100} step={10} value={input.replaceRate}
              onChange={(e) => set("replaceRate", Number(e.target.value))} />
          </div>
          <div className="full row-btns">
            <button type="submit" className="btn" disabled={busy}>{analysis ? "계산 중…" : "최적 조합 추천받기"}</button>
          </div>
        </form>
      </section>

      {/* 2. 추천 결과 */}
      {result && (
        <section className="card result" id="result">
          <h2>2. 추천 결과</h2>
          {stale && (
            <div className="stale">조건이 바뀌었어요. <button type="button" className="link" disabled={busy} onClick={() => runRecommend(input)}>다시 계산하기</button></div>
          )}
          {!ok ? (
            <p className="desc warn">{result.rec.ok ? "" : result.rec.reason}</p>
          ) : (
            <>
              <p className="desc">&quot;{result.input.taskName}&quot; 조건을 만족하는 조합 중 가장 경제적인 조합입니다.</p>
              <div className="print-only print-cond">
                검토 조건: 옮기는 무게 {result.input.loadKg}kg · 이동 거리 {result.input.distanceM}m · {INSPECTION_TEXT[result.input.inspection]} ·
                로봇팔 {result.input.pickKg > 0 ? `${result.input.pickKg}kg` : "없음"} · 대체 인원 {result.input.workers}명 · 인건비 {won(result.input.laborCost)} · 대체율 {result.input.replaceRate}%
                <br />작성일 {new Date().toLocaleDateString("ko-KR")} · ModuLink-AI 검토 리포트
              </div>
              <div className="combo">
                <ModCard cat="주행 베이스" m={ok.base} />
                <ModCard cat="로봇팔" m={ok.arm} />
                <ModCard cat="검사 센서" m={ok.sensor} />
              </div>
              <div className="kpis">
                <div className="kpi"><div className="k">총 도입비</div><div className="v">{won(ok.capex)}</div></div>
                <div className="kpi"><div className="k">연간 순절감액</div><div className="v" style={{ color: ok.annualSaving < 0 ? "var(--red)" : undefined }}>{won(ok.annualSaving)}</div></div>
                <div className="kpi">
                  <div className="k">투자 회수 기간</div>
                  <div className="v" style={{ color: paybackColor(ok.paybackMonths) }}>{formatPayback(ok.paybackMonths)}</div>
                </div>
              </div>
              <ul className="notes">
                <li>· 필요 적재 용량 {Math.round(ok.requiredKg)}kg (물품+모듈 무게 × 안전율 {RULES.SAFETY_MARGIN}) → 베이스 {ok.base.payload_kg}kg ✔</li>
                {ok.arm && <li>· 로봇팔 가반 {ok.arm.payload_kg}kg ≥ 집는 무게 {result.input.pickKg}kg × 안전율 {RULES.SAFETY_MARGIN}, 장착 규격 {ok.arm.mount} ↔ 베이스 {ok.base.mount} 호환 ✔</li>}
                <li>· 도입비 = 모듈 합계 {won(ok.moduleSum)} + 설치·연동비 {RULES.INTEGRATION_RATE * 100}%</li>
                <li>· 연간 순절감 = 인건비 {result.input.workers}명 × {won(result.input.laborCost)} × 대체율 {result.input.replaceRate}% ({won(ok.laborSaving)}) − 유지보수비(도입비의 {RULES.MAINTENANCE_RATE * 100}%)</li>
              </ul>
              <RoiChart capex={ok.capex} annualSaving={ok.annualSaving} paybackMonths={ok.paybackMonths} />
              <div className="checklist" id="checklist">
                <h3>안전·호환성 검토 체크리스트</h3>
                {buildChecklist(result.input, ok).map((g) => (
                  <div key={g.title} className="cgroup">
                    <div className="ctitle">{g.title}</div>
                    {g.items.map((it) => (
                      <label key={`${g.title}-${it}`} className="citem"><input type="checkbox" defaultChecked={g.auto} /> <span>{it}</span></label>
                    ))}
                  </div>
                ))}
                <p className="disclaimer">※ 참고용 검토 항목입니다. 인증·적합성 판단을 대신하지 않으며, 최종 확인은 전문가·인증기관을 통해 진행하세요.</p>
              </div>
              <p className="disclaimer">※ 모듈 사양·가격은 시연용 예시 값이며, 실제 견적은 현장 조건에 따라 달라집니다.</p>
              <div className="row-btns">
                <button type="button" className="btn gray" onClick={() => window.print()}>검토 리포트 인쇄·PDF</button>
                {(() => {
                  const saved = !saving && savedKey === JSON.stringify(result.input);
                  return (
                    <button type="button" className="btn" disabled={saving || stale || saved} onClick={() => onSave(result.input)}>
                      {saving ? "저장 중…" : stale ? "다시 계산 후 저장" : saved ? "저장됨 ✓" : "검토 기록 저장"}
                    </button>
                  );
                })()}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ModCard({ cat, m }: { cat: string; m: RobotModule | null }) {
  if (!m)
    return (
      <div className="mod none"><div className="cat">{cat}</div><div className="name">필요 없음</div></div>
    );
  return (
    <div className="mod">
      <div className="cat">{cat}</div>
      <div className="name">{m.name}</div>
      <div className="spec">{m.spec}</div>
      <div className="price">{won(m.price)}</div>
    </div>
  );
}

const paybackColor = (m: number | null) =>
  m === null ? "var(--red)" : m <= 24 ? "var(--green)" : m <= 48 ? "var(--orange)" : "var(--red)";
