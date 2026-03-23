// ─── strategyOptimizerEngine v1 ───────────────────────────────────────────────
// 분석 결과와 예측 결과를 결합하여 다음 업로드 전략을 생성한다.
//
// 입력: AnalysisResult
//   — contentClusters, trendDetection, performancePrediction,
//     thumbnailAnalysis, uploadTiming 참조
//
// 전략 생성:
//   1. contentStrategy  — trendStatus="Trending" cluster 결합
//                          "Create more {clusters} content"
//   2. thumbnailStrategy — |correlation| 최대 feature
//                          "Increase/Decrease {feature} in thumbnails"
//   3. timingStrategy   — uploadTiming.bestHour
//                          "Upload around {bestHour}:00"
//   4. expectedViews    — performancePrediction.predictedViews
//   5. confidence       — performancePrediction.confidence

import type { AnalysisResult } from "../core/enginePipeline";

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface StrategyPlan {
  contentStrategy:   string;
  thumbnailStrategy: string;
  timingStrategy:    string;
  expectedViews:     number;
  confidence:        number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// 1. 콘텐츠 전략 ───────────────────────────────────────────────────────────────

function buildContentStrategy(analysis: AnalysisResult): string {
  const trending = analysis.trendDetection
    .filter(t => t.trendStatus === "Trending")
    .map(t => t.cluster);

  if (trending.length === 0) {
    // Trending 없으면 top cluster 사용
    const top = analysis.contentClusters.clusters[0];
    return top
      ? `Create more ${top.cluster} content`
      : "Create more content";
  }

  return `Create more ${trending.join(" ")} content`;
}

// 2. 썸네일 전략 ───────────────────────────────────────────────────────────────

interface FeatureEntry {
  label:       string;
  correlation: number;
}

function buildThumbnailStrategy(analysis: AnalysisResult): string {
  const { brightnessCorrelation, contrastCorrelation, colorCorrelation } =
    analysis.thumbnailAnalysis;

  const features: FeatureEntry[] = [
    { label: "brightness",     correlation: brightnessCorrelation },
    { label: "contrast",       correlation: contrastCorrelation   },
    { label: "color variance", correlation: colorCorrelation      },
  ];

  const top = features.reduce((best, f) =>
    Math.abs(f.correlation) > Math.abs(best.correlation) ? f : best,
  );

  if (Math.abs(top.correlation) < 0.05) {
    return "Optimize thumbnail visuals";
  }

  const direction = top.correlation >= 0 ? "Increase" : "Decrease";
  return `${direction} ${top.label} in thumbnails`;
}

// 3. 업로드 시간 전략 ──────────────────────────────────────────────────────────

function buildTimingStrategy(analysis: AnalysisResult): string {
  const { bestHour } = analysis.uploadTiming;
  if (bestHour < 0) return "No upload timing data available";
  return `Upload around ${bestHour}:00`;
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 분석 결과를 결합하여 다음 업로드 전략 플랜을 생성한다.
 *
 * @param analysis  AnalysisResult  enginePipeline 출력 (performancePrediction 완료 상태)
 * @returns         StrategyPlan
 */
export function run(analysis: AnalysisResult): StrategyPlan {
  const { predictedViews, confidence } = analysis.performancePrediction;

  return {
    contentStrategy:   buildContentStrategy(analysis),
    thumbnailStrategy: buildThumbnailStrategy(analysis),
    timingStrategy:    buildTimingStrategy(analysis),
    expectedViews:     predictedViews,
    confidence,
  };
}
