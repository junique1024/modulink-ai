import { connection } from "next/server";
import Workspace from "@/components/Workspace";
import { getModules } from "@/features/modules/repository";
import { listRecords } from "@/features/recommendations/repository";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function Home() {
  await connection(); // 매 요청마다 DB 최신 값을 읽도록 (캐시 안 함)

  const configured = isSupabaseConfigured();
  const [{ modules, source }, { records, error }] = await Promise.all([getModules(), listRecords()]);
  const dbReady = configured && !error;

  return (
    <main className="wrap">
      <Workspace modules={modules} initialRecords={records} dbReady={dbReady} catalogLabel={`모듈 ${modules.length}개 (${source === "supabase" ? "DB" : "기본 카탈로그"})`} />

      <footer>
        ModuLink-AI 프로토타입 · 2026 기업가정신 챌린지 · 팀 신촌다이나믹스
        <br />※ 모듈 사양과 가격은 시연용 예시 값입니다
      </footer>
    </main>
  );
}
