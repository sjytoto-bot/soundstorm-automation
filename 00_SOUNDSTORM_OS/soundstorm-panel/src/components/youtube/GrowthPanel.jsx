// ─── GrowthPanel v1 ───────────────────────────────────────────────────────────
// 최근 30일 vs 이전 30일 2-column 비교 패널
//
// Props:
//   summary — AnalyticsSummary | null  (현재 기간)
//   prev30  — AnalyticsSummary | null  (이전 30일)
//   growth  — calcGrowth() 반환값

import { T } from "../../styles/tokens";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtCount(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("ko-KR");
}

function fmtWatchTime(min) {
  if (min == null || isNaN(min)) return "—";
  return `${(min / 10000).toFixed(1)}만분`;
}

function fmtAvgDuration(sec) {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── 지표 행 ──────────────────────────────────────────────────────────────────

function MetricRow({ label, currentVal, prevVal, growthVal }) {
  const isPositive = growthVal != null && growthVal >= 0;
  const isNegative = growthVal != null && growthVal < 0;

  return (
    <div style={{
      display:       "grid",
      gridTemplateColumns: "1fr auto auto auto",
      gap:           T.spacing.md,
      alignItems:    "center",
      padding:       `${T.spacing.sm}px 0`,
      borderBottom:  `1px solid ${T.border}`,
    }}>
      {/* 지표명 */}
      <span style={{
        fontSize:   T.font.size.sm,
        color:      T.sub,
        fontWeight: T.font.weight.medium,
      }}>
        {label}
      </span>

      {/* 현재값 */}
      <span style={{
        fontSize:   T.font.size.md,
        fontWeight: T.font.weight.semibold,
        color:      T.text,
        fontFamily: "monospace",
        textAlign:  "right",
      }}>
        {currentVal}
      </span>

      {/* 화살표 + 성장율 */}
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: "monospace",
        color:      isPositive ? T.success : isNegative ? T.danger : T.muted,
        minWidth:   60,
        textAlign:  "center",
      }}>
        {growthVal == null
          ? "—"
          : isPositive
            ? `▲ +${growthVal}%`
            : `▼ ${growthVal}%`
        }
      </span>

      {/* 이전값 */}
      <span style={{
        fontSize:   T.font.size.sm,
        color:      T.muted,
        fontFamily: "monospace",
        textAlign:  "right",
      }}>
        {prevVal}
      </span>
    </div>
  );
}

// ─── GrowthPanel ──────────────────────────────────────────────────────────────

export default function GrowthPanel({ summary, prev30, growth }) {
  // 지표 정의
  const metrics = [
    {
      label:      "조회수",
      currentVal: fmtCount(summary?.views),
      prevVal:    fmtCount(prev30?.views),
      growthVal:  growth?.views ?? null,
    },
    {
      label:      "좋아요",
      currentVal: fmtCount(summary?.likes),
      prevVal:    fmtCount(prev30?.likes),
      growthVal:  growth?.likes ?? null,
    },
    {
      label:      "시청시간",
      currentVal: fmtWatchTime(summary?.watchTimeMin),
      prevVal:    fmtWatchTime(prev30?.watchTimeMin),
      growthVal:  growth?.watchTime ?? null,
    },
    {
      label:      "평균시청시간",
      currentVal: fmtAvgDuration(summary?.avgDurationSec),
      prevVal:    fmtAvgDuration(prev30?.avgDurationSec),
      growthVal:  growth?.avgDuration ?? null,
    },
  ];

  if (!summary && !prev30) {
    return (
      <div style={{ color: T.muted, fontSize: T.font.size.sm, padding: T.spacing.md }}>
        데이터 없음
      </div>
    );
  }

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 헤더: 성장 분석 + 기간 배지 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            T.spacing.sm,
        marginBottom:   T.spacing.lg,
      }}>
        <span style={{
          fontSize:   T.font.size.sm,
          fontWeight: T.font.weight.semibold,
          color:      T.text,
        }}>
          성장 분석
        </span>
        <span style={{
          fontSize:     T.font.size.xs,
          color:        T.sub,
          background:   T.bgSection,
          border:       `1px solid ${T.border}`,
          borderRadius: T.radius.badge,
          padding:      `${T.spacing.xs / 2}px ${T.spacing.xs}px`,
          fontFamily:   "monospace",
        }}>
          30d vs prev30
        </span>
      </div>

      {/* 컬럼 헤더 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap:                 T.spacing.md,
        marginBottom:        T.spacing.xs,
      }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }} />
        <span style={{
          fontSize:  T.font.size.xs,
          color:     T.muted,
          textAlign: "right",
          minWidth:  80,
        }}>
          최근 30일
        </span>
        <span style={{
          fontSize:  T.font.size.xs,
          color:     T.muted,
          textAlign: "center",
          minWidth:  60,
        }}>
          변화
        </span>
        <span style={{
          fontSize:  T.font.size.xs,
          color:     T.muted,
          textAlign: "right",
          minWidth:  80,
        }}>
          이전 30일
        </span>
      </div>

      {/* 지표 행 목록 */}
      {metrics.map(m => (
        <MetricRow key={m.label} {...m} />
      ))}
    </div>
  );
}
