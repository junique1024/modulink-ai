import type { Recommendation, RobotModule, TaskInput } from "./types";

/** 계산 기준값 — 현장 기준에 맞게 여기서만 바꾸면 됩니다 */
export const RULES = {
  SAFETY_MARGIN: 1.2, // 하중 안전율
  INTEGRATION_RATE: 0.15, // 설치·연동비 = 모듈 합계의 15%
  MAINTENANCE_RATE: 0.08, // 연 유지보수비 = 도입비의 8%
} as const;

const mounts = (m: RobotModule) =>
  String(m.mount ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * 작업 조건 → 최적 모듈 조합 + ROI
 * 순수 함수(입력만 받고 결과만 돌려줌)라서 화면·서버·향후 Claude API 연동에서 그대로 재사용합니다.
 */
export function recommend(input: TaskInput, modules: RobotModule[]): Recommendation {
  if (!modules.length) return { ok: false, reason: "모듈 카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  const bases = modules.filter((m) => m.category === "base");
  const arms = modules.filter((m) => m.category === "arm");
  const sensors = modules.filter((m) => m.category === "sensor");

  // 1) 검사 수준에 맞는 센서 중 가장 저렴한 것
  let sensor: RobotModule | null = null;
  if (input.inspection !== "none") {
    sensor =
      sensors
        .filter((s) => (s.level ?? "basic") === input.inspection)
        .sort((a, b) => a.price - b.price)[0] ?? null;
    if (!sensor) return { ok: false, reason: "요청한 검사 수준을 지원하는 센서가 DB에 없습니다." };
  }

  // 2) 집는 무게를 감당하는 로봇팔 후보 (0kg이면 로봇팔 없음)
  const armCandidates: (RobotModule | null)[] =
    input.pickKg > 0 ? arms.filter((a) => a.payload_kg >= input.pickKg * RULES.SAFETY_MARGIN) : [null];

  // 3) 베이스 적재 용량 + 장착 규격 호환 검사 → 가장 저렴한 조합
  let best: { base: RobotModule; arm: RobotModule | null; requiredKg: number; moduleSum: number } | null = null;
  for (const arm of armCandidates) {
    const requiredKg = (input.loadKg + (arm?.self_kg ?? 0) + (sensor?.self_kg ?? 0)) * RULES.SAFETY_MARGIN;
    for (const base of bases) {
      if (base.payload_kg < requiredKg) continue;
      if (arm && !mounts(base).some((x) => mounts(arm).includes(x))) continue;
      const moduleSum = base.price + (arm?.price ?? 0) + (sensor?.price ?? 0);
      if (!best || moduleSum < best.moduleSum) best = { base, arm, requiredKg, moduleSum };
    }
  }
  if (!best) return { ok: false, reason: "조건을 만족하는 모듈 조합이 없습니다. 하중이나 집는 무게를 낮춰 보세요." };

  // 4) 비용·ROI
  const capex = best.moduleSum * (1 + RULES.INTEGRATION_RATE);
  const rate = Math.min(100, Math.max(0, input.replaceRate ?? 100)) / 100;
  const laborSaving = input.workers * input.laborCost * rate;
  const annualSaving = laborSaving - capex * RULES.MAINTENANCE_RATE;
  const paybackMonths = annualSaving > 0 ? capex / (annualSaving / 12) : null;

  return { ok: true, ...best, sensor, capex, laborSaving, annualSaving, paybackMonths };
}

/** 표시용 포맷 */
export const won = (man: number) => `${Math.round(man).toLocaleString("ko-KR")}만원`;
/** 큰 금액은 억 단위로 짧게 (그래프 축 등) */
export const wonShort = (man: number) => {
  const sign = man < 0 ? "−" : "";
  const a = Math.abs(man);
  return a >= 10000 ? `${sign}${(a / 10000).toFixed(1)}억` : `${sign}${Math.round(a).toLocaleString("ko-KR")}만`;
};
export const formatPayback = (months: number | null) =>
  months === null ? "회수 불가" : months < 12 ? `${months.toFixed(1)}개월` : `${(months / 12).toFixed(1)}년 (${Math.round(months)}개월)`;
export const INSPECTION_LABEL: Record<string, string> = { none: "검사 없음", basic: "기본 검사", precise: "정밀 검사" };

/** 추천 과정 기록 (로딩 화면에 실제 계산 단계를 보여주기 위한 값) — recommend()와 같은 규칙으로 셈 */
export interface AnalysisTrace {
  total: number;
  bases: number;
  arms: number;
  sensors: number;
  armNeeded: boolean;
  armCandidates: number;
  combos: number;
  rejectedCapacity: number;
  rejectedMount: number;
  feasible: number;
}

export function traceRecommend(input: TaskInput, modules: RobotModule[]): AnalysisTrace {
  const bases = modules.filter((m) => m.category === "base");
  const arms = modules.filter((m) => m.category === "arm");
  const sensors = modules.filter((m) => m.category === "sensor");
  const sensor =
    input.inspection === "none"
      ? null
      : sensors.filter((s) => (s.level ?? "basic") === input.inspection).sort((a, b) => a.price - b.price)[0] ?? null;
  const armCandidates: (RobotModule | null)[] =
    input.pickKg > 0 ? arms.filter((a) => a.payload_kg >= input.pickKg * RULES.SAFETY_MARGIN) : [null];
  let rejectedCapacity = 0, rejectedMount = 0, feasible = 0;
  for (const arm of armCandidates) {
    const requiredKg = (input.loadKg + (arm?.self_kg ?? 0) + (sensor?.self_kg ?? 0)) * RULES.SAFETY_MARGIN;
    for (const base of bases) {
      if (base.payload_kg < requiredKg) rejectedCapacity++;
      else if (arm && !mounts(base).some((x) => mounts(arm).includes(x))) rejectedMount++;
      else feasible++;
    }
  }
  return {
    total: modules.length,
    bases: bases.length,
    arms: arms.length,
    sensors: sensors.length,
    armNeeded: input.pickKg > 0,
    armCandidates: input.pickKg > 0 ? armCandidates.length : 0,
    combos: armCandidates.length * bases.length,
    rejectedCapacity,
    rejectedMount,
    feasible,
  };
}
