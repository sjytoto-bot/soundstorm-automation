import { describe, it, expect } from "vitest";
import { shouldDispatch } from "../src/components/dashboard/UpdateStatusBar";

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-03-19T02:00:00Z").getTime();
const min = (m: number) => m * 60_000;

function run(
  status: string,
  conclusion: string | null,
  minsAgo: number,
  id = 1,
) {
  const updated_at = new Date(NOW - min(minsAgo)).toISOString();
  return { id, updated_at, conclusion, status, name: "youtube-data-sync" };
}

// ─── shouldDispatch 테스트 ────────────────────────────────────────────────────

describe("shouldDispatch", () => {

  // ── 기본 케이스 ──────────────────────────────────────────────────────────────

  it("성공 55분 전 → ok (60분 기준 미달)", () => {
    const result = shouldDispatch({
      runs: [run("completed", "success", 55)],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("ok");
  });

  it("성공 60분 전, 첫 dispatch → dispatch", () => {
    const result = shouldDispatch({
      runs: [run("completed", "success", 60)],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("dispatch");
  });

  it("성공 90분 전 → dispatch", () => {
    const result = shouldDispatch({
      runs: [run("completed", "success", 90)],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("dispatch");
  });

  // cron 25분 + stale 60분 충돌 방지 검증
  it("cron 25분 실행 후 35분 경과 → ok (중복 dispatch 없음)", () => {
    const result = shouldDispatch({
      runs: [run("completed", "success", 35)],  // cron이 35분 전 성공
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("ok");  // 60분 미달 → dispatch 안 함
  });

  // ── RUNNING 케이스 ────────────────────────────────────────────────────────────

  it("RUNNING 10분 → running (정상 실행 중)", () => {
    const result = shouldDispatch({
      runs: [run("in_progress", null, 10)],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("running");
  });

  it("QUEUED 5분 → running", () => {
    const result = shouldDispatch({
      runs: [run("queued", null, 5)],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("running");
  });

  it("RUNNING 31분 (stuck) → dispatch (성공 이력 없음)", () => {
    const result = shouldDispatch({
      runs: [run("in_progress", null, 31)],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("dispatch");
  });

  it("RUNNING 31분 stuck + 성공 이력 50분 전 → ok (60분 기준 미달)", () => {
    const result = shouldDispatch({
      runs: [
        run("in_progress", null, 31, 2),
        run("completed", "success", 50, 1),
      ],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("ok");
  });

  // ── safety lock (중복 방지) ───────────────────────────────────────────────────

  it("dispatch 3분 전 → cooldown (safety lock)", () => {
    const result = shouldDispatch({
      runs: [run("completed", "success", 70)],  // 70분 전 성공 → stale 조건 충족
      now: NOW,
      lastDispatchAt: NOW - min(3),
      retryCount: 0,
    });
    expect(result).toBe("cooldown");
  });

  it("dispatch 6분 전, retry 0 → cooldown (safety lock 통과 후 45분 backoff 적용)", () => {
    const result = shouldDispatch({
      runs: [run("completed", "success", 70)],  // 70분 전 성공 → stale 조건 충족
      now: NOW,
      lastDispatchAt: NOW - min(6),
      retryCount: 0,
    });
    expect(result).toBe("cooldown");
  });

  // ── exponential backoff ───────────────────────────────────────────────────────

  it("retry 0 → 45분 쿨다운: 44분 후 → cooldown", () => {
    const result = shouldDispatch({
      runs: [run("completed", "failure", 50)],
      now: NOW,
      lastDispatchAt: NOW - min(44),
      retryCount: 0,
    });
    expect(result).toBe("cooldown");
  });

  it("retry 0 → 45분 쿨다운: 46분 후 → dispatch", () => {
    const result = shouldDispatch({
      runs: [run("completed", "failure", 50)],
      now: NOW,
      lastDispatchAt: NOW - min(46),
      retryCount: 0,
    });
    expect(result).toBe("dispatch");
  });

  it("retry 1 → 90분 쿨다운: 89분 후 → cooldown", () => {
    const result = shouldDispatch({
      runs: [run("completed", "failure", 100)],
      now: NOW,
      lastDispatchAt: NOW - min(89),
      retryCount: 1,
    });
    expect(result).toBe("cooldown");
  });

  it("retry 1 → 90분 쿨다운: 91분 후 → dispatch", () => {
    const result = shouldDispatch({
      runs: [run("completed", "failure", 100)],
      now: NOW,
      lastDispatchAt: NOW - min(91),
      retryCount: 1,
    });
    expect(result).toBe("dispatch");
  });

  it("retry 10 → 180분 cap: 179분 후 → cooldown", () => {
    const result = shouldDispatch({
      runs: [run("completed", "failure", 200)],
      now: NOW,
      lastDispatchAt: NOW - min(179),
      retryCount: 10,
    });
    expect(result).toBe("cooldown");
  });

  it("retry 10 → 180분 cap: 181분 후 → dispatch", () => {
    const result = shouldDispatch({
      runs: [run("completed", "failure", 200)],
      now: NOW,
      lastDispatchAt: NOW - min(181),
      retryCount: 10,
    });
    expect(result).toBe("dispatch");
  });

  // ── 가장 최신 success 기준 ────────────────────────────────────────────────────

  it("오래된 success(90분) + 최신 success(30분) → ok (최신 기준 적용)", () => {
    const result = shouldDispatch({
      runs: [
        run("completed", "success", 30, 3),  // 최신 — 60분 미달
        run("completed", "failure", 50, 2),
        run("completed", "success", 90, 1),  // 구버전
      ],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("ok");
  });

  it("오래된 success(120분) + 최신 success(65분) → dispatch (최신 기준 초과)", () => {
    const result = shouldDispatch({
      runs: [
        run("completed", "success", 65, 2),
        run("completed", "success", 120, 1),
      ],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("dispatch");
  });

  // ── 빈 runs ───────────────────────────────────────────────────────────────────

  it("runs 비어있음 → cooldown", () => {
    const result = shouldDispatch({
      runs: [],
      now: NOW,
      lastDispatchAt: 0,
      retryCount: 0,
    });
    expect(result).toBe("cooldown");
  });
});
