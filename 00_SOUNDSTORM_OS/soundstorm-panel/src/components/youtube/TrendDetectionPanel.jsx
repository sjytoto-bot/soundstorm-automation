import { useState } from "react";
import { T } from "../../styles/tokens";

const MAX_VISIBLE = 6;

// ─── 트렌드 상태별 색상 ───────────────────────────────────────────────────────
const TREND_COLOR = {
  rising:    { text: T.color.success, bg: T.successBg,  label: "상승" },
  stable:    { text: T.warn,          bg: T.warnBg,     label: "안정" },
  declining: { text: T.color.danger,  bg: T.dangerBg,   label: "하락" },
};

function trendKey(status) {
  const s = (status ?? "").toLowerCase();
  if (s === "trending") return "rising";
  if (s === "stable")   return "stable";
  return "declining";
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtViews(n) {
  if (!n || n <= 0) return "—";
  return Math.round(n).toLocaleString("ko-KR");
}

// ─── TrendBadge ───────────────────────────────────────────────────────────────
function TrendBadge({ status }) {
  const key = trendKey(status);
  const c   = TREND_COLOR[key] ?? TREND_COLOR.stable;
  return (
    <span style={{
      fontSize:      10,
      fontWeight:    T.font.weight.bold,
      letterSpacing: "0.06em",
      color:         c.text,
      background:    c.bg,
      borderRadius:  T.radius.badge,
      padding:       `2px ${T.spacing.sm}px`,
      fontFamily:    "monospace",
    }}>
      {c.label}
    </span>
  );
}

// ─── MomentumBar ──────────────────────────────────────────────────────────────
function MomentumBar({ pct, status }) {
  const key   = trendKey(status);
  const color = TREND_COLOR[key]?.text ?? T.color.primary;
  return (
    <div style={{
      height:       5,
      borderRadius: T.radius.pill,
      background:   T.bgSection,
      overflow:     "hidden",
    }}>
      <div style={{
        height:       "100%",
        width:        `${Math.min(100, Math.max(0, pct))}%`,
        borderRadius: T.radius.pill,
        background:   color,
        transition:   "width 0.3s ease",
      }} />
    </div>
  );
}

// ─── ClusterRow ───────────────────────────────────────────────────────────────
function ClusterRow({ cluster }) {
  const { name, trend, momentum, avgViews } = cluster;
  const momentumPct = Math.round((momentum ?? 0) * 100);

  return (
    <div style={{
      padding:      `${T.spacing.md}px 0`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   T.spacing.xs,
      }}>
        <span style={{
          fontSize:      T.font.size.sm,
          fontWeight:    T.font.weight.bold,
          color:         T.text,
          textTransform: "capitalize",
        }}>
          {name}
        </span>
        <TrendBadge status={trend} />
      </div>

      <MomentumBar pct={momentumPct} status={trend} />

      <div style={{ display: "flex", gap: T.spacing.lg, marginTop: T.spacing.xs }}>
        <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: "monospace" }}>
          상승 속도 {momentumPct}%
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: "monospace" }}>
          평균 조회수 {fmtViews(avgViews)}
        </span>
      </div>
    </div>
  );
}

// ─── TrendDetectionPanel ──────────────────────────────────────────────────────
// Props:
//   clusters — { name, trend, momentum, avgViews }[]
export default function TrendDetectionPanel({ clusters }) {
  const [showAll, setShowAll] = useState(false);

  if (!clusters || clusters.length === 0) return null;

  const visible = showAll ? clusters : clusters.slice(0, MAX_VISIBLE);
  const hiddenCount = clusters.length - MAX_VISIBLE;

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 클러스터 목록 */}
      <div>
        {visible.map(c => (
          <ClusterRow key={c.name} cluster={c} />
        ))}
      </div>

      {/* +N more 버튼 */}
      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop:    T.spacing.md,
            width:        "100%",
            padding:      `${T.spacing.sm}px`,
            background:   T.bgSection,
            border:       `1px solid ${T.border}`,
            borderRadius: T.radius.btn,
            fontSize:     T.font.size.xs,
            color:        T.sub,
            fontFamily:   "monospace",
            cursor:       "pointer",
          }}
        >
          +{hiddenCount}개 더 보기
        </button>
      )}
      {showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(false)}
          style={{
            marginTop:    T.spacing.md,
            width:        "100%",
            padding:      `${T.spacing.sm}px`,
            background:   "transparent",
            border:       "none",
            fontSize:     T.font.size.xs,
            color:        T.muted,
            cursor:       "pointer",
          }}
        >
          접기 ▲
        </button>
      )}
    </div>
  );
}
