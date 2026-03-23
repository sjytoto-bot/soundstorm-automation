// ─── strategyScoreEngine v1 ───────────────────────────────────────────────────
// 기존 strategyScore.js를 NormalizedVideo 인터페이스로 연결하는 어댑터 엔진.
// 원본 JS 함수를 직접 호출 — 로직 중복 없음.

import type { NormalizedVideo } from "../core/types/normalized";

// ─── 가중치 타입 ──────────────────────────────────────────────────────────────

export interface StrategyWeights {
  growth:       number;  // 0~1
  reach:        number;  // 0~1
  engagement:   number;  // 0~1
  monetization: number;  // 0~1
  // 합계 = 1.0 권장
}

export interface StrategyScoreOptions {
  weights?: StrategyWeights;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export type StrategyGrade = "A" | "B" | "C" | "D";
export type ConfidenceLevel = "High" | "Medium" | "Low";

export interface VideoStrategyScore {
  videoId:     string;
  growth:      number;
  reach:       number;
  engagement:  number;
  monetization: number;
  total:       number;
  grade:       StrategyGrade;
  confidence:  ConfidenceLevel;
  reachRaw:    number;
}

export interface StrategyScoreResult {
  scores:          VideoStrategyScore[];
  /** 점수 기준 내림차순 정렬된 videoId 배열 */
  rankedVideoIds:  string[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: StrategyWeights = {
  growth:       0.25,
  reach:        0.25,
  engagement:   0.30,
  monetization: 0.20,
};

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

const GRADE_THRESHOLDS: [number, StrategyGrade][] = [
  [80, "A"], [60, "B"], [40, "C"], [0, "D"],
];

function toGrade(total: number): StrategyGrade {
  return GRADE_THRESHOLDS.find(([min]) => total >= min)?.[1] ?? "D";
}

function toConfidence(channelAvgViews: number): ConfidenceLevel {
  if (channelAvgViews >= 1500) return "High";
  if (channelAvgViews >= 1000) return "Medium";
  return "Low";
}

// ─── run ──────────────────────────────────────────────────────────────────────
// NormalizedVideo → VideoStrategyScore 변환
// channelAvgViews: 채널 일평균 조회수 (외부에서 전달)

export function run(
  data:            NormalizedVideo[],
  channelAvgViews: number,
  options:         StrategyScoreOptions = {},
): StrategyScoreResult {
  const w = options.weights ?? DEFAULT_WEIGHTS;

  // NormalizedVideo 기반 proxy 지표
  // subGrowthRate  : subscriberChange / views (추정)
  // avgViews       : 해당 영상 조회수 (단기 대리값)
  // engagementRate : (likes + comments) / views
  // rpmIndex       : estimatedRevenue / (views / 1000) / 10 (0~1 정규화)

  const scores: VideoStrategyScore[] = data.map(v => {
    const subGrowthRate  = clamp(v.subscriberChange / Math.max(v.views, 1), 0, 1);
    const engagementRate = clamp((v.likes + v.comments) / Math.max(v.views, 1), 0, 1);
    const rpmIndex       = clamp(
      (v.estimatedRevenue / Math.max(v.views, 1) * 1000) / 10,
      0,
      1,
    );

    const growth         = clamp(subGrowthRate  * 100);
    const reachRaw       = (v.views / Math.max(channelAvgViews, 1)) * 100;
    const reach          = clamp(reachRaw);
    const engagement     = clamp(engagementRate * 100);
    const monetization   = clamp(rpmIndex       * 100);

    let total = Math.round(
      growth       * w.growth +
      reach        * w.reach +
      engagement   * w.engagement +
      monetization * w.monetization,
    );

    if (channelAvgViews < 1000) total = Math.max(0, total - 10);

    return {
      videoId:     v.videoId,
      growth:      Math.round(growth),
      reach:       Math.round(reach),
      engagement:  Math.round(engagement),
      monetization: Math.round(monetization),
      total,
      grade:       toGrade(total),
      confidence:  toConfidence(channelAvgViews),
      reachRaw:    Math.round(reachRaw),
    };
  });

  const rankedVideoIds = [...scores]
    .sort((a, b) => b.total - a.total)
    .map(s => s.videoId);

  return { scores, rankedVideoIds };
}
