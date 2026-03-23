// ─── Strategy Score Calculator v1 ─────────────────────────────────────────────
// Track 전략 점수 산출 — 0~100 범위 강제, side effect 없음 (pure function)

// ─── helpers ──────────────────────────────────────────────────────────────────

const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

// ─── constants ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  growth:       0.25,
  reach:        0.25,
  engagement:   0.30,
  monetization: 0.20,
};

// 내림차순 임계값 — 첫 번째로 충족하는 등급 적용
const GRADE_THRESHOLDS = [
  [80, "A"],
  [60, "B"],
  [40, "C"],
  [0,  "D"],
];

// ─── sortTracks ───────────────────────────────────────────────────────────────
// @param  tracks  Array of track objects (with .strategy)
// @param  sortKey "strategy" | "reach" | "engagement" | "growth" | "monetization"
// @returns 새로운 정렬 배열 (원본 불변)

export function sortTracks(tracks, sortKey) {
  const field = sortKey === "strategy" ? "total" : sortKey;
  return [...tracks].sort((a, b) => b.strategy[field] - a.strategy[field]);
}

// ─── confidence 임계값 ─────────────────────────────────────────────────────────
// channelAvgViews 기준 표본 신뢰도
//   >= 1500 → High    (표본 충분)
//   >= 1000 → Medium  (보통)
//   <  1000 → Low     (표본 부족 — total 패널티 적용)

function calcConfidence(channelAvgViews) {
  if (channelAvgViews >= 1500) return "High";
  if (channelAvgViews >= 1000) return "Medium";
  return "Low";
}

// ─── calculateStrategyScore ────────────────────────────────────────────────────
// @param  track           { subGrowthRate, avgViews, engagementRate, rpmIndex }
//                         subGrowthRate / engagementRate / rpmIndex: 0~1 fraction
//                         avgViews: number (채널 일평균 대비 비교값)
// @param  channelAvgViews number — 채널 일평균 조회수
// @param  weights         { growth, reach, engagement, monetization } — 합계 1.0
//                         미전달 시 기본값(WEIGHTS) 사용
// @returns { growth, reach, reachRaw, reachNormalized,
//            engagement, monetization, total, grade, confidence }

export function calculateStrategyScore(track, channelAvgViews, weights = WEIGHTS) {
  const growth         = clamp(track.subGrowthRate * 100);
  const reachRaw       = (track.avgViews / Math.max(channelAvgViews, 1)) * 100;
  const reachNorm      = clamp(reachRaw);          // 0~100 정규화 (total 계산용)
  const engagement     = clamp(track.engagementRate * 100);
  const monetization   = clamp(track.rpmIndex * 100);

  let total = Math.round(
    growth       * weights.growth +
    reachNorm    * weights.reach +
    engagement   * weights.engagement +
    monetization * weights.monetization
  );

  // ── Minimum Sample Guard ────────────────────────────────────────────────────
  // 채널 일평균 조회수 < 1000 → 표본 부족 왜곡 방지 -10 패널티
  if (channelAvgViews < 1000) {
    total = Math.max(0, total - 10);
  }

  const grade      = GRADE_THRESHOLDS.find(([min]) => total >= min)?.[1] ?? "D";
  const confidence = calcConfidence(channelAvgViews);

  return {
    growth:          Math.round(growth),
    reach:           Math.round(reachNorm),    // 기존 참조(s.reach) 호환 유지
    reachRaw:        Math.round(reachRaw),
    reachNormalized: Math.round(reachNorm),
    engagement:      Math.round(engagement),
    monetization:    Math.round(monetization),
    total,
    grade,
    confidence,
  };
}
