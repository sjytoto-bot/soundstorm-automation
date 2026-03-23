// ─── Strategy Snapshot Util ────────────────────────────────────────────────────
// localStorage 기반 전략 스냅샷 저장 / 불러오기 / 삭제
// 서버 연동 없음 — JSON 직렬화 사용
//
// snapshot 구조:
//   { id, label, period, weights, tracks:[{id,total,grade,delta}], createdAt }

const STORAGE_KEY = "SOUNDSTORM_STRATEGY_SNAPSHOTS";

// ─── helpers ──────────────────────────────────────────────────────────────────

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persist(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ─── API ──────────────────────────────────────────────────────────────────────

// snapshot 추가 (최신 순, 맨 앞 삽입)
export function saveSnapshot(snapshot) {
  const list = load();
  list.unshift(snapshot);
  persist(list);
}

// 전체 스냅샷 목록 반환 (최신 순)
export function getSnapshots() {
  return load();
}

// id 일치 항목 제거
export function deleteSnapshot(id) {
  persist(load().filter(s => s.id !== id));
}
