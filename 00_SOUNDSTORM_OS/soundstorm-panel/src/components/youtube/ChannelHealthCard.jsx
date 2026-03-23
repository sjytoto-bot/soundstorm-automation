// ─── ChannelHealthCard.jsx ────────────────────────────────────────────────────
// 채널 건강 점수 카드 (Stage J)
//
// Props:
//   healthData — computeChannelHealth() 반환값
//               { score, grade, label, breakdown, trend }
//   loading    — boolean (데이터 로딩 중)

import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 등급별 색상 ─────────────────────────────────────────────────────────────

function gradeStyle(grade) {
  if (grade === "A") return { color: T.success,  bg: T.successBg,  border: T.successBorder };
  if (grade === "B") return { color: T.color?.primary ?? T.primary, bg: T.primarySoft, border: T.primaryBorder };
  if (grade === "C") return { color: T.warn,   bg: T.warnBg,   border: T.borderColor.warning };
  return                     { color: T.danger, bg: T.dangerBg, border: T.borderColor.danger };
}

// ─── 점수 게이지 바 ──────────────────────────────────────────────────────────

function ScoreBar({ score, color }) {
  return (
    <div style={{
      height:       8,
      background:   T.bgSection,
      borderRadius: T.radius.pill,
      overflow:     "hidden",
      marginTop:    T.spacing.sm,
    }}>
      <div style={{
        height:           "100%",
        width:            `${score}%`,
        background:       color,
        borderRadius:     T.radius?.pill ?? 999,
        transition:       "width 0.6s ease",
      }} />
    </div>
  );
}

// ─── breakdown 행 ────────────────────────────────────────────────────────────

function BreakdownRow({ reason, delta }) {
  const isPos = delta > 0;
  return (
    <div style={{
      display:       "flex",
      justifyContent: "space-between",
      alignItems:    "center",
      padding:       `${T.spacing.xs}px 0`,
      borderBottom:  `1px solid ${T.borderSoft}`,
    }}>
      <span style={{ fontSize: T.font.size.xs, color: T.sub }}>{reason}</span>
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color:      isPos ? T.success : T.danger,
      }}>
        {isPos ? `+${delta}` : `${delta}`}
      </span>
    </div>
  );
}

// ─── trend 아이콘 ─────────────────────────────────────────────────────────────

function TrendIcon({ trend }) {
  if (trend === "up")   return <TrendingUp  size={14} color={T.success} />;
  if (trend === "down") return <TrendingDown size={14} color={T.danger}  />;
  return <Minus size={14} color={T.muted} />;
}

// ─── ChannelHealthCard ────────────────────────────────────────────────────────

export default function ChannelHealthCard({ healthData, loading = false }) {
  if (loading || !healthData) {
    return (
      <div style={{
        background:   T.bgCard,
        border:       `1px solid ${T.border}`,
        borderRadius: T.radius.card,
        padding:      T.spacing.xl,
        height:       "100%",
        boxSizing:    "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.lg }}>
          <Activity size={14} color={T.sub} />
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>채널 건강 점수</span>
        </div>
        <div style={{ color: T.muted, fontSize: T.font.size.xs }}>
          {loading ? "분석 중…" : "데이터 없음"}
        </div>
      </div>
    );
  }

  const { score, grade, label, breakdown, trend } = healthData;
  const gs = gradeStyle(grade);

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
      height:       "100%",
      boxSizing:    "border-box",
    }}>
      {/* 헤더 */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.sm,
        marginBottom: T.spacing.lg,
      }}>
        <Activity size={14} color={T.primary} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>채널 건강 점수</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <TrendIcon trend={trend} />
        </div>
      </div>

      {/* 점수 + 등급 */}
      <div style={{
        display:     "flex",
        alignItems:  "flex-end",
        gap:         T.spacing.md,
        marginBottom: T.spacing.sm,
      }}>
        <div style={{
          fontSize:   T.font.size.hero,
          fontWeight: T.font.weight.bold,
          fontFamily: T.font.familyMono,
          color:      gs.color,
          lineHeight: 1,
        }}>
          {score}
        </div>
        <div style={{ paddingBottom: 4 }}>
          <div style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          T.spacing.xs,
            background:   gs.bg,
            border:       `1px solid ${gs.border}`,
            borderRadius: T.radius.badge,
            padding:      `2px ${T.spacing.sm}px`,
          }}>
            <span style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.bold, color: gs.color }}>{grade}</span>
            <span style={{ fontSize: T.font.size.xs, color: gs.color }}>{label}</span>
          </div>
        </div>
      </div>

      {/* 게이지 바 */}
      <ScoreBar score={score} color={gs.color} />

      {/* breakdown */}
      {breakdown?.length > 0 && (
        <div style={{ marginTop: T.spacing.lg }}>
          <div style={{
            fontSize:      T.font.size.xxs,
            color:         T.muted,
            fontFamily:    T.font.familyMono,
            letterSpacing: "0.06em",
            marginBottom:  T.spacing.xs,
          }}>
            점수 구성
          </div>
          {breakdown.map((b, i) => (
            <BreakdownRow key={i} reason={b.reason} delta={b.delta} />
          ))}
        </div>
      )}
    </div>
  );
}
