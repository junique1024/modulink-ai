import { won, wonShort } from "@/features/modules/recommend";

/** 월별 누적 손익 그래프: 도입비(−)에서 출발해 매달 순절감액만큼 회복 → 0을 넘는 순간이 회수 시점 */
export default function RoiChart({ capex, annualSaving, paybackMonths }: { capex: number; annualSaving: number; paybackMonths: number | null }) {
  const monthly = annualSaving / 12;
  const months = paybackMonths === null ? 60 : Math.min(120, Math.max(36, Math.ceil((paybackMonths * 1.6) / 12) * 12));
  const pts = Array.from({ length: months + 1 }, (_, m) => -capex + monthly * m);
  const max = Math.max(...pts, 0);
  const min = Math.min(...pts, 0);

  const W = 760, H = 240, L = 72, R = 16, T = 16, B = 32;
  const x = (m: number) => L + ((W - L - R) * m) / months;
  const y = (v: number) => T + ((H - T - B) * (max - v)) / (max - min || 1);
  const path = pts.map((v, m) => `${m ? "L" : "M"}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const step = months <= 48 ? 12 : 24;

  return (
    <div className="chart">
      <div className="chart-title">월별 누적 손익 (도입 시점부터)</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="월별 누적 손익 그래프">
        <rect x={L} y={y(0)} width={W - L - R} height={Math.max(0, y(min) - y(0))} fill="#fdecea" opacity={0.6} />
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#b0b0b8" strokeDasharray="4 4" />
        <text x={L - 8} y={y(0) + 4} textAnchor="end" fontSize="12" fill="#6e6e73">0</text>
        {y(min) - y(0) > 16 && <text x={L - 8} y={y(min) + 4} textAnchor="end" fontSize="12" fill="#6e6e73">{wonShort(min)}</text>}
        {max > 0 && y(0) - y(max) > 16 && <text x={L - 8} y={y(max) + 10} textAnchor="end" fontSize="12" fill="#6e6e73">+{wonShort(max)}</text>}
        {Array.from({ length: Math.floor(months / step) + 1 }, (_, i) => i * step).map((m) => (
          <text key={m} x={x(m)} y={H - 10} textAnchor="middle" fontSize="12" fill="#6e6e73">{m === 0 ? "도입" : `${m}개월`}</text>
        ))}
        <path d={path} fill="none" stroke="#0071e3" strokeWidth="3" strokeLinejoin="round" />
        {paybackMonths !== null && paybackMonths <= months && (
          <g>
            <line x1={x(paybackMonths)} x2={x(paybackMonths)} y1={T} y2={H - B} stroke="#1f9d55" strokeDasharray="3 3" />
            <circle cx={x(paybackMonths)} cy={y(0)} r="6" fill="#1f9d55" />
            <text x={x(paybackMonths) + (x(paybackMonths) > W - 160 ? -8 : 8)} y={T + 12} textAnchor={x(paybackMonths) > W - 160 ? "end" : "start"} fontSize="13" fontWeight="700" fill="#1f9d55">
              {paybackMonths.toFixed(1)}개월에 본전
            </text>
          </g>
        )}
      </svg>
      <div className="chart-note">
        {paybackMonths === null
          ? "현재 조건에선 절감액이 유지보수비보다 작아 회수되지 않습니다. 대체 인원이나 작업량을 다시 확인해 보세요."
          : `${months}개월 뒤 누적 ${pts[months] >= 0 ? "이익" : "손실"} ${won(Math.abs(pts[months]))} (매달 ${won(monthly)} 절감 가정)`}
      </div>
    </div>
  );
}
