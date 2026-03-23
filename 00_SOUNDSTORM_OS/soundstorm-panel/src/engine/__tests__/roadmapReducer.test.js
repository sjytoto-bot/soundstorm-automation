import { describe, it, expect } from "vitest";
import { roadmapReducer, createRoadmapEvent, ROADMAP_EVENT_TYPES } from "../roadmapReducer";

// ─── 공통 초기 상태 ────────────────────────────────────────────────────────────
const BASE_STATE = {
  roadmap: {
    current_phase: "1단계",
    focus_phase:   "1",
    active_track:  null,
    tracks:        {},
  },
  goals:   {},
  history: [],
};

// ─── TRACK_CREATED ─────────────────────────────────────────────────────────────
describe("roadmapReducer / TRACK_CREATED", () => {
  it("tracks에 새 트랙을 추가한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_CREATED, {
      id: "t1", name: "트랙1", phase: "1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.roadmap.tracks["t1"]).toMatchObject({
      name: "트랙1", phase: "1", status: "active",
    });
  });

  it("history에 이벤트를 추가한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_CREATED, {
      id: "t1", name: "트랙1", phase: "1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].type).toBe(ROADMAP_EVENT_TYPES.TRACK_CREATED);
  });

  it("phase가 없으면 null로 저장한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_CREATED, {
      id: "t2", name: "트랙2",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.roadmap.tracks["t2"].phase).toBeNull();
  });

  it("roadmap이 없으면 state 그대로 반환한다", () => {
    const stateWithoutRoadmap = { goals: {} };
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_CREATED, {
      id: "t1", name: "트랙1", phase: "1",
    });
    const s = roadmapReducer(stateWithoutRoadmap, e);
    expect(s).toBe(stateWithoutRoadmap);
  });
});

// ─── TRACK_MOVED ───────────────────────────────────────────────────────────────
describe("roadmapReducer / TRACK_MOVED", () => {
  const STATE_WITH_TRACK = {
    ...BASE_STATE,
    roadmap: {
      ...BASE_STATE.roadmap,
      tracks: { t1: { name: "트랙1", phase: "1", status: "active" } },
    },
  };

  it("트랙의 phase를 변경한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_MOVED, { id: "t1", phase: "2" });
    const s = roadmapReducer(STATE_WITH_TRACK, e);
    expect(s.roadmap.tracks["t1"].phase).toBe("2");
  });

  it("다른 필드는 유지된다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_MOVED, { id: "t1", phase: "3" });
    const s = roadmapReducer(STATE_WITH_TRACK, e);
    expect(s.roadmap.tracks["t1"].name).toBe("트랙1");
    expect(s.roadmap.tracks["t1"].status).toBe("active");
  });

  it("존재하지 않는 트랙이면 state 그대로 반환한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_MOVED, { id: "ghost", phase: "2" });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s).toBe(BASE_STATE);
  });

  it("history에 이벤트를 추가한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_MOVED, { id: "t1", phase: "2" });
    const s = roadmapReducer(STATE_WITH_TRACK, e);
    expect(s.history).toHaveLength(1);
  });
});

// ─── ACTIVE_TRACK_CHANGED ──────────────────────────────────────────────────────
describe("roadmapReducer / ACTIVE_TRACK_CHANGED", () => {
  const STATE_WITH_TRACK = {
    ...BASE_STATE,
    roadmap: {
      ...BASE_STATE.roadmap,
      tracks: { t1: { name: "트랙1", phase: "1" } },
    },
  };

  it("active_track을 지정 트랙으로 변경한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.ACTIVE_TRACK_CHANGED, { id: "t1" });
    const s = roadmapReducer(STATE_WITH_TRACK, e);
    expect(s.roadmap.active_track).toBe("t1");
  });

  it("id가 null이면 active_track을 null로 설정한다", () => {
    const s0 = {
      ...STATE_WITH_TRACK,
      roadmap: { ...STATE_WITH_TRACK.roadmap, active_track: "t1" },
    };
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.ACTIVE_TRACK_CHANGED, { id: null });
    const s = roadmapReducer(s0, e);
    expect(s.roadmap.active_track).toBeNull();
  });

  it("존재하지 않는 트랙 id는 무시한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.ACTIVE_TRACK_CHANGED, { id: "ghost" });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s).toBe(BASE_STATE);
  });
});

// ─── GOAL_CREATED ──────────────────────────────────────────────────────────────
describe("roadmapReducer / GOAL_CREATED", () => {
  it("goals에 새 goal을 추가한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "목표1", trackId: "t1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.goals["g1"]).toMatchObject({
      title: "목표1", trackId: "t1", status: "planned",
    });
  });

  it("id를 명시하지 않으면 goal_ 접두사로 자동 생성한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      title: "자동ID 목표", trackId: "t1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    const keys = Object.keys(s.goals);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^goal_/);
  });

  it("priority 기본값은 medium이다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "목표1", trackId: "t1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.goals["g1"].priority).toBe("medium");
  });

  it("초기 status는 항상 planned이다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "목표1", trackId: "t1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.goals["g1"].status).toBe("planned");
  });

  it("기존 goals는 유지된다", () => {
    const s0 = { ...BASE_STATE, goals: { g0: { title: "기존", status: "done", trackId: "t1" } } };
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "새 목표", trackId: "t1",
    });
    const s = roadmapReducer(s0, e);
    expect(Object.keys(s.goals)).toHaveLength(2);
    expect(s.goals["g0"].title).toBe("기존");
  });

  it("history에 이벤트를 추가한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "목표1", trackId: "t1",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s.history).toHaveLength(1);
  });
});

// ─── GOAL_STATUS_CHANGED ───────────────────────────────────────────────────────
describe("roadmapReducer / GOAL_STATUS_CHANGED", () => {
  const STATE_WITH_GOAL = {
    ...BASE_STATE,
    goals: { g1: { title: "목표1", status: "planned", trackId: "t1" } },
  };

  it("goal의 status를 active로 변경한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "active",
    });
    const s = roadmapReducer(STATE_WITH_GOAL, e);
    expect(s.goals["g1"].status).toBe("active");
  });

  it("goal의 status를 done으로 변경한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "done",
    });
    const s = roadmapReducer(STATE_WITH_GOAL, e);
    expect(s.goals["g1"].status).toBe("done");
  });

  it("goal의 status를 blocked로 변경한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "blocked",
    });
    const s = roadmapReducer(STATE_WITH_GOAL, e);
    expect(s.goals["g1"].status).toBe("blocked");
  });

  it("다른 goal 필드는 변경되지 않는다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "done",
    });
    const s = roadmapReducer(STATE_WITH_GOAL, e);
    expect(s.goals["g1"].title).toBe("목표1");
    expect(s.goals["g1"].trackId).toBe("t1");
  });

  it("존재하지 않는 goal이면 state 그대로 반환한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "ghost", status: "done",
    });
    const s = roadmapReducer(BASE_STATE, e);
    expect(s).toBe(BASE_STATE);
  });

  it("history에 이벤트를 추가한다", () => {
    const e = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "done",
    });
    const s = roadmapReducer(STATE_WITH_GOAL, e);
    expect(s.history).toHaveLength(1);
  });
});

// ─── UNDO 시뮬레이션 ────────────────────────────────────────────────────────────
describe("roadmapReducer / undo 시뮬레이션", () => {
  it("history 재실행으로 마지막 상태 변경을 되돌린다", () => {
    const e_create = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "목표1", trackId: "t1",
    });
    const e_done = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "done",
    });

    const s1 = roadmapReducer(BASE_STATE, e_create);
    const s2 = roadmapReducer(s1, e_done);

    expect(s2.goals["g1"].status).toBe("done");
    expect(s2.history).toHaveLength(2);

    // undo: history에서 마지막 이벤트 제외 후 초기 상태부터 재실행
    const eventsToReplay = s2.history.slice(0, -1);
    const sUndo = eventsToReplay.reduce(
      (acc, evt) => roadmapReducer(acc, evt),
      { ...BASE_STATE, history: [] }
    );

    // e_create만 재실행됨 → status는 초기값 "planned"
    expect(sUndo.goals["g1"].status).toBe("planned");
  });

  it("다중 이벤트 체인 후 history 길이가 이벤트 수와 일치한다", () => {
    const events = [
      createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_CREATED,        { id: "t1", name: "트랙1", phase: "1" }),
      createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED,         { id: "g1", title: "목표1", trackId: "t1" }),
      createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED,  { id: "g1", status: "done" }),
      createRoadmapEvent(ROADMAP_EVENT_TYPES.TRACK_MOVED,          { id: "t1", phase: "2" }),
    ];
    const finalState = events.reduce((s, e) => roadmapReducer(s, e), BASE_STATE);
    expect(finalState.history).toHaveLength(4);
  });

  it("빈 상태에서 이벤트 없이 시작하면 history도 비어 있다", () => {
    expect(BASE_STATE.history).toHaveLength(0);
  });

  it("history 재실행으로 두 단계 전 상태를 복원한다", () => {
    const e1 = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, {
      id: "g1", title: "목표1", trackId: "t1",
    });
    const e2 = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "active",
    });
    const e3 = createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: "g1", status: "done",
    });

    const s3 = [e1, e2, e3].reduce((s, e) => roadmapReducer(s, e), BASE_STATE);

    // 두 단계 undo (e1만 재실행)
    const sUndo2 = s3.history.slice(0, 1).reduce(
      (acc, evt) => roadmapReducer(acc, evt),
      { ...BASE_STATE, history: [] }
    );
    expect(sUndo2.goals["g1"].status).toBe("planned");
  });
});
