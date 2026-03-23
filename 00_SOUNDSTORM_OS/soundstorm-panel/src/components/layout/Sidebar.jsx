import { T, L } from "../../styles/tokens";

// ─── 로컬 색상 앨리어스 — T 토큰 기반, 하드코딩 금지 ─────────────────────────
const C = {
  white:  T.bgCard,
  border: T.border,
  sub:    T.sub,
};

// ─── Sidebar — nav 전용, 헤더 없음 ────────────────────────────────────────────
// Props
//   collapsed    {bool}
//   tabs         {Array<{id, label, icon}>}
//   activeTab    {string}
//   onTabChange  {func}

export default function Sidebar({ collapsed, tabs, activeTab, onTabChange }) {
  return (
    <aside style={{
      width: collapsed ? T.component.size.sidebarCollapsed : T.component.size.sidebarExpanded,
      transition: `width ${T.motion.default}`,
      overflow: "hidden",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${C.border}`,
      background: C.white,
    }}>
      <nav style={{
        flex: 1, paddingTop: 8,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <div key={tab.id} style={{ position: "relative" }}>
              {isActive && (
                <span style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: T.component.size.rail, height: 24, background: T.primary,
                  borderRadius: `0 ${T.component.radius.rail}px ${T.component.radius.rail}px 0`, zIndex: 10, pointerEvents: "none",
                }} />
              )}
              <button
                onClick={() => onTabChange(tab.id)}
                title={collapsed ? tab.label : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: `${L.iconCol}px 1fr`,
                  alignItems: "center",
                  width: "100%", height: L.rowH,
                  padding: `0 ${T.spacing.sm}px`,
                  border: "none", background: "transparent",
                  cursor: "pointer",
                  color: isActive ? T.primary : C.sub,
                  transition: `color ${T.motion.default}`,
                }}
              >
                <span style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                  <Icon size={16} />
                </span>
                <span style={{
                  fontSize: T.font.size.sm, fontWeight: T.font.weight.medium,
                  overflow: "hidden", whiteSpace: "nowrap",
                  opacity: collapsed ? 0 : 1,
                  transition: `opacity ${T.motion.default}`,
                }}>
                  {tab.label}
                </span>
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
