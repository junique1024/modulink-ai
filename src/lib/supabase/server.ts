import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트
 * - URL/키가 없거나 형식이 잘못되면 null → 기록은 브라우저 저장 모드로 동작합니다.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || url.includes("your-project") || !/^https?:\/\//.test(url)) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: false },
      // DB가 응답하지 않아도 화면이 멈추지 않도록 3초 제한
      global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(3000) }) },
    });
  } catch {
    return null;
  }
}

export const isSupabaseConfigured = () => getSupabase() !== null;
