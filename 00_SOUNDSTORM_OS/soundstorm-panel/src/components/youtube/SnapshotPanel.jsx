import { T } from "../../styles/tokens";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  white:  T.bgCard,
  bg:     T.bgApp,
  border: T.border,
  text:   T.text,
  sub:    T.sub,
  muted:  T.muted,
};

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function defaultLabel() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `Snapshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const AXIS_KEYS = ["growth", "reach", "engagement", "monetization"];

function isActiveSnapshot(snap, period, weights) {
  return (
    snap.period === period &&
    AXIS_KEYS.every(k => Math.abs((snap.weights[k] ?? 0) - (weights[k] ?? 0)) < 0.001)
  );
}

// ─── SnapshotPanel ─────────────────────────────────────────────────────────────
// Props
//   snapshots   Array<snapshot>
//   period      현재 선택 period
//   weights     현재 가중치
//   onSave      (label: string) => void
//   onLoad      (snapshot) => void
//   onDelete    (id: string) => void

export default function SnapshotPanel({ snapshots, period, weights, onSave, onLoad, onDelete }) {
  const handleSave = () => {
    const def   = defaultLabel();
    const label = window.prompt("스냅샷 이름을 입력하세요:", def);
    if (label === null) return;         // 취소
    onSave(label.trim() || def);
  };

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.border}`,
      borderRadius: T.radius.card,
      padding:      `${T.spacing.xl}px`,
      boxShadow:    T.shadow.card,
      display:      "flex",
      flexDirection:"column",
      gap:          T.spacing.md,
    }}>

      {/* ── 헤더 + 저장 버튼 ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
          Strategy Snapshots
        </span>
        <button
          onClick={handleSave}
          style={{
            fontSize:      10,
            fontFamily:    "monospace",
            letterSpacing: "0.06em",
            fontWeight:    600,
            padding:       `${T.spacing.xs}px ${T.spacing.md}px`,
            borderRadius:  T.radius.badge,
            border:        `1px solid ${T.color.primary}`,
            background:    T.primarySoft,
            color:         T.color.primary,
            cursor:        "pointer",
          }}
        >
          + Save Snapshot
        </button>
      </div>

      {/* ── 스냅샷 목록 ─────────────────────────────────────────────────────── */}
      {snapshots.length === 0 ? (
        <div style={{
          padding:      `${T.spacing.md}px`,
          borderRadius: T.radius.btn,
          border:       `1px solid ${C.border}`,
          background:   C.bg,
          textAlign:    "center",
        }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
            저장된 스냅샷 없음
          </span>
        </div>
      ) : (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.xs,
          maxHeight:     240,
          overflowY:     "auto",
        }}>
          {snapshots.map(snap => {
            const isActive = isActiveSnapshot(snap, period, weights);
            return (
              <div
                key={snap.id}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  justifyContent:"space-between",
                  gap:           T.spacing.md,
                  padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
                  borderRadius:  T.radius.btn,
                  border:        `1px solid ${isActive ? T.color.primary : C.border}`,
                  background:    isActive ? T.primarySoft : C.bg,
                  transition:    "background 0.15s, border-color 0.15s",
                }}
              >
                {/* 정보 영역 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{
                    fontSize:     12,
                    fontWeight:   isActive ? 600 : 500,
                    color:        isActive ? T.color.primary : C.text,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                  }}>
                    {snap.label}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
                    <span style={{
                      fontSize: 9, color: C.muted, fontFamily: "monospace",
                      border: `1px solid ${C.border}`, borderRadius: T.radius.badge,
                      padding: `0 ${T.spacing.xs}px`,
                    }}>
                      {snap.period === "all" ? "ALL" : `${snap.period}D`}
                    </span>
                    <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>
                      {formatDate(snap.createdAt)}
                    </span>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div style={{ display: "flex", gap: T.spacing.xs, flexShrink: 0 }}>
                  <button
                    onClick={() => onLoad(snap)}
                    style={{
                      fontSize:     9,
                      fontFamily:   "monospace",
                      fontWeight:   600,
                      padding:      `2px ${T.spacing.xs}px`,
                      borderRadius: T.radius.badge,
                      border:       `1px solid ${T.color.primary}33`,
                      background:   T.primarySoft,
                      color:        T.color.primary,
                      cursor:       "pointer",
                    }}
                  >
                    Load
                  </button>
                  <button
                    onClick={() => onDelete(snap.id)}
                    style={{
                      fontSize:     9,
                      fontFamily:   "monospace",
                      fontWeight:   600,
                      padding:      `2px ${T.spacing.xs}px`,
                      borderRadius: T.radius.badge,
                      border:       `1px solid ${T.color.danger}33`,
                      background:   T.dangerBg,
                      color:        T.color.danger,
                      cursor:       "pointer",
                    }}
                  >
                    Del
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
