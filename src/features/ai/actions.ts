"use server";

import type { InspectionLevel, TaskInput } from "@/features/modules/types";
import { describe, parseRule, type ParseResult } from "./parse";

/**
 * 자연어 → 작업 조건
 * - ANTHROPIC_API_KEY 가 있으면 Claude API로 해석 (서버에서만 호출 → 키 노출 없음)
 * - Claude가 못 찾은 값은 규칙 기반 결과로 보완
 * - 키가 없거나 호출이 실패·지연되면 규칙 기반 해석기로 자동 전환 → 데모가 멈추지 않음
 */
export async function parseNatural(text: string): Promise<ParseResult> {
  const input = String(text ?? "").slice(0, 500);
  const rule = parseRule(input);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !input.trim()) return rule;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        system:
          "너는 공장 로봇 도입 요청을 숫자 조건으로 바꾸는 도우미다. 반드시 JSON 한 개만 출력한다. " +
          '형식: {"loadKg":number|null,"distanceM":number|null,"inspection":"none"|"basic"|"precise"|null,' +
          '"pickKg":number|null,"workers":number|null,"laborCost":number|null,"replaceRate":number|null}. ' +
          "loadKg=옮기는 물품 무게(kg), pickKg=로봇팔로 집는 무게(kg, 로봇팔 불필요라고 하면 0, 언급 없으면 null), " +
          "distanceM=1회 이동 거리(m), inspection=외관검사 수준(정밀·치수·미세결함이면 precise), " +
          "workers=대체되는 총 인원(교대 반영), laborCost=1인당 연 인건비(만원), replaceRate=업무 대체율(%). " +
          "문장에 없는 값은 반드시 null.",
        messages: [{ role: "user", content: input }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? "";
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

    const num = (v: unknown, max: number) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.min(v, max) : undefined);
    const ai: Partial<TaskInput> = {
      loadKg: num(json.loadKg, 5000),
      pickKg: num(json.pickKg, 5000),
      distanceM: num(json.distanceM, 5000),
      inspection: ["none", "basic", "precise"].includes(json.inspection) ? (json.inspection as InspectionLevel) : undefined,
      workers: num(json.workers, 100),
      laborCost: num(json.laborCost, 100000),
      replaceRate: num(json.replaceRate, 100),
    };
    // Claude 값 우선, 비어 있으면 규칙 기반 값으로 보완
    const patch: Partial<TaskInput> = { ...rule.patch };
    for (const [k, v] of Object.entries(ai)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
    return { patch, understood: describe(patch), engine: "claude" };
  } catch (e) {
    console.error("[ai] Claude 해석 실패 → 규칙 기반으로 전환:", (e as Error).message);
    return rule;
  }
}
