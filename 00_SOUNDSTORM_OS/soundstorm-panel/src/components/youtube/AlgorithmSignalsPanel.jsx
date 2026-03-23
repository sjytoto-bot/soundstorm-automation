import { T } from "../../styles/tokens";

// ─── 상태값 한국어 번역 ───────────────────────────────────────────────────────
const VELOCITY_KO = {
  "Exploding": "조회수 급상승",
  "Growing":   "조회수 상승",
  "Flat":      "보통",
};

const ALGO_ENTRY_KO = {
  "Algorithm Boost": "추천 알고리즘 진입",
  "Entering":        "알고리즘 진입",
  "Normal":          "보통",
};

function translateVelocity(v)   { return VELOCITY_KO[v]   ?? v ?? "—"; }
function translateAlgoEntry(v)  { return ALGO_ENTRY_KO[v] ?? v ?? "—"; }

// ─── 신호 상태별 색상 ─────────────────────────────────────────────────────────
function statusColor(value) {
  if (value === "Algorithm Boost" || value === "추천 알고리즘 진입") return T.color.success;
  if (value === "Entering"        || value === "알고리즘 진입")       return T.color.primary;
  if (value === "Exploding"       || value === "조회수 급상승")        return T.color.success;
  if (value === "Growing"         || value === "조회수 상승")          return T.color.primary;
  if (value === "Flat"            || value === "보통")                return T.muted;
  if (value === "Normal")                                            return T.muted;
  return T.text;
}

// ─── 모멘텀 방향 아이콘 ───────────────────────────────────────────────────────
function momentumIcon(pct) {
  if (pct === null || pct === undefined) return "";
  if (pct >= 50) return " ↑";
  if (pct >= 25) return " →";
  return " ↓";
}

// ─── SignalRow ─────────────────────────────────────────────────────────────────
function SignalRow({ label, value, unit, highlight }) {
  const display = value !== null && value !== undefined ? `${value}${unit ?? ""}` : "—";
  const color   = highlight ? statusColor(value) : T.text;

  return (
    <div style={{
      display:        "flex",
      justifyContent: "space-between",
      alignItems:     "center",
      padding:        `${T.spacing.sm}px 0`,
      borderBottom:   `1px solid ${T.border}`,
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
        fontWeight: T.font.weight.bold,
        color,
        fontFamily: typeof value === "number" ? "monospace" : "inherit",
      }}>
        {display}
      </span>
    </div>
  );
}

// ─── MiniBar ──────────────────────────────────────────────────────────────────
function MiniBar({ pct, color }) {
  if (pct === null || pct === undefined) return null;
  return (
    <div style={{
      height:       4,
      borderRadius: T.radius.pill,
      background:   T.bgSection,
      overflow:     "hidden",
      marginTop:    T.spacing.xs,
    }}>
      <div style={{
        height:       "100%",
        width:        `${Math.min(100, Math.max(0, pct))}%`,
        borderRadius: T.radius.pill,
        background:   color ?? T.color.primary,
        transition:   "width 0.3s ease",
      }} />
    </div>
  );
}

// ─── AlgorithmSignalsPanel ────────────────────────────────────────────────────
// Props:
//   signals — {
//     momentum,           (number | null, %)
//     velocity,           (string: "Exploding" | "Growing" | "Flat")
//     algorithmEntry,     (string: "Algorithm Boost" | "Entering" | "Normal")
//     recommendationTraffic (number | null, %)
//   }
export default function AlgorithmSignalsPanel({ signals }) {
  if (!signals) return null;

  const { momentum, velocity, algorithmEntry, recommendationTraffic } = signals;

  const momentumColor = momentum >= 50 ? T.color.success : momentum >= 25 ? T.color.primary : T.muted;

  const recColor = recommendationTraffic >= 40
    ? T.color.success
    : recommendationTraffic >= 20
    ? T.color.primary
    : T.muted;

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 신호 행 */}
      <div>
        {/* 모멘텀 + 방향 아이콘 */}
        <div style={{ padding: `${T.spacing.sm}px 0`, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontWeight: T.font.weight.medium }}>
              모멘텀
            </span>
            <span style={{
              fontSize:   T.font.size.sm,
              fontWeight: T.font.weight.bold,
              color:      momentumColor,
              fontFamily: "monospace",
            }}>
              {momentum !== null && momentum !== undefined
                ? `${momentum}%${momentumIcon(momentum)}`
                : "—"}
            </span>
          </div>
          <MiniBar pct={momentum} color={momentumColor} />
        </div>

        {/* 조회수 속도 */}
        <SignalRow label="조회수 속도"  value={translateVelocity(velocity)}      highlight />

        {/* 알고리즘 진입 */}
        <SignalRow label="알고리즘 진입" value={translateAlgoEntry(algorithmEntry)} highlight />

        {/* 추천 트래픽 */}
        <div style={{ padding: `${T.spacing.sm}px 0` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontWeight: T.font.weight.medium }}>
              추천 트래픽
            </span>
            <span style={{
              fontSize:   T.font.size.sm,
              fontWeight: T.font.weight.bold,
              color:      recColor,
              fontFamily: "monospace",
            }}>
              {recommendationTraffic !== null && recommendationTraffic !== undefined
                ? `${recommendationTraffic}%`
                : "—"}
            </span>
          </div>
          <MiniBar pct={recommendationTraffic} color={recColor} />
        </div>
      </div>
    </div>
  );
}
