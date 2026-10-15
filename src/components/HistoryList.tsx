"use client";

import { formatPayback, INSPECTION_LABEL, won } from "@/features/modules/recommend";
import type { RecommendationRecord } from "@/features/recommendations/types";

/** 저장된 검토 기록 — 넓은 화면: 우측 사이드바 / 좁은 화면: '검토 기록' 탭 */
export default function HistoryList({ records, sourceLabel, onDelete, onOpen, freshId }: {
  records: RecommendationRecord[]; sourceLabel: string; onDelete: (id: number) => void; onOpen: (r: RecommendationRecord) => void; freshId: number | null;
}) {
  return (
    <div className="history">
      <div className="history-head">
        <h2>검토 기록</h2>
        <span className="count">{records.length}</span>
      </div>
      <p className="desc">{sourceLabel}에 저장 · 카드를 누르면 다시 열려요</p>
      {records.length === 0 ? (
        <div className="empty">추천 결과에서<br />[검토 기록 저장]을 누르면<br />여기에 차곡차곡 쌓여요</div>
      ) : (
        <ul className="hcards">
          {records.map((r) => {
            const combo = [r.combo?.base, r.combo?.arm, r.combo?.sensor].filter(Boolean).map((s) => String(s).split(" ")[0]).join(" + ");
            const d = new Date(r.created_at);
            const date = isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
            const pm = r.payback_months === null || r.payback_months === undefined ? null : Number(r.payback_months);
            return (
              <li key={r.id} className={`hcard ${r.id === freshId ? "fresh" : ""}`}>
                <button type="button" className="hopen" onClick={() => onOpen(r)} title="이 조건으로 다시 보기">
                  <span className="t">{r.task_name}</span>
                  <span className="s">{r.load_kg}kg · {INSPECTION_LABEL[r.inspection] ?? ""}</span>
                  <span className="c">{combo}</span>
                  <span className="kv"><b>{won(Number(r.capex) || 0)}</b><em>회수 {formatPayback(pm)}</em></span>
                  <span className="dt">{date}</span>
                </button>
                <button type="button" className="hdel" aria-label="삭제" onClick={() => onDelete(r.id)}>×</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
