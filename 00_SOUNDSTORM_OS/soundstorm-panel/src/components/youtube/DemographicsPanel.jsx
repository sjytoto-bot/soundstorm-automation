// ─── DemographicsPanel v1 ─────────────────────────────────────────────────────
// 시청자 분석: 연령 분포 + 성별 분포 (2열 레이아웃)
//
// Props:
//   age    — DimensionRow[]
//   gender — DimensionRow[]

import { T } from "../../styles/tokens";

// ─── 성별 한국어 변환 ─────────────────────────────────────────────────────────
const GENDER_LABELS = {
  male:    "남성",
  female:  "여성",
  unknown: "미분류",
};

// ─── 가로 막대 행 ─────────────────────────────────────────────────────────────
function BarRow({ label, ratio, barColor }) {
  const pct = Math.max(0, Math.min(1, ratio ?? 0));

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            T.spacing.sm,
      marginBottom:   T.spacing.sm,
    }}>
      {/* 레이블 */}
      <span style={{
        fontSize:  T.font.size.xs,
        color:     T.sub,
        minWidth:  44,
        flexShrink: 0,
      }}>
        {label}
      </span>

      {/* 막대 트랙 */}
      <div style={{
        flex:         1,
        height:       6,
        background:   T.bgSection,
        borderRadius: T.radius.pill,
        overflow:     "hidden",
      }}>
        {/* 채워진 막대 */}
        <div style={{
          width:        `${(pct * 100).toFixed(1)}%`,
          height:       "100%",
          background:   barColor,
          borderRadius: T.radius.pill,
          transition:   `width ${T.motion.duration} ${T.motion.easing}`,
        }} />
      </div>

      {/* 비율 텍스트 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
        fontFamily: "monospace",
        minWidth:   36,
        textAlign:  "right",
        flexShrink: 0,
      }}>
        {(pct * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ─── 섹션 소제목 ──────────────────────────────────────────────────────────────
function SubLabel({ children }) {
  return (
    <div style={{
      fontSize:     T.font.size.xs,
      fontWeight:   T.font.weight.semibold,
      color:        T.sub,
      marginBottom: T.spacing.md,
      letterSpacing: "0.04em",
    }}>
      {children}
    </div>
  );
}

// ─── DemographicsPanel ────────────────────────────────────────────────────────

export default function DemographicsPanel({ age, gender }) {
  const hasAge    = age    && age.length    > 0;
  const hasGender = gender && gender.length > 0;

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap:                 T.spacing.lg,
    }}>

      {/* ── 연령 분포 ──────────────────────────────────────────────────────── */}
      <div>
        <SubLabel>연령</SubLabel>
        {hasAge ? (
          age.map(row => (
            <BarRow
              key={row.key}
              label={row.key}
              ratio={row.ratio}
              barColor={T.color.primary}
            />
          ))
        ) : (
          <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
            데이터 없음
          </span>
        )}
      </div>

      {/* ── 성별 분포 ──────────────────────────────────────────────────────── */}
      <div>
        <SubLabel>성별</SubLabel>
        {hasGender ? (
          gender.map(row => {
            const key       = row.key?.toLowerCase() ?? "";
            const label     = GENDER_LABELS[key] ?? row.key;
            const barColor  = key === "female" ? T.color.success : T.color.primary;

            return (
              <BarRow
                key={row.key}
                label={label}
                ratio={row.ratio}
                barColor={barColor}
              />
            );
          })
        ) : (
          <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
            데이터 없음
          </span>
        )}
      </div>
    </div>
  );
}
