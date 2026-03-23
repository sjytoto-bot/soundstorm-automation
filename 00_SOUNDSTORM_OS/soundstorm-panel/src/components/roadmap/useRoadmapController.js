import { PHASES, DEFAULT_TEAMS } from "../../lib/roadmapConstants";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "../../engine/roadmapReducer";

export function useRoadmapController({
  officialState,
  dispatchRoadmap,
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
}) {
  // ── 파생 계산 ──────────────────────────────────────────────────────────────
  const existingTeams = [...new Set(Object.values(officialState?.goals ?? {}).map(g => g.team).filter(Boolean))];
  const teamOptions   = [...new Set([...DEFAULT_TEAMS, ...existingTeams])];

  const currentPhase   = officialState?.roadmap?.current_phase ?? "";
  const currentPhaseId = PHASES.find(p => currentPhase.startsWith(p.id + "단계"))?.id ?? PHASES[0].id;
  const focusPhaseId   = officialState?.roadmap?.focus_phase ?? currentPhaseId;
  const focusIndex     = PHASES.findIndex(p => p.id === focusPhaseId);
  const activeTrackId  = officialState?.roadmap?.active_track ?? null;

  const { tracks = {} } = officialState?.roadmap ?? {};
  const trackEntries = Object.entries(tracks);

  // Goals with id attached (fixes bug: goals map stores id as key, not in value)
  const allGoalEntries = Object.entries(officialState?.goals ?? {}).map(([gId, g]) => ({ ...g, id: gId }));

  // ── 로직 함수 ──────────────────────────────────────────────────────────────

  function isGroupCollapsed(trackId, statusId) {
    const key = `${trackId}_${statusId}`;
    return key in collapsedStatusGroups ? collapsedStatusGroups[key] : statusId === "done";
  }

  function toggleStatusGroup(trackId, statusId) {
    const key = `${trackId}_${statusId}`;
    setCollapsedStatusGroups(prev => ({ ...prev, [key]: !isGroupCollapsed(trackId, statusId) }));
  }

  function saveTrackName(id) {
    const trimmed = editingTrack.name.trim();
    if (trimmed && trimmed !== (tracks[id]?.name ?? "")) {
      dispatchRoadmap(createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_UPDATED, { id, patch: { name: trimmed } }));
    }
    setEditingTrack({ id: null, name: "" });
  }

  function savePhaseName(phaseId) {
    const trimmed = editingPhase.name.trim();
    if (trimmed) setPhaseCustomNames(prev => ({ ...prev, [phaseId]: trimmed }));
    setEditingPhase({ id: null, name: "" });
  }

  function getOrderedTrackEntries(phaseId, entries) {
    const order = phaseTrackOrder[phaseId];
    if (!order) return entries;
    const sorted = order.map(tid => entries.find(([id]) => id === tid)).filter(Boolean);
    const rest   = entries.filter(([id]) => !order.includes(id));
    return [...sorted, ...rest];
  }

  function handleTrackReorder(targetTrackId, targetPhaseId) {
    if (!trackDrag.draggingId || trackDrag.draggingId === targetTrackId) return;
    const fromPhase = tracks[trackDrag.draggingId]?.phase ?? currentPhaseId;
    if (fromPhase !== targetPhaseId) return; // cross-phase는 phase onDrop에서 처리
    const phaseEntries = trackEntries.filter(([, t]) => (t.phase ?? currentPhaseId) === targetPhaseId);
    const base = phaseTrackOrder[targetPhaseId] ?? phaseEntries.map(([id]) => id);
    const filtered = base.filter(id => id !== trackDrag.draggingId);
    const idx = filtered.indexOf(targetTrackId);
    filtered.splice(idx >= 0 ? idx : filtered.length, 0, trackDrag.draggingId);
    setPhaseTrackOrder(prev => ({ ...prev, [targetPhaseId]: filtered }));
  }

  function getOrderedStatusGoals(trackId, statusId, goals) {
    const key = `${trackId}_${statusId}`;
    const order = goalOrder[key];
    if (!order) return goals;
    const sorted = order.map(gid => goals.find(g => g.id === gid)).filter(Boolean);
    const rest   = goals.filter(g => !order.includes(g.id));
    return [...sorted, ...rest];
  }

  function handleGoalReorder(targetGoalId, trackId, statusId) {
    if (!goalDrag.draggingId || goalDrag.draggingId === targetGoalId) return;
    const key   = `${trackId}_${statusId}`;
    const goals = allGoalEntries.filter(g => g.trackId === trackId && g.status === statusId);
    const base  = goalOrder[key] ?? goals.map(g => g.id);
    const filtered = base.filter(id => id !== goalDrag.draggingId);
    const idx = filtered.indexOf(targetGoalId);
    filtered.splice(idx >= 0 ? idx : filtered.length, 0, goalDrag.draggingId);
    setGoalOrder(prev => ({ ...prev, [key]: filtered }));
  }

  function saveGoalEdit() {
    const rawTitle = editingGoal.title.trim();
    if (!rawTitle) { setEditingGoal({ id: null, title: "", priority: "medium", team: "" }); return; }
    const newTitle = editingGoal.team ? `[${editingGoal.team}] ${rawTitle}` : rawTitle;
    dispatchRoadmap(createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_UPDATED, {
      id: editingGoal.id,
      patch: { title: newTitle, priority: editingGoal.priority, team: editingGoal.team },
    }));
    setEditingGoal({ id: null, title: "", priority: "medium", team: "" });
  }

  return {
    existingTeams,
    teamOptions,
    currentPhase,
    currentPhaseId,
    focusPhaseId,
    focusIndex,
    activeTrackId,
    allGoalEntries,
    trackEntries,
    isGroupCollapsed,
    toggleStatusGroup,
    saveGoalEdit,
    saveTrackName,
    savePhaseName,
    getOrderedTrackEntries,
    handleTrackReorder,
    getOrderedStatusGoals,
    handleGoalReorder,
  };
}
