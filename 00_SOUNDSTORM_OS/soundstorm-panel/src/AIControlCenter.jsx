import { useState, useEffect, useCallback, useMemo } from "react";
import { T, L } from "./styles/tokens";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONO = { fontFamily: "monospace" };

const MODES = ["supervised", "semi-auto", "auto"];

const RISK_COLOR   = { low: T.success,  medium: T.warn,    high: "#DC2626" };
const STATUS_COLOR = { pending: T.muted, approved: T.primary, executed: T.success, rejected: "#DC2626" };

const TASK_STATUSES    = ["todo", "in_progress", "done"];
const TASK_STATUS_COLOR = { todo: T.muted, in_progress: T.primary, done: T.success };
const AREAS            = ["policy", "pricing", "roadmap", "structure", "operations"];
const AREA_LABEL       = { policy: "정책", pricing: "가격", roadmap: "로드맵", structure: "구조", operations: "운영" };

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, color: T.muted, ...MONO,
      letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Btn({ onClick, disabled, variant = "default", children }) {
  const styles = {
    default:  { bg: T.bgCard,    color: T.sub,      border: T.border     },
    approve:  { bg: "#DBEAFE",   color: T.primary,  border: T.primaryBorder },
    execute:  { bg: "#D1FAE5",   color: T.success,  border: T.successBorder },
    danger:   { bg: T.dangerBg,  color: "#DC2626",  border: "#FCA5A5"    },
  };
  const s = styles[variant] ?? styles.default;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 11, padding: "3px 9px", borderRadius: T.radius.badge,
        background: disabled ? T.bgSection : s.bg,
        color:      disabled ? T.muted    : s.color,
        border:     `1px solid ${disabled ? T.border : s.border}`,
        cursor:     disabled ? "default" : "pointer",
        transition: "background 0.1s, color 0.1s, border-color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / 86_400_000);
}

function dLabel(days) {
  if (days === null) return "";
  if (days === 0)    return "D-Day";
  if (days > 0)      return `D-${days}`;
  return `D+${Math.abs(days)}`;
}

// ─── Task Detail (inline expand) ─────────────────────────────────────────────

function TaskDetail({ task }) {
  const field = (label, value) => value == null ? null : (
    <div style={{ display: "contents" }}>
      <span style={{ fontSize: 11, color: T.muted, ...MONO }}>{label}</span>
      <span style={{ fontSize: 12, color: T.text }}>{value}</span>
    </div>
  );

  const teamLayer = [task.track, task.layer].filter(Boolean).join(" / ") || null;

  return (
    <div style={{
      padding: "10px 14px 12px",
      background: T.bgApp,
      borderTop: `1px solid ${T.border}`,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "64px 1fr",
        gap: "4px 10px", marginBottom: 6,
      }}>
        <span style={{ fontSize: 11, color: T.muted, ...MONO }}>ID</span>
        <span style={{ fontSize: 11, color: T.sub, ...MONO,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.id}
        </span>
        {field("팀/레이어", teamLayer)}
        {field("목표", task.goal)}
        {task.source?.summary && field(
          "소스",
          <span>
            {task.source.type && (
              <span style={{ fontSize: 11, ...MONO, color: T.sub, marginRight: 6 }}>
                [{task.source.type}]
              </span>
            )}
            {task.source.summary}
          </span>
        )}
      </div>

      {Array.isArray(task.context_log) && task.context_log.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: T.muted, ...MONO, marginBottom: 5, letterSpacing: "0.07em" }}>
            CONTEXT LOG
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
            {task.context_log.map((entry, i) => (
              <div key={i} style={{ display: "flex", gap: T.spacing.sm, alignItems: "flex-start" }}>
                <span style={{
                  fontSize: 11, ...MONO, flexShrink: 0,
                  color: entry.role === "agent" ? T.primary : T.sub,
                }}>
                  [{entry.role ?? "?"}]
                </span>
                <span style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{entry.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandableTaskRow({ task, index, expandedTaskId, onToggleTask, marker, onStatusChange }) {
  const d     = daysUntil(task.due_date);
  const isExp = expandedTaskId === task.id;
  const dCol  = d !== null && d <= 0 ? "#DC2626" : d !== null && d <= 2 ? T.warn : T.muted;

  async function handleStatusChange(e) {
    const next = e.target.value;
    if (next === task.status) return;
    const prev = task.status;
    try {
      await Promise.all([
        window.api.updateTask(task.id, { status: next }),
        window.api.appendChangeLog({
          event_type:  "task_status_changed",
          entity_type: "task",
          entity_id:   task.id,
          payload:     { from: prev, to: next, title: task.title },
        }),
      ]);
      onStatusChange?.();
    } catch (err) {
      console.error("[task status change failed]", err);
    }
  }

  return (
    <div style={{
      border: `1px solid ${isExp ? T.primary : T.border}`,
      borderRadius: T.radius.badge, marginBottom: 4, overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* grid: [24px 마커] [1fr 제목] [44px D-day] [auto 상태] [16px 토글]
           선택 배경이 padding 변화 없이 행 전체에 적용 → 정렬 깨짐 없음 */}
      <div
        onClick={() => onToggleTask(task.id)}
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr 44px auto 16px",
          alignItems: "center",
          columnGap: 6,
          padding: `6px ${L.pxSm}px`,
          cursor: "pointer",
          background: isExp ? T.primarySoft : "transparent",
          transition: "background 0.15s",
        }}
      >
        {/* 마커/인덱스 — 24px 고정, 텍스트 중앙 정렬 */}
        <span style={{
          fontSize: 11, ...MONO,
          color: marker != null ? dCol : T.muted,
          textAlign: "center",
        }}>
          {marker != null ? marker : `${(index ?? 0) + 1}.`}
        </span>

        {/* 제목 — 1fr, ellipsis */}
        <span style={{
          fontSize: 12, color: T.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {task.title ?? "(제목 없음)"}
        </span>

        {/* D-day — 44px 고정, 우측 정렬 */}
        <span style={{ fontSize: 11, ...MONO, color: dCol, textAlign: "right" }}>
          {d !== null ? dLabel(d) : ""}
        </span>

        {/* 상태 select */}
        <select
          value={task.status ?? "todo"}
          onClick={e => e.stopPropagation()}
          onChange={handleStatusChange}
          style={{
            fontSize: 11, padding: "1px 4px", borderRadius: T.radius.badge,
            border: `1px solid ${T.border}`,
            background: T.bgCard,
            color: TASK_STATUS_COLOR[task.status] ?? T.muted,
            cursor: "pointer",
          }}
        >
          {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* 토글 인디케이터 — 16px 고정, 중앙 정렬 */}
        <span style={{ fontSize: 10, color: T.muted, textAlign: "center" }}>
          {isExp ? "▲" : "▼"}
        </span>
      </div>
      {isExp && <TaskDetail task={task} />}
    </div>
  );
}

// ─── System Change Form ───────────────────────────────────────────────────────

function SystemChangeForm({ onSuccess, onError }) {
  const [area,       setArea]       = useState("policy");
  const [summary,    setSummary]    = useState("");
  const [detail,     setDetail]     = useState("");
  const [impact,     setImpact]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = summary.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await window.api.appendChangeLog({
        event_type:  "system_change",
        entity_type: "system",
        entity_id:   null,
        payload: {
          area,
          summary: summary.trim(),
          ...(detail.trim() && { detail: detail.trim() }),
          ...(impact.trim() && {
            impact: impact.split(",").map(s => s.trim()).filter(Boolean),
          }),
        },
      });
      setSummary("");
      setDetail("");
      setImpact("");
      onSuccess?.();
    } catch (e) {
      onError?.(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldStyle = {
    fontSize: 12, padding: "5px 9px",
    border: `1px solid ${T.border}`, borderRadius: T.radius.badge,
    color: T.text, background: T.bgCard, outline: "none",
  };

  return (
    <div style={{
      marginBottom: 28, padding: "14px 16px",
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
    }}>
      <SectionLabel>System Change 기록</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>

        <div style={{ display: "flex", gap: T.spacing.sm }}>
          <select
            value={area}
            onChange={e => setArea(e.target.value)}
            style={{ ...fieldStyle, flexShrink: 0, background: T.bgApp, cursor: "pointer" }}
          >
            {AREAS.map(a => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
          <input
            value={summary}
            onChange={e => setSummary(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            placeholder="summary (required)"
            style={{ ...fieldStyle, flex: 1 }}
          />
        </div>

        <input
          value={detail}
          onChange={e => setDetail(e.target.value)}
          placeholder="detail (optional)"
          style={fieldStyle}
        />

        <div style={{ display: "flex", gap: T.spacing.sm }}>
          <input
            value={impact}
            onChange={e => setImpact(e.target.value)}
            placeholder="impact (쉼표로 구분)"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <Btn onClick={handleSubmit} disabled={!canSubmit} variant={canSubmit ? "approve" : "default"}>
            {submitting ? "…" : "기록"}
          </Btn>
        </div>

      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ tasks, officialState, changelog, expandedTaskId, onToggleTask, onStatusChange }) {
  const tracks = officialState?.roadmap?.tracks ?? {};

  const topTasks = useMemo(() => (
    [...tasks]
      .filter(t => t.status !== "done")
      .sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority] ?? 3;
        const pb = PRIORITY_ORDER[b.priority] ?? 3;
        if (pa !== pb) return pa - pb;
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        if (da !== db) return da - db;
        return new Date(a.created_at) - new Date(b.created_at);
      })
      .slice(0, 5)
  ), [tasks]);

  const dueSoon = useMemo(() => (
    tasks
      .filter(t => {
        if (t.status === "done" || !t.due_date) return false;
        const d = daysUntil(t.due_date);
        return d !== null && d <= 2;
      })
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
  ), [tasks]);

  const trackEntries = Object.entries(tracks).filter(([id]) => id !== "기타");
  const recent = changelog.slice(0, 5);

  const card = {
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: T.radius.btn, padding: "14px 16px", flex: 1, minWidth: 0,
  };
  const cardLabel = {
    fontSize: 11, color: T.muted, marginBottom: 8,
    ...MONO, letterSpacing: "0.06em", textTransform: "uppercase",
  };
  const emptyStyle = { fontSize: 12, color: T.muted };

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionLabel>Dashboard</SectionLabel>

      {/* Row 1: Top 5 + 트랙별 진행률 */}
      <div style={{ display: "flex", gap: T.spacing.md, marginBottom: 12 }}>

        <div style={card}>
          <div style={cardLabel}>오늘 할 일 TOP 5</div>
          {topTasks.length === 0
            ? <div style={emptyStyle}>없음</div>
            : topTasks.map((t, i) => (
                <ExpandableTaskRow
                  key={t.id}
                  task={t}
                  index={i}
                  expandedTaskId={expandedTaskId}
                  onToggleTask={onToggleTask}
                  onStatusChange={onStatusChange}
                />
              ))
          }
        </div>

        <div style={card}>
          <div style={cardLabel}>트랙별 진행률</div>
          {trackEntries.length === 0
            ? <div style={emptyStyle}>트랙 없음</div>
            : trackEntries.map(([id, tr]) => (
                <div key={id} style={{ marginBottom: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: T.text }}>{tr.label}</span>
                    <span style={{ fontSize: 11, color: T.muted, ...MONO }}>{tr.progress}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: T.radius.badge, background: T.border, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: T.radius.badge, background: T.primary,
                      width: `${tr.progress}%`, transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              ))
          }
        </div>
      </div>

      {/* Row 2: 마감 임박 + 최근 변경 */}
      <div style={{ display: "flex", gap: T.spacing.md }}>

        <div style={card}>
          <div style={cardLabel}>마감 임박 (D-2 이하)</div>
          {dueSoon.length === 0
            ? <div style={emptyStyle}>없음</div>
            : dueSoon.map(t => {
                const d   = daysUntil(t.due_date);
                const hot = d !== null && d <= 0;
                return (
                  <ExpandableTaskRow
                    key={t.id}
                    task={t}
                    expandedTaskId={expandedTaskId}
                    onToggleTask={onToggleTask}
                    marker={hot ? "!" : "▲"}
                    onStatusChange={onStatusChange}
                  />
                );
              })
          }
        </div>

        <div style={card}>
          <div style={cardLabel}>최근 변경</div>
          {recent.length === 0
            ? <div style={emptyStyle}>없음</div>
            : recent.map((entry, i) => {
                const entryTime = entry.executed_at ?? entry.date;
                const entryLabel = entry.content
                  ?? (entry.proposal_id ? `proposal ${entry.proposal_id.slice(0, 8)}…` : "—");
                return (
                  {/* grid: [L.metaCol=52px 날짜] [1fr 내용]
                       alignItems: baseline — 날짜/내용 텍스트 베이스라인 통일 */}
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: `${L.metaCol}px 1fr`,
                    alignItems: "baseline",
                    columnGap: L.colGap,
                    marginBottom: 5,
                  }}>
                    <span style={{
                      fontSize: 11, color: T.muted, ...MONO, whiteSpace: "nowrap",
                    }}>
                      {entryTime
                        ? new Date(entryTime).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
                        : "—"}
                    </span>
                    <span style={{
                      fontSize: 12, color: T.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {entryLabel}
                    </span>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}

// ─── AI Task Auto Registration ────────────────────────────────────────────────

function parseAITasks(text) {
  if (typeof text !== "string") return [];
  const results = [];
  const re = /```json\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      if (obj?.type === "task" && obj?.auto_register === true) results.push(obj);
    } catch {
      // invalid JSON block — skip
    }
  }
  return results;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIControlCenter() {
  const [mode,           setModeState]    = useState("supervised");
  const [proposals,      setProposals]    = useState([]);
  const [changelog,      setChangelog]    = useState([]);
  const [tasks,          setTasks]        = useState([]);
  const [officialState,  setOfficialState] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [loading,        setLoading]      = useState(false);
  const [executingId,    setExecutingId]  = useState(null); // "<id>:approve" | "<id>:execute"
  const [error,          setError]        = useState(null);

  const handleToggleTask = (id) =>
    setExpandedTaskId(prev => (prev === id ? null : id));

  // ── Data load ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        fetchedMode,
        fetchedProposals,
        fetchedChangelog,
        fetchedTasks,
        fetchedOfficialState,
      ] = await Promise.all([
        window.api.getMode(),
        window.api.getAllProposals(),
        window.api.getChangelog(),
        window.api.loadTasks(),
        window.api.loadOfficialState(),
      ]);

      setModeState(fetchedMode ?? "supervised");
      setProposals(Array.isArray(fetchedProposals) ? fetchedProposals : []);

      const changelogArr = Array.isArray(fetchedChangelog) ? fetchedChangelog : [];
      setChangelog(changelogArr);

      let freshTasks = Array.isArray(fetchedTasks) ? fetchedTasks : [];
      let freshOs    = fetchedOfficialState ?? null;

      // ── AI Task Auto Registration ──────────────────────────────────────
      const allText = changelogArr.map(e => e.content ?? "").join("\n");
      const aiTasks = parseAITasks(allText);
      let   didAdd  = 0;

      for (const candidate of aiTasks) {
        try {
          const result = await window.api.addTask(candidate);
          if (result && !result.skipped) {
            console.log("[AI TASK REGISTERED]", result.id);
            didAdd++;
          }
        } catch (regErr) {
          setError(regErr?.message ?? String(regErr));
        }
      }

      if (didAdd > 0) {
        const reloaded = await Promise.all([
          window.api.loadTasks(),
          window.api.loadOfficialState(),
        ]);
        freshTasks = Array.isArray(reloaded[0]) ? reloaded[0] : [];
        freshOs    = reloaded[1] ?? null;
      }
      // ──────────────────────────────────────────────────────────────────

      setTasks(freshTasks);
      setOfficialState(freshOs);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleSetMode(e) {
    const next = e.target.value;
    try {
      await window.api.setMode(next);
      setModeState(next);
    } catch (e) {
      setError(e?.message ?? String(e));
    }
  }

  async function handleApprove(proposalId) {
    setExecutingId(proposalId + ":approve");
    setError(null);
    try {
      await window.api.approveProposal(proposalId);
      await load();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setExecutingId(null);
    }
  }

  async function handleExecute(proposalId) {
    setExecutingId(proposalId + ":execute");
    setError(null);
    try {
      await window.api.executeProposal(proposalId);
      await load();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setExecutingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* Error banner */}
      {error && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: T.radius.btn,
          background: T.dangerBg, border: `1px solid ${T.danger}44`,
          fontSize: 13, color: T.danger,
        }}>
          {error}
        </div>
      )}

      {/* ── Dashboard ────────────────────────────────────────────────────── */}
      <Dashboard
        tasks={tasks}
        officialState={officialState}
        changelog={changelog}
        expandedTaskId={expandedTaskId}
        onToggleTask={handleToggleTask}
        onStatusChange={load}
      />

      {/* ── System Change Form ───────────────────────────────────────────── */}
      <SystemChangeForm onSuccess={load} onError={setError} />

      {/* ── Mode + Refresh ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md, marginBottom: 28 }}>
        <SectionLabel>Current Mode</SectionLabel>
        <select
          value={mode}
          onChange={handleSetMode}
          style={{
            fontSize: 13, padding: "4px 8px",
            border: `1px solid ${T.border}`, borderRadius: T.radius.badge,
            background: T.bgCard, color: T.text, cursor: "pointer",
          }}
        >
          {MODES.map(modeName => <option key={modeName} value={modeName}>{modeName}</option>)}
        </select>
        <Btn onClick={load} disabled={loading}>
          {loading ? "…" : "↻ Refresh"}
        </Btn>
      </div>

      {/* ── Proposal Table ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <SectionLabel>Proposals ({proposals.length})</SectionLabel>

        {proposals.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, padding: "16px 0" }}>
            No proposals in queue.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["proposal_id", "agent_id", "risk_level", "confidence_score", "status", "created_at", "Actions"]
                    .map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "6px 10px",
                        borderBottom: `2px solid ${T.border}`,
                        color: T.muted, fontWeight: 500, ...MONO,
                        whiteSpace: "nowrap",
                      }}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {proposals.map(proposal => {
                  const isActing = executingId?.startsWith(proposal.proposal_id);
                  return (
                    <tr key={proposal.proposal_id}
                      style={{ borderBottom: `1px solid ${T.border}` }}
                    >
                      <td style={{ padding: "7px 10px", ...MONO, color: T.sub }}>
                        <span title={proposal.proposal_id}>
                          {proposal.proposal_id?.slice(0, 8)}…
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px" }}>{proposal.agent_id ?? "—"}</td>
                      <td style={{ padding: "7px 10px", ...MONO }}>
                        <span style={{ color: RISK_COLOR[proposal.risk_level] ?? T.sub }}>
                          {proposal.risk_level ?? "—"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px", ...MONO }}>
                        {typeof proposal.confidence_score === "number"
                          ? proposal.confidence_score.toFixed(2)
                          : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", ...MONO }}>
                        <span style={{ color: STATUS_COLOR[proposal.status] ?? T.sub }}>
                          {proposal.status ?? "—"}
                        </span>
                      </td>
                      <td style={{ padding: "7px 10px", ...MONO, color: T.muted, whiteSpace: "nowrap" }}>
                        {proposal.created_at
                          ? new Date(proposal.created_at).toLocaleString("ko-KR", { hour12: false })
                          : "—"}
                      </td>
                      <td style={{ padding: "7px 10px" }}>
                        <div style={{ display: "flex", gap: T.spacing.xxs }}>
                          <Btn
                            variant="approve"
                            disabled={proposal.status !== "pending" || !!isActing}
                            onClick={() => handleApprove(proposal.proposal_id)}
                          >
                            {isActing && executingId?.endsWith(":approve") ? "…" : "Approve"}
                          </Btn>
                          <Btn
                            variant="execute"
                            disabled={proposal.status !== "approved" || !!isActing}
                            onClick={() => handleExecute(proposal.proposal_id)}
                          >
                            {isActing && executingId?.endsWith(":execute") ? "…" : "Execute"}
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Changelog ────────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Recent Changelog (last 10)</SectionLabel>

        {changelog.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted }}>No changelog entries.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xxs }}>
            {changelog.map((entry, i) => (
              <div key={i} style={{
                fontSize: 12, padding: "9px 13px",
                background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius.btn,
                display: "flex", gap: T.spacing.lg, alignItems: "flex-start",
              }}>
                <span style={{ ...MONO, color: T.muted, fontSize: 11, flexShrink: 0, paddingTop: 1 }}>
                  {entry.executed_at || entry.date
                    ? new Date(entry.executed_at ?? entry.date).toLocaleString("ko-KR", { hour12: false })
                    : "—"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {entry.proposal_id && (
                    <div style={{ display: "flex", gap: T.spacing.sm, flexWrap: "wrap" }}>
                      <span style={{ color: T.muted }}>proposal</span>
                      <span style={{ ...MONO }}>{entry.proposal_id.slice(0, 16)}…</span>
                      {entry.new_version !== undefined && (
                        <span style={{ color: T.sub }}>
                          v{entry.previous_version} → v{entry.new_version}
                          {" "}({entry.actions_count} action{entry.actions_count !== 1 ? "s" : ""})
                        </span>
                      )}
                    </div>
                  )}
                  {entry.content && (
                    <div style={{ color: T.text }}>{entry.content}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
