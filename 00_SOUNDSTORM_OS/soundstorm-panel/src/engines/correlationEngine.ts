// ─── correlationEngine v1 ─────────────────────────────────────────────────────
// NormalizedVideo 지표 간 Pearson 상관관계를 계산한다.
// 결과는 전략 인사이트 생성 및 가중치 추천에 활용된다.

import type { NormalizedVideo } from "../core/types/normalized";

// ─── 분석 가능한 지표 키 ──────────────────────────────────────────────────────
export type MetricKey =
  | "views"
  | "likes"
  | "comments"
  | "watchTimeMinutes"
  | "averageViewDuration"
  | "estimatedRevenue"
  | "subscriberChange"
  | "durationSeconds";

export interface CorrelationPair {
  keyA:        MetricKey;
  keyB:        MetricKey;
  pearsonR:    number;    // -1 ~ +1
  /** 상관 강도 레이블 */
  strength:    "Strong" | "Moderate" | "Weak" | "Negligible";
  /** 상관 방향 */
  direction:   "Positive" | "Negative" | "None";
  /** 계산에 사용된 샘플 수 */
  sampleSize:  number;
}

export interface CorrelationResult {
  pairs: CorrelationPair[];
  /** 가장 강한 양의 상관 쌍 */
  strongestPositive: CorrelationPair | null;
  /** 가장 강한 음의 상관 쌍 */
  strongestNegative: CorrelationPair | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractValues(data: NormalizedVideo[], key: MetricKey): number[] {
  return data.map(v => (v as unknown as Record<string, number>)[key] ?? 0);
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;

  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;

  let cov = 0, stdX = 0, stdY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov  += dx * dy;
    stdX += dx * dx;
    stdY += dy * dy;
  }

  const denom = Math.sqrt(stdX * stdY);
  return denom < 1e-10 ? 0 : cov / denom;
}

function toStrength(r: number): CorrelationPair["strength"] {
  const abs = Math.abs(r);
  if (abs >= 0.7) return "Strong";
  if (abs >= 0.4) return "Moderate";
  if (abs >= 0.2) return "Weak";
  return "Negligible";
}

function toDirection(r: number): CorrelationPair["direction"] {
  if (r >  0.1) return "Positive";
  if (r < -0.1) return "Negative";
  return "None";
}

// ─── computeInternalCorrelations ──────────────────────────────────────────────
// 내부 유입 비율(internalRatio)과 성장률/시청 지속률 간 Pearson 상관계수를 계산한다.
// impressions/CTR 없이도 썸네일·추천 전략의 영향력을 측정하기 위해 사용한다.
//
// @param  items       분석 대상 배열 — 각 항목은 세 필드가 모두 유효한 숫자여야 함
// @param  minSamples  최소 샘플 수 (기본 5개 미만이면 null 반환)
// @returns            두 상관계수 | null (샘플 부족 또는 모두 NaN)

export interface InternalCorrelationInput {
  internalRatio: number;   // YouTube 내부 유입 비율 (0~1)
  growthRate:    number;   // 구독자 증가율 대리값 (subGrowthRate)
  retentionRate: number;   // 시청 지속률 대리값 (engagementRate)
}

export interface InternalCorrelationResult {
  internal_growth:    number;   // r(internalRatio, growthRate)   -1~+1
  internal_retention: number;   // r(internalRatio, retentionRate) -1~+1
  sampleSize:         number;
}

export function computeInternalCorrelations(
  items:      InternalCorrelationInput[],
  minSamples = 5,
): InternalCorrelationResult | null {
  // NaN / Infinity 필터링 (NaN 방지)
  const valid = items.filter(
    v =>
      isFinite(v.internalRatio) &&
      isFinite(v.growthRate)    &&
      isFinite(v.retentionRate)
  );

  if (valid.length < minSamples) return null;

  const internalVals  = valid.map(v => v.internalRatio);
  const growthVals    = valid.map(v => v.growthRate);
  const retentionVals = valid.map(v => v.retentionRate);

  const rGrowth    = pearson(internalVals, growthVals);
  const rRetention = pearson(internalVals, retentionVals);

  return {
    internal_growth:    isNaN(rGrowth)    ? 0 : Math.round(rGrowth    * 1000) / 1000,
    internal_retention: isNaN(rRetention) ? 0 : Math.round(rRetention * 1000) / 1000,
    sampleSize:         valid.length,
  };
}

// ─── run ──────────────────────────────────────────────────────────────────────

const METRIC_KEYS: MetricKey[] = [
  "views",
  "likes",
  "comments",
  "watchTimeMinutes",
  "averageViewDuration",
  "estimatedRevenue",
  "subscriberChange",
  "durationSeconds",
];

export function run(
  data:  NormalizedVideo[],
  keys?: MetricKey[],
): CorrelationResult {
  const targetKeys = keys ?? METRIC_KEYS;
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < targetKeys.length; i++) {
    for (let j = i + 1; j < targetKeys.length; j++) {
      const keyA = targetKeys[i];
      const keyB = targetKeys[j];
      const xs   = extractValues(data, keyA);
      const ys   = extractValues(data, keyB);
      const r    = pearson(xs, ys);

      pairs.push({
        keyA,
        keyB,
        pearsonR:   Math.round(r * 1000) / 1000,
        strength:   toStrength(r),
        direction:  toDirection(r),
        sampleSize: data.length,
      });
    }
  }

  const sorted = [...pairs].sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR));

  return {
    pairs,
    strongestPositive: sorted.find(p => p.direction === "Positive") ?? null,
    strongestNegative: sorted.find(p => p.direction === "Negative") ?? null,
  };
}
