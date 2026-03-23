/**
 * inject-phase1-goals.mjs
 * Phase 1 초기 Goal 주입 스크립트
 *
 * 실행: node inject-phase1-goals.mjs
 *
 * - 중복 title은 자동 skip
 * - append-only: 기존 이벤트 수정 없음
 * - 안정적 goal ID로 replay 정상 동작 보장
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";

const HIST_PATH  = "/Users/sinjiyong/Library/Application Support/soundstorm-panel/history.json";
const STATE_PATH = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/00_SOUNDSTORM_OS/soundstorm-panel/logs/state.json";

// ─── 1. 초기 상태 로드 (앱과 동일한 base) ────────────────────────────────────

let initialState = null;
try {
  initialState = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  console.log("✓ state.json loaded");
} catch {
  console.error("✗ state.json read failed");
  process.exit(1);
}

// ─── 2. history.json 로드 ────────────────────────────────────────────────────

let history = [];
try {
  if (existsSync(HIST_PATH)) {
    const raw = readFileSync(HIST_PATH, "utf-8");
    history = raw ? JSON.parse(raw) : [];
    console.log(`✓ history.json loaded (${history.length} events)`);
  } else {
    console.log("  history.json not found — starting from empty");
  }
} catch {
  console.error("✗ history.json parse failed — starting from empty");
}

// ─── 3. 로컬 Reducer (stable ID 지원 포함, roadmapReducer.js와 동기화) ──────

function reducer(state, event) {
  if (!state?.roadmap) return state;
  const roadmap = state.roadmap;
  const tracks  = roadmap.tracks ?? {};

  switch (event.type) {
    case "TRACK_CREATED": {
      const { id, name, phase } = event.payload;
      return {
        ...state,
        roadmap: { ...roadmap, tracks: { ...tracks, [id]: { name, phase: phase ?? null, status: "active", goals: {} } } },
        history: [...(state.history ?? []), event],
      };
    }
    case "TRACK_UPDATED": {
      const { id, patch } = event.payload;
      if (!tracks[id]) return state;
      return { ...state, roadmap: { ...roadmap, tracks: { ...tracks, [id]: { ...tracks[id], ...patch } } } };
    }
    case "TRACK_DELETED": {
      const { id } = event.payload;
      const { [id]: _, ...rest } = tracks;
      const filteredGoals = Object.fromEntries(
        Object.entries(state.goals ?? {}).filter(([, g]) => g.trackId !== id)
      );
      return {
        ...state,
        roadmap: { ...roadmap, tracks: rest, active_track: roadmap.active_track === id ? null : roadmap.active_track },
        goals:   filteredGoals,
        history: [...(state.history ?? []), event],
      };
    }
    case "TRACK_MOVED": {
      const { id, phase } = event.payload;
      if (!tracks[id]) return state;
      return {
        ...state,
        roadmap: { ...roadmap, tracks: { ...tracks, [id]: { ...tracks[id], phase } } },
        history: [...(state.history ?? []), event],
      };
    }
    case "ACTIVE_TRACK_CHANGED": {
      const { id } = event.payload;
      if (id != null && !tracks[id]) return state;
      return { ...state, roadmap: { ...roadmap, active_track: id ?? null } };
    }
    case "GOAL_CREATED": {
      // stable ID: payloadId가 있으면 사용, 없으면 Date.now() (backward-compatible)
      const { id: payloadId, title, trackId, priority = "medium", team = "" } = event.payload;
      const id = payloadId ?? ("goal_" + Date.now());
      return {
        ...state,
        goals: {
          ...(state.goals ?? {}),
          [id]: { title, status: "planned", trackId, priority, team, created_at: new Date().toISOString() },
        },
        history: [...(state.history ?? []), event],
      };
    }
    case "GOAL_UPDATED": {
      const { id, patch } = event.payload;
      if (!(state.goals ?? {})[id]) return state;
      return {
        ...state,
        goals: { ...(state.goals ?? {}), [id]: { ...(state.goals ?? {})[id], ...patch } },
        history: [...(state.history ?? []), event],
      };
    }
    case "GOAL_STATUS_CHANGED": {
      const { id, status } = event.payload;
      if (!(state.goals ?? {})[id]) return state;
      return {
        ...state,
        goals: { ...(state.goals ?? {}), [id]: { ...(state.goals ?? {})[id], status } },
        history: [...(state.history ?? []), event],
      };
    }
    case "GOAL_DELETED": {
      const { id } = event.payload;
      const { [id]: _, ...rest } = state.goals ?? {};
      return { ...state, goals: rest, history: [...(state.history ?? []), event] };
    }
    case "ROADMAP_FOCUS_CHANGED": {
      const { phase } = event.payload;
      return { ...state, roadmap: { ...roadmap, focus_phase: phase }, history: [...(state.history ?? []), event] };
    }
    default:
      return state;
  }
}

// ─── 4. 현재 상태 계산 ───────────────────────────────────────────────────────

let state = initialState;
for (const evt of history) state = reducer(state, evt);

const currentTracks     = state.roadmap?.tracks ?? {};
const currentGoals      = state.goals ?? {};
const existingGoalTitles = new Set(Object.values(currentGoals).map(g => g.title));

console.log("\n── 현재 상태 ──────────────────────────────────────────────────");
console.log("Tracks:", Object.keys(currentTracks).join(", "));
console.log(`Goals:  ${Object.keys(currentGoals).length}개`);
if (existingGoalTitles.size) {
  console.log("기존 Goal 제목:");
  for (const t of existingGoalTitles) console.log(`  · ${t}`);
}

// ─── 5. 주입할 이벤트 정의 ───────────────────────────────────────────────────

const TRACKS = [
  { id: "1단계_완료",   name: "1단계 완료",   phase: "1" },
  { id: "1단계_진행중", name: "1단계 진행중", phase: "1" },
  { id: "1단계_다음",   name: "1단계 다음",   phase: "1" },
];

const GOALS = [
  // ✅ COMPLETED → done
  { title: "License Engine v2.1 프로덕션 배포",      trackId: "1단계_완료",   status: "done"    },
  { title: "Cloud Run + Scheduler 자동화 가동",      trackId: "1단계_완료",   status: "done"    },
  { title: "R2 Presigned URL 구조 확정",             trackId: "1단계_완료",   status: "done"    },
  { title: "CSV 단일 마스터 구조 확정",               trackId: "1단계_완료",   status: "done"    },
  { title: "Track/Goal 이벤트 기반 구조 확정",        trackId: "1단계_완료",   status: "done"    },
  { title: "history append-only 구조 확정",          trackId: "1단계_완료",   status: "done"    },
  { title: "네이밍 / SS ID 체계 확정",                trackId: "1단계_완료",   status: "done"    },
  { title: "업로드 리듬 고정 전략 확정",               trackId: "1단계_완료",   status: "done"    },
  { title: "4시간 플레이리스트 파이프라인 표준화",      trackId: "1단계_완료",   status: "done"    },
  // 🔄 IN_PROGRESS → active
  { title: "점수 계산 구조 재점검",                    trackId: "1단계_진행중", status: "active"  },
  { title: "YouTube API 자동 수집 구현",              trackId: "1단계_진행중", status: "active"  },
  { title: "분석 코드 예외 처리 보강",                 trackId: "1단계_진행중", status: "active"  },
  { title: "실주문 10건 자동 발급 검증",               trackId: "1단계_진행중", status: "active"  },
  { title: "네이버 4개 상품 최종 통일",                trackId: "1단계_진행중", status: "active"  },
  { title: "제목/썸네일 가이드 최종안 확정",            trackId: "1단계_진행중", status: "active"  },
  // ⏭ NEXT → planned
  { title: "YouTube OAuth 안정성 검증",               trackId: "1단계_다음",   status: "planned" },
  { title: "점수 모델 확정 후 OS Freeze 선언",        trackId: "1단계_다음",   status: "planned" },
  { title: "2025 종합소득세 신고 구조 확정",           trackId: "1단계_다음",   status: "planned" },
  { title: "전략 자동 리포트 설계 준비",                trackId: "1단계_다음",   status: "planned" },
];

// ─── 6. 이벤트 생성 ─────────────────────────────────────────────────────────

const now      = Date.now();
const newEvents = [];
let   offset   = 0;

function makeEvent(type, payload, off) {
  const ts = now + off;
  return {
    id:        `evt_${ts}`,
    domain:    "roadmap",
    team:      "운영팀_마스터컨트롤",
    type,
    payload,
    timestamp: new Date(ts).toISOString(),
  };
}

// Tracks
for (const track of TRACKS) {
  if (currentTracks[track.id]) {
    console.log(`\nTRACK SKIP (exists): ${track.id}`);
  } else {
    offset += 10;
    newEvents.push(makeEvent("TRACK_CREATED", { id: track.id, name: track.name, phase: track.phase }, offset));
  }
}

// Goals
for (const goal of GOALS) {
  if (existingGoalTitles.has(goal.title)) {
    console.log(`GOAL  SKIP (exists): ${goal.title}`);
    continue;
  }

  offset += 10;
  const goalId = `goal_${now + offset}`;

  newEvents.push(makeEvent("GOAL_CREATED", {
    id:       goalId,
    title:    goal.title,
    trackId:  goal.trackId,
    priority: "medium",
    team:     "",
  }, offset));

  if (goal.status !== "planned") {
    offset += 10;
    newEvents.push(makeEvent("GOAL_STATUS_CHANGED", { id: goalId, status: goal.status }, offset));
  }
}

// ─── 7. 결과 출력 및 파일 쓰기 ───────────────────────────────────────────────

if (newEvents.length === 0) {
  console.log("\n✓ 주입할 이벤트 없음 — 모든 track/goal이 이미 존재합니다.");
  process.exit(0);
}

console.log(`\n── 주입 이벤트 (${newEvents.length}개) ───────────────────────────────────────`);
for (const e of newEvents) {
  const p = e.payload;
  const desc = e.type === "TRACK_CREATED"       ? `Track: "${p.name}" (phase ${p.phase})`
             : e.type === "GOAL_CREATED"        ? `Goal:  "${p.title}" → ${p.trackId}`
             : e.type === "GOAL_STATUS_CHANGED" ? `Status: ${p.id.slice(-8)} → ${p.status}`
             : JSON.stringify(p).slice(0, 60);
  console.log(`  [${e.type.padEnd(22)}] ${desc}`);
}

const updated  = [...history, ...newEvents];
const tempPath = HIST_PATH + ".tmp";
writeFileSync(tempPath, JSON.stringify(updated, null, 2), "utf-8");
renameSync(tempPath, HIST_PATH);

console.log(`\n✓ history.json 업데이트 완료 (총 ${updated.length}개 이벤트)`);
console.log("  앱을 재시작하면 3개 트랙과 19개 Goal이 반영됩니다.");
