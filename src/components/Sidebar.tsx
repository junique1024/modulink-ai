"use client";

import { useEffect, useState } from "react";

export const NAV = [
  { id: "home", label: "소개", sub: "서비스 한눈에" },
  { id: "ask", label: "말로 요청", sub: "문장 한 줄 입력" },
  { id: "conditions", label: "조건 확인", sub: "값 직접 수정" },
  { id: "result", label: "추천 결과", sub: "조합 · 회수 · 안전" },
  { id: "history", label: "검토 기록", sub: "저장한 안 비교" },
] as const;

/** 좌측 목차 (모바일에서는 상단 가로 메뉴) — 스크롤 위치에 따라 현재 섹션 강조 */
export default function Sidebar({ hasResult, storageLabel, catalogLabel, useDb }: { hasResult: boolean; storageLabel: string; catalogLabel: string; useDb: boolean }) {
  const [active, setActive] = useState<string>("home");

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let cur = "home";
        for (const n of NAV) {
          const el = document.getElementById(n.id);
          if (el && el.getBoundingClientRect().top <= 140) cur = n.id;
        }
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = "history";
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [hasResult]);

  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return; // 추천 결과가 아직 없으면 이동하지 않음
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <aside className="side" aria-label="목차">
      <a href="#home" className="brand" onClick={(e) => go(e, "home")}>
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="32" height="32"><rect x="3" y="18" width="26" height="9" rx="3" fill="currentColor" /><rect x="8" y="10" width="7" height="8" rx="2" fill="currentColor" opacity=".55" /><rect x="17" y="5" width="7" height="13" rx="2" fill="currentColor" opacity=".8" /></svg>
        </span>
        <span>
          <b>ModuLink-AI</b>
          <small>로봇 모듈 조합 · ROI 계산</small>
        </span>
      </a>
      <nav className="side-nav">
        {NAV.map((n, i) => {
          const disabled = n.id === "result" && !hasResult;
          return (
            <a key={n.id} href={`#${n.id}`} onClick={(e) => go(e, n.id)}
              className={`${active === n.id ? "on" : ""} ${disabled ? "dim" : ""}`}
              aria-current={active === n.id ? "true" : undefined}
              title={disabled ? "추천을 받으면 열립니다" : undefined}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <span className="txt"><b>{n.label}</b><small>{disabled ? "추천 후 표시" : n.sub}</small></span>
            </a>
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
