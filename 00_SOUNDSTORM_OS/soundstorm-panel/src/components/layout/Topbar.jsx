import { ChevronLeft, ChevronRight } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 로컬 색상 앨리어스 — T 토큰 기반, 하드코딩 금지 ─────────────────────────
const C = {
  white:  T.bgCard,
  border: T.border,
  sub:    T.sub,
  muted:  T.muted,
  text:   T.text,
  blue:   T.primary,
};

// ─── Topbar — 3영역 구조 고정 (좌/중앙/우), 높이 56px ────────────────────────
// Props
//   sidebarCollapsed  {bool}
//   onToggleSidebar   {func}
//   title             {string}  현재 탭 제목
//   progressPct       {number}  0-100
//   aiPanelCollapsed  {bool}
//   onToggleAiPanel   {func}

export default function Topbar({
  sidebarCollapsed,
  onToggleSidebar,
  title,
  progressPct,
}) {
  return (
    <header style={{
      height: T.component.size.topbar, flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `1px solid ${C.border}`,
      background: C.white,
      padding: `0 ${T.spacing.lg}px`,
      zIndex: 30,
    }}>

      {/* Left zone: 고정 너비 — sidebar toggle */}
      <div style={{ width: 200, display: "flex", alignItems: "center" }}>
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
          style={{
            width: T.component.size.iconButton, height: T.component.size.iconButton, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${C.border}`, borderRadius: T.component.radius.control,
            background: C.white, cursor: "pointer",
            color: C.muted, transition: `color ${T.motion.default}, border-color ${T.motion.default}`,
          }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Center zone: 탭 제목 — flex 1, justify center (absolute 금지) */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{
          fontSize: T.font.size.xs, fontWeight: T.font.weight.bold, color: C.sub,
          letterSpacing: "0.1em", fontFamily: T.font.familyMono,
        }}>
          {title}
        </span>
      </div>

      {/* Right zone: 고정 너비 — progress bar + % + AI panel toggle */}
      <div style={{ width: 200, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: T.spacing.sm }}>

        {/* Progress bar + percentage */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xxs }}>
          <div style={{ width: 80, height: T.component.size.progressSm, background: C.border, borderRadius: T.radius.pill }}>
            <div style={{
              height: "100%",
              width: `${progressPct}%`,
              background: C.blue,
              borderRadius: T.radius.pill,
              transition: `width ${T.motion.base}`,
            }} />
          </div>
          <span style={{
            fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
            color: progressPct > 0 ? C.text : C.muted,
            fontFamily: T.font.familyMono,
            minWidth: 28, textAlign: "right",
          }}>
            {progressPct}%
          </span>
        </div>

      </div>
    </header>
  );
}
