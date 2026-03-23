import { T } from "../../styles/tokens";
import { STATUS_CONFIG } from "../../lib/roadmapConstants";
import GoalItem from "./GoalItem";
import { useRoadmap } from "./RoadmapContext";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  muted: T.muted,
};

// ─── STATUS GROUP ──────────────────────────────────────────────────────────────
export default function StatusGroup({
  statusId,
  trackId,
  statusGoals,
}) {
  const { logic } = useRoadmap();
  const { isGroupCollapsed, toggleStatusGroup, getOrderedStatusGoals } = logic;

  const scfg = STATUS_CONFIG[statusId];
  const collapsed = isGroupCollapsed(trackId, statusId);

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => toggleStatusGroup(trackId, statusId)}
        style={{
          display: "flex", alignItems: "center", gap: T.spacing.xxs,
          width: "100%", padding: "4px 0",
          border: "none", background: "transparent",
          cursor: "pointer", textAlign: "left",
          marginBottom: collapsed ? 0 : 6,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: scfg.color }}>
          {scfg.label}
        </span>
        <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>
          {statusGoals.length}
        </span>
        <span style={{ fontSize: 9, color: C.muted, marginLeft: "auto" }}>
          {collapsed ? "▾" : "▴"}
        </span>
      </button>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          {getOrderedStatusGoals(trackId, statusId, statusGoals).map(goal => (
            <GoalItem
              key={goal.id}
              goal={goal}
              trackId={trackId}
              statusId={statusId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
