// ─── metricEngine v1 ──────────────────────────────────────────────────────────
// NormalizedVideo 배열에서 영상별 핵심 지표를 산출한다.
// 출력값은 enginePipeline에서 다른 엔진과 조합된다.

import type { NormalizedVideo } from "../core/types/normalized";

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface VideoMetric {
  videoId: string;

  /** 좋아요 / 조회수 (0~1) */
  likeRate: number;

  /** 댓글 / 조회수 (0~1) */
  commentRate: number;

  /** 시청 지속률 (averageViewDuration 그대로, 0~1) */
  retentionRate: number;

  /** 조회수 대비 시청 시간 효율 (watchTimeMinutes / views, 분 단위) */
  watchTimePerView: number;

  /** CPM 추정치 (estimatedRevenue / views * 1000, USD) */
  estimatedCpm: number;

  /** 수익화 효율 (revenue / watchTimeMinutes) */
  revenuePerMinute: number;
}

export interface MetricResult {
  metrics: VideoMetric[];
  /** 채널 전체 평균 지표 */
  channelAvg: Omit<VideoMetric, "videoId">;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function safe(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── run ──────────────────────────────────────────────────────────────────────

export function run(data: NormalizedVideo[]): MetricResult {
  const metrics: VideoMetric[] = data.map(v => ({
    videoId:          v.videoId,
    likeRate:         safe(v.likes,           v.views),
    commentRate:      safe(v.comments,        v.views),
    retentionRate:    v.averageViewDuration,
    watchTimePerView: safe(v.watchTimeMinutes, v.views),
    estimatedCpm:     safe(v.estimatedRevenue, v.views) * 1000,
    revenuePerMinute: safe(v.estimatedRevenue, v.watchTimeMinutes),
  }));

  const channelAvg: Omit<VideoMetric, "videoId"> = {
    likeRate:         avg(metrics.map(m => m.likeRate)),
    commentRate:      avg(metrics.map(m => m.commentRate)),
    retentionRate:    avg(metrics.map(m => m.retentionRate)),
    watchTimePerView: avg(metrics.map(m => m.watchTimePerView)),
    estimatedCpm:     avg(metrics.map(m => m.estimatedCpm)),
    revenuePerMinute: avg(metrics.map(m => m.revenuePerMinute)),
  };

  return { metrics, channelAvg };
}
