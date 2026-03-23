import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────

// fs 모킹 — mode_config.json 읽기 제어
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

// proposalQueueManager 모킹 — 파일 I/O 및 상태 변경 분리
vi.mock("../core/proposalQueueManager", () => ({
  getProposalById: vi.fn(),
  markApproved: vi.fn(),
}));

import { readFileSync } from "fs";
import { getProposalById, markApproved } from "../core/proposalQueueManager";
import { evaluateProposal } from "../core/approvalEngine";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440000";

function mockMode(mode: "supervised" | "semi-auto" | "auto") {
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ mode }) as unknown as ReturnType<typeof readFileSync>
  );
}

function mockProposal(risk_level: string, status = "pending") {
  vi.mocked(getProposalById).mockReturnValue({
    proposal_id: PROPOSAL_ID,
    agent_id: "claude-sonnet-4-6",
    timestamp: "2026-02-23T09:00:00.000Z",
    mode: "supervised",
    risk_level,
    actions: [],
    explanation: "test",
    confidence_score: 0.9,
    status,
    created_at: "2026-02-23T09:00:00.000Z",
    updated_at: "2026-02-23T09:00:00.000Z",
  } as ReturnType<typeof getProposalById>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── supervised ─────────────────────────────────────────────────────────────────

describe("supervised 모드", () => {
  it("risk_level = low → pending 반환", () => {
    mockMode("supervised");
    mockProposal("low");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("pending");
  });

  it("risk_level = medium → pending 반환", () => {
    mockMode("supervised");
    mockProposal("medium");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("pending");
  });

  it("risk_level = high → pending 반환", () => {
    mockMode("supervised");
    mockProposal("high");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("pending");
  });

  it("markApproved를 호출하지 않는다", () => {
    mockMode("supervised");
    mockProposal("low");
    evaluateProposal(PROPOSAL_ID);
    expect(markApproved).not.toHaveBeenCalled();
  });
});

// ── semi-auto ──────────────────────────────────────────────────────────────────

describe("semi-auto 모드", () => {
  it("risk_level = low → approved 반환 + markApproved 호출", () => {
    mockMode("semi-auto");
    mockProposal("low");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("approved");
    expect(markApproved).toHaveBeenCalledOnce();
    expect(markApproved).toHaveBeenCalledWith(PROPOSAL_ID);
  });

  it("risk_level = medium → pending 반환, markApproved 미호출", () => {
    mockMode("semi-auto");
    mockProposal("medium");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("pending");
    expect(markApproved).not.toHaveBeenCalled();
  });

  it("risk_level = high → pending 반환, markApproved 미호출", () => {
    mockMode("semi-auto");
    mockProposal("high");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("pending");
    expect(markApproved).not.toHaveBeenCalled();
  });
});

// ── auto ───────────────────────────────────────────────────────────────────────

describe("auto 모드", () => {
  it("risk_level = low → approved 반환 + markApproved 호출", () => {
    mockMode("auto");
    mockProposal("low");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("approved");
    expect(markApproved).toHaveBeenCalledWith(PROPOSAL_ID);
  });

  it("risk_level = medium → approved 반환 + markApproved 호출", () => {
    mockMode("auto");
    mockProposal("medium");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("approved");
    expect(markApproved).toHaveBeenCalledWith(PROPOSAL_ID);
  });

  it("risk_level = high → approved 반환 + markApproved 호출", () => {
    mockMode("auto");
    mockProposal("high");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("approved");
    expect(markApproved).toHaveBeenCalledWith(PROPOSAL_ID);
  });
});

// ── 재처리 방지 ────────────────────────────────────────────────────────────────

describe("재처리 방지 (status !== pending)", () => {
  it("이미 approved → approved 그대로 반환, markApproved 미호출", () => {
    mockMode("auto");
    mockProposal("low", "approved");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("approved");
    expect(markApproved).not.toHaveBeenCalled();
  });

  it("이미 rejected → rejected 그대로 반환, markApproved 미호출", () => {
    mockMode("auto");
    mockProposal("low", "rejected");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("rejected" as "pending");
    expect(markApproved).not.toHaveBeenCalled();
  });

  it("이미 executed → executed 그대로 반환, markApproved 미호출", () => {
    mockMode("auto");
    mockProposal("low", "executed");
    expect(evaluateProposal(PROPOSAL_ID)).toBe("executed" as "pending");
    expect(markApproved).not.toHaveBeenCalled();
  });
});

// ── 존재하지 않는 proposal_id ──────────────────────────────────────────────────

describe("존재하지 않는 proposal_id", () => {
  it("getProposalById가 null 반환 시 Error throw", () => {
    vi.mocked(getProposalById).mockReturnValue(null);
    expect(() => evaluateProposal("non-existent-id")).toThrow(
      "Proposal not found: non-existent-id"
    );
  });

  it("Error 발생 시 markApproved를 호출하지 않는다", () => {
    vi.mocked(getProposalById).mockReturnValue(null);
    expect(() => evaluateProposal("ghost-id")).toThrow();
    expect(markApproved).not.toHaveBeenCalled();
  });
});
