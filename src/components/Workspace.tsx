"use client";

import { useEffect, useState } from "react";
import type { RobotModule, TaskInput } from "@/features/modules/types";
import { removeRecommendation, saveRecommendation } from "@/features/recommendations/actions";
import { toRecord, type RecommendationRecord } from "@/features/recommendations/types";
import HistoryList from "./HistoryList";
import Planner from "./Planner";

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

  return (
    <>
      <header>
        <div>
          <h1>ModuLink-AI</h1>
          <div className="tagline">말 한 줄로 로봇 모듈 조합 · 투자 회수 기간 · 안전 검토 항목까지</div>
        </div>
        <span className={`badge ${useDb ? "on" : "off"}`} title={catalogLabel}>● {useDb ? "DB 연결됨" : "기록: 이 브라우저에 저장"}</span>
      </header>
      <Planner modules={modules} onSave={onSave} saving={saving} savedKey={savedKey} />
      <HistoryList records={records} onDelete={onDelete} sourceLabel={useDb ? "DB(Supabase)" : "이 브라우저"} />
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
