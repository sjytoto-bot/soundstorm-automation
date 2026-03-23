import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────
// 하위 모듈을 전부 격리 — controlCenter의 오케스트레이션 로직만 검증

vi.mock("../core/proposalValidator", () => ({
  validateProposal: vi.fn(() => true as const),
}));

vi.mock("../core/proposalQueueManager", () => ({
  addProposal: vi.fn(),
}));

vi.mock("../core/approvalEngine", () => ({
  evaluateProposal: vi.fn(),
}));

vi.mock("../core/actionDispatcher", () => ({
  executeProposal: vi.fn(),
}));

import { validateProposal }   from "../core/proposalValidator";
import { addProposal }         from "../core/proposalQueueManager";
import { evaluateProposal }    from "../core/approvalEngine";
import { executeProposal }     from "../core/actionDispatcher";
import { processProposal }     from "../core/controlCenter";

// ── Fixture ───────────────────────────────────────────────────────────────────

const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440000";

const PROPOSAL = {
  proposal_id:      PROPOSAL_ID,
  agent_id:         "claude-sonnet-4-6",
  timestamp:        "2026-02-23T09:00:00.000Z",
  mode:             "supervised",
  risk_level:       "low",
  actions:          [{
    action_id:  "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    type:       "update",
    path:       "$.data.status",
    new_value:  "active",
    reversible: true,
  }],
  explanation:      "Test proposal",
  confidence_score: 0.9,
};

beforeEach(() => {
  // resetAllMocks: 호출 기록 + 구현 모두 초기화 (clearAllMocks는 구현을 유지함)
  vi.resetAllMocks();

  // 기본 구현 복원 — 각 테스트는 필요한 부분만 override
  vi.mocked(validateProposal).mockReturnValue(true);
  vi.mocked(addProposal).mockImplementation(() => {});
  vi.mocked(evaluateProposal).mockReturnValue("pending");
  vi.mocked(executeProposal).mockImplementation(() => {});
});

// ── supervised 모드 ────────────────────────────────────────────────────────────

describe("supervised 모드 → pending", () => {
  it("evaluateProposal가 pending을 반환하면 status: pending", () => {
    vi.mocked(evaluateProposal).mockReturnValue("pending");

    const result = processProposal(PROPOSAL);

    expect(result.status).toBe("pending");
    expect(result.proposal_id).toBe(PROPOSAL_ID);
  });

  it("executeProposal이 호출되지 않는다", () => {
    vi.mocked(evaluateProposal).mockReturnValue("pending");

    processProposal(PROPOSAL);

    expect(executeProposal).not.toHaveBeenCalled();
  });
});

// ── semi-auto + low risk ───────────────────────────────────────────────────────

describe("semi-auto + low risk → executed", () => {
  it("evaluateProposal가 approved를 반환하면 status: executed", () => {
    vi.mocked(evaluateProposal).mockReturnValue("approved");

    const result = processProposal(PROPOSAL);

    expect(result.status).toBe("executed");
    expect(result.proposal_id).toBe(PROPOSAL_ID);
  });

  it("executeProposal이 proposal_id와 함께 호출된다", () => {
    vi.mocked(evaluateProposal).mockReturnValue("approved");

    processProposal(PROPOSAL);

    expect(executeProposal).toHaveBeenCalledOnce();
    expect(executeProposal).toHaveBeenCalledWith(PROPOSAL_ID);
  });
});

// ── semi-auto + medium risk ────────────────────────────────────────────────────

describe("semi-auto + medium risk → pending", () => {
  it("evaluateProposal가 pending을 반환하면 status: pending, 실행 없음", () => {
    vi.mocked(evaluateProposal).mockReturnValue("pending");

    const result = processProposal({ ...PROPOSAL, risk_level: "medium" });

    expect(result.status).toBe("pending");
    expect(executeProposal).not.toHaveBeenCalled();
  });
});

// ── auto 모드 ──────────────────────────────────────────────────────────────────

describe("auto 모드 → executed", () => {
  it("evaluateProposal approved → executeProposal 호출 → status: executed", () => {
    vi.mocked(evaluateProposal).mockReturnValue("approved");

    const result = processProposal(PROPOSAL);

    expect(result.status).toBe("executed");
    expect(executeProposal).toHaveBeenCalledWith(PROPOSAL_ID);
  });
});

// ── 파이프라인 호출 순서 ────────────────────────────────────────────────────────

describe("호출 순서 보장", () => {
  it("validate → addProposal → evaluateProposal 순서로 호출된다", () => {
    vi.mocked(evaluateProposal).mockReturnValue("pending");
    const order: string[] = [];

    vi.mocked(validateProposal).mockImplementation(() => { order.push("validate"); return true; });
    vi.mocked(addProposal).mockImplementation(() => { order.push("add"); });
    vi.mocked(evaluateProposal).mockImplementation(() => { order.push("evaluate"); return "pending"; });

    processProposal(PROPOSAL);

    expect(order).toEqual(["validate", "add", "evaluate"]);
  });

  it("approved 시 evaluate → executeProposal 순서로 호출된다", () => {
    const order: string[] = [];
    vi.mocked(validateProposal).mockImplementation(() => { order.push("validate"); return true; });
    vi.mocked(addProposal).mockImplementation(() => { order.push("add"); });
    vi.mocked(evaluateProposal).mockImplementation(() => { order.push("evaluate"); return "approved"; });
    vi.mocked(executeProposal).mockImplementation(() => { order.push("execute"); });

    processProposal(PROPOSAL);

    expect(order).toEqual(["validate", "add", "evaluate", "execute"]);
  });
});

// ── validation 실패 ────────────────────────────────────────────────────────────

describe("validation 실패", () => {
  it("validateProposal throws → Error가 그대로 전파된다", () => {
    vi.mocked(validateProposal).mockImplementation(() => {
      throw new Error("Proposal validation failed");
    });

    expect(() => processProposal(PROPOSAL)).toThrow("Proposal validation failed");
  });

  it("validation 실패 시 addProposal이 호출되지 않는다", () => {
    vi.mocked(validateProposal).mockImplementation(() => {
      throw new Error("Proposal validation failed");
    });

    expect(() => processProposal(PROPOSAL)).toThrow();
    expect(addProposal).not.toHaveBeenCalled();
  });

  it("validation 실패 시 evaluateProposal이 호출되지 않는다", () => {
    vi.mocked(validateProposal).mockImplementation(() => {
      throw new Error("Proposal validation failed");
    });

    expect(() => processProposal(PROPOSAL)).toThrow();
    expect(evaluateProposal).not.toHaveBeenCalled();
  });
});

// ── dispatcher 실패 → rollback 후 Error ───────────────────────────────────────

describe("dispatcher 실패", () => {
  it("executeProposal throws → Error가 그대로 전파된다", () => {
    vi.mocked(evaluateProposal).mockReturnValue("approved");
    vi.mocked(executeProposal).mockImplementation(() => {
      throw new Error("Dispatch failed: rollback executed");
    });

    expect(() => processProposal(PROPOSAL)).toThrow("Dispatch failed: rollback executed");
  });

  it("dispatcher 실패 시 status: executed는 반환되지 않는다", () => {
    vi.mocked(evaluateProposal).mockReturnValue("approved");
    vi.mocked(executeProposal).mockImplementation(() => {
      throw new Error("Dispatch failed");
    });

    let result: ReturnType<typeof processProposal> | undefined;
    try {
      result = processProposal(PROPOSAL);
    } catch {
      // expected
    }
    expect(result).toBeUndefined();
  });
});
