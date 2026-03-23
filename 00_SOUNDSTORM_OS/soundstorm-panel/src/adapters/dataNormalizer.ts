// ─── dataNormalizer v1 ────────────────────────────────────────────────────────
// RawVideoRow[] (Google Sheets 원본) → NormalizedVideo[] (엔진 파이프라인 입력)
//
// 변환 규칙:
//   views            → views         (avgViews 개념, 엔진에서 채널 평균과 비교됨)
//   likes / views    → likeRate 파생 (metricEngine.run() 에서 직접 계산)
//   comments / views → commentRate 파생 (metricEngine.run() 에서 직접 계산)
//   watchTimeMinutes → watchTimeMinutes
//   uploadDate       → publishedAt   (ISO 8601 정규화)
//                    → averageViewDuration 추정 (watchTime ÷ views ÷ ASSUMED_DURATION)
//
// Google Sheets 미제공 필드 기본값:
//   averageViewDuration  watchTimeMinutes / (views × 5분) 추정, clamp 0~1
//   estimatedRevenue     0
//   subscriberChange     0
//   trafficSources       {}   ← trafficEngine은 빈 맵을 허용
//   thumbnailUrl         ""
//   tags                 []
//   durationSeconds      0
//   source               "google_sheet"

import type { NormalizedVideo } from "../core/types/normalized";
import type { RawVideoRow } from "./GoogleSheetAdapter";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** 0 나누기 및 Infinity/NaN 방지 */
function safeDivide(a: number, b: number): number {
  if (!b || !isFinite(b)) return 0;
  const r = a / b;
  return isFinite(r) ? r : 0;
}

/**
 * 업로드일 문자열을 ISO 8601 로 정규화한다.
 * 파싱 불가 시 빈 문자열 반환.
 */
function toISO(raw: string): string {
  if (!raw?.trim()) return "";
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * 업로드일 기준 오늘까지 경과 일수.
 * momentumEngine 이 publishedAt 문자열로 동일 계산을 수행하므로
 * 여기선 averageViewDuration 추정에만 활용한다.
 */
function daysSinceUpload(uploadDate: string): number {
  if (!uploadDate) return 0;
  const d = new Date(uploadDate);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

// ─── normalizeVideos ──────────────────────────────────────────────────────────

/**
 * RawVideoRow[] → NormalizedVideo[]
 *
 * Google Sheets 데이터를 enginePipeline 입력 구조로 변환한다.
 * video_id 가 없는 행은 필터링된다.
 *
 * @param rawRows fetchSheetVideos() 반환값
 * @returns NormalizedVideo[]  runFullAnalysis() 에 직접 전달 가능
 */
export function normalizeVideos(rawRows: RawVideoRow[]): NormalizedVideo[] {
  return rawRows
    .filter(row => Boolean(row.videoId?.trim()))
    .map<NormalizedVideo>(row => {
      const views = Math.max(0, row.views);
      const likes = Math.max(0, row.likes);
      const comments = Math.max(0, row.comments);
      const watchTimeMinutes = Math.max(0, row.watchTimeMinutes);

      // averageViewDuration 추정:
      // 시트는 영상 길이를 제공하지 않으므로 5분(업로드 음악 기준)으로 가정.
      // watchTimeMinutes / (views × 5min) → 0~1 clamp
      const ASSUMED_DURATION_MIN = 5;
      const averageViewDuration =
        views > 0
          ? Math.min(1, safeDivide(watchTimeMinutes, views * ASSUMED_DURATION_MIN))
          : 0;

      return {
        videoId: row.videoId.trim(),
        title: row.title ?? "",
        publishedAt: toISO(row.uploadDate),
        views,
        likes,
        comments,
        watchTimeMinutes,
        averageViewDuration,
        estimatedRevenue: 0,
        subscriberChange: 0,
        // 트래픽 소스: 시트에 열이 있으면 파싱, 없으면 빈 객체 (trafficEngine 허용)
        trafficSources: ((row.trafficInternalPct || row.trafficSuggestedPct)
          ? {
              SUGGESTED_VIDEO: row.trafficSuggestedPct ?? 0,
              YOUTUBE_SEARCH:  row.trafficSearchPct    ?? 0,
              BROWSE:          row.trafficBrowsePct    ?? 0,
              RELATED_VIDEO:   row.trafficInternalPct  ?? 0,
              EXTERNAL:        row.trafficExternalPct  ?? 0,
            }
          : {}) as Record<string, number>,
        thumbnailUrl: row.thumbnailUrl,
        tags: [],
        durationSeconds: 0,
        source: "google_sheet",
      };
    });
}

// ─── re-export helper ─────────────────────────────────────────────────────────
// 외부에서 개별 유틸이 필요할 때 사용

export { daysSinceUpload, toISO };
