"use server";

import { getModules } from "@/features/modules/repository";
import type { InspectionLevel, TaskInput } from "@/features/modules/types";
import { deleteRecord, insertRecord } from "./repository";
import { toRecord, type RecommendationRecord } from "./types";

export type SaveResult = { ok: true; record: RecommendationRecord } | { ok: false; message: string };

const num = (v: unknown, max: number) => Math.min(max, Math.max(0, Number(v) || 0));

/** 입력 조건 → 서버에서 값 검증·다시 계산(화면 값을 그대로 믿지 않음) → DB 저장 */
export async function saveRecommendation(raw: TaskInput): Promise<SaveResult> {
  const inspection = String(raw?.inspection ?? "none");
  const input: TaskInput = {
    taskName: String(raw?.taskName ?? "").trim().slice(0, 80) || "이름 없는 작업",
    loadKg: num(raw?.loadKg, 5000),
    distanceM: num(raw?.distanceM, 5000),
    inspection: (["none", "basic", "precise"].includes(inspection) ? inspection : "none") as InspectionLevel,
    pickKg: num(raw?.pickKg, 5000),
    workers: num(raw?.workers, 100),
    laborCost: num(raw?.laborCost, 100000),
    replaceRate: num(raw?.replaceRate ?? 100, 100),
  };
  try {
    const { modules } = await getModules();
    const rec = toRecord(input, modules);
    if ("error" in rec) return { ok: false, message: rec.error };
    return { ok: true, record: await insertRecord(rec) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function removeRecommendation(id: number): Promise<{ ok: boolean; message?: string }> {
  try {
    await deleteRecord(Number(id));
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
