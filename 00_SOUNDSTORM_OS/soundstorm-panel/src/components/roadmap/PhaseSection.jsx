import { T } from "../../styles/tokens";
import { ChevronRight, ChevronDown } from "lucide-react";
import TrackCard from "./TrackCard";
import { useRoadmap } from "./RoadmapContext";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  bg:         T.bgApp,
  white:      T.bgCard,
  border:     T.border,
  text:       T.text,
  sub:        T.sub,
  muted:      T.muted,
  blue:       T.primary,
  blueBg:     T.primarySoft,
  green:      T.status.done.text,
};

// ─── PHASE SECTION ─────────────────────────────────────────────────────────────
export default function PhaseSection({
  phase, phaseIdx,
  phaseTrackEntries,
  phaseGoals,
  isStageCollapsed,
  isFocus,
  isPast,
  isDragTarget,
}) {
  const { state, setters, logic, external } = useRoadmap();
  const { phaseCustomNames, editingPhase, trackDrag } = state;
  const { setEditingPhase, setCollapsedStages, setTrackDrag, setEditingTrack } = setters;
  const { savePhaseName, getOrderedTrackEntries, handleTrackReorder } = logic;
  const { tracks, currentPhaseId, activeTrackId, onTrackCreate, onSetFocus, onTrackMove } = external;

  const phaseCompleted = phaseGoals.length > 0 && phaseGoals.every(g => g.status === "done");
  const phaseDoneCount = phaseGoals.filter(g => g.status === "done").length;
  const phaseProgress  = phaseGoals.length ? Math.round(phaseDoneCount / phaseGoals.length * 100) : 0;

  // 트랙 카드 위 drop 핸들러: 같은 phase면 순서 재정렬, 다른 phase면 이동
  function handleDropOnTrack(targetTrackId) {
    if (trackDrag.draggingId) {
      const fromPhase = tracks[trackDrag.draggingId]?.phase ?? currentPhaseId;
      if (fromPhase === phase.id) {
        handleTrackReorder(targetTrackId, phase.id);
      } else {
        onTrackMove(trackDrag.draggingId, phase.id);
      }
    }
    setTrackDrag(prev => ({ ...prev, draggingId: null, overPhaseId: null, overTrackId: null }));
  }

  return (
    <div
      style={{ marginBottom: 20 }}
      onDragOver={e => { e.preventDefault(); if (trackDrag.draggingId) setTrackDrag(prev => ({ ...prev, overPhaseId: phase.id })); }}
      onDragLeave={e => {
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
          setTrackDrag(prev => ({ ...prev, overPhaseId: null }));
        }
      }}
      onDrop={e => {
        // 카드 위 drop은 카드 자체에서 처리 — 여기선 빈 공간 drop만 처리
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (trackDrag.draggingId) {
          const fromPhase = tracks[trackDrag.draggingId]?.phase ?? currentPhaseId;
          if (fromPhase !== phase.id) onTrackMove(trackDrag.draggingId, phase.id);
        }
        setTrackDrag(prev => ({ ...prev, draggingId: null, overPhaseId: null, overTrackId: null }));
      }}
    >
      {/* Stage Header v3 */}
      <div style={{ marginBottom: isStageCollapsed ? 0 : T.spacing.md }}>
        {/* 클릭 가능한 헤더 행 */}
        <div
          style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 12,
            borderBottom: `2px solid ${isFocus ? C.blue : isPast ? C.green : C.border}`,
            cursor: "pointer",
          }}
          onClick={() => setCollapsedStages(prev => ({ ...prev, [phase.id]: !prev[phase.id] }))}
        >
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
            {editingPhase.id === phase.id ? (
              <input
                autoFocus
                value={editingPhase.name}
                onChange={e => setEditingPhase(prev => ({ ...prev, name: e.target.value }))}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === "Enter")  savePhaseName(phase.id);
                  if (e.key === "Escape") setEditingPhase({ id: null, name: "" });
                }}
                onBlur={() => savePhaseName(phase.id)}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                style={{
                  fontSize: 17, fontWeight: 700,
                  border: `1px solid ${C.blue}`, borderRadius: T.radius.badge,
                  padding: "2px 8px", color: C.text,
                  background: C.white, outline: "none",
                }}
              />
            ) : (
              <h2
                style={{
                  fontSize: 17, fontWeight: 700, color: C.text,
                  letterSpacing: "-0.2px", lineHeight: 1, margin: 0,
                  cursor: "text",
                }}
                onDoubleClick={e => {
                  e.stopPropagation();
                  setEditingPhase({ id: phase.id, name: phaseCustomNames[phase.id] ?? phase.name });
                }}
                title="더블클릭으로 이름 수정"
              >
                {phase.label} — {phaseCustomNames[phase.id] ?? phase.name}
              </h2>
            )}
            {isStageCollapsed
              ? <ChevronRight size={14} color={C.muted} />
              : <ChevronDown  size={14} color={C.muted} />
            }
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
            {phaseGoals.length > 0 && (
              <>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: phaseCompleted ? C.green : C.blue,
                  letterSpacing: "0.04em",
                }}>
                  {phaseProgress}% COMPLETE
                </span>
                <span style={{ width: 1, height: 12, background: C.border, flexShrink: 0 }} />
              </>
            )}
            <div
              style={{ display: "flex", gap: T.spacing.sm }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  const newId = onTrackCreate(phase.id);
                  if (newId) setEditingTrack({ id: newId, name: "새 트랙" });
                }}
                style={{
                  fontSize: 11, padding: "3px 10px",
                  border: `1px solid ${C.border}`, borderRadius: T.radius.btn,
                  background: C.white, color: C.sub, cursor: "pointer",
                }}
              >
                + 트랙
              </button>
              {!isFocus && (
                <button
                  onClick={() => onSetFocus(phase.id)}
                  style={{
                    fontSize: 11, padding: "3px 10px",
                    border: `1px solid ${C.border}`, borderRadius: T.radius.btn,
                    background: "transparent", color: C.sub, cursor: "pointer",
                  }}
                >
                  집중
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible content — CSS grid row height transition */}
      <div style={{
        display: "grid",
        gridTemplateRows: isStageCollapsed ? "0fr" : "1fr",
        transition: "grid-template-rows 0.3s ease",
      }}>
        <div style={{ overflow: "hidden" }}>

          {/* Drag hint */}
          {isDragTarget && (
            <div style={{
              marginBottom: T.spacing.md, padding: "8px", fontSize: 11, color: C.blue, textAlign: "center",
              border: `1px dashed ${C.blue}`, borderRadius: T.radius.btn, background: C.blueBg,
            }}>
              여기에 드롭하여 이동
            </div>
          )}

          {/* Track grid */}
          {phaseTrackEntries.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted, padding: "4px 0" }}>등록된 트랙 없음</div>
          )}
          {phaseTrackEntries.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xl }}>
              {getOrderedTrackEntries(phase.id, phaseTrackEntries).map(([id, track]) => {
                const isActiveTrack = id === activeTrackId;
                const trackGoals    = phaseGoals.filter(g => g.trackId === id);
                const isDragging    = trackDrag.draggingId === id;
                const isDropTarget  = trackDrag.overTrackId === id
                  && trackDrag.draggingId !== id
                  && (tracks[trackDrag.draggingId]?.phase ?? currentPhaseId) === phase.id;

                return (
                  <TrackCard
                    key={id}
                    id={id}
                    track={track}
                    phase={phase}
                    trackGoals={trackGoals}
                    isActiveTrack={isActiveTrack}
                    isDragging={isDragging}
                    isDropTarget={isDropTarget}
                    onDropOnTrack={handleDropOnTrack}
                  />
                );
              })}
            </div>
          )}

        </div>{/* overflow:hidden inner */}
      </div>{/* grid-template-rows transition outer */}

    </div>
  );
}
