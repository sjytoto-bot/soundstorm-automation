// ─── SELECTORS ────────────────────────────────────────────────────────────────
// Pure functions: officialState → derived values.
// No side effects. No imports from React.

export function selectGoalStats(officialState) {
  const goals   = Object.values(officialState?.goals ?? {});
  const done    = goals.filter(g => g.status === "done").length;
  const active  = goals.filter(g => g.status === "active").length;
  const planned = goals.filter(g => g.status === "planned").length;
  const blocked = goals.filter(g => g.status === "blocked").length;
  const total   = goals.length;
  const progressPct = total ? Math.round(done / total * 100) : 0;
  return { done, active, planned, blocked, total, progressPct };
}

export function selectTrackStats(officialState) {
  const tracks       = officialState?.roadmap?.tracks ?? {};
  const allTracks    = Object.entries(tracks);
  const activeTracks = Object.values(tracks).filter(t => t.status === "active").length;
  const focusTrack   = officialState?.roadmap?.active_track ?? "";
  return { tracks, allTracks, activeTracks, focusTrack };
}

// DashboardView 전용 — GlobalStatusBar / InsightSummary / TrendPreview가 필요한 값 묶음
export function selectDashboardData(officialState) {
  const g = selectGoalStats(officialState);
  const t = selectTrackStats(officialState);
  return {
    completion:       g.progressPct,
    activeTracks:     t.activeTracks,
    active:           g.active,
    blocked:          g.blocked,
    goalDistribution: { done: g.done, active: g.active, planned: g.planned, blocked: g.blocked, total: g.total },
    monthlyRevenue:   officialState?.kpi?.monthlyRevenue ?? "--",
    last30Views:      officialState?.kpi?.last30Views    ?? "--",
    currentPhase:     officialState?.roadmap?.current_phase ?? "--",
    focusTrackId:     officialState?.roadmap?.active_track  ?? null,
    tracks:           t.tracks,
  };
}
