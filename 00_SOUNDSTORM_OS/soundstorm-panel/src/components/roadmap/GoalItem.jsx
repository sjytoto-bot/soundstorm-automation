import { T } from "../../styles/tokens";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "../../engine/roadmapReducer";
import { STATUS_CONFIG } from "../../lib/roadmapConstants";
import { useRoadmap } from "./RoadmapContext";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  bg:     T.bgApp,
  white:  T.bgCard,
  border: T.border,
  text:   T.text,
  sub:    T.sub,
  muted:  T.muted,
  blue:   T.primary,
};

function parseTeamTag(title) {
  const m = title?.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

// ─── GOAL ITEM ─────────────────────────────────────────────────────────────────
export default function GoalItem({ goal, trackId, statusId }) {
  const { state, setters, logic, external } = useRoadmap();
  const { goalDrag, editingGoal } = state;
  const { setGoalDrag, setEditingGoal } = setters;
  const { saveGoalEdit, handleGoalReorder } = logic;
  const { onDispatch, teamOptions } = external;

  const scfg = STATUS_CONFIG[statusId];
  const isGoalDragTarget = goalDrag.overId === goal.id && goalDrag.draggingId && goalDrag.draggingId !== goal.id;

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); setGoalDrag(prev => ({ ...prev, draggingId: goal.id })); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={e => { e.stopPropagation(); setGoalDrag(prev => ({ ...prev, draggingId: null, overId: null })); }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setGoalDrag(prev => ({ ...prev, overId: goal.id })); }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); handleGoalReorder(goal.id, trackId, statusId); setGoalDrag(prev => ({ ...prev, draggingId: null, overId: null })); }}
      style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: T.spacing.md,
        padding: "9px 10px 9px 12px", borderRadius: T.radius.btn,
        background: C.bg,
        borderLeft: `3px solid ${scfg.color}`,
        overflow: "hidden",
        opacity: goalDrag.draggingId === goal.id ? 0.4 : 1,
        boxShadow: isGoalDragTarget ? `0 -3px 0 0 ${scfg.color}` : "none",
        cursor: "grab",
        transition: "opacity 0.3s, box-shadow 0.3s",
      }}
    >
      {editingGoal.id === goal.id ? (
        <div
          style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flex: 1 }}
          onBlur={e => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              saveGoalEdit();
            }
          }}
        >
          <select value={editingGoal.team} onChange={e => setEditingGoal(prev => ({ ...prev, team: e.target.value }))}
            style={{ height: 26, fontSize: 11, padding: "0 4px", border: `1px solid ${C.border}`, borderRadius: T.radius.badge, background: C.white, color: C.sub, cursor: "pointer", flexShrink: 0 }}>
            <option value="">(팀 없음)</option>
            {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            autoFocus
            value={editingGoal.title}
            onChange={e => setEditingGoal(prev => ({ ...prev, title: e.target.value }))}
            onKeyDown={e => {
              if (e.key === "Enter") saveGoalEdit();
              if (e.key === "Escape") setEditingGoal(prev => ({ ...prev, id: null }));
            }}
            style={{ fontSize: 13, flex: 1, padding: "2px 8px", border: `1px solid ${C.blue}`, borderRadius: T.radius.badge, color: C.text, background: C.white, outline: "none" }}
          />
          <button onClick={() => setEditingGoal(prev => ({ ...prev, id: null }))}
            style={{ fontSize: 11, padding: "2px 8px", border: `1px solid ${C.border}`, borderRadius: T.radius.badge, background: "transparent", color: C.muted, cursor: "pointer", flexShrink: 0 }}>
            ✕
          </button>
        </div>
      ) : (
        <>
          {/* 좌측: 제목/팀 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14, fontWeight: 600, color: C.text,
                overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", cursor: "pointer", lineHeight: 1.4,
              }}
              onDoubleClick={() => {
                const tag = parseTeamTag(goal.title);
                setEditingGoal({
                  id: goal.id,
                  title: goal.title?.replace(/^\[[^\]]+\]\s*/, "") ?? "",
                  priority: goal.priority ?? "medium",
                  team: tag ?? "",
                });
              }}
              title="더블클릭으로 수정"
            >
              {goal.title?.replace(/^\[[^\]]+\]\s*/, "") || "(제목 없음)"}
            </div>
            {(goal.team || parseTeamTag(goal.title)) && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {goal.team || parseTeamTag(goal.title)}
              </div>
            )}
          </div>
          {/* 우측: 현재 상태 badge + 다른 상태 경량 버튼 */}
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, flexShrink: 0 }}>
            <span style={{
              fontSize: 11, padding: "3px 8px",
              borderRadius: T.radius.pill,
              background: STATUS_CONFIG[goal.status]?.bg,
              color: STATUS_CONFIG[goal.status]?.color,
              fontWeight: 600, flexShrink: 0,
            }}>
              {STATUS_CONFIG[goal.status]?.label}
            </span>
            <span style={{ width: 1, height: 12, background: C.border, margin: "0 4px", flexShrink: 0 }} />
            {Object.entries(STATUS_CONFIG)
              .filter(([sid]) => sid !== goal.status)
              .map(([sid, cfg]) => (
                <button key={sid}
                  onClick={() => onDispatch(createRoadmapEvent(
                    ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED,
                    { id: goal.id, status: sid }
                  ))}
                  style={{
                    fontSize: 10, padding: "3px 5px",
                    border: "none", borderRadius: T.radius.badge,
                    background: "transparent",
                    color: C.muted,
                    cursor: "pointer", fontWeight: 400,
                  }}
                >
                  {cfg.label}
                </button>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}
