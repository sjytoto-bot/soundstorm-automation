import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ────────────────────────────────────────────────────────────

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../core/proposalQueueManager", () => ({
  getProposalById: vi.fn(),
  markExecuted: vi.fn(),
}));

// rollbackManager을 모킹하여 dispatcher 로직만 순수하게 검증
vi.mock("../core/rollbackManager", () => ({
  backupState: vi.fn(),
  restore: vi.fn(),
}));

import { readFileSync, writeFileSync } from "fs";
import { getProposalById, markExecuted } from "../core/proposalQueueManager";
import * as rollbackManager from "../core/rollbackManager";
import { executeProposal } from "../core/actionDispatcher";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROPOSAL_ID = "550e8400-e29b-41d4-a716-446655440000";

const BASE_ACTION = {
  action_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  type: "update" as const,
  path: "$.data.status",
  old_value: "pending",
  new_value:  "active",
  reversible: true,
};

const APPROVED_PROPOSAL = {
  proposal_id:      PROPOSAL_ID,
  agent_id:         "claude-sonnet-4-6",
  status:           "approved",
  risk_level:       "low",
  actions:          [BASE_ACTION],
  explanation:      "Activate data",
  confidence_score: 0.9,
  created_at:       "2026-02-23T09:00:00.000Z",
  updated_at:       "2026-02-23T09:00:00.000Z",
};

// ── In-memory state / changelog tracking ──────────────────────────────────────

type AnyObj = Record<string, unknown>;
let mockState:     AnyObj;
let mockChangelog: AnyObj[];

function setupMocks(stateOverride?: Partial<AnyObj>) {
  mockState = {
    version:      1,
    last_updated: "2026-02-23T08:00:00.000Z",
    data:         { status: "pending", items: ["a", "b"] },
    ...stateOverride,
  };
  mockChangelog = [];

  vi.mocked(readFileSync).mockImplementation((path) => {
    const p = String(path);
    if (p.includes("state.json"))     return JSON.stringify(mockState)     as unknown as ReturnType<typeof readFileSync>;
    if (p.includes("changelog.json")) return JSON.stringify(mockChangelog) as unknown as ReturnType<typeof readFileSync>;
    return "{}" as unknown as ReturnType<typeof readFileSync>;
  });

  vi.mocked(writeFileSync).mockImplementation((path, data) => {
    const p = String(path);
    if (p.includes("state.json"))     mockState     = JSON.parse(data as string);
    else if (p.includes("changelog.json")) mockChangelog = JSON.parse(data as string);
  });

  vi.mocked(getProposalById).mockReturnValue(APPROVED_PROPOSAL as ReturnType<typeof getProposalById>);
  vi.mocked(markExecuted).mockImplementation(() => {});
  vi.mocked(rollbackManager.backupState).mockImplementation(() => {});
  vi.mocked(rollbackManager.restore).mockImplementation(() => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

// ── 정상 실행 ─────────────────────────────────────────────────────────────────

describe("정상 실행 — update", () => {
  it("action 경로의 값이 new_value로 변경된다", () => {
    executeProposal(PROPOSAL_ID);
    expect((mockState.data as AnyObj).status).toBe("active");
  });

  it("state.version이 1 증가한다", () => {
    const before = mockState.version as number;
    executeProposal(PROPOSAL_ID);
    expect(mockState.version).toBe(before + 1);
  });

  it("state.last_updated가 현재 시각으로 갱신된다", () => {
    const before = mockState.last_updated;
    executeProposal(PROPOSAL_ID);
    expect(mockState.last_updated).not.toBe(before);
    expect(() => new Date(mockState.last_updated as string)).not.toThrow();
  });

  it("backupState가 mutation 이전에 호출된다", () => {
    executeProposal(PROPOSAL_ID);
    expect(rollbackManager.backupState).toHaveBeenCalledOnce();
  });

  it("markExecuted가 성공 후 호출된다", () => {
    executeProposal(PROPOSAL_ID);
    expect(markExecuted).toHaveBeenCalledWith(PROPOSAL_ID);
  });
});

// ── changelog 기록 ────────────────────────────────────────────────────────────

describe("changelog 기록", () => {
  it("실행 후 changelog에 항목이 1개 추가된다", () => {
    executeProposal(PROPOSAL_ID);
    expect(mockChangelog).toHaveLength(1);
  });

  it("changelog 항목에 proposal_id가 기록된다", () => {
    executeProposal(PROPOSAL_ID);
    expect((mockChangelog[0] as AnyObj).proposal_id).toBe(PROPOSAL_ID);
  });

  it("changelog 항목에 version 전환 정보가 기록된다", () => {
    executeProposal(PROPOSAL_ID);
    const entry = mockChangelog[0] as AnyObj;
    expect(entry.previous_version).toBe(1);
    expect(entry.new_version).toBe(2);
  });

  it("changelog 항목에 actions_count가 기록된다", () => {
    executeProposal(PROPOSAL_ID);
    expect((mockChangelog[0] as AnyObj).actions_count).toBe(1);
  });

  it("changelog 항목에 executed_at(ISO8601)이 기록된다", () => {
    executeProposal(PROPOSAL_ID);
    const ea = (mockChangelog[0] as AnyObj).executed_at as string;
    expect(() => new Date(ea)).not.toThrow();
  });
});

// ── create action ─────────────────────────────────────────────────────────────

describe("create action", () => {
  it("존재하지 않는 경로에 새 값이 생성된다", () => {
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [{ ...BASE_ACTION, type: "create", path: "$.data.newField", new_value: "born" }],
    } as ReturnType<typeof getProposalById>);

    executeProposal(PROPOSAL_ID);
    expect((mockState.data as AnyObj).newField).toBe("born");
  });

  it("이미 존재하는 경로에 create → rollback 후 Error", () => {
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [{ ...BASE_ACTION, type: "create", path: "$.data.status", new_value: "conflict" }],
    } as ReturnType<typeof getProposalById>);

    expect(() => executeProposal(PROPOSAL_ID)).toThrow("already exists");
    expect(rollbackManager.restore).toHaveBeenCalledOnce();
  });
});

// ── delete action ─────────────────────────────────────────────────────────────

describe("delete action", () => {
  it("존재하는 경로가 삭제된다", () => {
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [{ ...BASE_ACTION, type: "delete", path: "$.data.status", new_value: null }],
    } as ReturnType<typeof getProposalById>);

    executeProposal(PROPOSAL_ID);
    expect((mockState.data as AnyObj).status).toBeUndefined();
  });

  it("존재하지 않는 경로 delete → rollback 후 Error", () => {
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [{ ...BASE_ACTION, type: "delete", path: "$.data.ghost", new_value: null }],
    } as ReturnType<typeof getProposalById>);

    expect(() => executeProposal(PROPOSAL_ID)).toThrow("does not exist");
    expect(rollbackManager.restore).toHaveBeenCalledOnce();
  });
});

// ── 중간 action 실패 → rollback ───────────────────────────────────────────────

describe("중간 action 실패 → rollback", () => {
  it("2번째 action 실패 → restore 호출, markExecuted 미호출", () => {
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [
        BASE_ACTION, // 1번: 성공 ($.data.status update)
        { ...BASE_ACTION, action_id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000001",
          type: "update", path: "$.data.nonExistent", new_value: "boom" }, // 2번: 실패
      ],
    } as ReturnType<typeof getProposalById>);

    expect(() => executeProposal(PROPOSAL_ID)).toThrow();
    expect(rollbackManager.restore).toHaveBeenCalledOnce();
    expect(markExecuted).not.toHaveBeenCalled();
  });

  it("실패 시 changelog에 기록되지 않는다", () => {
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [
        { ...BASE_ACTION, type: "update", path: "$.ghost.field", new_value: "x" },
      ],
    } as ReturnType<typeof getProposalById>);

    expect(() => executeProposal(PROPOSAL_ID)).toThrow();
    expect(mockChangelog).toHaveLength(0);
  });

  it("실패 시 state.json에 기록되지 않는다", () => {
    const originalVersion = mockState.version;
    vi.mocked(getProposalById).mockReturnValue({
      ...APPROVED_PROPOSAL,
      actions: [
        { ...BASE_ACTION, type: "update", path: "$.ghost.field", new_value: "x" },
      ],
    } as ReturnType<typeof getProposalById>);

    expect(() => executeProposal(PROPOSAL_ID)).toThrow();
    // writeFileSync for state.json should NOT have been called (no successful commit)
    const stateCalls = vi.mocked(writeFileSync).mock.calls.filter(([p]) =>
      String(p).includes("state.json")
    );
    expect(stateCalls).toHaveLength(0);
  });
});

// ── approved 아닌 proposal ────────────────────────────────────────────────────

describe("approved 아닌 proposal", () => {
  it("status=pending → Error, restore 미호출", () => {
    vi.mocked(getProposalById).mockReturnValue(
      { ...APPROVED_PROPOSAL, status: "pending" } as ReturnType<typeof getProposalById>
    );
    expect(() => executeProposal(PROPOSAL_ID)).toThrow("not approved");
    expect(rollbackManager.restore).not.toHaveBeenCalled();
  });

  it("status=rejected → Error throw", () => {
    vi.mocked(getProposalById).mockReturnValue(
      { ...APPROVED_PROPOSAL, status: "rejected" } as ReturnType<typeof getProposalById>
    );
    expect(() => executeProposal(PROPOSAL_ID)).toThrow();
  });

  it("존재하지 않는 proposal_id → Proposal not found Error", () => {
    vi.mocked(getProposalById).mockReturnValue(null);
    expect(() => executeProposal("ghost-id")).toThrow("Proposal not found: ghost-id");
  });
});
