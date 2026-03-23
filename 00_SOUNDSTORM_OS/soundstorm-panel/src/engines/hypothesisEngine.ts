// ─── hypothesisEngine ─────────────────────────────────────────────────────────
// Pack Performance + Hypothesis → 패턴 추출 → Next Opportunity 추천
//
// 흐름:
//   실험 데이터 (hypothesis + performance)
//   ↓
//   패턴 분석 (차원별 성과 집계)
//   ↓
//   Best Pattern 추출
//   ↓
//   Next Opportunity 추천
//
// 패턴 차원:
//   theme / thumbnailStyle / hookType / targetEmotion
//   단일 차원 + 복합 차원(theme × thumbnailStyle) 모두 분석
//
// 사용처:
//   GrowthLoopMonitor (Best Pattern 카드 + 패턴 기반 Next Opportunity)

import type { ContentPack, PackHypothesis } from "@/core/types/contentPack";
import { calcPerformanceScore } from "./packPerformanceEngine";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** 단일 패턴 결과 (차원 1개 또는 복합) */
export interface PatternResult {
  /** 패턴 레이블 (예: "Oriental Trap × Red Epic") */
  label:      string;
  /** 패턴을 구성하는 차원 */
  dimensions: Partial<PackHypothesis>;
  /** 해당 패턴이 적용된 Pack 수 (sample size) */
  packCount:  number;
  /** 평균 CTR (0~1) */
  avgCtr:     number;
  /** 평균 성과 Score (0~100) */
  avgScore:   number;
  /** 신뢰도 점수: log(count + 1) * avgScore — sample size 반영 */
  confidence: number;
  /** 기여 Pack ID 목록 */
  packIds:    string[];
}

/** hypothesisEngine 전체 출력 */
export interface HypothesisInsight {
  /** 성과 기준 상위 패턴 목록 */
  bestPatterns:       PatternResult[];
  /** 패턴 기반 Next Opportunity 추천 테마 */
  nextOpportunities:  string[];
  /** 실험 가능한 Pack 수 (hypothesis + performance 모두 있음) */
  experimentCount:    number;
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/** 차원 레이블 생성 */
function dimensionLabel(dims: Partial<PackHypothesis>): string {
  return Object.values(dims).filter(Boolean).join(" × ");
}

/** hypothesis + performance 모두 있는 Pack만 필터 */
function getExperiments(packs: ContentPack[]): ContentPack[] {
  return packs.filter(
    p => p.hypothesis &&
         Object.values(p.hypothesis).some(Boolean) &&
         p.performance &&
         (p.performance.ctr || p.performance.views)
  );
}

/** 차원 조합별 패턴 집계 */
function aggregateByDimensions(
  experiments: ContentPack[],
  getDims: (h: PackHypothesis) => Partial<PackHypothesis>,
): Map<string, { dims: Partial<PackHypothesis>; packs: ContentPack[] }> {
  const map = new Map<string, { dims: Partial<PackHypothesis>; packs: ContentPack[] }>();

  for (const pack of experiments) {
    const dims  = getDims(pack.hypothesis!);
    const label = dimensionLabel(dims);
    if (!label) continue;

    const existing = map.get(label);
    if (existing) {
      existing.packs.push(pack);
    } else {
      map.set(label, { dims, packs: [pack] });
    }
  }
  return map;
}

/** 집계 맵 → PatternResult[] */
function toPatternResults(
  map: Map<string, { dims: Partial<PackHypothesis>; packs: ContentPack[] }>,
): PatternResult[] {
  return Array.from(map.entries()).map(([label, { dims, packs }]) => {
    const ctrs   = packs.map(p => p.performance?.ctr ?? 0).filter(c => c > 0);
    const scores = packs.map(p => calcPerformanceScore(p.performance!).total);
    const count  = packs.length;

    const avgCtr   = ctrs.length   > 0 ? ctrs.reduce((a, b)   => a + b, 0) / ctrs.length   : 0;
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // confidence = log(count + 1) * avgScore * (1 + avgCtr / 10)
    // sample 1개: log(2) ≈ 0.69 → score * 0.69  (신뢰도 낮음)
    // sample 5개: log(6) ≈ 1.79 → score * 1.79  (신뢰도 높음)
    // CTR weight:  3% → ×1.3 / 6% → ×1.6 / 8% → ×1.8  (CTR 높을수록 빠르게 상승)
    const confidence = Math.log(count + 1) * avgScore * (1 + avgCtr / 0.1);

    return {
      label,
      dimensions: dims,
      packCount:  count,
      avgCtr,
      avgScore,
      confidence,
      packIds:    packs.map(p => p.id),
    };
  });
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * Pack 목록을 분석해 가설 패턴 + Next Opportunity를 생성한다.
 *
 * 분석 차원:
 *   - theme 단독
 *   - thumbnailStyle 단독
 *   - hookType 단독
 *   - theme × thumbnailStyle 복합 (가장 강력한 신호)
 */
export function analyzeHypotheses(packs: ContentPack[]): HypothesisInsight {
  const experiments = getExperiments(packs);

  if (experiments.length === 0) {
    return { bestPatterns: [], nextOpportunities: [], experimentCount: 0 };
  }

  // 각 차원 집계
  const themeMap     = aggregateByDimensions(experiments, h => ({ theme:          h.theme }));
  const thumbMap     = aggregateByDimensions(experiments, h => ({ thumbnailStyle: h.thumbnailStyle }));
  const hookMap      = aggregateByDimensions(experiments, h => ({ hookType:       h.hookType }));
  const comboMap     = aggregateByDimensions(experiments, h => ({
    theme:          h.theme,
    thumbnailStyle: h.thumbnailStyle,
  }));

  // 전체 합산 + avgScore 내림차순 정렬
  const all: PatternResult[] = [
    ...toPatternResults(themeMap),
    ...toPatternResults(thumbMap),
    ...toPatternResults(hookMap),
    ...toPatternResults(comboMap),
  ].sort((a, b) => b.confidence - a.confidence || b.avgScore - a.avgScore);

  // 중복 제거 (label 기준) + 상위 6개
  const seen = new Set<string>();
  const bestPatterns = all.filter(p => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  }).slice(0, 6);

  // Next Opportunity 생성:
  //   1. 상위 theme 패턴의 theme 값 → 직접 추천
  //   2. 상위 복합(theme × thumbnailStyle) → "Theme + Style 시리즈" 형태로 추천
  const nextOpportunities: string[] = [];

  bestPatterns.forEach(p => {
    const { theme, thumbnailStyle } = p.dimensions;
    if (theme && thumbnailStyle && p.avgScore >= 40) {
      nextOpportunities.push(`${theme} + ${thumbnailStyle} 시리즈`);
    } else if (theme && p.avgScore >= 30) {
      nextOpportunities.push(theme);
    }
  });

  return {
    bestPatterns,
    nextOpportunities: [...new Set(nextOpportunities)].slice(0, 6),
    experimentCount:   experiments.length,
  };
}
