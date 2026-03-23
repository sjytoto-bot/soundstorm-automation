export function calculateStageProgress(stage) {
  if (!stage.subtracks || stage.subtracks.length === 0) return 0;

  const completed = stage.subtracks.filter(
    (t) => t.status === "completed"
  ).length;

  return Math.round((completed / stage.subtracks.length) * 100);
}

export function calculateStageStatus(stage) {
  if (!stage.subtracks || stage.subtracks.length === 0) {
    return "locked";
  }

  const completed = stage.subtracks.filter(
    t => t.status === "completed"
  ).length;

  const total = stage.subtracks.length;

  if (completed === total) return "completed";
  if (completed > 0) return "active";
  return "waiting";
}

export function getActiveStage(roadmap) {
  return roadmap.find(
    s => calculateStageStatus(s) === "active"
  ) || null;
}

export function updateSubtrackStatus(roadmap, stageId, subtrackId, newStatus) {
  return roadmap.map(stage => {
    if (stage.id !== stageId) return stage;

    return {
      ...stage,
      subtracks: stage.subtracks.map(st =>
        st.id === subtrackId
          ? { ...st, status: newStatus }
          : st
      )
    };
  });
}

export function addChangeLogEntry(roadmap, subtrackId, note) {
  const entry = { date: new Date().toISOString(), note };
  return roadmap.map(stage => ({
    ...stage,
    subtracks: stage.subtracks.map(st =>
      st.id === subtrackId
        ? { ...st, changelog: [entry, ...(st.changelog ?? [])] }
        : st
    )
  }));
}

export function makeChangeLogEvent(roadmap, subtrackId, note, action = "log") {
  const stage = roadmap.find(s => s.subtracks.some(st => st.id === subtrackId));
  return {
    id: Date.now(),
    stageId: stage?.id ?? null,
    subtrackId,
    action,
    note,
    date: new Date().toISOString(),
  };
}

export function getStaleSubtracks(roadmap, days = 5) {
  const now = new Date();

  return roadmap.flatMap(stage =>
    stage.subtracks.reduce((acc, st) => {
      if (st.status !== "in-progress") return acc;

      // Compute daysAgo once and reuse for both the stale check and the output
      let daysAgo = null;
      if (st.changelog && st.changelog.length > 0) {
        const lastDate = new Date(st.changelog[0].date);
        if (!isNaN(lastDate.getTime())) {
          daysAgo = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
        }
      }

      const isStale = daysAgo === null || daysAgo >= days;
      if (isStale) {
        acc.push({ stageId: stage.id, subtrackId: st.id, name: st.name, daysAgo });
      }
      return acc;
    }, [])
  );
}
