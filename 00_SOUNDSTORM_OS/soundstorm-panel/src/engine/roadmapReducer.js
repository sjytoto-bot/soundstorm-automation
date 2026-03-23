export const ROADMAP_EVENT_TYPES = {
  TRACK_CREATED:         "TRACK_CREATED",
  TRACK_UPDATED:         "TRACK_UPDATED",
  TRACK_DELETED:         "TRACK_DELETED",
  TRACK_MOVED:           "TRACK_MOVED",
  ACTIVE_TRACK_CHANGED:  "ACTIVE_TRACK_CHANGED",
  GOAL_CREATED:          "GOAL_CREATED",
  GOAL_UPDATED:          "GOAL_UPDATED",
  GOAL_STATUS_CHANGED:   "GOAL_STATUS_CHANGED",
  GOAL_DELETED:          "GOAL_DELETED",
  ROADMAP_FOCUS_CHANGED: "ROADMAP_FOCUS_CHANGED",
};

export function roadmapReducer(state, event) {
  if (!state?.roadmap) return state;

  const roadmap = state.roadmap;
  const tracks  = roadmap.tracks ?? {};

  switch (event.type) {

    case ROADMAP_EVENT_TYPES.TRACK_CREATED: {
      const { id, name, phase } = event.payload;
      return {
        ...state,
        roadmap: {
          ...roadmap,
          tracks: {
            ...tracks,
            [id]: {
              name,
              phase: phase ?? null,
              status: "active",
              goals:  {},
            },
          },
        },
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.TRACK_UPDATED: {
      const { id, patch } = event.payload;
      if (!tracks[id]) return state;
      return {
        ...state,
        roadmap: {
          ...roadmap,
          tracks: {
            ...tracks,
            [id]: {
              ...tracks[id],
              ...patch,
            },
          },
        },
      };
    }

    case ROADMAP_EVENT_TYPES.TRACK_DELETED: {
      const { id } = event.payload;
      const { [id]: _, ...rest } = tracks;
      const filteredGoals = Object.fromEntries(
        Object.entries(state.goals ?? {}).filter(([, goal]) => goal.trackId !== id)
      );
      return {
        ...state,
        roadmap: {
          ...roadmap,
          tracks:       rest,
          active_track: roadmap.active_track === id ? null : roadmap.active_track,
        },
        goals:   filteredGoals,
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.ACTIVE_TRACK_CHANGED: {
      const { id } = event.payload;
      if (id != null && !tracks[id]) return state;
      return {
        ...state,
        roadmap: {
          ...roadmap,
          active_track: id ?? null,
        },
      };
    }

    case ROADMAP_EVENT_TYPES.TRACK_MOVED: {
      const { id, phase } = event.payload;
      if (!tracks[id]) return state;
      return {
        ...state,
        roadmap: {
          ...roadmap,
          tracks: {
            ...tracks,
            [id]: { ...tracks[id], phase },
          },
        },
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.GOAL_CREATED: {
      const { id: payloadId, title, trackId, priority = "medium", team = "" } = event.payload;
      const id = payloadId ?? ("goal_" + Date.now());
      return {
        ...state,
        goals: {
          ...(state.goals ?? {}),
          [id]: {
            title,
            status:     "planned",
            trackId,
            priority,
            team,
            created_at: new Date().toISOString(),
          },
        },
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.GOAL_UPDATED: {
      const { id, patch } = event.payload;
      if (!(state.goals ?? {})[id]) return state;
      return {
        ...state,
        goals: {
          ...(state.goals ?? {}),
          [id]: {
            ...(state.goals ?? {})[id],
            ...patch,
          },
        },
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED: {
      const { id, status } = event.payload;
      if (!(state.goals ?? {})[id]) return state;
      return {
        ...state,
        goals: {
          ...(state.goals ?? {}),
          [id]: {
            ...(state.goals ?? {})[id],
            status,
          },
        },
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.GOAL_DELETED: {
      const { id } = event.payload;
      const { [id]: _, ...rest } = state.goals ?? {};
      return {
        ...state,
        goals: rest,
        history: [...(state.history ?? []), event],
      };
    }

    case ROADMAP_EVENT_TYPES.ROADMAP_FOCUS_CHANGED: {
      const { phase } = event.payload;
      return {
        ...state,
        roadmap: {
          ...roadmap,
          focus_phase: phase,
        },
        history: [...(state.history ?? []), event],
      };
    }

    default:
      return state;
  }
}

export function createRoadmapEvent(type, payload) {
  return {
    id:        "evt_" + Date.now(),
    domain:    "roadmap",
    team:      "운영팀_마스터컨트롤",
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}
