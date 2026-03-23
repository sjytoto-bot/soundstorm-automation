// ─── youtubeAnalyticsService ──────────────────────────────────────────────────
// YouTube Analytics 데이터 조회 서비스 레이어
//
// 데이터 소스 우선순위:
//   1. window.api.fetchYTAnalytics  — Electron IPC → YouTube Analytics API (정확, range 필요)
//   2. fetchReachData (reachAdapter) — Google Sheets (_RawData_Master) Fallback
//
// 사용처: useContentPackController (syncPerformance)
// UI 레이어에서 직접 호출 금지 — 반드시 controller를 통해 사용

import { fetchReachData } from "@/adapters/reachAdapter";
import type { ContentPerformance } from "@/core/types/contentPack";

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

/** video_id → performance 맵 */
export type AnalyticsMap = Record<string, ContentPerformance>;

// ─── IPC bridge 헬퍼 ─────────────────────────────────────────────────────────

type ApiBridge = {
  fetchYTAnalytics?: (range: { start: string; end: string }) => Promise<
    Array<[string, number, number]>  // [videoId, impressions, ctr]
  >;
};

function getApi(): ApiBridge | undefined {
  return (window as unknown as { api?: ApiBridge }).api;
}

// ─── YT Analytics IPC 조회 ────────────────────────────────────────────────────

async function fetchFromYTAnalytics(videoIds: string[]): Promise<AnalyticsMap> {
  const api = getApi();
  if (!api?.fetchYTAnalytics) throw new Error("YT Analytics IPC 미연결");

  // 최근 90일 range (video_id 필터는 API 측에서 처리)
  const end   = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = await api.fetchYTAnalytics({ start, end });

  const map: AnalyticsMap = {};
  for (const [videoId, impressions, ctr] of rows) {
    if (!videoIds.includes(videoId)) continue;
    map[videoId] = {
      impressions: impressions > 0 ? impressions : undefined,
      ctr:         ctr         > 0 ? ctr         : undefined,
    };
  }
  return map;
}

// ─── Google Sheets Fallback 조회 ─────────────────────────────────────────────

async function fetchFromSheets(videoIds: string[]): Promise<AnalyticsMap> {
  const rows = await fetchReachData();
  const map: AnalyticsMap = {};

  for (const row of rows) {
    if (!videoIds.includes(row.video_id)) continue;
    map[row.video_id] = {
      views:       row.views       > 0 ? row.views       : undefined,
      impressions: row.impressions != null && row.impressions > 0 ? row.impressions : undefined,
      ctr:         row.ctr         != null && row.ctr         > 0 ? row.ctr         : undefined,
    };
  }
  return map;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 단일 video_id의 Analytics를 조회한다.
 * YT Analytics IPC → Sheets fallback 순서로 시도.
 */
export async function fetchPerformanceByVideoId(
  videoId: string,
): Promise<ContentPerformance> {
  const map = await fetchAllPerformance([videoId]);
  return map[videoId] ?? {};
}

/**
 * 복수 video_id의 Analytics를 일괄 조회한다.
 * YT Analytics IPC → Sheets fallback 순서로 시도.
 *
 * @returns video_id → ContentPerformance 맵 (데이터 없는 ID는 포함되지 않음)
 */
export async function fetchAllPerformance(
  videoIds: string[],
): Promise<AnalyticsMap> {
  if (videoIds.length === 0) return {};

  // 1차: YT Analytics IPC
  try {
    const map = await fetchFromYTAnalytics(videoIds);
    console.log(`[youtubeAnalyticsService] YT Analytics IPC 성공 — ${Object.keys(map).length}개`);
    return map;
  } catch (e) {
    console.warn("[youtubeAnalyticsService] YT Analytics IPC 실패, Sheets fallback:", e);
  }

  // 2차: Google Sheets fallback
  try {
    const map = await fetchFromSheets(videoIds);
    console.log(`[youtubeAnalyticsService] Sheets fallback 성공 — ${Object.keys(map).length}개`);
    return map;
  } catch (e) {
    console.warn("[youtubeAnalyticsService] Sheets fallback도 실패:", e);
    return {};
  }
}
