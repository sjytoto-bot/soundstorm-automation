/**
 * SOUNDSTORM OS — AI Control Center
 *
 * Single entry point for processing an AI-generated proposal end-to-end.
 * Orchestrates: validate → queue → evaluate → (dispatch if approved)
 *
 * Prohibited: direct state access / queue internals / re-implementing
 *             approval logic / re-implementing dispatch logic
 */

import { validateProposal }   from "./proposalValidator";
import { addProposal }         from "./proposalQueueManager";
import { evaluateProposal }    from "./approvalEngine";
import { executeProposal }     from "./actionDispatcher";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProcessResult {
  status: "pending" | "approved" | "executed";
  proposal_id: string;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Processes a raw AI proposal through the full Phase 2 pipeline:
 *
 *   validate → addProposal → evaluateProposal → [executeProposal]
 *
 * Returns:
 *   { status: "executed" }  — approved and successfully dispatched
 *   { status: "pending"  }  — queued, awaiting human or future evaluation
 *
 * @throws if validation fails, queueing fails, or dispatch fails (with rollback)
 */
export function processProposal(proposal: object): ProcessResult {
  // 1. Schema validation — throws on any violation
  validateProposal(proposal);

  const proposal_id = (proposal as Record<string, unknown>)["proposal_id"] as string;

  // 2. Add to pending queue
  addProposal(proposal);

  // 3. Approval decision (mode-based, no side-effects beyond markApproved)
  const decision = evaluateProposal(proposal_id);

  // 4. If approved, dispatch immediately
  if (decision === "approved") {
    executeProposal(proposal_id);
    return { status: "executed", proposal_id };
  }

  // 5. Not yet approved — remains in queue as pending
  return { status: "pending", proposal_id };
}
