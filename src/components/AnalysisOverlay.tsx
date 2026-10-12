"use client";

export interface AnalysisStep {
  label: string;
  detail?: string;
}

/** 추천 계산 단계 표시 (실제 계산 결과 숫자를 단계별로 보여줌) */
export default function AnalysisOverlay({ steps, done, onSkip }: { steps: AnalysisStep[]; done: number; onSkip: () => void }) {
  const pct = Math.round((Math.min(done, steps.length) / steps.length) * 100);
  return (
    <div className="analysis" role="dialog" aria-modal="true" aria-label="최적 조합 계산 중" onClick={onSkip}>
      <div className="analysis-card" onClick={(e) => e.stopPropagation()}>
        <div className="analysis-head">
          <span className="pulse" aria-hidden />
          <b>ModuLink-AI가 최적 조합을 계산하고 있어요</b>
        </div>
        <ol className="steps">
          {steps.map((s, i) => {
            const state = i < done ? "done" : i === done ? "run" : "wait";
            return (
              <li key={s.label} className={state}>
                <span className="mark" aria-hidden>{state === "done" ? "✓" : ""}</span>
                <div>
                  <div className="slabel">{s.label}</div>
                  {state === "done" && s.detail && <div className="sdetail">{s.detail}</div>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        <button type="button" className="skip" onClick={onSkip}>건너뛰기</button>
      </div>
    </div>
  );
}
