import { describe, it, expect, vi } from "vitest";
import { useRoadmapController } from "../useRoadmapController";
import { ROADMAP_EVENT_TYPES } from "../../../engine/roadmapReducer";

// ─── 공통 파라미터 팩토리 ──────────────────────────────────────────────────────
function makeBaseParams(overrides = {}) {
  return {
    officialState: {
      roadmap: {
        current_phase: "1단계",
        focus_phase:   "1",
        active_track:  null,
        tracks:        {},
      },
      goals: {},
    },
    dispatchRoadmap:         vi.fn(),
    collapsedStages:         {},
    setCollapsedStages:      vi.fn(),
    collapsedStatusGroups:   {},
    setCollapsedStatusGroups: vi.fn(),
    editingGoal:  { id: null, title: "", priority: "medium", team: "" },
    setEditingGoal: vi.fn(),
    editingTrack: { id: null, name: "" },
    setEditingTrack: vi.fn(),
    editingPhase: { id: null, name: "" },
    setEditingPhase: vi.fn(),
    phaseCustomNames:    {},
    setPhaseCustomNames: vi.fn(),
    trackDrag:    { draggingId: null, overPhaseId: null, overTrackId: null },
    setTrackDrag: vi.fn(),
    goalDrag:     { draggingId: null, overId: null },
    setGoalDrag:  vi.fn(),
    goalOrder:       {},
    setGoalOrder:    vi.fn(),
    phaseTrackOrder:    {},
    setPhaseTrackOrder: vi.fn(),
    ...overrides,
  };
}

// ─── isGroupCollapsed ──────────────────────────────────────────────────────────
describe("useRoadmapController / isGroupCollapsed", () => {
  it("done 그룹의 기본값은 true(접힌 상태)다", () => {
    const { isGroupCollapsed } = useRoadmapController(makeBaseParams());
    expect(isGroupCollapsed("t1", "done")).toBe(true);
  });

  it("active 그룹의 기본값은 false(펼쳐진 상태)다", () => {
    const { isGroupCollapsed } = useRoadmapController(makeBaseParams());
    expect(isGroupCollapsed("t1", "active")).toBe(false);
  });

  it("planned 그룹의 기본값은 false다", () => {
    const { isGroupCollapsed } = useRoadmapController(makeBaseParams());
    expect(isGroupCollapsed("t1", "planned")).toBe(false);
  });

  it("blocked 그룹의 기본값은 false다", () => {
    const { isGroupCollapsed } = useRoadmapController(makeBaseParams());
    expect(isGroupCollapsed("t1", "blocked")).toBe(false);
  });

  it("collapsedStatusGroups에 명시된 값을 기본값보다 우선한다", () => {
    const { isGroupCollapsed } = useRoadmapController(makeBaseParams({
      collapsedStatusGroups: { "t1_done": false, "t1_active": true },
    }));
    expect(isGroupCollapsed("t1", "done")).toBe(false);
    expect(isGroupCollapsed("t1", "active")).toBe(true);
  });

  it("다른 트랙의 설정은 서로 독립적이다", () => {
    const { isGroupCollapsed } = useRoadmapController(makeBaseParams({
      collapsedStatusGroups: { "t1_active": true },
    }));
    expect(isGroupCollapsed("t1", "active")).toBe(true);
    expect(isGroupCollapsed("t2", "active")).toBe(false);
  });
});

// ─── toggleStatusGroup ─────────────────────────────────────────────────────────
describe("useRoadmapController / toggleStatusGroup", () => {
  it("done 그룹(기본 true) 토글 시 false로 업데이트한다", () => {
    const setCollapsedStatusGroups = vi.fn();
    const { toggleStatusGroup } = useRoadmapController(makeBaseParams({
      collapsedStatusGroups: {},
      setCollapsedStatusGroups,
    }));

    toggleStatusGroup("t1", "done");

    const updater = setCollapsedStatusGroups.mock.calls[0][0];
    const result  = updater({});
    expect(result["t1_done"]).toBe(false);
  });

  it("active 그룹(기본 false) 토글 시 true로 업데이트한다", () => {
    const setCollapsedStatusGroups = vi.fn();
    const { toggleStatusGroup } = useRoadmapController(makeBaseParams({
      collapsedStatusGroups: {},
      setCollapsedStatusGroups,
    }));

    toggleStatusGroup("t1", "active");

    const updater = setCollapsedStatusGroups.mock.calls[0][0];
    const result  = updater({});
    expect(result["t1_active"]).toBe(true);
  });

  it("이미 명시된 값을 반전한다", () => {
    const setCollapsedStatusGroups = vi.fn();
    const { toggleStatusGroup } = useRoadmapController(makeBaseParams({
      collapsedStatusGroups: { "t1_planned": true },
      setCollapsedStatusGroups,
    }));

    toggleStatusGroup("t1", "planned");

    const updater = setCollapsedStatusGroups.mock.calls[0][0];
    const result  = updater({ "t1_planned": true });
    expect(result["t1_planned"]).toBe(false);
  });
});

// ─── getOrderedTrackEntries ────────────────────────────────────────────────────
describe("useRoadmapController / getOrderedTrackEntries", () => {
  const entries = [
    ["t1", { name: "트랙1", phase: "1" }],
    ["t2", { name: "트랙2", phase: "1" }],
    ["t3", { name: "트랙3", phase: "1" }],
  ];

  it("phaseTrackOrder가 없으면 원래 순서를 그대로 반환한다", () => {
    const { getOrderedTrackEntries } = useRoadmapController(makeBaseParams());
    const result = getOrderedTrackEntries("1", entries);
    expect(result.map(([id]) => id)).toEqual(["t1", "t2", "t3"]);
  });

  it("phaseTrackOrder에 따라 순서를 재정렬한다", () => {
    const { getOrderedTrackEntries } = useRoadmapController(makeBaseParams({
      phaseTrackOrder: { "1": ["t3", "t1", "t2"] },
    }));
    const result = getOrderedTrackEntries("1", entries);
    expect(result.map(([id]) => id)).toEqual(["t3", "t1", "t2"]);
  });

  it("order에 없는 항목은 뒤에 추가한다", () => {
    const { getOrderedTrackEntries } = useRoadmapController(makeBaseParams({
      phaseTrackOrder: { "1": ["t2"] },
    }));
    const result = getOrderedTrackEntries("1", entries);
    const ids = result.map(([id]) => id);
    expect(ids[0]).toBe("t2");
    expect(ids).toContain("t1");
    expect(ids).toContain("t3");
  });

  it("다른 phase의 order는 영향을 주지 않는다", () => {
    const { getOrderedTrackEntries } = useRoadmapController(makeBaseParams({
      phaseTrackOrder: { "2": ["t3", "t2", "t1"] },
    }));
    const result = getOrderedTrackEntries("1", entries);
    expect(result.map(([id]) => id)).toEqual(["t1", "t2", "t3"]);
  });
});

// ─── handleTrackReorder ────────────────────────────────────────────────────────
describe("useRoadmapController / handleTrackReorder", () => {
  const officialStateWith3Tracks = {
    roadmap: {
      current_phase: "1단계",
      focus_phase:   "1",
      active_track:  null,
      tracks: {
        t1: { name: "트랙1", phase: "1", status: "active" },
        t2: { name: "트랙2", phase: "1", status: "active" },
        t3: { name: "트랙3", phase: "1", status: "active" },
      },
    },
    goals: {},
  };

  it("같은 phase 내에서 t1을 t3 앞으로 이동한다", () => {
    const setPhaseTrackOrder = vi.fn();
    const { handleTrackReorder } = useRoadmapController(makeBaseParams({
      officialState:   officialStateWith3Tracks,
      trackDrag:       { draggingId: "t1", overPhaseId: "1", overTrackId: "t3" },
      setPhaseTrackOrder,
    }));

    handleTrackReorder("t3", "1");

    const updater = setPhaseTrackOrder.mock.calls[0][0];
    const result  = updater({});
    // t1이 t3 직전 위치로 이동: [t2, t1, t3]
    expect(result["1"]).toEqual(["t2", "t1", "t3"]);
  });

  it("draggingId와 targetTrackId가 같으면 아무것도 하지 않는다", () => {
    const setPhaseTrackOrder = vi.fn();
    const { handleTrackReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateWith3Tracks,
      trackDrag:     { draggingId: "t1", overPhaseId: "1", overTrackId: "t1" },
      setPhaseTrackOrder,
    }));

    handleTrackReorder("t1", "1");
    expect(setPhaseTrackOrder).not.toHaveBeenCalled();
  });

  it("draggingId가 null이면 아무것도 하지 않는다", () => {
    const setPhaseTrackOrder = vi.fn();
    const { handleTrackReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateWith3Tracks,
      trackDrag:     { draggingId: null, overPhaseId: null, overTrackId: null },
      setPhaseTrackOrder,
    }));

    handleTrackReorder("t3", "1");
    expect(setPhaseTrackOrder).not.toHaveBeenCalled();
  });

  it("dragging 트랙과 targetPhaseId가 다르면(cross-phase) 아무것도 하지 않는다", () => {
    const setPhaseTrackOrder = vi.fn();
    const officialStateCrossPhase = {
      roadmap: {
        current_phase: "1단계",
        focus_phase:   "1",
        active_track:  null,
        tracks: {
          t1: { name: "트랙1", phase: "2", status: "active" }, // phase 2에 있음
          t2: { name: "트랙2", phase: "1", status: "active" },
        },
      },
      goals: {},
    };

    const { handleTrackReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateCrossPhase,
      trackDrag:     { draggingId: "t1", overPhaseId: "1", overTrackId: "t2" },
      setPhaseTrackOrder,
    }));

    handleTrackReorder("t2", "1"); // t1(phase 2)을 phase 1로 이동 시도
    expect(setPhaseTrackOrder).not.toHaveBeenCalled();
  });
});

// ─── handleGoalReorder ─────────────────────────────────────────────────────────
describe("useRoadmapController / handleGoalReorder", () => {
  const officialStateWith3Goals = {
    roadmap: {
      current_phase: "1단계",
      focus_phase:   "1",
      active_track:  null,
      tracks: { t1: { name: "트랙1", phase: "1" } },
    },
    goals: {
      g1: { title: "목표1", status: "active", trackId: "t1" },
      g2: { title: "목표2", status: "active", trackId: "t1" },
      g3: { title: "목표3", status: "active", trackId: "t1" },
    },
  };

  it("g1을 g3 앞으로 이동한다", () => {
    const setGoalOrder = vi.fn();
    const { handleGoalReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateWith3Goals,
      goalDrag:      { draggingId: "g1", overId: "g3" },
      setGoalOrder,
    }));

    handleGoalReorder("g3", "t1", "active");

    const updater = setGoalOrder.mock.calls[0][0];
    const result  = updater({});
    expect(result["t1_active"]).toEqual(["g2", "g1", "g3"]);
  });

  it("draggingId가 null이면 아무것도 하지 않는다", () => {
    const setGoalOrder = vi.fn();
    const { handleGoalReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateWith3Goals,
      goalDrag:      { draggingId: null, overId: "g3" },
      setGoalOrder,
    }));

    handleGoalReorder("g3", "t1", "active");
    expect(setGoalOrder).not.toHaveBeenCalled();
  });

  it("dragging과 target이 같으면 아무것도 하지 않는다", () => {
    const setGoalOrder = vi.fn();
    const { handleGoalReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateWith3Goals,
      goalDrag:      { draggingId: "g2", overId: "g2" },
      setGoalOrder,
    }));

    handleGoalReorder("g2", "t1", "active");
    expect(setGoalOrder).not.toHaveBeenCalled();
  });

  it("기존 goalOrder가 있으면 그것을 기반으로 재정렬한다", () => {
    const setGoalOrder = vi.fn();
    const { handleGoalReorder } = useRoadmapController(makeBaseParams({
      officialState: officialStateWith3Goals,
      goalDrag:      { draggingId: "g3", overId: "g1" },
      goalOrder:     { "t1_active": ["g2", "g3", "g1"] }, // 기존 커스텀 순서
      setGoalOrder,
    }));

    handleGoalReorder("g1", "t1", "active");

    const updater = setGoalOrder.mock.calls[0][0];
    const result  = updater({ "t1_active": ["g2", "g3", "g1"] });
    // g3를 g1 앞으로: ["g2", "g3", "g1"] → g3 제거 → ["g2", "g1"] → g1 위치에 g3 삽입 → ["g2", "g3", "g1"]
    expect(result["t1_active"]).toEqual(["g2", "g3", "g1"]);
  });
});

// ─── saveGoalEdit ──────────────────────────────────────────────────────────────
describe("useRoadmapController / saveGoalEdit", () => {
  it("team이 있으면 [team] 접두사를 붙인 title로 dispatch한다", () => {
    const dispatchRoadmap = vi.fn();
    const setEditingGoal  = vi.fn();
    const { saveGoalEdit } = useRoadmapController(makeBaseParams({
      dispatchRoadmap,
      setEditingGoal,
      editingGoal: { id: "g1", title: "새 제목", priority: "high", team: "콘텐츠팀" },
      officialState: {
        roadmap: { current_phase: "1단계", focus_phase: "1", active_track: null, tracks: {} },
        goals:   { g1: { title: "기존", status: "planned", trackId: "t1" } },
      },
    }));

    saveGoalEdit();

    expect(dispatchRoadmap).toHaveBeenCalledOnce();
    const event = dispatchRoadmap.mock.calls[0][0];
    expect(event.type).toBe(ROADMAP_EVENT_TYPES.GOAL_UPDATED);
    expect(event.payload.patch.title).toBe("[콘텐츠팀] 새 제목");
    expect(event.payload.patch.priority).toBe("high");
    expect(event.payload.patch.team).toBe("콘텐츠팀");
  });

  it("team이 없으면 접두사 없이 title만 사용한다", () => {
    const dispatchRoadmap = vi.fn();
    const { saveGoalEdit } = useRoadmapController(makeBaseParams({
      dispatchRoadmap,
      editingGoal: { id: "g1", title: "제목만", priority: "low", team: "" },
      officialState: {
        roadmap: { current_phase: "1단계", focus_phase: "1", active_track: null, tracks: {} },
        goals:   { g1: { title: "기존", status: "planned", trackId: "t1" } },
      },
    }));

    saveGoalEdit();

    const event = dispatchRoadmap.mock.calls[0][0];
    expect(event.payload.patch.title).toBe("제목만");
  });

  it("title이 공백만 있으면 dispatch하지 않고 editingGoal을 초기화한다", () => {
    const dispatchRoadmap = vi.fn();
    const setEditingGoal  = vi.fn();
    const { saveGoalEdit } = useRoadmapController(makeBaseParams({
      dispatchRoadmap,
      setEditingGoal,
      editingGoal: { id: "g1", title: "   ", priority: "medium", team: "" },
    }));

    saveGoalEdit();

    expect(dispatchRoadmap).not.toHaveBeenCalled();
    expect(setEditingGoal).toHaveBeenCalledWith({
      id: null, title: "", priority: "medium", team: "",
    });
  });

  it("저장 후 editingGoal을 초기값으로 리셋한다", () => {
    const setEditingGoal = vi.fn();
    const { saveGoalEdit } = useRoadmapController(makeBaseParams({
      setEditingGoal,
      editingGoal: { id: "g1", title: "제목", priority: "low", team: "" },
      officialState: {
        roadmap: { current_phase: "1단계", focus_phase: "1", active_track: null, tracks: {} },
        goals:   { g1: { title: "기존", status: "planned", trackId: "t1" } },
      },
    }));

    saveGoalEdit();

    expect(setEditingGoal).toHaveBeenCalledWith({
      id: null, title: "", priority: "medium", team: "",
    });
  });

  it("title을 trim한 후 저장한다", () => {
    const dispatchRoadmap = vi.fn();
    const { saveGoalEdit } = useRoadmapController(makeBaseParams({
      dispatchRoadmap,
      editingGoal: { id: "g1", title: "  앞뒤 공백  ", priority: "medium", team: "" },
      officialState: {
        roadmap: { current_phase: "1단계", focus_phase: "1", active_track: null, tracks: {} },
        goals:   { g1: { title: "기존", status: "planned", trackId: "t1" } },
      },
    }));

    saveGoalEdit();

    const event = dispatchRoadmap.mock.calls[0][0];
    expect(event.payload.patch.title).toBe("앞뒤 공백");
  });
});

// ─── 파생 계산값 ───────────────────────────────────────────────────────────────
describe("useRoadmapController / 파생 계산값", () => {
  it("currentPhaseId를 current_phase에서 추출한다", () => {
    const { currentPhaseId } = useRoadmapController(makeBaseParams({
      officialState: {
        roadmap: { current_phase: "2단계", focus_phase: "2", active_track: null, tracks: {} },
        goals: {},
      },
    }));
    expect(currentPhaseId).toBe("2");
  });

  it("current_phase가 없으면 첫 번째 phase로 fallback한다", () => {
    const { currentPhaseId } = useRoadmapController(makeBaseParams({
      officialState: {
        roadmap: { current_phase: "", focus_phase: null, active_track: null, tracks: {} },
        goals: {},
      },
    }));
    expect(currentPhaseId).toBe("1");
  });

  it("allGoalEntries에 goal id가 포함된다", () => {
    const { allGoalEntries } = useRoadmapController(makeBaseParams({
      officialState: {
        roadmap: { current_phase: "1단계", focus_phase: "1", active_track: null, tracks: {} },
        goals: {
          g1: { title: "목표1", status: "planned", trackId: "t1" },
          g2: { title: "목표2", status: "active",  trackId: "t1" },
        },
      },
    }));
    expect(allGoalEntries).toHaveLength(2);
    expect(allGoalEntries.find(g => g.id === "g1")).toBeDefined();
    expect(allGoalEntries.find(g => g.id === "g2")).toBeDefined();
  });

  it("teamOptions에 DEFAULT_TEAMS와 기존 팀이 포함된다", () => {
    const { teamOptions } = useRoadmapController(makeBaseParams({
      officialState: {
        roadmap: { current_phase: "1단계", focus_phase: "1", active_track: null, tracks: {} },
        goals: {
          g1: { title: "목표1", status: "planned", trackId: "t1", team: "새팀" },
        },
      },
    }));
    expect(teamOptions).toContain("새팀");
    expect(teamOptions).toContain("운영·개발팀"); // DEFAULT_TEAMS 중 하나
  });
});
