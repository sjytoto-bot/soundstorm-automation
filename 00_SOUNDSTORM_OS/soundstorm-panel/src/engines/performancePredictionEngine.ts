// ─── performancePredictionEngine v1 ───────────────────────────────────────────
// 분석 결과를 기반으로 다음 영상의 예상 성과를 계산한다.
//
// 입력: AnalysisResult
//   — tracks, contentClusters, trendDetection, thumbnailAnalysis, uploadTiming 참조
//
// 예측 요소:
//   clusterImpact   = top cluster.clusterScore
//   trendImpact     = top trend.trendScore
//   thumbnailImpact = max(|brightnessCorr|, |contrastCorr|, |colorCorr|)
//   timingImpact    = uploadTiming.bestScore
//
// predictionScore:
//   clusterImpact * 0.35 + trendImpact * 0.30 + thumbnailImpact * 0.20 + timingImpact * 0.15
//
// predictedViews:
//   avgChannelViews * (1 + predictionScore)
//
// confidence:
//   유효 요소 비율(0~1) * 0.6 + min(sampleSize/10, 1) * 0.4

import type { AnalysisResult } from "../core/enginePipeline";

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface PredictionResult {
  /** 예상 조회수 (반올림) */
  predictedViews: number;
  /** 종합 예측 점수 (0~∞, 채널 평균 기준 상대 점수) */
  predictedScore: number;
  /** 예측 신뢰도 (0~1) */
  confidence:     number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * AnalysisResult를 기반으로 다음 영상 예상 성과를 계산한다.
 *
 * @param analysis  AnalysisResult  enginePipeline 출력 (trendDetection 완료 상태)
 * @returns         PredictionResult
 */
export function run(analysis: AnalysisResult): PredictionResult {
  const { contentClusters, trendDetection, thumbnailAnalysis, uploadTiming, tracks } = analysis;

  // ── 예측 요소 추출 ──────────────────────────────────────────────────────────

  // 1. clusterImpact — clusterScore 최고 cluster (이미 내림차순 정렬됨)
  const topCluster     = contentClusters.clusters[0];
  const clusterImpact  = topCluster?.clusterScore ?? 0;

  // 2. trendImpact — trendScore 최고 trend (이미 내림차순 정렬됨)
  const topTrend      = trendDetection[0];
  const trendImpact   = topTrend?.trendScore ?? 0;

  // 3. thumbnailImpact — 상관계수 절대값 최대
  const { brightnessCorrelation, contrastCorrelation, colorCorrelation } = thumbnailAnalysis;
  const thumbnailImpact = Math.max(
    Math.abs(brightnessCorrelation),
    Math.abs(contrastCorrelation),
    Math.abs(colorCorrelation),
  );

  // 4. timingImpact — 최적 시간대 score
  const timingImpact = uploadTiming.bestScore;

  // ── predictionScore ─────────────────────────────────────────────────────────
  const predictionScore =
    clusterImpact   * 0.35 +
    trendImpact     * 0.30 +
    thumbnailImpact * 0.20 +
    timingImpact    * 0.15;

  // ── avgChannelViews ──────────────────────────────────────────────────────────
  const avgChannelViews = mean(tracks.map(t => t.avgViews));

  // ── predictedViews ───────────────────────────────────────────────────────────
  const predictedViews = Math.round(avgChannelViews * (1 + predictionScore));

  // ── confidence ───────────────────────────────────────────────────────────────
  // 유효 요소 수 (0보다 큰 요소만 카운트)
  const validFactors = [clusterImpact, trendImpact, thumbnailImpact, timingImpact]
    .filter(v => v > 0).length;
  const factorRatio    = validFactors / 4;
  const sampleRatio    = clamp01(thumbnailAnalysis.sampleSize / 10);
  const confidence     = clamp01(factorRatio * 0.6 + sampleRatio * 0.4);

  return {
    predictedViews,
    predictedScore: Math.round(predictionScore * 1000) / 1000,
    confidence:     Math.round(confidence     * 1000) / 1000,
  };
}
