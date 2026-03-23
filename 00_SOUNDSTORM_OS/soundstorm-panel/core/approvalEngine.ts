/**
 * SOUNDSTORM OS — Approval Engine
 *
 * Evaluates a pending proposal and returns the approval decision
 * based on mode_config.json.
 *
 * Prohibited: state.json access / dispatcher calls /
 *             conflict detection / auto-execution / mode logic beyond approval
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getProposalById, markApproved } from "./proposalQueueManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODE_CONFIG_PATH = join(__dirname, "../config/mode_config.json");

// ── Types ──────────────────────────────────────────────────────────────────────

type Mode = "supervised" | "semi-auto" | "auto";

interface ModeConfig {
  mode: Mode;
}

// ── Internal ───────────────────────────────────────────────────────────────────

function readModeConfig(): ModeConfig {
  return JSON.parse(readFileSync(MODE_CONFIG_PATH, "utf-8")) as ModeConfig;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Evaluates a proposal and returns the approval decision.
 *
 * - supervised : always returns "pending" (human review required)
 * - semi-auto  : auto-approves only if risk_level === "low"
 * - auto       : always approves
 *
 * If the proposal is already processed (status !== "pending"),
 * returns the current status without re-evaluating (idempotency guard).
 *
 * @throws Error if proposal_id does not exist in the queue
 */
export function evaluateProposal(proposal_id: string): "approved" | "pending" {
  const proposal = getProposalById(proposal_id);

  if (!proposal) {
    throw new Error(`Proposal not found: ${proposal_id}`);
  }

  // 재처리 방지: pending이 아닌 경우 현재 상태를 그대로 반환
  if (proposal.status !== "pending") {
    return proposal.status as "approved" | "pending";
  }

  const { mode } = readModeConfig();
  const risk_level = proposal["risk_level"] as string;

  switch (mode) {
    case "supervised":
      // 항상 대기 — 모든 proposal은 사람이 검토
      return "pending";

    case "semi-auto":
      // low risk만 자동 승인
      if (risk_level === "low") {
        markApproved(proposal_id);
        return "approved";
      }
      return "pending";

    case "auto":
      // 무조건 자동 승인
      markApproved(proposal_id);
      return "approved";

    default:
      return "pending";
  }
}
