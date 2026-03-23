import { T } from "../../styles/tokens";

// ─── Section ──────────────────────────────────────────────────────────────────
// 패널 접기/펼치기 wrapper. 완전 제어(controlled) 방식.
// Props:
//   title    — 섹션 라벨 (헤더에 표시)
//   open     — 현재 open 상태
//   onToggle — toggle 콜백
//   children — 패널 콘텐츠
export default function Section({ title, open, onToggle, children }) {
  return (
    <div>
      {/* ── 토글 헤더 ─────────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        style={{
          width:          "100%",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        `${T.spacing.sm}px ${T.spacing.md}px`,
          minHeight:      T.spacing.xxl,
          marginBottom:   open ? T.spacing.sm : 0,
          background:     "transparent",
          border:         "none",
          cursor:         "pointer",
          borderRadius:   T.radius.btn,
        }}
      >
        <span style={{
          fontSize:      T.font.size.xs,
          fontWeight:    T.font.weight.semibold,
          color:         T.muted,
          letterSpacing: "0.08em",
          fontFamily:    "monospace",
          textTransform: "uppercase",
        }}>
          {title}
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.muted,
          lineHeight: T.font.lineHeight.tight,
          transition: `transform ${T.motion.duration} ${T.motion.easing}`,
          display:    "inline-block",
          transform:  open ? "rotate(0deg)" : "rotate(-90deg)",
        }}>
          ▼
        </span>
      </button>

      {/* ── 콘텐츠 — CSS Grid 애니메이션 ──────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateRows:    open ? "1fr" : "0fr",
        transition:          "grid-template-rows 0.2s ease",
      }}>
        <div style={{ overflow: "hidden" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
