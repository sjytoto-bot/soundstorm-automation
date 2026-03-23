// ─── strategyRecommendationEngine v1 ──────────────────────────────────────────
// 분석 엔진 결과를 기반으로 콘텐츠 전략 추천을 생성한다.
//
// 입력: AnalysisResult
//   — contentClusters, thumbnailAnalysis, algorithmEntry, trafficGrowth 참조
//
// 추천 규칙:
//   1. 콘텐츠 전략   — clusterScore 최고 cluster → "Focus on {cluster} content"
//   2. 썸네일 전략   — brightnessCorrelation / contrastCorrelation / colorCorrelation
//                     절대값 최고 feature → "Increase/Decrease {feature} in thumbnails"
//   3. 알고리즘 전략 — Entering 또는 Algorithm Boost 영상 존재 시 → "Promote rising video"
//
// confidence:
//   콘텐츠    — clusterScore (0~1 범위 그대로 사용, max 1)
//   썸네일    — |상관계수| (0~1)
//   알고리즘  — (boostCount*2 + enteringCount) / max(tracks, 1) clamp 0~1

import type { AnalysisResult } from "../core/enginePipeline";

// ─── Result Types ─────────────────────────────────────────────────────────────

export type RecommendationType = "content" | "thumbnail" | "algorithm";

export interface RecommendationResult {
  type:       RecommendationType;
  message:    string;
  /** 추천 신뢰도 (0~1) */
  confidence: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── 1. 콘텐츠 전략 ───────────────────────────────────────────────────────────

function buildContentRec(
  analysis: AnalysisResult,
): RecommendationResult | null {
  const { clusters } = analysis.contentClusters;
  if (clusters.length === 0) return null;

  // clusterScore 내림차순 정렬은 이미 엔진에서 완료됨
  const top = clusters[0];
  return {
    type:       "content",
    message:    `Focus on ${top.cluster} content`,
    confidence: clamp01(top.clusterScore),
  };
}

// ─── 2. 썸네일 전략 ───────────────────────────────────────────────────────────

type ThumbnailFeatureName = "brightness" | "contrast" | "color";

interface ThumbnailFeatureEntry {
  name:        ThumbnailFeatureName;
  label:       string;
  correlation: number;
}

function buildThumbnailRec(
  analysis: AnalysisResult,
): RecommendationResult | null {
  const { brightnessCorrelation, contrastCorrelation, colorCorrelation, sampleSize } =
    analysis.thumbnailAnalysis;

  if (sampleSize < 2) return null;

  const features: ThumbnailFeatureEntry[] = [
    { name: "brightness", label: "brightness", correlation: brightnessCorrelation },
    { name: "contrast",   label: "contrast",   correlation: contrastCorrelation   },
    { name: "color",      label: "color variance", correlation: colorCorrelation  },
  ];

  // 절대값 기준 가장 강한 상관관계 선택
  const top = features.reduce((best, f) =>
    Math.abs(f.correlation) > Math.abs(best.correlation) ? f : best,
  );

  if (Math.abs(top.correlation) < 0.05) return null; // 유의미하지 않으면 생략

  const direction = top.correlation >= 0 ? "Increase" : "Decrease";
  return {
    type:       "thumbnail",
    message:    `${direction} ${top.label} in thumbnails`,
    confidence: clamp01(Math.abs(top.correlation)),
  };
}

// ─── 3. 알고리즘 전략 ─────────────────────────────────────────────────────────

function buildAlgorithmRec(
  analysis: AnalysisResult,
): RecommendationResult | null {
  const { boostCount, enteringCount, byVideo } = analysis.algorithmEntry;
  const totalTracks = byVideo.length;

  if (boostCount === 0 && enteringCount === 0) return null;

  // boost 영상이 있으면 구체적 타이틀 포함
  const boostVideo = byVideo.find(v => v.entryStatus === "Algorithm Boost");
  const enteringVideo = byVideo.find(v => v.entryStatus === "Entering");
  const targetVideo = boostVideo ?? enteringVideo;

  // 대상 track의 name 찾기
  const targetTrack = targetVideo
    ? analysis.tracks.find(t => t.videoId === targetVideo.videoId)
    : null;

  const message = targetTrack
    ? `Promote rising video: ${targetTrack.name}`
    : "Promote rising video";

  const confidence = clamp01((boostCount * 2 + enteringCount) / Math.max(totalTracks, 1));

  return {
    type: "algorithm",
    message,
    confidence,
  };
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 분석 결과를 기반으로 전략 추천 목록을 생성한다.
 *
 * @param analysis  AnalysisResult  enginePipeline 전체 출력
 * @returns         RecommendationResult[]  confidence 내림차순
 */
export function run(analysis: AnalysisResult): RecommendationResult[] {
  const recs: RecommendationResult[] = [];

  const content   = buildContentRec(analysis);
  const thumbnail = buildThumbnailRec(analysis);
  const algorithm = buildAlgorithmRec(analysis);

  if (content)   recs.push(content);
  if (thumbnail) recs.push(thumbnail);
  if (algorithm) recs.push(algorithm);

  // confidence 내림차순 정렬
  return recs.sort((a, b) => b.confidence - a.confidence);
}
