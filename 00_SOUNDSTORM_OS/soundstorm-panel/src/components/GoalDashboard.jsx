import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ROADMAP_EVENT_TYPES, createRoadmapEvent } from "../engine/roadmapReducer";
import { T } from "../styles/tokens";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: "planned", label: "대기",   color: T.muted,   bg: T.bgApp       },
  { id: "active",  label: "진행중", color: T.primary,  bg: T.primarySoft },
  { id: "blocked", label: "보류",   color: T.danger,   bg: T.dangerBg    },
  { id: "done",    label: "완료",   color: T.success,  bg: T.successBg   },
];

const PRIORITY_LABEL = { high: "높음", medium: "보통", low: "낮음" };
const PRIORITY_COLOR = {
  high:   { color: T.danger,  bg: T.dangerBg },
  medium: { color: T.warn,    bg: T.warnBg   },
  low:    { color: T.muted,   bg: T.bgApp    },
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// 스테일 체크용 기준 시간 — 모듈 로드 시 1회만 계산 (render 내 Date.now() 호출 방지)
const MODULE_LOAD_TIME = Date.now();

// ─── GOAL DASHBOARD ───────────────────────────────────────────────────────────

export default function GoalDashboard({ officialState, onDispatch }) {
  const [search,       setSearch]       = useState("");
  const [filterTrack,  setFilterTrack]  = useState("all");
  const [showForm,     setShowForm]     = useState(false);
  const [activeGoalId, setActiveGoalId] = useState(null); // DnD

  const allGoals = useMemo(
    () => Object.entries(officialState?.goals ?? {}).map(([id, g]) => ({ id, ...g })),
    [officialState]
  );
  const tracks = officialState?.roadmap?.tracks ?? {};

  // ── Filter + search ─────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => allGoals.filter(g => {
      if (filterTrack !== "all" && g.trackId !== filterTrack) return false;
      if (search && !g.title?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    [allGoals, filterTrack, search]
  );

  // ── DnD sensors ─────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart({ active }) {
    setActiveGoalId(active.id);
  }

  function handleDragEnd({ active, over }) {
    setActiveGoalId(null);
    if (!over) return;
    const newStatus = over.id;
    const goal = allGoals.find(g => g.id === active.id);
    if (!goal || goal.status === newStatus) return;
    onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
      id: active.id, status: newStatus,
    }));
  }

  const draggingGoal = activeGoalId ? allGoals.find(g => g.id === activeGoalId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: T.spacing.md, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Goal 검색…"
          style={{
            fontSize: 12, padding: "5px 10px",
            border: `1px solid ${T.border}`, borderRadius: T.radius.badge,
            color: T.text, background: T.bgCard, outline: "none", width: 180,
          }}
        />

        {/* Track filter */}
        <select
          value={filterTrack}
          onChange={e => setFilterTrack(e.target.value)}
          style={{
            fontSize: 12, padding: "5px 8px",
            border: `1px solid ${T.border}`, borderRadius: T.radius.badge,
            color: T.sub, background: T.bgCard, cursor: "pointer",
          }}
        >
          <option value="all">모든 트랙</option>
          {Object.entries(tracks).map(([k, tr]) => (
            <option key={k} value={k}>{tr.name ?? tr.label ?? k}</option>
          ))}
        </select>

        <span style={{ fontSize: 11, color: T.muted }}>
          {filtered.length} / {allGoals.length}개
        </span>

        <div style={{ flex: 1 }} />

        {/* + Goal */}
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            fontSize: 12, padding: "5px 14px",
            background: showForm ? T.bgApp : T.primary,
            color: showForm ? T.sub : T.bgCard,
            border: `1px solid ${showForm ? T.border : T.primary}`,
            borderRadius: T.radius.badge, cursor: "pointer",
          }}
        >
          {showForm ? "취소" : "+ 작업 추가"}
        </button>
      </div>

      {/* ── Inline create form ─────────────────────────────────────────────── */}
      {showForm && (
        <GoalCreateForm
          tracks={tracks}
          onSubmit={payload => {
            onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_CREATED, payload));
            setShowForm(false);
          }}
        />
      )}

      {/* ── Board ──────────────────────────────────────────────────────────── */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: T.spacing.md }}>
          {COLUMNS.map(col => {
            const colGoals = filtered.filter(g => g.status === col.id);
            return (
              <Column
                key={col.id}
                col={col}
                goals={colGoals}
                tracks={tracks}
                onDispatch={onDispatch}
                draggingId={activeGoalId}
              />
            );
          })}
        </div>

        <DragOverlay>
          {draggingGoal && (
            <GoalCard
              goal={draggingGoal}
              tracks={tracks}
              onDispatch={onDispatch}
              isOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ─── COLUMN ───────────────────────────────────────────────────────────────────

function Column({ col, goals, tracks, onDispatch, draggingId }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 240,
        borderRadius: T.radius.btn,
        border: `1px solid ${isOver ? col.color : T.border}`,
        background: isOver ? col.bg : T.bgApp,
        transition: "background 0.15s, border-color 0.15s",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Column header */}
      <div style={{
        padding: "8px 12px",
        borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: col.color }}>{col.label}</span>
        <span style={{
          fontSize: 11, fontFamily: "monospace",
          background: col.bg, color: col.color,
          border: `1px solid ${col.color}33`,
          borderRadius: T.radius.badge, padding: "1px 6px",
        }}>
          {goals.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: T.spacing.xxs, flex: 1 }}>
        {goals.map(goal => (
          <GoalCard
            key={goal.id}
            goal={goal}
            tracks={tracks}
            onDispatch={onDispatch}
            isOverlay={false}
            isDragging={goal.id === draggingId}
          />
        ))}
      </div>
    </div>
  );
}

// ─── GOAL CARD ────────────────────────────────────────────────────────────────

function GoalCard({ goal, tracks, onDispatch, isOverlay, isDragging }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: goal.id });

  const priorityStyle = PRIORITY_COLOR[goal.priority] ?? PRIORITY_COLOR.medium;
  const trackName     = tracks[goal.trackId]?.name ?? tracks[goal.trackId]?.label ?? goal.trackId ?? "—";
  const isStale       = goal.status === "active" && goal.created_at
    && (MODULE_LOAD_TIME - new Date(goal.created_at).getTime()) > SEVEN_DAYS_MS;

  const style = {
    transform: isOverlay ? "rotate(2deg)" : CSS.Translate.toString(transform),
    opacity:   isDragging ? 0.3 : 1,
    padding: "10px 12px",
    background: T.bgCard,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius.btn,
    cursor: "grab",
    userSelect: "none",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {/* Title */}
      <div style={{
        fontSize: 12, fontWeight: 500, color: T.text, marginBottom: 6, lineHeight: 1.4,
        display: "flex", alignItems: "center", gap: T.spacing.xs,
      }}>
        {goal.title || "(제목 없음)"}
        {isStale && (
          <AlertTriangle size={10} color={T.warn} style={{ flexShrink: 0 }} />
        )}
      </div>

      {/* Badges row */}
      <div style={{ display: "flex", gap: T.spacing.xs, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: "monospace",
          color: priorityStyle.color, background: priorityStyle.bg,
          border: `1px solid ${priorityStyle.color}33`,
          borderRadius: T.radius.badge, padding: "1px 4px",
        }}>
          {PRIORITY_LABEL[goal.priority] ?? "Med"}
        </span>
        {trackName !== "—" && (
          <span style={{ fontSize: 9, color: T.muted }}>{trackName}</span>
        )}
        {goal.team && (
          <span style={{ fontSize: 9, color: T.muted }}>· {goal.team}</span>
        )}
      </div>

      {/* Status buttons */}
      <div
        style={{ display: "flex", gap: T.spacing.xs, flexWrap: "wrap" }}
        onPointerDown={e => e.stopPropagation()}
      >
        {COLUMNS.map(col => {
          const isCurrent = goal.status === col.id;
          return (
            <button
              key={col.id}
              onClick={() => {
                if (isCurrent) return;
                onDispatch(createRoadmapEvent(ROADMAP_EVENT_TYPES.GOAL_STATUS_CHANGED, {
                  id: goal.id, status: col.id,
                }));
              }}
              style={{
                fontSize: 9, padding: "2px 5px",
                border: `1px solid ${isCurrent ? col.color : T.border}`,
                borderRadius: T.radius.badge,
                background: isCurrent ? col.bg : T.bgCard,
                color: isCurrent ? col.color : T.muted,
                cursor: isCurrent ? "default" : "pointer",
                fontWeight: isCurrent ? 700 : 400,
              }}
            >
              {col.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── GOAL CREATE FORM ─────────────────────────────────────────────────────────

function GoalCreateForm({ tracks, onSubmit }) {
  const [title,    setTitle]    = useState("");
  const [trackId,  setTrackId]  = useState(Object.keys(tracks)[0] ?? "");
  const [priority, setPriority] = useState("medium");
  const [team,     setTeam]     = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), trackId, priority, team: team.trim() });
  }

  const inputStyle = {
    fontSize: 12, padding: "5px 8px",
    border: `1px solid ${T.border}`, borderRadius: T.radius.badge,
    color: T.text, background: T.bgCard, outline: "none",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex", gap: T.spacing.sm, flexWrap: "wrap", alignItems: "center",
        padding: "12px 16px",
        border: `1px solid ${T.primary}`,
        borderRadius: T.radius.btn, background: T.primarySoft,
      }}
    >
      <input
        autoFocus
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="작업 제목"
        style={{ ...inputStyle, flex: 1, minWidth: 160 }}
      />
      <select value={trackId} onChange={e => setTrackId(e.target.value)} style={inputStyle}>
        {Object.entries(tracks).map(([k, tr]) => (
          <option key={k} value={k}>{tr.name ?? tr.label ?? k}</option>
        ))}
      </select>
      <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
        <option value="high">높음</option>
        <option value="medium">보통</option>
        <option value="low">낮음</option>
      </select>
      <input
        type="text"
        value={team}
        onChange={e => setTeam(e.target.value)}
        placeholder="팀 (선택)"
        style={{ ...inputStyle, width: 130 }}
      />
      <button
        type="submit"
        style={{
          fontSize: 12, padding: "5px 14px",
          background: T.primary, color: T.bgCard,
          border: "none", borderRadius: T.radius.badge, cursor: "pointer",
        }}
      >
        추가
      </button>
    </form>
  );
}
