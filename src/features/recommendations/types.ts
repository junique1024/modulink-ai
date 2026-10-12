import { recommend } from "@/features/modules/recommend";
import type { RobotModule, TaskInput } from "@/features/modules/types";

/** DB `recommendations` 테이블 한 행 (브라우저 저장 모드도 같은 모양) */
export interface RecommendationRecord {
  id: number;
  created_at: string;
  task_name: string;
  load_kg: number;
  distance_m: number;
  inspection: string;
  pick_kg: number;
  workers: number;
  labor_cost: number;
  /** 추천 조합 + 업무 대체율 (스키마 변경 없이 jsonb에 함께 보관) */
  combo: { base: string; arm: string | null; sensor: string | null; replaceRate?: number };
  capex: number;
  annual_saving: number;
  payback_months: number | null;
}
export type NewRecord = Omit<RecommendationRecord, "id" | "created_at">;

/** 입력 조건 → 저장용 행 (항상 다시 계산해서 만듦) */
export function toRecord(input: TaskInput, modules: RobotModule[]): NewRecord | { error: string } {
  const r = recommend(input, modules);
  if (!r.ok) return { error: r.reason };
  return {
    task_name: input.taskName.trim().slice(0, 80) || "이름 없는 작업",
    load_kg: input.loadKg,
    distance_m: input.distanceM,
    inspection: input.inspection,
    pick_kg: input.pickKg,
    workers: input.workers,
    labor_cost: input.laborCost,
    combo: { base: r.base.name, arm: r.arm?.name ?? null, sensor: r.sensor?.name ?? null, replaceRate: input.replaceRate },
    capex: Math.round(r.capex),
    annual_saving: Math.round(r.annualSaving),
    payback_months: r.paybackMonths === null ? null : Math.round(r.paybackMonths * 10) / 10,
  };
}
