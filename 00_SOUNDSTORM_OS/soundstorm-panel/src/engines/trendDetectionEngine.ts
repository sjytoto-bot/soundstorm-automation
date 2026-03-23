// ─── trendDetectionEngine v1 ──────────────────────────────────────────────────
// 콘텐츠 유형별 성과 변화를 분석하여 상승 트렌드를 탐지한다.
//
// 입력: AnalysisResult
//   — contentClusters (cluster, avgViews, avgVelocity, videoCount) 참조
//
// trendScore 공식:
//   avgVelocity          * 0.6
// + avgViewsNormalized   * 0.4   (avgViews / maxClusterViews, 0~1)
//
// 트렌드 상태:
//   trendScore > 0.65        → "Trending"
//   0.45 ≤ trendScore ≤ 0.65 → "Stable"
//   trendScore < 0.45        → "Declining"
//
// 결과: trendScore 내림차순 정렬

import type { AnalysisResult } from "../core/enginePipeline";

// ─── Result Types ─────────────────────────────────────────────────────────────

export type TrendStatus = "Trending" | "Stable" | "Declining";

export interface TrendResult {
  cluster:     string;
  trendScore:  number;
  trendStatus: TrendStatus;
  videoCount:  number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toStatus(score: number): TrendStatus {
  if (score > 0.65)  return "Trending";
  if (score >= 0.45) return "Stable";
  return "Declining";
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * contentClusters 데이터를 기반으로 클러스터별 트렌드를 분석한다.
 *
 * @param analysis  AnalysisResult  enginePipeline 출력 (contentClusters 완료 상태)
 * @returns         TrendResult[]   trendScore 내림차순
 */
export function run(analysis: AnalysisResult): TrendResult[] {
  const { clusters } = analysis.contentClusters;
  if (clusters.length === 0) return [];

  // avgViews 최대값 (정규화 기준)
  const maxClusterViews = Math.max(...clusters.map(c => c.avgViews), 1);

  return clusters
    .map(c => {
      const avgViewsNormalized = c.avgViews / maxClusterViews;
      const trendScore = Math.max(
        0,
        c.avgVelocity * 0.6 + avgViewsNormalized * 0.4,
      );
      return {
        cluster:     c.cluster,
        trendScore:  Math.round(trendScore * 1000) / 1000,
        trendStatus: toStatus(trendScore),
        videoCount:  c.videoCount,
      };
    })
    .sort((a, b) => b.trendScore - a.trendScore);
}
