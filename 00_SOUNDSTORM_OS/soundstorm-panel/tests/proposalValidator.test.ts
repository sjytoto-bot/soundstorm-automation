import { describe, it, expect } from "vitest";
import { validateProposal } from "../core/proposalValidator";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_PROPOSAL = {
  proposal_id: "550e8400-e29b-41d4-a716-446655440000",
  agent_id: "claude-sonnet-4-6",
  timestamp: "2026-02-23T09:00:00.000Z",
  mode: "supervised",
  risk_level: "low",
  actions: [
    {
      action_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      type: "update",
      path: "$.stages[0].subtracks[0].status",
      old_value: "in-progress",
      new_value: "completed",
      reversible: true,
    },
  ],
  explanation: "Mark first subtrack as completed after review.",
  confidence_score: 0.92,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("validateProposal", () => {
  it("유효한 proposal을 통과시킨다", () => {
    expect(validateProposal(VALID_PROPOSAL)).toBe(true);
  });

  it("old_value 없이도 유효하다 (optional 필드)", () => {
    const { actions, ...rest } = VALID_PROPOSAL;
    const { old_value, ...actionWithoutOld } = actions[0];
    expect(validateProposal({ ...rest, actions: [actionWithoutOld] })).toBe(true);
  });

  it("필수 필드(explanation) 누락 시 Error를 throw한다", () => {
    const { explanation, ...missing } = VALID_PROPOSAL;
    expect(() => validateProposal(missing)).toThrow("Proposal validation failed");
  });

  it("필수 필드(confidence_score) 누락 시 Error를 throw한다", () => {
    const { confidence_score, ...missing } = VALID_PROPOSAL;
    expect(() => validateProposal(missing)).toThrow("Proposal validation failed");
  });

  it("risk_level enum 오류 시 Error를 throw한다", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, risk_level: "critical" })
    ).toThrow("Proposal validation failed");
  });

  it("mode enum 오류 시 Error를 throw한다", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, mode: "manual" })
    ).toThrow("Proposal validation failed");
  });

  it("confidence_score > 1 범위 오류 시 Error를 throw한다", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, confidence_score: 1.5 })
    ).toThrow("Proposal validation failed");
  });

  it("confidence_score < 0 범위 오류 시 Error를 throw한다", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, confidence_score: -0.1 })
    ).toThrow("Proposal validation failed");
  });

  it("actions 배열이 비어 있으면 Error를 throw한다 (minItems: 1)", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, actions: [] })
    ).toThrow("Proposal validation failed");
  });

  it("action.type enum 오류 시 Error를 throw한다", () => {
    const badAction = { ...VALID_PROPOSAL.actions[0], type: "patch" };
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, actions: [badAction] })
    ).toThrow("Proposal validation failed");
  });

  it("action.action_id가 UUID 형식이 아니면 Error를 throw한다", () => {
    const badAction = { ...VALID_PROPOSAL.actions[0], action_id: "not-a-uuid" };
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, actions: [badAction] })
    ).toThrow("Proposal validation failed");
  });

  it("proposal_id가 UUID 형식이 아니면 Error를 throw한다", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, proposal_id: "abc-123" })
    ).toThrow("Proposal validation failed");
  });

  it("timestamp가 ISO8601이 아니면 Error를 throw한다", () => {
    expect(() =>
      validateProposal({ ...VALID_PROPOSAL, timestamp: "2026/02/23" })
    ).toThrow("Proposal validation failed");
  });
});
