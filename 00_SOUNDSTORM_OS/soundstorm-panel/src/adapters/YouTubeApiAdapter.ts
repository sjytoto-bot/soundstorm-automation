// ─── YouTubeApiAdapter v1 ──────────────────────────────────────────────────────
// YouTube Data API v3 + Analytics API 원본 응답을 NormalizedVideo 배열로 변환한다.
// items: videos.list(part=snippet,statistics,contentDetails) 응답 기준

import type { NormalizedVideo } from "../core/types/normalized";

// ─── 원본 타입 (YouTube Data API v3 응답 구조 기준) ───────────────────────────

export interface YouTubeApiItem {
  id: string;
  snippet?: {
    title?:       string;
    publishedAt?: string;
    tags?:        string[];
    thumbnails?: {
      high?: { url?: string };
      default?: { url?: string };
    };
  };
  statistics?: {
    viewCount?:    string;
    likeCount?:    string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;   // ISO 8601 duration (e.g. "PT3M45S")
  };
}

// Analytics API 행 결과 (video 단위 축소 보고서)
export interface YouTubeAnalyticsRow {
  videoId:              string;
  estimatedRevenue?:    number;
  subscriberChange?:    number;
  watchTimeMinutes?:    number;
  averageViewDuration?: number;
  trafficSources?:      Record<string, number>;
  // ── IPC fetchYTAnalytics 결과 (impressions + ctr) ──────────────────────────
  impressions?:         number;
  ctr?:                 number;   // 0~1 비율
}

// IPC raw row 타입: [videoId, impressions, ctr]
// Electron Main의 fetchAnalytics() 반환값 형식
export type RawAnalyticsRow = [string, number, number];

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | undefined, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

/** ISO 8601 duration → 초 변환 (PT1H2M3S 형식) */
function parseDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (toNum(m[1]) * 3600) + (toNum(m[2]) * 60) + toNum(m[3]);
}

function thumbnailUrl(snippet: YouTubeApiItem["snippet"]): string {
  return snippet?.thumbnails?.high?.url
    ?? snippet?.thumbnails?.default?.url
    ?? "";
}

// ─── parseRawAnalyticsRows ────────────────────────────────────────────────────
// IPC fetchYTAnalytics() 반환값 [videoId, impressions, ctr][] →
// YouTubeAnalyticsRow[] (impressions/ctr만 채워진 sparse 객체)

export function parseRawAnalyticsRows(
  rawRows: RawAnalyticsRow[],
): Pick<YouTubeAnalyticsRow, "videoId" | "impressions" | "ctr">[] {
  return rawRows.map(([videoId, impressions, ctr]) => ({
    videoId,
    impressions: Number(impressions) || 0,
    ctr:         Number(ctr)         || 0,
  }));
}

// ─── adapt ────────────────────────────────────────────────────────────────────
// @param  items         YouTube Data API items 배열
// @param  analyticsRows Analytics API 행 배열 (없으면 빈 배열)
//                       impressions/ctr가 채워진 행을 포함해도 무방
// @returns NormalizedVideo[]

export function adapt(
  items:         YouTubeApiItem[],
  analyticsRows: YouTubeAnalyticsRow[] = [],
): NormalizedVideo[] {
  // Analytics 데이터를 videoId 기준으로 인덱스 구성
  const analyticsMap = new Map<string, YouTubeAnalyticsRow>(
    analyticsRows.map(r => [r.videoId, r])
  );

  return items
    .filter(item => Boolean(item.id))
    .map<NormalizedVideo>(item => {
      const analytics = (analyticsMap.get(item.id) ?? {}) as Partial<YouTubeAnalyticsRow>;
      return {
        videoId:             item.id,
        title:               item.snippet?.title ?? "",
        publishedAt:         item.snippet?.publishedAt ?? "",
        views:               toNum(item.statistics?.viewCount),
        likes:               toNum(item.statistics?.likeCount),
        comments:            toNum(item.statistics?.commentCount),
        watchTimeMinutes:    analytics.watchTimeMinutes    ?? 0,
        averageViewDuration: analytics.averageViewDuration ?? 0,
        estimatedRevenue:    analytics.estimatedRevenue    ?? 0,
        subscriberChange:    analytics.subscriberChange    ?? 0,
        trafficSources:      analytics.trafficSources      ?? {},
        thumbnailUrl:        thumbnailUrl(item.snippet),
        tags:                item.snippet?.tags            ?? [],
        durationSeconds:     parseDuration(item.contentDetails?.duration),
        source:              "youtube_api",
        // Analytics API 보강 필드 (없으면 undefined)
        impressions:         analytics.impressions,
        ctr:                 analytics.ctr,
      };
    });
}

// ─── mergeAnalyticsIntoNormalized ─────────────────────────────────────────────
// 이미 정규화된 NormalizedVideo[] 배열에 IPC raw rows를 후처리로 join한다.
// enginePipeline에서 기존 정규화 후 Analytics 데이터를 추가할 때 사용.
//
// @param  videos   기존 NormalizedVideo[]
// @param  rawRows  window.api.fetchYTAnalytics() 결과 ([videoId, impr, ctr][])
// @returns         impressions/ctr가 채워진 새 배열 (원본 불변)

export function mergeAnalyticsIntoNormalized(
  videos:  NormalizedVideo[],
  rawRows: RawAnalyticsRow[],
): NormalizedVideo[] {
  const analyticsMap = new Map<string, { impressions: number; ctr: number }>(
    rawRows.map(([videoId, impressions, ctr]) => [
      videoId,
      { impressions: Number(impressions) || 0, ctr: Number(ctr) || 0 },
    ])
  );

  return videos.map(v => {
    const a = analyticsMap.get(v.videoId);
    if (!a) return v;
    return { ...v, impressions: a.impressions, ctr: a.ctr };
  });
}
