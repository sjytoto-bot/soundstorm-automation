// ─── earlyMomentumEngine v1 ───────────────────────────────────────────────────
// 업로드 후 7일 이내 영상의 초반 성과를 분석한다.
//
// 입력:
//   tracks  — TrackResult[]   (avgViews, engagementRate 제공)
//   metaMap — Map<videoId, EarlyTrackMeta>  (retentionRate, daysSinceUpload 제공)
//
// 분석 대상: daysSinceUpload <= 7 인 영상만
//
// momentumScore = viewsScore * 0.5 + engagementScore * 0.3 + retentionScore * 0.2
//   viewsScore      = avgViews / channelMedianViews
//   engagementScore = engagementRate  (0~1)
//   retentionScore  = retentionRate   (0~1)
//
// 판단 기준:
//   > 1.2     → Rising
//   0.8~1.2   → Stable
//   < 0.8     → Declining

import type { TrackResult } from "../core/enginePipeline";

// ─── 보조 입력 타입 ────────────────────────────────────────────────────────────
// TrackResult에 없는 필드 — enginePipeline에서 NormalizedVideo + metricEngine로 채운다.

export interface EarlyTrackMeta {
  /** metricEngine VideoMetric.retentionRate (= averageViewDuration, 0~1) */
  retentionRate:   number;
  /** publishedAt 기준 오늘까지 경과일 */
  daysSinceUpload: number;
}

// ─── 출력 타입 ────────────────────────────────────────────────────────────────

export type EarlyMomentumStatus = "Rising" | "Stable" | "Declining";

export interface VideoEarlyMomentum {
  videoId:        string;
  momentumScore:  number;
  momentumStatus: EarlyMomentumStatus;
}

export interface EarlyMomentumResult {
  /** 7일 이내 영상별 분석 결과 */
  byVideo:     VideoEarlyMomentum[];
  /** 분석 대상 영상 수 (daysSinceUpload <= 7) */
  earlyCount:  number;
  /** Rising 영상 수 */
  risingCount: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function toStatus(score: number): EarlyMomentumStatus {
  if (score > 1.2)  return "Rising";
  if (score >= 0.8) return "Stable";
  return "Declining";
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 업로드 후 7일 이내 영상의 초반 성과를 분석한다.
 *
 * @param tracks   TrackResult[]  enginePipeline의 tracks 출력
 * @param metaMap  videoId → EarlyTrackMeta  retentionRate + daysSinceUpload
 * @returns        EarlyMomentumResult
 */
export function run(
  tracks:  TrackResult[],
  metaMap: Map<string, EarlyTrackMeta>,
): EarlyMomentumResult {
  // 채널 전체 중앙값 조회수 (viewsScore 분모)
  const channelMedianViews = median(tracks.map(t => t.avgViews)) || 1;

  // 분석 대상: daysSinceUpload <= 7 인 영상만
  const earlyTracks = tracks.filter(t => {
    const meta = metaMap.get(t.videoId);
    return meta !== undefined && meta.daysSinceUpload <= 7;
  });

  const byVideo: VideoEarlyMomentum[] = earlyTracks.map(t => {
    const meta = metaMap.get(t.videoId)!;

    const viewsScore      = t.avgViews / channelMedianViews;
    const engagementScore = t.engagementRate;   // (likes + comments) / views, 0~1
    const retentionScore  = meta.retentionRate; // averageViewDuration, 0~1

    const momentumScore =
      viewsScore      * 0.5 +
      engagementScore * 0.3 +
      retentionScore  * 0.2;

    return {
      videoId:        t.videoId,
      momentumScore,
      momentumStatus: toStatus(momentumScore),
    };
  });

  return {
    byVideo,
    earlyCount:  earlyTracks.length,
    risingCount: byVideo.filter(v => v.momentumStatus === "Rising").length,
  };
}
