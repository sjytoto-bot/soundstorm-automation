import { useMemo, useState } from "react";
import { T, L } from "../styles/tokens";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const EVENT_COLOR = {
  TRACK_CREATED:        { color: T.primary,  label: "Track 생성"  },
  TRACK_UPDATED:        { color: T.warn,     label: "Track 수정"  },
  TRACK_DELETED:        { color: T.danger,   label: "Track 삭제"  },
  ACTIVE_TRACK_CHANGED: { color: T.primary,  label: "Active 변경" },
  GOAL_CREATED:         { color: T.success,  label: "Goal 생성"   },
  GOAL_UPDATED:         { color: T.warn,     label: "Goal 수정"   },
  GOAL_STATUS_CHANGED:  { color: T.primary,  label: "상태 변경"   },
  GOAL_DELETED:         { color: T.danger,   label: "Goal 삭제"   },
};

const selectStyle = {
  fontSize: 12, padding: "4px 8px",
  border: `1px solid ${T.border}`, borderRadius: T.radius.badge,
  color: T.sub, background: T.bgCard, cursor: "pointer",
};

// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────

export default function ActivityLog({ officialState }) {
  const [filterType,  setFilterType]  = useState("all");
  const [filterTrack, setFilterTrack] = useState("all");

  const history = useMemo(
    () => [...(officialState?.history ?? [])].reverse(),
    [officialState]
  );
  const tracks = useMemo(
    () => officialState?.roadmap?.tracks ?? {},
    [officialState]
  );

  // ── Event type options ───────────────────────────────────────────────────────
  const typeOptions = useMemo(
    () => ["all", ...Array.from(new Set(history.map(e => e.type)))],
    [history]
  );

  // ── Track options ────────────────────────────────────────────────────────────
  const trackOptions = useMemo(
    () => ["all", ...Object.keys(tracks)],
    [tracks]
  );

  // ── Filtered events ──────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => history.filter(e => {
      if (filterType  !== "all" && e.type !== filterType) return false;
      if (filterTrack !== "all") {
        const tid = e.payload?.trackId ?? e.payload?.id ?? null;
        if (tid !== filterTrack) return false;
      }
      return true;
    }),
    [history, filterType, filterTrack]
  );

  return (
    <div>

      {/* ── Header + filters ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: T.spacing.md, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: T.sub }}>
          총 {history.length}건
        </span>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={selectStyle}
        >
          <option value="all">모든 이벤트</option>
          {typeOptions.filter(t => t !== "all").map(t => (
            <option key={t} value={t}>{EVENT_COLOR[t]?.label ?? t}</option>
          ))}
        </select>

        <select
          value={filterTrack}
          onChange={e => setFilterTrack(e.target.value)}
          style={selectStyle}
        >
          <option value="all">모든 트랙</option>
          {trackOptions.filter(t => t !== "all").map(k => (
            <option key={k} value={k}>{tracks[k]?.name ?? tracks[k]?.label ?? k}</option>
          ))}
        </select>

        <span style={{ fontSize: 11, color: T.muted }}>
          {filtered.length} / {history.length}건 표시
        </span>
      </div>

      {/* ── Event list ───────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: T.muted }}>이벤트 없음</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
          {filtered.map(evt => {
            const meta      = EVENT_COLOR[evt.type] ?? { color: T.muted, label: evt.type };
            const timeLabel = evt.timestamp
              ? new Date(evt.timestamp).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "—";
            const summary = payloadSummary(evt.payload);

            return (
              /* grid: [L.badgeCol=80px 타입뱃지] [1fr 페이로드] [auto 시간]
                 alignItems: baseline → 텍스트 베이스라인 정렬 일관성 유지 */
              <div
                key={evt.id ?? evt.timestamp}
                style={{
                  display: "grid",
                  gridTemplateColumns: `${L.badgeCol}px 1fr auto`,
                  alignItems: "baseline",
                  columnGap: L.colGap,
                  padding: `8px ${L.pxSm}px`,
                  border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
                  background: T.bgCard,
                }}
              >
                {/* Type badge — L.badgeCol 고정, justifySelf:start 로 좌측 정렬 */}
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                  color: meta.color,
                  border: `1px solid ${meta.color}33`,
                  borderRadius: T.radius.badge, padding: "2px 6px",
                  whiteSpace: "nowrap",
                  justifySelf: "start",
                }}>
                  {meta.label}
                </span>

                {/* Payload summary */}
                <span style={{
                  fontSize: 12, color: T.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {summary}
                </span>

                {/* Timestamp — secondary text */}
                <span style={{
                  fontSize: 11, color: T.muted,
                  fontFamily: "monospace", whiteSpace: "nowrap",
                }}>
                  {timeLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function payloadSummary(payload) {
  if (!payload) return "—";
  const parts = [];
  if (payload.id)     parts.push(`id: ${String(payload.id).slice(0, 20)}`);
  if (payload.name)   parts.push(`name: ${payload.name}`);
  if (payload.title)  parts.push(`title: ${payload.title}`);
  if (payload.status) parts.push(`→ ${payload.status}`);
  if (payload.trackId) parts.push(`track: ${payload.trackId}`);
  if (payload.patch) {
    const keys = Object.keys(payload.patch).join(", ");
    parts.push(`patch: {${keys}}`);
  }
  return parts.join("  ·  ") || JSON.stringify(payload).slice(0, 60);
}
