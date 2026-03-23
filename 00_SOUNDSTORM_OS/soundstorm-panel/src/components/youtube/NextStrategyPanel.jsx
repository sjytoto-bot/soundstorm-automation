import { T } from "../../styles/tokens";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtViews(n) {
  if (!n || n <= 0) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function confidenceColor(conf) {
  if (conf >= 0.7) return T.color.success;
  if (conf >= 0.4) return T.color.warning;
  return T.color.danger;
}

// ─── GridCell ─────────────────────────────────────────────────────────────────
function GridCell({ label, value, accent }) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xs,
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      background:    T.bgSection,
      borderRadius:  T.radius.btn,
    }}>
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
        fontWeight: T.font.weight.medium,
      }}>
        {label}
      </span>
      <span style={{
        fontSize:   T.font.size.sm,
        fontWeight: T.font.weight.semibold,
        color:      accent ?? T.text,
        minHeight:  18,
      }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ─── ConfidenceCell ───────────────────────────────────────────────────────────
function ConfidenceCell({ confidence }) {
  const pct   = Math.round((confidence ?? 0) * 100);
  const color = confidenceColor(confidence ?? 0);
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xs,
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      background:    T.bgSection,
      borderRadius:  T.radius.btn,
    }}>
      <span style={{ fontSize: T.font.size.xs, color: T.muted, fontWeight: T.font.weight.medium }}>
        전략 신뢰도
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{
          fontSize:   T.font.size.sm,
          fontWeight: T.font.weight.bold,
          color,
          fontFamily: "monospace",
          flexShrink: 0,
        }}>
          {pct}%
        </span>
        <div style={{
          flex:         1,
          height:       5,
          borderRadius: T.radius.pill,
          background:   T.border,
          overflow:     "hidden",
        }}>
          <div style={{
            height:       "100%",
            width:        `${pct}%`,
            borderRadius: T.radius.pill,
            background:   color,
            transition:   "width 0.3s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── NextStrategyPanel ────────────────────────────────────────────────────────
// Props:
//   strategyData — {
//     nextContent, expectedViews, expectedViewsHigh,
//     bestUploadTime, thumbnailAdvice, strategicNote, confidence
//   }
export default function NextStrategyPanel({ strategyData }) {
  if (!strategyData) return null;

  const {
    expectedViews,
    expectedViewsHigh,
    thumbnailAdvice,
    confidence,
  } = strategyData;

  const viewsRange = (expectedViews && expectedViews > 0)
    ? `${fmtViews(expectedViews)} – ${fmtViews(expectedViewsHigh ?? expectedViews * 1.5)}`
    : "—";

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 헤더 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   T.spacing.lg,
      }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontWeight:    T.font.weight.bold,
          color:         T.text,
          letterSpacing: "0.05em",
        }}>
          AI 콘텐츠 전략
        </span>
        <span style={{
          fontSize:     10,
          fontFamily:   "monospace",
          color:        T.primary,
          background:   T.primarySoft,
          borderRadius: T.radius.badge,
          padding:      `2px ${T.spacing.sm}px`,
        }}>
          AI PLAN
        </span>
      </div>

      {/* 2-column grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap:                 T.spacing.sm,
      }}>
        <GridCell label="예상 조회수"  value={viewsRange}  accent={T.color.primary} />
        <GridCell label="썸네일 전략" value={thumbnailAdvice}           />
        <ConfidenceCell confidence={confidence} />
      </div>
    </div>
  );
}
