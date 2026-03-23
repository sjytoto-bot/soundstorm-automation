// ─── DevicePanel v1 ───────────────────────────────────────────────────────────
// 기기별 시청 비율 패널 (mobile / desktop / tablet / tv)
//
// Props:
//   devices — DimensionRow[]

import { T } from "../../styles/tokens";

// ─── 기기 한국어 레이블 ───────────────────────────────────────────────────────
const DEVICE_LABELS = {
  mobile:  "모바일",
  desktop: "데스크톱",
  tablet:  "태블릿",
  tv:      "TV",
};

const DEVICE_ORDER = ["mobile", "desktop", "tablet", "tv"];

// ─── 기기 카드 ────────────────────────────────────────────────────────────────
function DeviceCard({ label, ratio }) {
  const pct = Math.max(0, Math.min(1, ratio ?? 0));

  return (
    <div style={{
      display:      "flex",
      flexDirection: "column",
      gap:          T.spacing.xs,
      background:   T.bgSection,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.lg,
    }}>
      {/* 기기 레이블 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
      }}>
        {label}
      </span>

      {/* 비율 (큰 숫자) */}
      <span style={{
        fontSize:   T.font.size.xl,
        fontWeight: T.font.weight.bold,
        color:      T.text,
        fontFamily: "monospace",
        lineHeight: T.font.lineHeight.tight,
      }}>
        {(pct * 100).toFixed(1)}%
      </span>

      {/* 소형 막대 */}
      <div style={{
        height:       4,
        background:   T.border,
        borderRadius: T.radius.pill,
        overflow:     "hidden",
        marginTop:    T.spacing.xs,
      }}>
        <div style={{
          width:        `${(pct * 100).toFixed(1)}%`,
          height:       "100%",
          background:   T.color.primary,
          borderRadius: T.radius.pill,
          transition:   `width ${T.motion.duration} ${T.motion.easing}`,
        }} />
      </div>
    </div>
  );
}

// ─── DevicePanel ──────────────────────────────────────────────────────────────

export default function DevicePanel({ devices }) {
  const list = devices ?? [];

  if (list.length === 0) {
    return (
      <div style={{ fontSize: T.font.size.xs, color: T.muted, padding: T.spacing.md }}>
        데이터 없음
      </div>
    );
  }

  // 정해진 순서대로 정렬, 없는 기기는 0으로 대체
  const deviceMap = new Map(list.map(d => [d.key?.toLowerCase(), d]));
  const ordered = DEVICE_ORDER.map(key => ({
    key,
    label: DEVICE_LABELS[key] ?? key,
    ratio: deviceMap.get(key)?.ratio ?? 0,
  }));

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap:                 T.spacing.md,
    }}>
      {ordered.map(d => (
        <DeviceCard key={d.key} label={d.label} ratio={d.ratio} />
      ))}
    </div>
  );
}
