// ─── ExecutionPanel ───────────────────────────────────────────────────────────
// Creator Control Panel — Dashboard 최상단
//
// 구조:
//   ┌──────────────────────────────────────────────────────┐
//   │  콘텐츠 실행                            │  Status    │  ← Header
//   ├──────────────────────────────────────────────────────┤
//   │  이번 주 업로드  │  다음 업로드 예측                  │  ← 가로 2분할
//   ├──────────────────────────────────────────────────────┤
//   │  [썸네일 생성]  [콘텐츠 팩 →]                        │  ← Action Bar
//   └──────────────────────────────────────────────────────┘

import { T } from "../../styles/tokens";
import { useState, useEffect } from "react";
import type { ExecutionState } from "@/controllers/useExecutionController";
import type { RecentPerfVideo } from "@/lib/recentPerformance";
import type { AutoAlertTask }   from "@/types/alertTypes";
import { useContentPackCtx } from "@/controllers/ContentPackContext";
import { MomentumBadge }     from "./ExecutionMomentum";
import ExecutionStatus       from "./ExecutionStatus";

interface ExecutionPanelProps extends ExecutionState {
  suggestedThemes?:  string[];
  syncError?:        string | null;
  lastSyncAt?:       string | null;
  recentPerfVideos?: RecentPerfVideo[];
  channelAvgCTR?:    number | null;
  autoAlertTasks?:     AutoAlertTask[];
  onDismissAutoTask?:  (id: string) => void;
  onRowClick?:         (v: RecentPerfVideo) => void;
  goldenHour?:         any | null;
  noCard?:             boolean;
}

// ─── CRITICAL 자동 태스크 섹션 ────────────────────────────────────────────────

const PROB_ICON: Record<string, string> = {
  BROWSE_DROP:    "🖼",
  SUGGESTED_DROP: "🔗",
  EXTERNAL_DROP:  "📡",
  MIXED_DROP:     "⚠",
  CTR_WEAK:       "📉",
  IMPRESSION_DROP:"📊",
};

function AutoAlertTaskSection({
  tasks,
  onDismiss,
}: {
  tasks:     AutoAlertTask[];
  onDismiss: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [trackedId,   setTrackedId]    = useState<string | null>(null);

  if (tasks.length === 0) return null;

  function handleConfirmYes(task: AutoAlertTask) {
    const api = (window as any).api;
    if (api?.registerActionComplete) {
      api.registerActionComplete({
        video_id:         task.video_id,
        action_type:      task.problem_type ?? "MANUAL",
        source:           "auto_alert",
        linked_alert_key: task.linked_alert_key ?? null,
        timestamp:        new Date().toISOString(),
      }).catch(console.error);
    }
    setConfirmingId(null);
    setTrackedId(task.id);
    // 2.5초 후 태스크 목록에서 제거
    setTimeout(() => {
      setTrackedId(null);
      onDismiss(task.id);
    }, 2500);
  }

  return (
    <div style={{
      borderRadius: T.radius.card,
      border:       `1px solid ${T.danger}`,
      overflow:     "hidden",
    }}>
      {/* 섹션 헤더 */}
      <div style={{
        background:  T.dangerBg,
        padding:     `${T.spacing.sm}px ${T.spacing.md}px`,
        display:     "flex",
        alignItems:  "center",
        gap:         T.spacing.sm,
      }}>
        <span style={{ fontSize: T.font.size.xs, fontWeight: T.font.weight.bold, color: T.danger, fontFamily: T.font.familyMono, letterSpacing: "0.08em" }}>
          🔴 CRITICAL 자동 태스크
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.danger, marginLeft: "auto" }}>
          {tasks.length}건
        </span>
      </div>

      {/* 태스크 목록 */}
      {tasks.map(task => (
        <div key={task.id} style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgCard }}>
          {/* 추적 시작 피드백 행 */}
          {trackedId === task.id ? (
            <div style={{
              display:    "flex",
              alignItems: "center",
              gap:        T.spacing.sm,
              padding:    `${T.spacing.sm}px ${T.spacing.md}px`,
            }}>
              <span style={{ fontSize: T.font.size.xs, color: T.success, flex: 1 }}>
                추적 시작됨 — 3일 후 자동 평가
              </span>
            </div>
          ) : (
          <>
          {/* 메인 행 */}
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        T.spacing.sm,
            padding:    `${T.spacing.sm}px ${T.spacing.md}px`,
          }}>
            <span style={{ fontSize: T.font.size.sm }}>
              {PROB_ICON[task.traffic_source_type] || PROB_ICON[task.problem_type] || "🔴"}
            </span>
            <span style={{ fontSize: T.font.size.xs, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {task.title}
            </span>
            <span style={{ fontSize: T.font.size.xxs, color: T.muted, flexShrink: 0 }}>
              {task.traffic_source_type !== "NONE" ? task.traffic_source_type : task.problem_type}
            </span>
            {confirmingId !== task.id && (
              <button
                onClick={() => setConfirmingId(task.id)}
                style={{
                  fontSize:     T.font.size.xxs,
                  color:        T.sub,
                  background:   "transparent",
                  border:       `1px solid ${T.borderSoft}`,
                  borderRadius: T.radius.pill,
                  padding:      "2px 8px",
                  cursor:       "pointer",
                  flexShrink:   0,
                }}
              >
                완료
              </button>
            )}
          </div>

          {/* 확인 행 */}
          {confirmingId === task.id && (
            <div style={{
              display:        "flex",
              alignItems:     "center",
              gap:            T.spacing.sm,
              padding:        `${T.spacing.xs}px ${T.spacing.md}px ${T.spacing.sm}px`,
              background:     T.warnBg ?? T.dangerBg,
              borderTop:      `1px solid ${T.borderSoft}`,
            }}>
              <span style={{ fontSize: T.font.size.xs, color: T.text, flex: 1 }}>
                실제로 행동했나요?
              </span>
              <button
                onClick={() => handleConfirmYes(task)}
                style={{
                  fontSize:     T.font.size.xs,
                  fontWeight:   T.font.weight.bold,
                  color:        T.success,
                  background:   "transparent",
                  border:       `1px solid ${T.success}`,
                  borderRadius: T.radius.pill,
                  padding:      "2px 10px",
                  cursor:       "pointer",
                }}
              >
                예
              </button>
              <button
                onClick={() => setConfirmingId(null)}
                style={{
                  fontSize:     T.font.size.xs,
                  color:        T.muted,
                  background:   "transparent",
                  border:       `1px solid ${T.borderSoft}`,
                  borderRadius: T.radius.pill,
                  padding:      "2px 10px",
                  cursor:       "pointer",
                }}
              >
                아니오
              </button>
            </div>
          )}
          </>
          )}
        </div>
      ))}
    </div>
  );
}


// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function ExecutionPanel({
  scheduledContent: _scheduledContent,
  nextUploadDate: _nextUploadDate,
  isOverdue: _isOverdue,
  overdueDays: _overdueDays,
  uploadMomentum,
  daysSinceLastUpload,
  avgIntervalDays: _avgIntervalDays,
  suggestedThemes  = [],
  syncError        = null,
  lastSyncAt       = null,
  recentPerfVideos = [],
  channelAvgCTR    = null,
  autoAlertTasks   = [],
  onDismissAutoTask,
  onRowClick,
  goldenHour: _goldenHour,
  noCard           = false,
}: ExecutionPanelProps) {
  const { createPack } = useContentPackCtx();

  // ── 골든아워 영상 목록 로드 ────────────────────────────────────────────────
  const [activeUploads, setActiveUploads] = useState<
    { videoId: string; elapsedHours: number; status: string }[]
  >([]);

  useEffect(() => {
    const api = (window as any).api;
    if (!api?.readActiveUploads) return;
    api.readActiveUploads()
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setActiveUploads(
          data.map(d => ({
            videoId:      String(d.video_id ?? ""),
            elapsedHours: Number(d.elapsed_hours ?? 0),
            status:       String(d.status ?? "COLLECTING"),
          }))
        );
      })
      .catch(() => {});
  }, []);

  // 완료 처리: state.json 업데이트 + 부모 state에서 즉시 제거
  function handleDismiss(taskId: string) {
    const api = (window as any).api;
    if (api?.updateTask) {
      api.updateTask(taskId, { status: "done" }).catch(console.error);
    }
    onDismissAutoTask?.(taskId);
  }

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
      {/* ── CRITICAL 자동 태스크 — 맨 위 고정 ── */}
      <AutoAlertTaskSection tasks={autoAlertTasks} onDismiss={handleDismiss} />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          fontFamily:    T.font.familyMono,
          letterSpacing: "0.08em",
        }}>
          콘텐츠 실행
        </span>
        <MomentumBadge momentum={uploadMomentum} daysSince={daysSinceLastUpload} />
      </div>

      {/* ── Status ── */}
      <div style={{
        background:   T.bgSection,
        borderRadius: T.radius.btn,
        padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      }}>
        <ExecutionStatus
          recentPerfVideos={recentPerfVideos}
          channelAvgCTR={channelAvgCTR}
          onRowClick={onRowClick}
          activeUploads={activeUploads}
        />
      </div>
    </div>
  );

  if (noCard) return content;

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.lg,
      boxShadow:     T.shadow.card,
    }}>
      {content}
    </div>
  );
}
