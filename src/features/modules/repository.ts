import { getSupabase } from "@/lib/supabase/server";
import { DEFAULT_MODULES } from "./defaultCatalog";
import type { RobotModule } from "./types";

const VALID = new Set(["base", "arm", "sensor"]);

/** 모듈 카탈로그 불러오기: Supabase → (없거나 실패·이상값이면) 기본 카탈로그 */
export async function getModules(): Promise<{ modules: RobotModule[]; source: "supabase" | "default" }> {
  const sb = getSupabase();
  if (!sb) return { modules: DEFAULT_MODULES, source: "default" };
  try {
    const { data, error } = await sb.from("modules").select("*").order("id");
    if (error || !data?.length) {
      if (error) console.error("[modules] 불러오기 실패:", error.message);
      return { modules: DEFAULT_MODULES, source: "default" };
    }
    const modules = data
      .map((m) => ({ ...m, payload_kg: Number(m.payload_kg) || 0, self_kg: Number(m.self_kg) || 0, price: Number(m.price) || 0, mount: String(m.mount ?? "") }))
      .filter((m) => VALID.has(m.category) && m.price > 0 && m.name) as RobotModule[];
    const hasBase = modules.some((m) => m.category === "base");
    return hasBase ? { modules, source: "supabase" } : { modules: DEFAULT_MODULES, source: "default" };
  } catch (e) {
    console.error("[modules] 불러오기 실패:", (e as Error).message);
    return { modules: DEFAULT_MODULES, source: "default" };
  }
}
