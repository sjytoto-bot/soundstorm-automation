import { useState } from "react";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "../engine/roadmapReducer";
import { T } from "../styles/tokens";
import StatusPill from "./ui/StatusPill";
import { PHASES, STATUS_CONFIG, TEAM_TAGS } from "../lib/roadmapConstants";
import PhaseSection from "./roadmap/PhaseSection";
import { RoadmapProvider } from "./roadmap/RoadmapContext";
import { useRoadmapController } from "./roadmap/useRoadmapController";

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
  greenBg:    T.status.done.bg,
  greenBorder: T.successBorder,
};

// ─── ROADMAP VIEW ─────────────────────────────────────────────────────────────

export default function RoadmapView({
  officialState, onDispatch,
  collapsedStages, setCollapsedStages,
  viewMode, setViewMode,
  onSetFocus, onTrackCreate, onTrackFocus, onTrackMove,
}) {
  // ── State: 기능 단위 그룹 ──────────────────────────────────────────────────
  const [collapsedStatusGroups, setCollapsedStatusGroups] = useState({});
  const [openInputId,     setOpenInputId]     = useState(null);
  const [inputTitle,      setInputTitle]      = useState("");
  const [inputTeam,       setInputTeam]       = useState("");
  const [phaseTrackOrder, setPhaseTrackOrder] = useState({});
  const [collapsedTracks, setCollapsedTracks] = useState({});
  const [phaseCustomNames, setPhaseCustomNames] = useState({});
  const [goalOrder,       setGoalOrder]       = useState({});

  // 그룹 state
  const [trackDrag, setTrackDrag] = useState({ draggingId: null, overPhaseId: null, overTrackId: null });
  const [goalDrag,  setGoalDrag]  = useState({ draggingId: null, overId: null });
  const [editingTrack, setEditingTrack] = useState({ id: null, name: "" });
  const [editingPhase, setEditingPhase] = useState({ id: null, name: "" });
  const [editingGoal,  setEditingGoal]  = useState({ id: null, title: "", priority: "medium", team: "" });

  const controller = useRoadmapController({
    officialState,
    dispatchRoadmap: onDispatch,
    collapsedStages,
    setCollapsedStages,
    collapsedStatusGroups,
    setCollapsedStatusGroups,
    editingGoal,
    setEditingGoal,
    editingTrack,
    setEditingTrack,
    editingPhase,
    setEditingPhase,
    phaseCustomNames,
    setPhaseCustomNames,
    trackDrag,
    setTrackDrag,
    goalDrag,
    setGoalDrag,
    goalOrder,
    setGoalOrder,
    phaseTrackOrder,
    setPhaseTrackOrder,
  });

  const { tracks = {} } = officialState?.roadmap ?? {};

  if (!officialState?.roadmap) {
    return (
      <div style={{ color: C.muted, fontSize: 13, paddingTop: 8 }}>
        로드맵 데이터 로딩 중…
      </div>
    );
  }

  const contextValue = {
    state: {
      collapsedStatusGroups, openInputId, inputTitle, inputTeam,
      collapsedTracks, collapsedStages, editingGoal, goalDrag,
      trackDrag, editingTrack, editingPhase, phaseCustomNames,
    },
    setters: {
      setCollapsedStatusGroups, setOpenInputId, setInputTitle, setInputTeam,
      setCollapsedTracks, setCollapsedStages, setEditingGoal, setGoalDrag,
      setTrackDrag, setEditingTrack, setEditingPhase,
    },
    logic: {
      isGroupCollapsed:       controller.isGroupCollapsed,
      toggleStatusGroup:      controller.toggleStatusGroup,
      saveGoalEdit:           controller.saveGoalEdit,
      saveTrackName:          controller.saveTrackName,
      savePhaseName:          controller.savePhaseName,
      getOrderedTrackEntries: controller.getOrderedTrackEntries,
      handleTrackReorder:     controller.handleTrackReorder,
      getOrderedStatusGoals:  controller.getOrderedStatusGoals,
      handleGoalReorder:      controller.handleGoalReorder,
    },
    external: {
      onDispatch,
      teamOptions:    controller.teamOptions,
      tracks,
      currentPhaseId: controller.currentPhaseId,
      activeTrackId:  controller.activeTrackId,
      onTrackCreate, onSetFocus, onTrackFocus, onTrackMove,
    },
  };

  return (
    <RoadmapProvider value={contextValue}>
      <div>

        {/* ── Phase list / Team view ──────────────────────────────────────── */}
        {viewMode === "phase" ? (
        <div>
          {PHASES.map((phase, i) => {
            const isFocus = phase.id === controller.focusPhaseId;
            const isPast  = i < controller.focusIndex;

            const phaseTrackEntries = controller.trackEntries.filter(([, track]) =>
              (track.phase ?? controller.currentPhaseId) === phase.id
            );

            const phaseGoals = controller.allGoalEntries.filter(g => {
              const t = tracks[g.trackId];
              return (t?.phase ?? controller.currentPhaseId) === phase.id;
            });

            const isStageCollapsed = !!collapsedStages[phase.id];

            const isDragTarget = trackDrag.overPhaseId === phase.id
              && trackDrag.draggingId
              && (tracks[trackDrag.draggingId]?.phase ?? controller.currentPhaseId) !== phase.id;

            return (
              <PhaseSection
                key={phase.id}
                phase={phase}
                phaseIdx={i}
                phaseTrackEntries={phaseTrackEntries}
                phaseGoals={phaseGoals}
                isStageCollapsed={isStageCollapsed}
                isFocus={isFocus}
                isPast={isPast}
                isDragTarget={isDragTarget}
              />
            );
          })}
        </div>
        ) : (
        /* ── 팀별 보기 ─────────────────────────────────────────────────── */
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.lg }}>
          {[...TEAM_TAGS, null].map(team => {
            const teamGoals = team
              ? controller.allGoalEntries.filter(g => g.title?.startsWith(`[${team}]`))
              : controller.allGoalEntries.filter(g => !TEAM_TAGS.some(t => g.title?.startsWith(`[${t}]`)));
            if (!team && teamGoals.length === 0) return null;
            const doneCount    = teamGoals.filter(g => g.status === "done").length;
            const activeCount  = teamGoals.filter(g => g.status === "active").length;
            const plannedCount = teamGoals.filter(g => g.status === "planned").length;
            return (
              <div
                key={team ?? "_untagged"}
                style={{
                  borderRadius: T.radius.card, overflow: "hidden",
                  border: `1px solid ${C.border}`, background: C.white,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                  transition: "transform 0.3s ease, box-shadow 0.3s ease",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,23,42,0.08)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.04)";
                }}
              >
                {/* 팀 헤더 */}
                <div style={{
                  padding: "12px 18px",
                  background: C.bg,
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    {team ?? "미분류"}
                  </span>
                  <div style={{ display: "flex", gap: T.spacing.sm }}>
                    {[["완료", doneCount, C.green], ["진행중", activeCount, C.blue], ["대기", plannedCount, C.muted]].map(([lbl, cnt, col]) => (
                      cnt > 0 && <span key={lbl} style={{ fontSize: 11, color: col }}>
                        {lbl} <span style={{ fontWeight: 700 }}>{cnt}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Goal 목록 */}
                <div style={{ padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
                  {teamGoals.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.muted, padding: "4px 0" }}>등록된 작업 없음</div>
                  ) : teamGoals.map(goal => (
                    <div key={goal.id} style={{
                      display: "flex", alignItems: "flex-start",
                      justifyContent: "space-between", gap: T.spacing.md,
                      padding: "10px 12px", borderRadius: T.radius.btn,
                      background: C.bg, border: `1px solid ${C.border}`,
                    }}>
                      {/* 좌측: StatusPill + 제목 */}
                      <div style={{ display: "flex", gap: T.spacing.md, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                        <StatusPill status={goal.status} />
                        <span style={{
                          fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          lineHeight: 1.5,
                        }}>
                          {goal.title?.replace(/^\[[^\]]+\]\s*/, "") ?? "(제목 없음)"}
                        </span>
                      </div>
                      {/* 우측: 상태 변경 버튼 */}
                      <div style={{ display: "flex", gap: T.spacing.xs, flexShrink: 0 }}>
                        {Object.entries(STATUS_CONFIG).map(([sid, sc]) => {
                          const isCurrent = goal.status === sid;
                          return (
                            <button key={sid}
                              onClick={() => {
                                if (!isCurrent) onDispatch(createRoadmapEvent(
                                  ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED,
                                  { id: goal.id, status: sid }
                                ));
                              }}
                              style={{
                                fontSize: 11, padding: "4px 6px",
                                border: "none", borderRadius: T.radius.btn,
                                background: isCurrent ? C.blue : "transparent",
                                color: isCurrent ? T.bgCard : C.sub,
                                cursor: isCurrent ? "default" : "pointer",
                                fontWeight: isCurrent ? 700 : 400,
                              }}
                            >
                              {sc.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </RoadmapProvider>
  );
}
