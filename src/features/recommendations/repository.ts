import { getSupabase } from "@/lib/supabase/server";
import type { NewRecord, RecommendationRecord } from "./types";

/**
 * Supabase `recommendations` 테이블 접근
 * - Supabase 미설정 시 기록은 화면(브라우저 저장소)에서 관리합니다 → src/components/Workspace.tsx
 * - Supabase 오류(일시정지·네트워크 등)가 나도 화면이 깨지지 않도록 오류를 값으로 돌려줍니다
 */
export async function listRecords(): Promise<{ records: RecommendationRecord[]; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { records: [] };
  try {
    const { data, error } = await sb.from("recommendations").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) return { records: [], error: error.message };
    return { records: (data ?? []) as RecommendationRecord[] };
  } catch (e) {
    return { records: [], error: (e as Error).message };
  }
}

export async function insertRecord(rec: NewRecord): Promise<RecommendationRecord> {
  const sb = getSupabase();
  if (!sb) throw new Error("DB 미설정");
  const { data, error } = await sb.from("recommendations").insert(rec).select().single();
  if (error) throw new Error(error.message);
  return data as RecommendationRecord;
}

export async function deleteRecord(id: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("DB 미설정");
  const { error } = await sb.from("recommendations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
