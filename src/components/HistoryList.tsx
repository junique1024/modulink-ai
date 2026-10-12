"use client";

import { formatPayback, INSPECTION_LABEL, won } from "@/features/modules/recommend";
import type { RecommendationRecord } from "@/features/recommendations/types";

export default function HistoryList({ records, sourceLabel, onDelete }: { records: RecommendationRecord[]; sourceLabel: string; onDelete: (id: number) => void }) {
  return (
    <section className="card history" id="history">
      <h2>3. 저장된 검토 기록</h2>
      <p className="desc">{sourceLabel}에 저장된 기록 {records.length}건</p>
      {records.length === 0 ? (
        <div className="empty">아직 저장된 기록이 없어요. 추천 결과에서 [검토 기록 저장]을 눌러 보세요.</div>
      ) : (
        records.map((r) => {
          const combo = [r.combo?.base, r.combo?.arm, r.combo?.sensor].filter(Boolean).map((s) => String(s).split(" ")[0]).join(" + ");
          const d = new Date(r.created_at);
          const date = isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} · `;
          const pm = r.payback_months === null || r.payback_months === undefined ? null : Number(r.payback_months);
          return (
            <div className="item" key={r.id}>
              <div className="item-main">
                <div className="t">{r.task_name}</div>
                <div className="s">{date}{r.load_kg}kg · {INSPECTION_LABEL[r.inspection] ?? ""} · {combo}</div>
              </div>
              <div className="r">
                <div className="p">{won(Number(r.capex) || 0)}</div>
                <div className="s">회수 {formatPayback(pm)}</div>
                <button type="button" className="btn gray small" style={{ marginTop: 6 }} onClick={() => onDelete(r.id)}>삭제</button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
