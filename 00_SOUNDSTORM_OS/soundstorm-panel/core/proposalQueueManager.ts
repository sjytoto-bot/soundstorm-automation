/**
 * SOUNDSTORM OS — Proposal Queue Manager
 *
 * Manages the lifecycle of AI-generated proposals.
 * Proposals are validated then placed in the queue as "pending".
 * Only the OS may change the status; no auto-execution logic exists here.
 *
 * Prohibited: state.json access / risk-based logic / auto-approval / dispatch
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateProposal } from "./proposalValidator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QUEUE_PATH = join(__dirname, "../logs/proposal_queue.json");

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed";

export interface QueueEntry extends Record<string, unknown> {
  proposal_id: string;
  status: ProposalStatus;
  created_at: string;
  updated_at: string;
}

interface Queue {
  version: number;
  proposals: QueueEntry[];
}

// ── Internal I/O ───────────────────────────────────────────────────────────────

function readQueue(): Queue {
  return JSON.parse(readFileSync(QUEUE_PATH, "utf-8")) as Queue;
}

function writeQueue(queue: Queue): void {
  writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), "utf-8");
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Validates a proposal and adds it to the queue as "pending".
 * @throws if validation fails or proposal_id already exists in queue
 */
export function addProposal(proposal: object): void {
  validateProposal(proposal);

  const queue = readQueue();
  const raw = proposal as Record<string, unknown>;
  const proposal_id = raw["proposal_id"] as string;

  if (queue.proposals.some(p => p.proposal_id === proposal_id)) {
    throw new Error(`Duplicate proposal_id: ${proposal_id}`);
  }

  const now = new Date().toISOString();
  const entry: QueueEntry = {
    ...raw,
    proposal_id,
    status: "pending",
    created_at: now,
    updated_at: now,
  };

  queue.proposals.push(entry);
  writeQueue(queue);
}

/**
 * Returns all proposals with status "pending".
 */
export function getPendingProposals(): QueueEntry[] {
  return readQueue().proposals.filter(p => p.status === "pending");
}

/**
 * Returns a proposal by id, or null if not found.
 */
export function getProposalById(proposal_id: string): QueueEntry | null {
  return readQueue().proposals.find(p => p.proposal_id === proposal_id) ?? null;
}

// ── Status transitions ─────────────────────────────────────────────────────────

function updateStatus(proposal_id: string, status: ProposalStatus): void {
  const queue = readQueue();
  const entry = queue.proposals.find(p => p.proposal_id === proposal_id);

  if (!entry) {
    throw new Error(`Proposal not found: ${proposal_id}`);
  }

  entry.status = status;
  entry.updated_at = new Date().toISOString();
  writeQueue(queue);
}

export function markApproved(proposal_id: string): void {
  updateStatus(proposal_id, "approved");
}

export function markRejected(proposal_id: string): void {
  updateStatus(proposal_id, "rejected");
}

export function markExecuted(proposal_id: string): void {
  updateStatus(proposal_id, "executed");
}
