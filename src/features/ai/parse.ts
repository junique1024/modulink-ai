import type { InspectionLevel, TaskInput } from "@/features/modules/types";

/** 자연어 해석 결과: 알아낸 값 + 화면에 보여줄 "이렇게 이해했어요" 목록 */
export interface ParseResult {
  patch: Partial<TaskInput>;
  understood: string[];
  engine: "claude" | "rule";
}

/** 문장에서 채울 수 있는 조건 항목 */
export type ParsedField = "loadKg" | "pickKg" | "distanceM" | "inspection" | "workers" | "laborCost" | "replaceRate";

export const INSPECTION_TEXT: Record<InspectionLevel, string> = { none: "검사 없음", basic: "기본 외관 검사", precise: "정밀 검사" };

const KOR_NUM: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const MAX = { kg: 5000, m: 5000, workers: 100, cost: 100000 };
const clamp = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v * 10) / 10));

/** 해석된 값 → 화면용 문구 */
export function describe(patch: Partial<TaskInput>, notes: Partial<Record<ParsedField, string>> = {}): string[] {
  const out: string[] = [];
  if (patch.loadKg !== undefined) out.push(`옮기는 무게 ${patch.loadKg}kg`);
  if (patch.pickKg !== undefined) out.push(patch.pickKg > 0 ? `로봇팔로 집는 무게 ${patch.pickKg}kg` : "로봇팔 필요 없음");
  if (patch.distanceM !== undefined) out.push(`1회 이동 거리 ${patch.distanceM}m`);
  if (patch.inspection !== undefined) out.push(INSPECTION_TEXT[patch.inspection]);
  if (patch.workers !== undefined) out.push(`대체 인원 ${patch.workers}명${notes.workers ?? ""}`);
  if (patch.laborCost !== undefined) out.push(`1인당 연 인건비 ${patch.laborCost.toLocaleString("ko-KR")}만원`);
  if (patch.replaceRate !== undefined) out.push(`업무 대체율 ${patch.replaceRate}%`);
  return out;
}

/**
 * 규칙 기반 해석기 (API 키 없이도 항상 동작하는 기본 엔진)
 * 예) "하중 50kg 물품을 80m 옮기고 외관 검사까지, 작업자 2명 대체"
 */
export function parseRule(text: string): ParseResult {
  const src = String(text ?? "").slice(0, 500);
  // 쉼표 제거 시 "4,500" 같은 숫자는 붙이고, 문장 쉼표는 공백으로
  const t = src.replace(/(\d),(\d{3})/g, "$1$2").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const patch: Partial<TaskInput> = {};
  const notes: Partial<Record<ParsedField, string>> = {};

  // 1) 무게 (kg · 킬로 · 톤): 앞 문맥으로 "옮기는 무게" / "로봇팔로 집는 무게" 구분
  const PICK_WORDS = /(집|피킹|들어|들고|팔로|그리퍼|꺼내|올려|담|픽업)/;
  const NO_ARM = /로봇\s*팔\s*(은|는)?\s*(없|필요\s*없|불필요|빼)|이송만|운반만|옮기기만|옮기만/;
  const weights = [...t.matchAll(/(\d+(?:\.\d+)?)\s*(kg|킬로(?:그램)?|㎏|톤|t(?![a-z]))/gi)].map((m) => ({
    v: Number(m[1]) * (/^(톤|t)$/i.test(m[2]) ? 1000 : 1),
    idx: m.index ?? 0,
    len: m[0].length,
  }));
  for (const w of weights) {
    const before = t.slice(Math.max(0, w.idx - 10), w.idx);
    const after = t.slice(w.idx + w.len, w.idx + w.len + 12);
    const pickHere = PICK_WORDS.test(before) || (weights.length > 1 && /^\s*\S{0,6}?\s*(을|를)?\s*(집|피킹|들어|꺼내)/.test(after));
    if (pickHere && patch.pickKg === undefined) patch.pickKg = clamp(w.v, MAX.kg);
    else if (patch.loadKg === undefined) patch.loadKg = clamp(w.v, MAX.kg);
  }
  // 무게가 하나뿐이고 "집어서 옮긴다"면 같은 무게를 로봇팔이 집는다고 판단
  if (patch.loadKg !== undefined && patch.pickKg === undefined && PICK_WORDS.test(t) && !NO_ARM.test(t)) patch.pickKg = patch.loadKg;
  if (patch.pickKg !== undefined && patch.loadKg === undefined) patch.loadKg = patch.pickKg;
  if (NO_ARM.test(t)) patch.pickKg = 0;

  // 2) 거리 (m · 미터 · km), mm·m/s 제외
  const dist = t.match(/(\d+(?:\.\d+)?)\s*(km|킬로미터|m(?![m/a-z])|미터)/i);
  if (dist) patch.distanceM = clamp(Number(dist[1]) * (/^(km|킬로미터)$/i.test(dist[2]) ? 1000 : 1), MAX.m);

  // 3) 검사 수준
  if (/검사\s*(는|은)?\s*(없|필요\s*없|불필요|안\s*해|생략|빼)/.test(t)) patch.inspection = "none";
  else if (/(정밀|치수|미세|크랙|3D|3d)/.test(t)) patch.inspection = "precise";
  else if (/(검사|외관|불량|오염|찍힘|비전|품질)/.test(t)) patch.inspection = "basic";

  // 4) 대체 인원: "2명", "두 명", "2인" (단, "1인당"·"2인1조"는 제외) × 교대 수
  const wNum = t.match(/(\d+(?:\.\d+)?)\s*(?:명|인(?!당|\s*1\s*조|건|치))/);
  const wKor = t.match(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*명/);
  let workers = wNum ? Number(wNum[1]) : wKor ? KOR_NUM[wKor[1]] : undefined;
  const shift = t.match(/(\d)\s*교대/);
  if (workers !== undefined && shift && Number(shift[1]) > 1 && !/(총|전체|합계|모두)\s*\d*\s*명/.test(t)) {
    workers *= Number(shift[1]);
    notes.workers = ` (${shift[1]}교대 반영)`;
  }
  if (workers !== undefined) patch.workers = clamp(workers, MAX.workers);

  // 5) 인건비 (만원 단위): "연봉 4500만원", "5천만원", "0.5억", "1억 2천만원"
  const eok = t.match(/(\d+(?:\.\d+)?)\s*억(?:\s*(\d+)\s*천)?\s*(?:만)?\s*원?/);
  const man = t.match(/(\d+(?:\.\d+)?)\s*(천)?\s*만\s*원?/);
  if (eok) patch.laborCost = clamp(Number(eok[1]) * 10000 + (eok[2] ? Number(eok[2]) * 1000 : 0), MAX.cost);
  else if (man) patch.laborCost = clamp(Number(man[1]) * (man[2] ? 1000 : 1), MAX.cost);

  // 6) 업무 대체율: "업무의 70% 대체", "대체율 60%"
  const rate = t.match(/(\d{1,3})\s*%/);
  if (rate && /(대체|자동화|줄|절감)/.test(t)) patch.replaceRate = Math.min(100, Number(rate[1]));

  patch.taskName = src.trim().slice(0, 40) + (src.trim().length > 40 ? "…" : "");
  return { patch, understood: describe(patch, notes), engine: "rule" };
}
