// ─── dataSyncGuard v1 ─────────────────────────────────────────────────────────
// 마스터 시트와 트래픽 소스 시트의 최신 날짜 차이를 감지한다.
// 순수 함수 — 상태 변경 없음.

// ─── Status 타입 ──────────────────────────────────────────────────────────────
// "OK"                  : 두 시트가 동기화됨 (차이 ≤ 2일)
// "TRAFFIC_DATA_STALE"  : 트래픽 시트가 마스터보다 3일 이상 뒤처짐
// "UNKNOWN"             : 날짜 파싱 불가 (rows가 없거나 date 필드 없음)

const STALE_THRESHOLD_DAYS = 2;   // 이 값을 초과하면 STALE

// ─── helpers ──────────────────────────────────────────────────────────────────

/** "MM-DD" 문자열 → Date (현재 연도 기준) */
function parseMmDd(mmdd) {
  if (!mmdd || typeof mmdd !== "string") return null;
  const parts = mmdd.split("-");
  if (parts.length < 2) return null;
  const mm = parseInt(parts[0], 10);
  const dd = parseInt(parts[1], 10);
  if (isNaN(mm) || isNaN(dd)) return null;
  const year = new Date().getFullYear();
  return new Date(year, mm - 1, dd);
}

function diffDays(dateA, dateB) {
  return Math.floor((dateA.getTime() - dateB.getTime()) / 86_400_000);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// ─── getLatestDate ────────────────────────────────────────────────────────────
// @param  rows  { date: "MM-DD", ...}[] 형식의 배열
// @returns Date | null

export function getLatestDate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let latest = null;
  for (const row of rows) {
    const d = parseMmDd(row.date);
    if (!d) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

// ─── getDataSyncStatus ────────────────────────────────────────────────────────
// @param  masterRows   마스터 시트 행 배열 (DAILY_STATS 등)
// @param  trafficRows  트래픽 소스 시트 행 배열 (TRAFFIC_STATS 등)
// @returns {
//   status:        "OK" | "TRAFFIC_DATA_STALE" | "UNKNOWN"
//   masterLatest:  string | null   (ISO 날짜 "YYYY-MM-DD")
//   trafficLatest: string | null
//   diffDays:      number          (마스터 - 트래픽, 음수 불가)
// }

export function getDataSyncStatus(masterRows, trafficRows) {
  const masterLatest  = getLatestDate(masterRows);
  const trafficLatest = getLatestDate(trafficRows);

  if (!masterLatest || !trafficLatest) {
    return {
      status:        "UNKNOWN",
      masterLatest:  masterLatest  ? toIsoDate(masterLatest)  : null,
      trafficLatest: trafficLatest ? toIsoDate(trafficLatest) : null,
      diffDays:      0,
    };
  }

  const diff   = Math.max(0, diffDays(masterLatest, trafficLatest));
  const status = diff > STALE_THRESHOLD_DAYS ? "TRAFFIC_DATA_STALE" : "OK";

  return {
    status,
    masterLatest:  toIsoDate(masterLatest),
    trafficLatest: toIsoDate(trafficLatest),
    diffDays:      diff,
  };
}
