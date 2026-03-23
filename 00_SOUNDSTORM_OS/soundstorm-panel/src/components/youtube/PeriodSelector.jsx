// ─── PeriodSelector v2 ────────────────────────────────────────────────────────
// 기간 선택 토글 버튼 (7일 / 30일 / 전체)
//
// Props:
//   period   — "7d" | "30d" | "all"
//   onChange — (period: string) => void

import { T } from "../../styles/tokens";

const OPTIONS = [
  { value: "7d",  label: "7일" },
  { value: "30d", label: "30일" },
  { value: "all", label: "전체" },
];

export default function PeriodSelector({ period, onChange }) {
  return (
    <div style={{
      display:      "flex",
      flexDirection: "row",
      gap:          T.spacing.xs,
      borderRadius: T.radius.btn,
      overflow:     "hidden",
    }}>
      {OPTIONS.map(opt => {
        const isActive = period === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
              fontSize:     T.font.size.xs,
              fontWeight:   isActive ? T.font.weight.semibold : T.font.weight.regular,
              background:   isActive ? T.color.primary : T.bgSection,
              color:        isActive ? "#FFFFFF"         : T.sub,
              border:       "none",
              cursor:       "pointer",
              borderRadius: T.radius.btn,
              transition:   `background ${T.motion.duration} ${T.motion.easing}`,
              lineHeight:   T.font.lineHeight.tight,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
