import { useState } from "react";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "../engine/roadmapReducer";
import { selectTrackStats } from "../lib/selectors";
import { PHASES } from "../lib/roadmapConstants";
import RoadmapView from "../components/RoadmapView";
import { T } from "../styles/tokens";

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
};

// ─── ROADMAP PAGE ─────────────────────────────────────────────────────────────
// Props
//   officialState  {object}
//   onDispatch     {func}  dispatchRoadmap

export default function RoadmapPage({ officialState, onDispatch }) {
  const [collapsedStages, setCollapsedStages] = useState({});
  const [viewMode,        setViewMode]        = useState("phase"); // "phase" | "team"

  const { allTracks, focusTrack } = selectTrackStats(officialState);

  return (
    <>
      {/* ── Roadmap 전용 툴바 ─────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, height: 40,
        display: "flex", alignItems: "center", gap: T.spacing.sm,
        padding: `0 ${T.spacing.xxl}px`,
        borderBottom: `1px solid ${C.border}`,
        background: C.white,
      }}>
        {/* 집중 트랙 dropdown */}
        <div style={{ display: "flex", alignItems: "baseline", gap: T.spacing.xxs }}>
          <span style={{ fontSize: 11, color: C.muted }}>집중</span>
          <div style={{ position: "relative" }}>
            <select
              value={focusTrack}
              onChange={e => {
                const v = e.target.value;
                onDispatch(createRoadmapEvent(
                  ROADMAP_EVENT_TYPES.ACTIVE_TRACK_CHANGED,
                  { id: v || null }
                ));
              }}
              style={{
                appearance: "none", border: "none", background: "transparent",
                fontSize: 11, fontWeight: 600, paddingRight: 14,
                outline: "none", cursor: "pointer",
                color: focusTrack ? C.text : C.muted,
              }}
            >
              <option value="">(없음)</option>
              {allTracks.map(([k, tr]) => (
                <option key={k} value={k}>{tr.name ?? tr.label ?? k}</option>
              ))}
            </select>
            <span style={{
              position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
              fontSize: 9, color: C.muted, pointerEvents: "none",
            }}>▾</span>
          </div>
        </div>

        {/* Stage 컨트롤 버튼 */}
        <button
          onClick={() => {
            const anyOpen = PHASES.some(p => !collapsedStages[p.id]);
            setCollapsedStages(
              anyOpen ? Object.fromEntries(PHASES.map(p => [p.id, true])) : {}
            );
          }}
          style={{
            fontSize: 11, padding: "6px 14px",
            border: `1px solid ${C.border}`, borderRadius: T.radius.btn,
            background: C.white, color: C.sub,
            cursor: "pointer", fontWeight: 600, letterSpacing: "0.04em",
          }}
        >
          {PHASES.every(p => collapsedStages[p.id]) ? "EXPAND STAGES" : "COLLAPSE STAGES"}
        </button>

        {/* 뷰 모드 토글 */}
        {[["phase", "STAGES"], ["team", "TEAMS"]].map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              fontSize: 11, padding: "6px 14px",
              border: `1px solid ${viewMode === mode ? C.blue : C.border}`,
              borderRadius: T.radius.btn,
              background: viewMode === mode ? C.blueBg : C.white,
              color:      viewMode === mode ? C.blue   : C.sub,
              cursor: "pointer", fontWeight: 600, letterSpacing: "0.04em",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 스크롤존 ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${T.spacing.lg}px ${T.spacing.xxl}px ${T.spacing.xxl}px` }}>
        <RoadmapView
          officialState={officialState}
          onDispatch={onDispatch}
          collapsedStages={collapsedStages}
          setCollapsedStages={setCollapsedStages}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onSetFocus={phaseId => {
            onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.ROADMAP_FOCUS_CHANGED, { phase: phaseId }));
          }}
          onTrackCreate={phaseId => {
            const id = "track_" + Date.now();
            onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_CREATED, { id, name: "새 트랙", phase: phaseId }));
            return id;
          }}
          onTrackFocus={trackId => {
            onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.ACTIVE_TRACK_CHANGED, { id: trackId }));
          }}
          onTrackMove={(trackId, phaseId) => {
            onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_MOVED, { id: trackId, phase: phaseId }));
          }}
        />
      </div>
    </>
  );
}
