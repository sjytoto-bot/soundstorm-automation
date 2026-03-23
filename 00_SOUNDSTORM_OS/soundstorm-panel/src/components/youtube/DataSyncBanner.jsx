import { T } from "../../styles/tokens";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  bg:     T.warnBg,
  border: T.color.warning,
  text:   T.text,
  muted:  T.muted,
};

// ─── DataSyncBanner ───────────────────────────────────────────────────────────
// Props
//   syncStatus  { status, masterLatest, trafficLatest, diffDays }
//
// status === "OK"      → null 반환 (렌더링 없음)
// status === "UNKNOWN" → 회색 info 배너
// status === "TRAFFIC_DATA_STALE" → 경고 배너 + 신뢰도 낮음 배지

export default function DataSyncBanner({ syncStatus }) {
  if (!syncStatus || syncStatus.status === "OK") return null;

  const isStale = syncStatus.status === "TRAFFIC_DATA_STALE";

  const borderColor  = isStale ? T.color.warning : T.muted;
  const bgColor      = isStale ? T.warnBg        : T.bgApp;
  const iconColor    = isStale ? T.color.warning  : T.muted;
  const textColor    = isStale ? T.color.warning  : T.muted;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          T.spacing.md,
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius: T.radius.btn,
      border:       `1px solid ${borderColor}`,
      background:   bgColor,
    }}>

      {/* 아이콘 */}
      <span style={{
        fontSize:   14,
        color:      iconColor,
        flexShrink: 0,
        marginTop:  1,
        fontFamily: "monospace",
      }}>
        {isStale ? "⚠" : "ℹ"}
      </span>

      {/* 메시지 영역 */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs, flex: 1 }}>

        {/* 메인 메시지 */}
        <span style={{ fontSize: 12, fontWeight: 600, color: textColor }}>
          {isStale
            ? "외부유입 데이터가 최신이 아닙니다."
            : "데이터 동기화 상태를 확인할 수 없습니다."}
        </span>

        {/* 날짜 + 지연 정보 */}
        {syncStatus.trafficLatest && (
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
              마지막 업데이트: {syncStatus.trafficLatest}
            </span>
            {isStale && (
              <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
                · {syncStatus.diffDays}일 지연
              </span>
            )}
          </div>
        )}

      </div>

      {/* 신뢰도 낮음 배지 — Traffic 관련 분석에만 표시 */}
      {isStale && (
        <div style={{
          display:       "flex",
          alignItems:    "center",
          gap:           T.spacing.xs,
          flexShrink:    0,
          flexDirection: "column",
          alignSelf:     "center",
        }}>
          <span style={{
            fontSize:      9,
            fontFamily:    "monospace",
            fontWeight:    700,
            letterSpacing: "0.06em",
            color:         T.color.warning,
            border:        `1px solid ${T.color.warning}55`,
            background:    `${T.color.warning}11`,
            borderRadius:  T.radius.badge,
            padding:       `2px ${T.spacing.sm}px`,
            whiteSpace:    "nowrap",
          }}>
            TRAFFIC 분석 · 신뢰도 낮음
          </span>
        </div>
      )}

    </div>
  );
}
