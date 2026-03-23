/**
 * SOUNDSTORM OS — Action Dispatcher
 *
 * Executes approved proposals against state.json as a single transaction.
 * All actions in a proposal succeed or none do (rollback on any failure).
 *
 * Prohibited: approvalEngine calls / mode logic / proposal mutation / queue restructuring
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getProposalById, markExecuted } from "./proposalQueueManager";
import * as rollback from "./rollbackManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const STATE_PATH     = join(__dirname, "../logs/state.json");
const CHANGELOG_PATH = join(__dirname, "../logs/changelog.json");

// ── Types ──────────────────────────────────────────────────────────────────────

interface Action {
  action_id: string;
  type: "create" | "update" | "delete";
  path: string;
  old_value?: unknown;
  new_value: unknown;
  reversible: boolean;
}

interface AppState extends Record<string, unknown> {
  version: number;
  last_updated: string;
}

// ── Path utilities (dot-notation + bracket indexing) ──────────────────────────

/**
 * Converts a path string ("$.a.b[0].c" or "a.b.c") into
 * an ordered array of keys / indices.
 */
function parsePath(path: string): (string | number)[] {
  const clean = path.replace(/^\$\.?/, ""); // strip leading $ or $.
  if (!clean) return [];

  const segments: (string | number)[] = [];
  // Match either a plain key or a bracket index
  const re = /([^.\[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    if (m[1] !== undefined) segments.push(m[1]);
    else if (m[2] !== undefined) segments.push(parseInt(m[2], 10));
  }
  return segments;
}

function getAtPath(root: unknown, path: string): unknown {
  const segs = parsePath(path);
  let cur: unknown = root;
  for (const seg of segs) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

function setAtPath(root: object, path: string, value: unknown): void {
  const segs = parsePath(path);
  if (segs.length === 0) throw new Error("Empty path");

  let cur: Record<string | number, unknown> = root as Record<string | number, unknown>;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]];
    if (next === null || next === undefined) {
      throw new Error(`Path not found at segment: "${String(segs[i])}"`);
    }
    cur = next as Record<string | number, unknown>;
  }
  cur[segs[segs.length - 1]] = value;
}

function deleteAtPath(root: object, path: string): void {
  const segs = parsePath(path);
  if (segs.length === 0) throw new Error("Empty path");

  let cur: Record<string | number, unknown> = root as Record<string | number, unknown>;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]];
    if (next === null || next === undefined) {
      throw new Error(`Path not found at segment: "${String(segs[i])}"`);
    }
    cur = next as Record<string | number, unknown>;
  }
  const last = segs[segs.length - 1];
  if (cur[last] === undefined) {
    throw new Error(`Cannot delete: path does not exist at "${String(last)}"`);
  }
  if (Array.isArray(cur) && typeof last === "number") {
    (cur as unknown[]).splice(last, 1);
  } else {
    delete (cur as Record<string, unknown>)[last as string];
  }
}

// ── Action executor ────────────────────────────────────────────────────────────

function applyAction(state: object, action: Action): void {
  switch (action.type) {
    case "create": {
      if (getAtPath(state, action.path) !== undefined) {
        throw new Error(
          `Create failed: path already exists: "${action.path}"`
        );
      }
      setAtPath(state, action.path, action.new_value);
      break;
    }
    case "update": {
      if (getAtPath(state, action.path) === undefined) {
        throw new Error(
          `Update failed: path does not exist: "${action.path}"`
        );
      }
      setAtPath(state, action.path, action.new_value);
      break;
    }
    case "delete": {
      if (getAtPath(state, action.path) === undefined) {
        throw new Error(
          `Delete failed: path does not exist: "${action.path}"`
        );
      }
      deleteAtPath(state, action.path);
      break;
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Executes all actions of an approved proposal as a single transaction.
 *
 * On success: persists updated state, appends changelog, marks proposal executed.
 * On failure: rolls back state.json to the pre-execution snapshot and rethrows.
 *
 * @throws Error if proposal does not exist or is not in "approved" status.
 */
export function executeProposal(proposal_id: string): void {
  // 1. Fetch proposal
  const proposal = getProposalById(proposal_id);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposal_id}`);
  }

  // 2. Guard: only approved proposals may be dispatched
  if (proposal.status !== "approved") {
    throw new Error(
      `Proposal is not approved. Current status: "${proposal.status}"`
    );
  }

  // 3. Load current state
  const state = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as AppState;
  const previousVersion = state.version ?? 0;

  // 4. Backup before any mutation
  rollback.backupState(state);

  // 5. Execute all actions — transactional: all or nothing
  const actions = (proposal["actions"] ?? []) as Action[];
  try {
    for (const action of actions) {
      applyAction(state, action);
    }

    // 6. Commit: update metadata
    state.version      = previousVersion + 1;
    state.last_updated = new Date().toISOString();

    // 7. Persist state
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");

    // 8. Append to changelog
    const changelog = JSON.parse(
      readFileSync(CHANGELOG_PATH, "utf-8")
    ) as object[];
    changelog.push({
      proposal_id,
      executed_at:      state.last_updated,
      actions_count:    actions.length,
      previous_version: previousVersion,
      new_version:      state.version,
    });
    writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2), "utf-8");

    // 9. Mark proposal as executed in queue
    markExecuted(proposal_id);

  } catch (err) {
    // Rollback on any failure — state.json is restored to pre-execution snapshot
    rollback.restore();
    throw err;
  }
}
