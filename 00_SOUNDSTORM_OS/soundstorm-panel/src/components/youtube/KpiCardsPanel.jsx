// ─── KpiCardsPanel v2 ─────────────────────────────────────────────────────────
// 6개 KPI 카드: 구독자 | 조회수 | 좋아요 | 시청시간 | 평균시청시간 | Revenue
//
// Props:
//   summary  — AnalyticsSummary | null
//   growth   — calcGrowth() 반환값
//   loading  — boolean

import { T } from "../../styles/tokens";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

/** 구독자 변화량: +N 또는 −N */
function fmtSubscriberChange(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("ko-KR");
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

/** 조회수 / 좋아요: 천 단위 구분 */
function fmtCount(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("ko-KR");
}

/** 시청시간: 만 단위 (소수점 1자리) */
function fmtWatchTime(min) {
  if (min == null || isNaN(min)) return "—";
  return `${(min / 10000).toFixed(1)}만분`;
}

/** 평균시청시간: M:SS */
function fmtAvgDuration(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 수익: ₩1,234 */
function fmtRevenue(krw) {
  if (krw == null || isNaN(krw)) return "—";
  return `₩${Math.round(krw).toLocaleString("ko-KR")}`;
}

/** 수익 성장율 계산 (소수점 1자리) */
function calcRevenueGrowth(current, prev) {
  if (prev == null || prev === 0 || current == null) return null;
  const raw = (current - prev) / Math.abs(prev) * 100;
  return Math.round(raw * 10) / 10;
}

/** 성장율 배지 렌더 */
function GrowthBadge({ value }) {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span style={{
      fontSize:   T.font.size.xs,
      fontFamily: "monospace",
      color:      isPositive ? T.success : T.danger,
      marginTop:  T.spacing.xs,
      display:    "block",
    }}>
      {isPositive ? "▲" : "▼"} {isPositive ? "+" : ""}{value}%
    </span>
  );
}

// ─── 카드 정의 ────────────────────────────────────────────────────────────────

function buildCards(summary, growth) {
  return [
    {
      label:       "구독자",
      value:       fmtSubscriberChange(summary?.subscriberChange),
      growthValue: growth?.subscribers ?? null,
    },
    {
      label:       "조회수",
      value:       fmtCount(summary?.views),
      growthValue: growth?.views ?? null,
    },
    {
      label:       "좋아요",
      value:       fmtCount(summary?.likes),
      growthValue: growth?.likes ?? null,
    },
    {
      label:       "시청시간",
      value:       fmtWatchTime(summary?.watchTimeMin),
      growthValue: growth?.watchTime ?? null,
    },
    {
      label:       "평균시청시간",
      value:       fmtAvgDuration(summary?.avgDurationSec),
      growthValue: growth?.avgDuration ?? null,
    },
    {
      label:       "수익",
      value:       fmtRevenue(summary?.revenue),
      growthValue: calcRevenueGrowth(summary?.revenue, summary?.revenuePrev),
    },
  ];
}

// ─── KpiCardsPanel ────────────────────────────────────────────────────────────

export default function KpiCardsPanel({ summary, growth, loading }) {
  const cards = buildCards(summary, growth);

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap:                 T.spacing.lg,
    }}>
      {cards.map(card => (
        <div
          key={card.label}
          style={{
            background:   T.bgCard,
            border:       `1px solid ${T.border}`,
            borderRadius: T.radius.card,
            padding:      T.spacing.xl,
            display:      "flex",
            flexDirection: "column",
          }}
        >
          {/* 라벨 */}
          <span style={{
            fontSize:   T.font.size.xs,
            color:      T.muted,
            marginBottom: T.spacing.xs,
          }}>
            {card.label}
          </span>

          {/* 값 */}
          <span style={{
            fontSize:   loading ? T.font.size.md : T.font.size.xl,
            fontWeight: T.font.weight.bold,
            color:      loading ? T.muted : T.text,
            letterSpacing: "-0.02em",
          }}>
            {loading ? "..." : card.value}
          </span>

          {/* 성장율 배지 */}
          {!loading && <GrowthBadge value={card.growthValue} />}
        </div>
      ))}
    </div>
  );
}
