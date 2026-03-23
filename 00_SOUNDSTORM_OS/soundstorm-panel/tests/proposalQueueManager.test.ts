import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

// fs 전체 모킹 — 실제 파일 시스템 접근 없음
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// proposalValidator 모킹 — 검증기는 별도 테스트 대상이므로 분리
vi.mock("../core/proposalValidator", () => ({
  validateProposal: vi.fn(() => true as const),
}));

import { readFileSync, writeFileSync } from "fs";
import { validateProposal } from "../core/proposalValidator";
import {
  addProposal,
  getPendingProposals,
  markApproved,
  markRejected,
  markExecuted,
  getProposalById,
} from "../core/proposalQueueManager";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROPOSAL_A = {
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
      new_value: "completed",
      reversible: true,
    },
  ],
  explanation: "Test proposal A",
  confidence_score: 0.9,
};

const PROPOSAL_B = {
  ...PROPOSAL_A,
  proposal_id: "660f9511-f30c-42e5-b827-557766551111",
  explanation: "Test proposal B",
};

// ── In-memory queue 상태 추적 ──────────────────────────────────────────────────

type MockQueue = { version: number; proposals: object[] };
let mockQueue: MockQueue;

beforeEach(() => {
  mockQueue = { version: 1, proposals: [] };

  vi.mocked(readFileSync).mockImplementation(
    () => JSON.stringify(mockQueue) as unknown as ReturnType<typeof readFileSync>
  );

  vi.mocked(writeFileSync).mockImplementation((_path, data) => {
    mockQueue = JSON.parse(data as string);
  });

  vi.mocked(validateProposal).mockReturnValue(true);
});

// ── addProposal ───────────────────────────────────────────────────────────────

describe("addProposal", () => {
  it("유효한 proposal을 pending 상태로 큐에 추가한다", () => {
    addProposal(PROPOSAL_A);

    const result = getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>;
    expect(result).not.toBeNull();
    expect(result.status).toBe("pending");
    expect(result.proposal_id).toBe(PROPOSAL_A.proposal_id);
  });

  it("created_at과 updated_at이 ISO8601 형식으로 기록된다", () => {
    addProposal(PROPOSAL_A);

    const result = getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>;
    expect(typeof result.created_at).toBe("string");
    expect(typeof result.updated_at).toBe("string");
    expect(() => new Date(result.created_at as string)).not.toThrow();
  });

  it("validateProposal이 호출된다", () => {
    addProposal(PROPOSAL_A);
    expect(validateProposal).toHaveBeenCalledWith(PROPOSAL_A);
  });

  it("validateProposal이 실패하면 큐에 추가하지 않는다", () => {
    vi.mocked(validateProposal).mockImplementationOnce(() => {
      throw new Error("Proposal validation failed");
    });

    expect(() => addProposal(PROPOSAL_A)).toThrow("Proposal validation failed");
    expect(getPendingProposals()).toHaveLength(0);
  });

  it("중복 proposal_id 시 Error를 throw한다", () => {
    addProposal(PROPOSAL_A);
    expect(() => addProposal(PROPOSAL_A)).toThrow(
      `Duplicate proposal_id: ${PROPOSAL_A.proposal_id}`
    );
  });

  it("서로 다른 proposal_id는 각각 추가된다", () => {
    addProposal(PROPOSAL_A);
    addProposal(PROPOSAL_B);

    expect(getPendingProposals()).toHaveLength(2);
  });
});

// ── getPendingProposals ───────────────────────────────────────────────────────

describe("getPendingProposals", () => {
  it("pending 상태 proposal만 반환한다", () => {
    addProposal(PROPOSAL_A);
    addProposal(PROPOSAL_B);
    markApproved(PROPOSAL_B.proposal_id);

    const pending = getPendingProposals();
    expect(pending).toHaveLength(1);
    expect((pending[0] as Record<string, unknown>).proposal_id).toBe(PROPOSAL_A.proposal_id);
  });

  it("pending이 없으면 빈 배열을 반환한다", () => {
    expect(getPendingProposals()).toHaveLength(0);
  });

  it("전부 처리된 경우 빈 배열을 반환한다", () => {
    addProposal(PROPOSAL_A);
    markRejected(PROPOSAL_A.proposal_id);

    expect(getPendingProposals()).toHaveLength(0);
  });
});

// ── markApproved / markRejected / markExecuted ────────────────────────────────

describe("상태 변경 — pending → approved → executed", () => {
  it("pending → approved 로 변경된다", () => {
    addProposal(PROPOSAL_A);
    markApproved(PROPOSAL_A.proposal_id);

    const result = getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>;
    expect(result.status).toBe("approved");
  });

  it("approved → executed 로 변경된다", () => {
    addProposal(PROPOSAL_A);
    markApproved(PROPOSAL_A.proposal_id);
    markExecuted(PROPOSAL_A.proposal_id);

    const result = getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>;
    expect(result.status).toBe("executed");
  });

  it("pending → rejected 로 변경된다", () => {
    addProposal(PROPOSAL_A);
    markRejected(PROPOSAL_A.proposal_id);

    const result = getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>;
    expect(result.status).toBe("rejected");
  });

  it("상태 변경 시 updated_at이 갱신된다", () => {
    addProposal(PROPOSAL_A);
    const before = (getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>).updated_at;

    // 1ms 이상 지연 보장
    vi.useFakeTimers();
    vi.advanceTimersByTime(10);
    markApproved(PROPOSAL_A.proposal_id);
    vi.useRealTimers();

    const after = (getProposalById(PROPOSAL_A.proposal_id) as Record<string, unknown>).updated_at;
    expect(after).not.toBe(before);
  });
});

// ── 존재하지 않는 id 에러 ─────────────────────────────────────────────────────

describe("존재하지 않는 proposal_id", () => {
  const GHOST_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  it("markApproved — Proposal not found Error", () => {
    expect(() => markApproved(GHOST_ID)).toThrow(`Proposal not found: ${GHOST_ID}`);
  });

  it("markRejected — Proposal not found Error", () => {
    expect(() => markRejected(GHOST_ID)).toThrow(`Proposal not found: ${GHOST_ID}`);
  });

  it("markExecuted — Proposal not found Error", () => {
    expect(() => markExecuted(GHOST_ID)).toThrow(`Proposal not found: ${GHOST_ID}`);
  });

  it("getProposalById — null 반환", () => {
    expect(getProposalById(GHOST_ID)).toBeNull();
  });
});
