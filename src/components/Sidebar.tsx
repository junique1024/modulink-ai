"use client";

import type { TabId } from "./Planner";

export const NAV: { id: TabId; label: string; sub: string; narrowOnly?: boolean }[] = [
  { id: "home", label: "소개", sub: "서비스 한눈에" },
  { id: "ask", label: "말로 요청", sub: "문장 한 줄 입력" },
  { id: "conditions", label: "조건 확인", sub: "값 직접 수정" },
  { id: "result", label: "추천 결과", sub: "조합 · 회수 · 안전" },
  { id: "robot", label: "로봇 연동", sub: "실시간 상태 · 안전 경보" },
  { id: "history", label: "검토 기록", sub: "저장한 안", narrowOnly: true },
];

/** 좌측 탭 메뉴 (모바일에서는 상단 가로 탭) */
export default function Sidebar({ tab, onTab, hasResult, storageLabel, catalogLabel, useDb, historyCount }: {
  tab: TabId; onTab: (t: TabId) => void; hasResult: boolean; storageLabel: string; catalogLabel: string; useDb: boolean; historyCount: number;
}) {
  return (
    <aside className="side" aria-label="메뉴">
      <button type="button" className="brand" onClick={() => onTab("home")}>
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="32" height="32"><rect x="3" y="18" width="26" height="9" rx="3" fill="currentColor" /><rect x="8" y="10" width="7" height="8" rx="2" fill="currentColor" opacity=".55" /><rect x="17" y="5" width="7" height="13" rx="2" fill="currentColor" opacity=".8" /></svg>
        </span>
        <span><b>ModuLink-AI</b><small>로봇 모듈 조합 · ROI 계산</small></span>
      </button>
      <nav className="side-nav" role="tablist" aria-label="화면 전환">
        {NAV.map((n, i) => {
          const dim = n.id === "result" && !hasResult;
          return (
            <button key={n.id} type="button" role="tab" aria-selected={tab === n.id}
              className={`${tab === n.id ? "on" : ""} ${dim ? "dim" : ""} ${n.narrowOnly ? "narrow-only" : ""}`}
              onClick={() => onTab(n.id)}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <span className="txt"><b>{n.label}{n.id === "history" && historyCount > 0 ? ` ${historyCount}` : ""}</b><small>{dim ? "추천 후 표시" : n.sub}</small></span>
            </button>
          );
        })}
      </nav>
      <div className="side-foot">
        <span className={`dot ${useDb ? "on" : ""}`} title={catalogLabel} />
        {storageLabel}
        <p>팀 신촌다이나믹스 · 2026 기업가정신 챌린지<br />※ 모듈 사양·가격은 시연용 예시 값</p>
        <a href="https://github.com/junique1024/modulink-ai" target="_blank" rel="noreferrer">소스코드 GitHub ↗</a>
      </div>
    </aside>
  );
}
