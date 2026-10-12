"use client";

import { useEffect, useState } from "react";
import type { RobotModule, TaskInput } from "@/features/modules/types";
import { removeRecommendation, saveRecommendation } from "@/features/recommendations/actions";
import { toRecord, type RecommendationRecord } from "@/features/recommendations/types";
import HistoryList from "./HistoryList";
import Hero from "./Hero";
import Planner from "./Planner";
import Sidebar from "./Sidebar";

const KEY = "modulink-ai.records.v1";
const readBrowser = (): RecommendationRecord[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeBrowser = (rows: RecommendationRecord[]) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 50)));
    return true;
  } catch {
    return false; // 시크릿 창 등 저장소 차단 시: 이번 화면에서만 유지
  }
};

/**
 * 화면 전체 상태: 추천기 + 저장 기록
 * - Supabase 정상: DB에 저장
 * - Supabase 미설정·오류: 이 브라우저에 저장 (데모 중 DB 문제가 생겨도 멈추지 않음)
 */
export default function Workspace({ modules, initialRecords, dbReady, catalogLabel }: { modules: RobotModule[]; initialRecords: RecommendationRecord[]; dbReady: boolean; catalogLabel: string }) {
  const [useDb, setUseDb] = useState(dbReady);
  const [records, setRecords] = useState<RecommendationRecord[]>(initialRecords);
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 후에만 읽을 수 있음
    if (!dbReady) setRecords(readBrowser());
  }, [dbReady]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const saveToBrowser = (input: TaskInput, note?: string) => {
    const rec = toRecord(input, modules);
    if ("error" in rec) return setToast(rec.error);
    const next = [{ ...rec, id: Date.now(), created_at: new Date().toISOString() }, ...records].slice(0, 50);
    setRecords(next);
    const persisted = writeBrowser(next);
    setToast(note ?? (persisted ? "저장했어요" : "저장했어요 (이 화면을 닫으면 사라져요)"));
  };

  const onSave = async (input: TaskInput) => {
    if (saving) return;
    setSaving(true);
    setSavedKey(JSON.stringify(input));
    try {
      if (!useDb) return saveToBrowser(input);
      const r = await saveRecommendation(input);
      if (r.ok) {
        setRecords((prev) => [r.record, ...prev]);
        setToast("DB에 저장했어요");
      } else {
        setUseDb(false);
        saveToBrowser(input, "DB 연결 문제로 이 브라우저에 저장했어요");
      }
    } catch {
      setUseDb(false);
      saveToBrowser(input, "DB 연결 문제로 이 브라우저에 저장했어요");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    const prev = records;
    const next = records.filter((r) => r.id !== id);
    setRecords(next);
    if (!useDb) return void writeBrowser(next);
    const r = await removeRecommendation(id).catch(() => ({ ok: false }));
    if (!r.ok) {
      setRecords(prev);
      setToast("삭제하지 못했어요. 잠시 후 다시 시도해 주세요");
    }
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const storageLabel = useDb ? "DB 연결됨" : "기록: 이 브라우저에 저장";

  return (
    <div className="shell">
      <Sidebar hasResult={hasResult} storageLabel={storageLabel} catalogLabel={catalogLabel} useDb={useDb} />
      <main className="wrap">
        <Hero
          onTry={() => window.dispatchEvent(new CustomEvent("modulink:example", { detail: 0 }))}
          onStart={() => { scrollTo("ask"); setTimeout(() => document.querySelector<HTMLTextAreaElement>("textarea.nl")?.focus({ preventScroll: true }), 450); }}
        />
        <Planner modules={modules} onSave={onSave} saving={saving} savedKey={savedKey} onResult={() => setHasResult(true)} />
        <HistoryList records={records} onDelete={onDelete} sourceLabel={useDb ? "DB(Supabase)" : "이 브라우저"} />
        <footer>
          ModuLink-AI 프로토타입 · 2026 기업가정신 챌린지 · 팀 신촌다이나믹스
          <br />※ 모듈 사양과 가격은 시연용 예시 값입니다
        </footer>
      </main>
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
