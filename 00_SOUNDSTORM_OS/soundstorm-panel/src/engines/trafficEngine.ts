// ─── trafficEngine v1 ─────────────────────────────────────────────────────────
// 트래픽 소스 분석 — 각 영상의 유입 경로 분포와 채널 전체 집계를 제공한다.

import type { NormalizedVideo } from "../core/types/normalized";

// ─── 알려진 트래픽 소스 키 ────────────────────────────────────────────────────
export type TrafficSource =
  | "YT_SEARCH"
  | "SUGGESTED_VIDEO"
  | "BROWSE_FEATURES"
  | "EXTERNAL"
  | "NOTIFICATION"
  | "PLAYLIST"
  | "OTHER";

// ─── 내부 유입으로 분류되는 소스 ──────────────────────────────────────────────
// YouTube가 자체 알고리즘으로 노출하는 소스 (검색·외부 제외)
// correlationEngine / InternalInfluencePanel에서 동일 기준 사용을 위해 export
export const INTERNAL_SOURCES: ReadonlyArray<string> = [
  "RELATED_VIDEO",    // 관련 동영상 추천 (다음 재생)
  "WHAT_TO_WATCH",    // YouTube 홈 추천
  "MY_HISTORY",       // 시청 기록 기반 추천
  "WATCH_LATER",      // 나중에 볼 영상 목록
];

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface VideoTrafficBreakdown {
  videoId: string;
  /** 소스별 비율 맵 (합계 ≈ 1.0) */
  sources: Record<string, number>;
  /** 최대 비율 소스 */
  dominantSource: string;
  /** INTERNAL_SOURCES 합산 비율 (0~1) — trafficSources 합계가 0이면 0 */
  internalRatio: number;
}

export interface TrafficResult {
  /** 영상별 트래픽 분석 */
  byVideo: VideoTrafficBreakdown[];
  /** 채널 전체 소스별 평균 비율 */
  channelAvgSources: Record<string, number>;
  /** 전체에서 가장 큰 트래픽 소스 */
  channelDominantSource: string;
  /** 채널 전체 평균 내부 유입 비율 */
  channelInternalRatio: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** sources 맵에서 INTERNAL_SOURCES 키 합산 비율 계산 */
export function computeInternalRatio(sources: Record<string, number>): number {
  const totalViews = Object.values(sources).reduce((s, v) => s + v, 0);
  if (totalViews <= 0) return 0;
  const internalViews = INTERNAL_SOURCES.reduce((s, k) => s + (sources[k] ?? 0), 0);
  const ratio = internalViews / totalViews;
  return isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
}

function dominant(sources: Record<string, number>): string {
  let max = -1;
  let key = "UNKNOWN";
  for (const [k, v] of Object.entries(sources)) {
    if (v > max) { max = v; key = k; }
  }
  return key;
}

function mergeAvg(maps: Record<string, number>[]): Record<string, number> {
  if (maps.length === 0) return {};
  const totals: Record<string, number> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      totals[k] = (totals[k] ?? 0) + v;
    }
  }
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) {
    result[k] = v / maps.length;
  }
  return result;
}

// ─── run ──────────────────────────────────────────────────────────────────────

export function run(data: NormalizedVideo[]): TrafficResult {
  const byVideo: VideoTrafficBreakdown[] = data.map(v => ({
    videoId:        v.videoId,
    sources:        v.trafficSources,
    dominantSource: dominant(v.trafficSources),
    internalRatio:  computeInternalRatio(v.trafficSources),
  }));

  const channelAvgSources     = mergeAvg(data.map(v => v.trafficSources));
  const channelDominantSource = dominant(channelAvgSources);
  const channelInternalRatio  = computeInternalRatio(channelAvgSources);

  return { byVideo, channelAvgSources, channelDominantSource, channelInternalRatio };
}
