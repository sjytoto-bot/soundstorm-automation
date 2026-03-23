import yaml from "js-yaml";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "./roadmapReducer";

// ─── ENUM MAPPINGS ────────────────────────────────────────────────────────────

const STATUS_MAP = {
  "대기":   "planned",
  "진행중": "active",
  "완료":   "done",
  "보류":   "blocked",
};

const PRIORITY_MAP = {
  "낮음": "low",
  "보통": "medium",
  "높음": "high",
};

// Korean command → English command alias
const COMMAND_ALIAS = {
  "작업_추가":     "GOAL_CREATE",
  "작업_상태변경": "GOAL_STATUS",
  "작업_수정":     "GOAL_UPDATE",
  "작업_삭제":     "GOAL_DELETE",
};

// Korean field key → English field key
const FIELD_ALIAS = {
  "트랙":    "track",
  "제목":    "title",
  "우선순위": "priority",
  "팀":      "team",
  "아이디":   "id",
  "상태":    "status",
};

function resolveEnum(value, map) {
  if (!value) return value;
  const s = String(value);
  return map[s] ?? s; // Korean → English, or passthrough if already English
}

function normalizeParams(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = FIELD_ALIAS[k] ?? k;
    out[key] = v;
  }
  return out;
}

// ─── TRACK RESOLVER ───────────────────────────────────────────────────────────

function resolveTrackId(trackNameOrId, state) {
  const tracks = state?.roadmap?.tracks ?? {};

  if (tracks[trackNameOrId]) return trackNameOrId;

  const entry = Object.entries(tracks).find(
    ([, t]) => t.name === trackNameOrId || t.label === trackNameOrId
  );
  return entry ? entry[0] : null;
}

// ─── EVENT BUILDER ────────────────────────────────────────────────────────────

function buildEvent(rawCommandType, rawParams, state) {
  const commandType = COMMAND_ALIAS[rawCommandType] ?? rawCommandType;
  const params = normalizeParams(rawParams);

  switch (commandType) {

    case "GOAL_CREATE": {
      const title    = params.title;
      const track    = params.track;
      const priority = resolveEnum(params.priority ?? "medium", PRIORITY_MAP);
      const team     = params.team ?? "";

      if (!title) return null;

      let trackId = null;
      if (track) {
        trackId = resolveTrackId(String(track), state);
        if (!trackId) return null;
      }

      return createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
        title: String(title),
        trackId,
        priority,
        team: String(team),
      });
    }

    case "GOAL_STATUS": {
      const id     = params.id;
      const status = resolveEnum(params.status, STATUS_MAP);

      if (!id || !status) return null;

      const valid = ["planned", "active", "done", "blocked"];
      if (!valid.includes(status)) return null;

      return createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
        id:     String(id),
        status,
      });
    }

    case "GOAL_UPDATE": {
      const id = params.id;
      if (!id) return null;

      const patch = {};
      if (params.title    !== undefined) patch.title    = String(params.title);
      if (params.priority !== undefined) patch.priority = resolveEnum(params.priority, PRIORITY_MAP);
      if (params.team     !== undefined) patch.team     = String(params.team);

      if (Object.keys(patch).length === 0) return null;

      return createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_UPDATED, {
        id: String(id),
        patch,
      });
    }

    case "GOAL_DELETE": {
      const id = params.id;
      if (!id) return null;

      return createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_DELETED, {
        id: String(id),
      });
    }

    default:
      return null;
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * parseCommand(yamlString, state)
 * Returns an event object on success, null on failure.
 * Supports both English and Korean command keywords/fields/enum values.
 */
export function parseCommand(yamlString, state) {
  try {
    const data = yaml.load(yamlString);
    if (!data || typeof data !== "object") return null;

    const entries = Object.entries(data);
    if (entries.length === 0) return null;

    const [commandType, params] = entries[0];
    return buildEvent(commandType, params, state);
  } catch {
    return null;
  }
}
