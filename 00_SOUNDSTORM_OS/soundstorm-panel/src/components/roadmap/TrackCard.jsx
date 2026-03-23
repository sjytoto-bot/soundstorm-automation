import { T } from "../../styles/tokens";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "../../engine/roadmapReducer";
import StatusGroup from "./StatusGroup";
import { useRoadmap } from "./RoadmapContext";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  bg:         T.bgApp,
  white:      T.bgCard,
  border:     T.border,
  borderSoft: T.borderSoft,
  text:       T.text,
  sub:        T.sub,
  muted:      T.muted,
  blue:       T.primary,
  blueBg:     T.primarySoft,
  blueBorder: T.primaryBorder,
  green:      T.status.done.text,
};

// ─── TRACK CARD ────────────────────────────────────────────────────────────────
export default function TrackCard({
  id, track, phase,
  trackGoals,
  isActiveTrack,
  isDragging,
  isDropTarget,
  onDropOnTrack,
}) {
  const { state, setters, logic, external } = useRoadmap();
  const { editingTrack, openInputId, inputTitle, inputTeam, collapsedTracks, trackDrag } = state;
  const { setEditingTrack, setOpenInputId, setInputTitle, setInputTeam, setCollapsedTracks, setTrackDrag } = setters;
  const { saveTrackName } = logic;
  const { onDispatch, teamOptions, onTrackFocus } = external;

  const doneCount  = trackGoals.filter(g => g.status === "done").length;
  const totalCount = trackGoals.length;
  const progress   = totalCount ? Math.round(doneCount / totalCount * 100) : 0;

  return (
    <div
      className="track-card"
      draggable
      onDragStart={e => { setTrackDrag(prev => ({ ...prev, draggingId: id })); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => {
        setTrackDrag(prev => ({ ...prev, draggingId: null, overPhaseId: null, overTrackId: null }));
      }}
      onDragOver={e => {
        e.preventDefault();
        e.stopPropagation();
        setTrackDrag(prev => ({ ...prev, overPhaseId: phase.id, overTrackId: id }));
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        onDropOnTrack(id);
      }}
      style={{
        border: isActiveTrack ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
        borderRadius: T.radius.card,
        background: C.white,
        overflow: "hidden",
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity 0.3s, border-color 0.3s, box-shadow 0.3s",
        boxShadow: isDropTarget
          ? `0 -3px 0 0 ${C.blue}, 0 1px 2px rgba(15,23,42,0.04)`
          : "0 1px 2px rgba(15,23,42,0.04)",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Card header: name + controls */}
      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xxs, marginBottom: 10 }}>

          {/* Track name */}
          {editingTrack.id === id ? (
            <input
              autoFocus
              value={editingTrack.name}
              onChange={e => setEditingTrack(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") saveTrackName(id);
                if (e.key === "Escape") setEditingTrack({ id: null, name: "" });
              }}
              onBlur={() => saveTrackName(id)}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              style={{
                fontSize: 15, fontWeight: 700,
                border: `1px solid ${C.blue}`, borderRadius: T.radius.badge,
                padding: "2px 8px", color: C.text,
                background: C.white, outline: "none",
                flex: 1, minWidth: 0,
              }}
            />
          ) : (
            <span
              style={{
                fontSize: 15, fontWeight: 700, color: C.text,
                flex: 1, minWidth: 0, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
                cursor: "text",
              }}
              onDoubleClick={e => {
                e.stopPropagation();
                setEditingTrack({ id, name: track.name ?? track.label ?? id });
              }}
              title="더블클릭으로 이름 수정"
            >
              {track.name ?? track.label ?? id}
            </span>
          )}

          {/* FOCUS badge */}
          {isActiveTrack && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              padding: "3px 8px", borderRadius: T.radius.pill,
              background: C.blue, color: T.bgCard,
              letterSpacing: "0.08em", flexShrink: 0,
            }}>
              FOCUS
            </span>
          )}

          {/* Settings / focus toggle */}
          <button
            onClick={e => { e.stopPropagation(); onTrackFocus(isActiveTrack ? null : id); }}
            onMouseDown={e => e.stopPropagation()}
            title={isActiveTrack ? "집중 해제" : "집중 설정"}
            style={{
              width: 26, height: 26, borderRadius: T.radius.btn,
              background: isActiveTrack ? C.blueBg : "transparent",
              border: `1px solid ${isActiveTrack ? C.blue : C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              color: isActiveTrack ? C.blue : C.muted, fontSize: 12,
            }}
          >
            ⚙
          </button>

          {/* + add goal */}
          <button
            onClick={e => {
              e.stopPropagation();
              setOpenInputId(id);
              setInputTitle("");
              setInputTeam("");
            }}
            onMouseDown={e => e.stopPropagation()}
            title="작업 추가"
            style={{
              width: 26, height: 26, borderRadius: T.radius.btn,
              background: "transparent",
              border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              color: C.sub, fontSize: 16, lineHeight: 1, paddingBottom: 1,
            }}
          >
            +
          </button>

          {/* 구분선: 액션 버튼 / 접기 버튼 분리 */}
          <span style={{ width: 1, height: 14, background: C.border, flexShrink: 0 }} />

          {/* Collapse chevron */}
          <button
            onClick={e => { e.stopPropagation(); setCollapsedTracks(prev => ({ ...prev, [id]: !prev[id] })); }}
            onMouseDown={e => e.stopPropagation()}
            title="접기/펴기"
            style={{
              width: 26, height: 26, borderRadius: T.radius.btn,
              background: "transparent", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
              color: C.muted, fontSize: 11,
            }}
          >
            {collapsedTracks[id] ? "▾" : "▴"}
          </button>
        </div>
      </div>

      {/* Goal groups */}
      {!collapsedTracks[id] && (
        <div style={{ padding: "0 14px", flex: 1 }}>

          {/* 인라인 입력 폼 */}
          <div style={{
            maxHeight: openInputId === id ? "64px" : "0",
            opacity:   openInputId === id ? 1 : 0,
            overflow:  "hidden",
            transition: "max-height 0.3s ease, opacity 0.3s ease",
            marginBottom: openInputId === id ? 10 : 0,
          }}>
            <div style={{
              padding: "8px 10px",
              border: `1px solid ${C.blueBorder}`,
              borderRadius: T.radius.btn,
              background: C.blueBg,
            }}>
              <div style={{ display: "flex", gap: T.spacing.xxs, alignItems: "center", flexWrap: "nowrap" }}>
                <select
                  value={inputTeam}
                  onChange={e => setInputTeam(e.target.value)}
                  style={{ height: 30, fontSize: 11, padding: "0 4px", border: `1px solid ${C.border}`, borderRadius: T.radius.badge, background: C.white, color: inputTeam ? C.text : C.muted, cursor: "pointer", flexShrink: 0, width: 88 }}
                >
                  <option value="">(팀)</option>
                  {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  value={inputTitle}
                  onChange={e => setInputTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && inputTitle.trim()) {
                      onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
                        trackId: id,
                        title: inputTeam ? `[${inputTeam}] ${inputTitle.trim()}` : inputTitle.trim(),
                        priority: "medium", team: inputTeam,
                      }));
                      setOpenInputId(null);
                    }
                    if (e.key === "Escape") setOpenInputId(null);
                  }}
                  placeholder="작업 제목"
                  style={{
                    fontSize: 12, padding: "0 8px", height: 30,
                    border: `1px solid ${C.border}`, borderRadius: T.radius.badge,
                    color: C.text, background: C.white, outline: "none",
                    flex: 1, minWidth: 80,
                  }}
                />
                <button
                  onClick={() => setOpenInputId(null)}
                  style={{ fontSize: 11, padding: "0 10px", height: 30, border: `1px solid ${C.border}`, borderRadius: T.radius.badge, background: "transparent", color: C.sub, cursor: "pointer", flexShrink: 0 }}
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    if (!inputTitle.trim()) return;
                    onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
                      trackId: id,
                      title: inputTeam ? `[${inputTeam}] ${inputTitle.trim()}` : inputTitle.trim(),
                      priority: "medium", team: inputTeam,
                    }));
                    setOpenInputId(null);
                  }}
                  style={{ fontSize: 11, padding: "0 12px", height: 30, background: C.blue, color: T.bgCard, border: "none", borderRadius: T.radius.badge, cursor: "pointer", fontWeight: 500, flexShrink: 0 }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>

          {/* Status groups: active → planned → blocked → done */}
          {["active", "planned", "blocked", "done"].map(statusId => {
            const statusGoals = trackGoals.filter(g => g.status === statusId);
            if (statusGoals.length === 0) return null;
            return (
              <StatusGroup
                key={statusId}
                statusId={statusId}
                trackId={id}
                statusGoals={statusGoals}
              />
            );
          })}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ padding: "8px 14px 10px" }}>
        <div style={{ height: 3, background: C.borderSoft, borderRadius: T.radius.pill }}>
          <div style={{
            height: "100%", borderRadius: T.radius.pill,
            width: `${progress}%`,
            background: doneCount === totalCount && totalCount > 0 ? C.green : C.blue,
            transition: "width 0.3s",
          }} />
        </div>
      </div>
    </div>
  );
}
