// ─── Period Aggregator v1 ───────────────────────────────────────────────────────
// DAILY_STATS 기반 기간별 채널 집계 — pure function, side effect 없음
//
// period: "7" | "30" | "90" | "all"
// slice:  dailyStats 말미 N 항목 (0번 인덱스 = 가장 과거)
//
// return:
//   avgViews       — 기간 일평균 조회수  (reach 계산의 채널 기준값)
//   subGrowthRate  — 기간 내 후반부 / 전반부 조회수 비율 (중립 1.0 → 0.5 정규화)
//   engagementRate — 기간 일평균 조회수 / 3 000 임계값 정규화
//   rpmIndex       — 기간 revenue/view ÷ 3.5 기준 정규화

const clamp01 = v => Math.max(0, Math.min(1, v));

export function aggregateStats(dailyStats, period) {
  const n     = period === "all"
    ? dailyStats.length
    : Math.min(Number(period), dailyStats.length);
  const slice = dailyStats.slice(-n);
  const len   = slice.length;

  const avgViews   = slice.reduce((s, d) => s + d.views,   0) / len;
  const avgRevenue = slice.reduce((s, d) => s + d.revenue, 0) / len;

  // ── 기간 내 추세 (후반부 평균 / 전반부 평균) ─────────────────────────────
  // 중립(1.0) → 0.5,  2배 성장 → 1.0,  절반 감소 → 0.25
  const half      = Math.ceil(len / 2);
  const earlyAvg  = slice.slice(0, half).reduce((s, d) => s + d.views, 0) / half;
  const recentAvg = slice.slice(half).reduce((s, d) => s + d.views, 0) / Math.max(len - half, 1);
  const subGrowthRate = clamp01(recentAvg / (2 * Math.max(earlyAvg, 1)));

  // ── 기간 평균 조회수 / 3 000 (채널 우수 기준) ────────────────────────────
  const engagementRate = clamp01(avgViews / 3000);

  // ── revenue-per-view ÷ 3.5 기준 RPM 정규화 ──────────────────────────────
  const rpmRaw   = avgRevenue / Math.max(avgViews, 1);
  const rpmIndex = clamp01(rpmRaw / 3.5);

  return { avgViews, subGrowthRate, engagementRate, rpmIndex };
}
