import { useState } from "react";
import { Zap, Sparkles, Clock, Settings, Play, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { parseCommand } from "../engine/commandParser";
import { T } from "../styles/tokens";

// ─── constants ────────────────────────────────────────────────────────────────

const PLACEHOLDER = `작업_추가:
  트랙: 대시보드 구축
  제목: 새 작업 예시
  우선순위: 높음
  팀: 운영·개발팀`;

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatActivity(evt) {
  const type    = evt.type ?? "";
  const payload = evt.payload ?? {};
  if (type === "GOAL_CREATED")         return `Goal 추가: ${payload.title ?? ""}`;
  if (type === "GOAL_STATUS_CHANGED")  return `상태 변경 → ${payload.status ?? ""}`;
  if (type === "GOAL_UPDATED")         return `Goal 수정: ${(payload.patch && Object.keys(payload.patch).join(", ")) ?? ""}`;
  if (type === "GOAL_DELETED")         return "Goal 삭제";
  if (type === "TRACK_CREATED")        return `트랙 생성: ${payload.name ?? ""}`;
  if (type === "TRACK_UPDATED")        return "트랙 수정";
  if (type === "TRACK_DELETED")        return "트랙 삭제";
  if (type === "ACTIVE_TRACK_CHANGED") return "집중 트랙 변경";
  return type;
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AIAssistantPanel({ officialState, onExecute, onUndo, width = 340, collapsed: collapsedProp, onToggle }) {
  const [nlInput,             setNlInput]             = useState("");
  const [cmd,                 setCmd]                 = useState(PLACEHOLDER);
  const [error,               setError]               = useState(null);
  const [success,             setSuccess]             = useState(null);
  const [showSnapshot,        setShowSnapshot]        = useState(false);
  const [snapshotInput,       setSnapshotInput]       = useState("");
  const [collapsedInternal,   setCollapsedInternal]   = useState(true);

  const collapsed  = collapsedProp !== undefined ? collapsedProp : collapsedInternal;
  const setCollapsed = onToggle !== undefined
    ? onToggle
    : () => setCollapsedInternal(v => !v);

  const recentActivity = [...(officialState?.history ?? [])].reverse().slice(0, 8);

  function handleExecute() {
    setError(null);
    setSuccess(null);
    if (!cmd.trim()) return;
    const event = parseCommand(cmd, officialState);
    if (!event) {
      setError("파싱 실패: 명령 · 필드 · 트랙을 확인해주세요");
      return;
    }
    onExecute(event);
    setSuccess(event.type);
    setCmd(PLACEHOLDER);
  }

  function handleCancel() {
    setCmd(PLACEHOLDER);
    setError(null);
    setSuccess(null);
  }

  // collapsed: 0px (완전 숨김, Topbar가 토글 전담), expanded: width prop

  return (
    <div style={{
      width: collapsed ? 0 : width,
      transition: "width 0.3s ease",
      flexShrink: 0,
      background: T.bgCard,
      borderLeft: collapsed ? "none" : `1px solid ${T.border}`,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      overflow: "hidden",
    }}>

      {/* ── Header: [토글 좌측 고정] [아이콘+레이블 fade] [undo fade] ── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: "flex", alignItems: "center",
        borderBottom: `1px solid ${T.border}`,
        padding: "0 10px",
        gap: T.spacing.sm,
        overflow: "hidden",
      }}>
        {/* 토글 버튼 — flexShrink:0, 항상 좌측 고정
             우측 패널이므로: 펼침→ChevronRight(접기), 접힘→ChevronLeft(펼치기) */}
        <button
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? "패널 펼치기" : "패널 접기"}
          style={{
            width: 28, height: 28, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
            background: T.bgCard, cursor: "pointer",
            color: T.muted, transition: "color 0.15s, border-color 0.15s",
          }}
        >
          {collapsed ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* 아이콘+레이블 그룹 — collapsed 시 fade out */}
        <div style={{
          display: "flex", alignItems: "center", gap: T.spacing.sm,
          flex: 1, minWidth: 0, overflow: "hidden",
          opacity: collapsed ? 0 : 1,
          transition: "opacity 0.15s",
          pointerEvents: collapsed ? "none" : "auto",
        }}>
          <Zap size={14} color={T.primary} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.text,
            letterSpacing: "0.1em", fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}>
            AI ASSISTANT
          </span>
        </div>

        {/* Undo 버튼 — collapsed 시 fade out */}
        <button
          onClick={onUndo}
          aria-label="실행 취소"
          title="Undo"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: T.muted, lineHeight: 1, padding: 4,
            display: "flex", alignItems: "center", flexShrink: 0,
            opacity: collapsed ? 0 : 1,
            transition: "opacity 0.15s",
            pointerEvents: collapsed ? "none" : "auto",
          }}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* ── Scrollable body — collapsed 시 fade + 포인터 차단 ── */}
      <div style={{
        flex: 1, overflowY: collapsed ? "hidden" : "auto",
        padding: "16px 20px",
        opacity: collapsed ? 0 : 1,
        transition: "opacity 0.15s",
        pointerEvents: collapsed ? "none" : "auto",
      }}>

        {/* NL input */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: "flex", alignItems: "center",
            border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
            background: T.bgApp, overflow: "hidden",
          }}>
            <input
              value={nlInput}
              onChange={e => setNlInput(e.target.value)}
              placeholder="자연어로 지시사항 입력..."
              style={{
                flex: 1, padding: "10px 12px", fontSize: 13,
                border: "none", background: "transparent",
                color: T.text, outline: "none",
                fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
              }}
            />
            <button
              aria-label="AI 지시사항 실행"
              style={{
                padding: "0 14px", height: 40, background: T.primary,
                border: "none", cursor: "pointer",
                color: T.bgCard, fontSize: 15,
                display: "flex", alignItems: "center",
              }}
            >
              <Sparkles size={16} />
            </button>
          </div>
        </div>

        {/* Dark terminal */}
        <div style={{
          background: T.terminal, borderRadius: T.radius.card,
          padding: "14px 16px", marginBottom: 12,
        }}>
          <div style={{
            fontSize: 10, fontFamily: "monospace",
            letterSpacing: "0.1em", color: T.color.success, marginBottom: 10,
          }}>
            OPERATIONAL_YAML
          </div>
          <textarea
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            rows={6}
            spellCheck={false}
            style={{
              width: "100%", background: "transparent",
              border: "none", outline: "none",
              color: T.border, fontSize: 12,
              fontFamily: "monospace", lineHeight: 1.8,
              resize: "none", caretColor: T.color.success,
            }}
          />
        </div>

        {/* Error / success */}
        {error && (
          <div style={{
            marginBottom: 10, padding: "8px 12px", borderRadius: T.radius.btn,
            background: T.dangerBg, border: `1px solid ${T.danger}44`,
            fontSize: 12, color: T.danger,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            marginBottom: 10, padding: "8px 12px", borderRadius: T.radius.btn,
            background: T.successBg, border: "1px solid #BBF7D0",
            fontSize: 12, color: T.success,
          }}>
            {success}
          </div>
        )}

        {/* Execute + Cancel */}
        <div style={{ display: "flex", gap: T.spacing.sm, marginBottom: 24 }}>
          <button
            onClick={handleExecute}
            style={{
              flex: 1, padding: "12px 0",
              background: T.primary, color: T.bgCard,
              border: "none", borderRadius: T.radius.btn, cursor: "pointer",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              fontFamily: "monospace",
              display: "flex", alignItems: "center", justifyContent: "center", gap: T.spacing.xxs,
            }}
          >
            <Play size={12} />
            EXECUTE
          </button>
          <button
            onClick={handleCancel}
            style={{
              padding: "12px 16px",
              background: T.bgCard, color: T.sub,
              border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
              cursor: "pointer", fontSize: 12,
              display: "flex", alignItems: "center", gap: T.spacing.xs,
            }}
          >
            <RotateCcw size={12} />
            취소
          </button>
        </div>

        {/* Activity Feed */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xxs, marginBottom: 12 }}>
            <Clock size={12} color={T.muted} />
            <span style={{
              fontSize: 10, fontWeight: 700, color: T.muted,
              fontFamily: "monospace", letterSpacing: "0.1em",
            }}>
              ACTIVITY FEED
            </span>
          </div>

          {recentActivity.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted, padding: "4px 0" }}>활동 없음</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
              {recentActivity.map((evt, i) => (
                <div key={evt.id ?? i} style={{ display: "flex", gap: T.spacing.md, alignItems: "flex-start" }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: T.warnBg, border: "1px solid #FDE68A",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 1,
                  }}>
                    <Settings size={11} color={T.warn} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, color: T.text, fontWeight: 500, lineHeight: 1.4,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {formatActivity(evt)}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {formatTime(evt.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Snapshot Export — collapsed 시 fade ── */}
      <div style={{
        padding: "12px 20px",
        borderTop: `1px solid ${T.border}`,
        flexShrink: 0,
        opacity: collapsed ? 0 : 1,
        transition: "opacity 0.15s",
        pointerEvents: collapsed ? "none" : "auto",
      }}>
        <button
          onClick={() => setShowSnapshot(v => !v)}
          style={{
            width: "100%", padding: "12px",
            background: T.bgCard, color: T.sub,
            border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
            fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", fontFamily: "monospace",
            cursor: "pointer",
          }}
        >
          SNAPSHOT EXPORT
        </button>

        {showSnapshot && (
          <div style={{ marginTop: 10 }}>
            <textarea
              value={snapshotInput}
              onChange={e => setSnapshotInput(e.target.value)}
              rows={3}
              placeholder="SNAPSHOT_START ... SNAPSHOT_END"
              style={{
                width: "100%", fontSize: 11, padding: "8px",
                border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
                background: T.bgApp, color: T.text, outline: "none",
                fontFamily: "monospace", resize: "vertical",
              }}
            />
          </div>
        )}
      </div>

    </div>
  );
}
