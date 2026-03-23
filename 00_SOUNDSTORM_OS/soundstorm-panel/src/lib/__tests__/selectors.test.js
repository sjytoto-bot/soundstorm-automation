import { describe, it, expect } from "vitest";
import {
  selectGoalStats,
  selectTrackStats,
  selectDashboardData,
} from "../selectors";

// ─── FIXTURES ─────────────────────────────────────────────────────────────────
const EMPTY_STATE = {
  roadmap: {
    current_phase: "1단계",
    focus_phase:   "1",
    active_track:  null,
    tracks:        {},
  },
  goals:   {},
  history: [],
};

function makeGoals(specs) {
  // specs: array of { id, status, trackId? }
  return Object.fromEntries(
    specs.map(({ id, status, trackId = "t1", team = "" }) => [
      id,
      { title: `목표_${id}`, status, trackId, team },
    ])
  );
}

function makeTracks(specs) {
  // specs: array of { id, status?, phase? }
  return Object.fromEntries(
    specs.map(({ id, status = "active", phase = "1" }) => [
      id,
      { name: `트랙_${id}`, status, phase },
    ])
  );
}

// ─── selectGoalStats ───────────────────────────────────────────────────────────
describe("selectGoalStats", () => {
  it("goals가 없으면 전부 0을 반환한다", () => {
    const result = selectGoalStats(EMPTY_STATE);
    expect(result).toEqual({ done: 0, active: 0, planned: 0, blocked: 0, total: 0, progressPct: 0 });
  });

  it("null / undefined state에서도 0을 반환한다", () => {
    expect(selectGoalStats(null)).toEqual({ done: 0, active: 0, planned: 0, blocked: 0, total: 0, progressPct: 0 });
    expect(selectGoalStats(undefined)).toEqual({ done: 0, active: 0, planned: 0, blocked: 0, total: 0, progressPct: 0 });
  });

  it("각 status별 count를 정확히 계산한다", () => {
    const state = {
      ...EMPTY_STATE,
      goals: makeGoals([
        { id: "g1", status: "done"    },
        { id: "g2", status: "done"    },
        { id: "g3", status: "active"  },
        { id: "g4", status: "planned" },
        { id: "g5", status: "blocked" },
      ]),
    };
    const result = selectGoalStats(state);
    expect(result.done).toBe(2);
    expect(result.active).toBe(1);
    expect(result.planned).toBe(1);
    expect(result.blocked).toBe(1);
    expect(result.total).toBe(5);
  });

  it("progressPct = done / total * 100 (정수 반올림)", () => {
    const state = {
      ...EMPTY_STATE,
      goals: makeGoals([
        { id: "g1", status: "done" },
        { id: "g2", status: "done" },
        { id: "g3", status: "active" },
      ]),
    };
    const { progressPct } = selectGoalStats(state);
    expect(progressPct).toBe(67); // 2/3 * 100 = 66.666... → 67
  });

  it("progressPct가 0이면 0을 반환한다 (total=0)", () => {
    const { progressPct } = selectGoalStats(EMPTY_STATE);
    expect(progressPct).toBe(0);
  });

  it("전부 완료되면 progressPct가 100이다", () => {
    const state = {
      ...EMPTY_STATE,
      goals: makeGoals([
        { id: "g1", status: "done" },
        { id: "g2", status: "done" },
      ]),
    };
    const { progressPct } = selectGoalStats(state);
    expect(progressPct).toBe(100);
  });

  it("단일 goal이 done이면 progressPct가 100이다", () => {
    const state = {
      ...EMPTY_STATE,
      goals: makeGoals([{ id: "g1", status: "done" }]),
    };
    const { progressPct, total } = selectGoalStats(state);
    expect(total).toBe(1);
    expect(progressPct).toBe(100);
  });
});

// ─── selectTrackStats ──────────────────────────────────────────────────────────
describe("selectTrackStats", () => {
  it("tracks가 없으면 빈 결과를 반환한다", () => {
    const result = selectTrackStats(EMPTY_STATE);
    expect(result.activeTracks).toBe(0);
    expect(result.allTracks).toHaveLength(0);
    expect(result.focusTrack).toBe("");
  });

  it("null state에서 빈 결과를 반환한다", () => {
    const result = selectTrackStats(null);
    expect(result.activeTracks).toBe(0);
    expect(result.allTracks).toHaveLength(0);
  });

  it("active 상태의 트랙 수를 정확히 센다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: {
        ...EMPTY_STATE.roadmap,
        tracks: makeTracks([
          { id: "t1", status: "active"   },
          { id: "t2", status: "active"   },
          { id: "t3", status: "inactive" },
        ]),
      },
    };
    const { activeTracks } = selectTrackStats(state);
    expect(activeTracks).toBe(2);
  });

  it("allTracks에 모든 트랙 [id, track] 쌍이 포함된다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: {
        ...EMPTY_STATE.roadmap,
        tracks: makeTracks([
          { id: "t1", status: "active" },
          { id: "t2", status: "active" },
        ]),
      },
    };
    const { allTracks } = selectTrackStats(state);
    expect(allTracks).toHaveLength(2);
    expect(allTracks.map(([id]) => id)).toContain("t1");
    expect(allTracks.map(([id]) => id)).toContain("t2");
  });

  it("focusTrack은 roadmap.active_track을 반환한다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: {
        ...EMPTY_STATE.roadmap,
        active_track: "t2",
        tracks: makeTracks([{ id: "t1" }, { id: "t2" }]),
      },
    };
    const { focusTrack } = selectTrackStats(state);
    expect(focusTrack).toBe("t2");
  });

  it("active_track이 null이면 focusTrack은 빈 문자열이다", () => {
    const { focusTrack } = selectTrackStats(EMPTY_STATE);
    expect(focusTrack).toBe("");
  });

  it("active 트랙이 0개이면 activeTracks는 0이다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: {
        ...EMPTY_STATE.roadmap,
        tracks: makeTracks([
          { id: "t1", status: "paused" },
          { id: "t2", status: "done"   },
        ]),
      },
    };
    const { activeTracks } = selectTrackStats(state);
    expect(activeTracks).toBe(0);
  });
});

// ─── selectDashboardData ───────────────────────────────────────────────────────
describe("selectDashboardData", () => {
  it("completion은 selectGoalStats의 progressPct와 동일하다", () => {
    const state = {
      ...EMPTY_STATE,
      goals: makeGoals([
        { id: "g1", status: "done" },
        { id: "g2", status: "active" },
      ]),
    };
    const { completion } = selectDashboardData(state);
    expect(completion).toBe(50);
  });

  it("goalDistribution이 각 status 수를 포함한다", () => {
    const state = {
      ...EMPTY_STATE,
      goals: makeGoals([
        { id: "g1", status: "done"    },
        { id: "g2", status: "active"  },
        { id: "g3", status: "planned" },
        { id: "g4", status: "blocked" },
      ]),
    };
    const { goalDistribution } = selectDashboardData(state);
    expect(goalDistribution).toEqual({ done: 1, active: 1, planned: 1, blocked: 1, total: 4 });
  });

  it("kpi 데이터가 없으면 monthlyRevenue와 last30Views는 '--'이다", () => {
    const { monthlyRevenue, last30Views } = selectDashboardData(EMPTY_STATE);
    expect(monthlyRevenue).toBe("--");
    expect(last30Views).toBe("--");
  });

  it("kpi 데이터가 있으면 해당 값을 반환한다", () => {
    const state = {
      ...EMPTY_STATE,
      kpi: { monthlyRevenue: 500000, last30Views: 12000 },
    };
    const { monthlyRevenue, last30Views } = selectDashboardData(state);
    expect(monthlyRevenue).toBe(500000);
    expect(last30Views).toBe(12000);
  });

  it("currentPhase가 없으면 '--'를 반환한다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: { ...EMPTY_STATE.roadmap, current_phase: undefined },
    };
    const { currentPhase } = selectDashboardData(state);
    expect(currentPhase).toBe("--");
  });

  it("currentPhase를 roadmap.current_phase에서 가져온다", () => {
    const { currentPhase } = selectDashboardData(EMPTY_STATE);
    expect(currentPhase).toBe("1단계");
  });

  it("activeTracks은 selectTrackStats의 activeTracks와 동일하다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: {
        ...EMPTY_STATE.roadmap,
        tracks: makeTracks([
          { id: "t1", status: "active"   },
          { id: "t2", status: "active"   },
          { id: "t3", status: "inactive" },
        ]),
      },
    };
    const { activeTracks } = selectDashboardData(state);
    expect(activeTracks).toBe(2);
  });

  it("빈 상태에서도 전부 기본값을 반환한다", () => {
    const result = selectDashboardData(EMPTY_STATE);
    expect(result.completion).toBe(0);
    expect(result.activeTracks).toBe(0);
    expect(result.active).toBe(0);
    expect(result.blocked).toBe(0);
    expect(result.goalDistribution.total).toBe(0);
  });

  it("focusTrackId는 roadmap.active_track을 반환한다", () => {
    const state = {
      ...EMPTY_STATE,
      roadmap: {
        ...EMPTY_STATE.roadmap,
        active_track: "t3",
        tracks: makeTracks([{ id: "t3" }]),
      },
    };
    const { focusTrackId } = selectDashboardData(state);
    expect(focusTrackId).toBe("t3");
  });
});
