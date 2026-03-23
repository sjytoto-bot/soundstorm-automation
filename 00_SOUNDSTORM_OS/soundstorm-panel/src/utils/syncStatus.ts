// ─── syncStatus.ts ────────────────────────────────────────────────────────────
// syncError 문자열을 구조화된 상태로 변환.
// ExecutionPanel 배지 + GrowthLoopMonitor 보호 판단에 공용으로 사용한다.
//
// TTL 기준:
//   FRESH          : 정상 (syncError === null) 또는 6시간 미만 스냅샷
//   STALE_WARNING  : 스냅샷 6시간 초과
//   STALE_CRITICAL : 스냅샷 24시간 초과
//   SYNC_FAILED    : 스냅샷도 없는 완전 실패

export type SyncLevel =
  | "FRESH"
  | "STALE_WARNING"
  | "STALE_CRITICAL"
  | "SYNC_FAILED";

export interface SyncStatus {
  level:    SyncLevel;
  hoursAgo: number | null;   // STALE_* 시 경과 시간 (반올림), 그 외 null
  label:    string;          // UI 표시 문자열
  color:    string;          // 텍스트 색상 hex
  bg:       string;          // 배경 색상 hex
  dot:      "🟢" | "🟡" | "🔴";
  /** true이면 엔진 추천을 신뢰할 수 없음 */
  isStale:  boolean;
}

function formatHours(h: number): string {
  if (h < 1) return "방금";
  return `${h}시간 전`;
}

export function parseSyncStatus(
  syncError: string | null,
  lastSyncAt?: string | null,
): SyncStatus {
  // ── 정상 ──────────────────────────────────────────────────────────────────
  if (!syncError) {
    const label = lastSyncAt
      ? `${formatHours(Math.round((Date.now() - new Date(lastSyncAt).getTime()) / 3_600_000))} 업데이트`
      : "데이터 정상";
    return {
      level: "FRESH", hoursAgo: null,
      label, color: "#16A34A", bg: "#F0FDF4", dot: "🟢", isStale: false,
    };
  }

  // ── 스냅샷 사용 중 ─────────────────────────────────────────────────────────
  if (syncError.startsWith("STALE_SNAPSHOT:")) {
    const savedAt  = syncError.replace("STALE_SNAPSHOT:", "");
    const msAgo    = Date.now() - new Date(savedAt).getTime();
    const hoursAgo = Math.round(msAgo / 3_600_000);

    if (hoursAgo > 24) {
      return {
        level: "STALE_CRITICAL", hoursAgo,
        label:    `${hoursAgo}시간 지연`,
        color:    "#B91C1C",
        bg:       "#FEF2F2",
        dot:      "🔴",
        isStale:  true,
      };
    }
    if (hoursAgo > 6) {
      return {
        level: "STALE_WARNING", hoursAgo,
        label:    `${hoursAgo}시간 지연`,
        color:    "#D97706",
        bg:       "#FFFBEB",
        dot:      "🟡",
        isStale:  true,
      };
    }
    // 6시간 미만 스냅샷 — 사실상 FRESH 취급
    return {
      level: "FRESH", hoursAgo,
      label:    `${hoursAgo}시간 전 업데이트`,
      color:    "#16A34A",
      bg:       "#F0FDF4",
      dot:      "🟢",
      isStale:  false,
    };
  }

  // ── 완전 실패 ──────────────────────────────────────────────────────────────
  return {
    level: "SYNC_FAILED", hoursAgo: null,
    label:   "동기화 실패",
    color:   "#B91C1C",
    bg:      "#FEF2F2",
    dot:     "🔴",
    isStale: true,
  };
}
