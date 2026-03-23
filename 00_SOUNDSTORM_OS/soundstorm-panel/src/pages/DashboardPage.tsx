// ─── DashboardPage v13 ───────────────────────────────────────────────────────
// Creator Decision OS — 실행률 최우선 레이아웃
//
// [sticky] CriticalAlertBanner   — CRITICAL 진단 있을 때만
// ActionCommandBar               — 1 Primary + 2 Secondary, 클릭 연결
// TodayBriefCard                 — 전략(좌) + 골든아워(우) 통합
// ChannelPulseRow                — 건강도+KPI 1줄, [분석보기] 토글
// {expanded} KPI 상세            — AnalyticsHeader + KPICards + ActionResultPanel
// DashboardDiagnosticsSection    — 문제 있을 때만 (CTR/노출/Retention/캠페인)
// ExecutionPanel + ContentPack
// DashboardPortfolioSection
// EarlyPerformanceCompact
// DashboardGrid

import { useEffect, useRef } from "react";
import { useBlocks } from "../contexts/BlocksContext";
import { T } from "../styles/tokens";
import type { DashboardData, DashboardActions } from "../types/dashboardData";
import { BLOCK_REGISTRY } from "../dashboard/blockRegistry";
import VideoDetailModal         from "../components/dashboard/VideoDetailModal";
import CriticalAlertBanner      from "../components/dashboard/CriticalAlertBanner";
import ActionConfirmModal       from "../components/dashboard/ActionConfirmModal";
import SaveStatusBadge          from "../components/dashboard/SaveStatusBadge";
import DashboardProviders       from "../components/dashboard/DashboardProviders";
import DashboardBlockStack      from "../components/dashboard/DashboardBlockStack";
import { useDashboardRuntime }  from "../hooks/useDashboardRuntime";
import { useDashboardInteractions } from "../hooks/useDashboardInteractions";
import { useDashboardDiagFilter } from "../contexts/DashboardDiagFilterContext";

// ─── DashboardContent ─────────────────────────────────────────────────────────

function DashboardContent() {
  const runtime = useDashboardRuntime();
  const { setOpenVideoDrilldown } = useDashboardDiagFilter();
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const interactions = useDashboardInteractions({
    analytics: runtime.analytics,
    execution: runtime.execution,
    reachRows: runtime.reachRows,
    videoDiagnostics: runtime.videoDiagnostics,
    videoTrendMap: runtime.videoTrendMap,
    setAutoAlertTasks: runtime.setAutoAlertTasks,
  });

  useEffect(() => {
    setOpenVideoDrilldown(() => interactions.handleVideoIdClick);
    return () => setOpenVideoDrilldown(null);
  }, [interactions.handleVideoIdClick, setOpenVideoDrilldown]);

  useEffect(() => {
    const api = window.api;
    if (!api?.showDashboardNotification) return;

    const topCritical = runtime.criticalAlerts?.[0] ?? null;
    if (topCritical?.videoId) {
      const key = `critical:${topCritical.videoId}:${topCritical.problemType}:${topCritical.severity}`;
      if (!notifiedKeysRef.current.has(key)) {
        notifiedKeysRef.current.add(key);
        const label =
          topCritical.problemType === "CTR_WEAK" ? "CTR 위기"
            : topCritical.problemType === "RETENTION_WEAK" ? "시청유지율 위기"
            : topCritical.problemType === "IMPRESSION_DROP" ? "노출 급감"
            : "긴급 점검 필요";
        api.showDashboardNotification({
          title: `SOUNDSTORM — ${label}`,
          body: `${topCritical.title ?? topCritical.videoId}\n지금 대시보드에서 확인하세요`,
        }).catch(() => {});
      }
    }

    const topExternal = runtime.externalDrop?.drops?.[0] ?? null;
    if (topExternal?.slug) {
      const key = `external:${topExternal.slug}:${topExternal.status}:${topExternal.dropRate}`;
      if (!notifiedKeysRef.current.has(key)) {
        notifiedKeysRef.current.add(key);
        api.showDashboardNotification({
          title: "SOUNDSTORM — 외부 유입 급감",
          body: `${topExternal.campaign || topExternal.slug}\n최근 ${runtime.externalDrop.windowDays}일 유입이 ${(topExternal.dropRate * 100).toFixed(0)}% 감소했습니다`,
        }).catch(() => {});
      }
    }
  }, [runtime.criticalAlerts, runtime.externalDrop]);

  // ── DashboardData — 모든 계산 완료 데이터를 단일 객체로 조립 ─────────────────
  // Block은 이 객체만 받는다. DashboardPage에 추가 state 없음.
  const dashData: DashboardData = {
    execution: runtime.execution,
    analytics: runtime.analytics,
    videoDiagnostics: runtime.videoDiagnostics,
    suggestedThemes: runtime.suggestedThemes,
    syncError: runtime.syncError,
    lastSyncAt: runtime.lastSyncAt,
    reachRows: runtime.reachRows,
    channelAvgCTR: runtime.channelAvgCTR,
    ctrGrowth: runtime.ctrGrowth,
    diagnostics: runtime.diagnostics,
    recentPerfVideos: runtime.recentPerfVideos,
    dataHealth: runtime.dataHealth,
    strategy: runtime.strategy,
    portfolio: runtime.portfolio,
    healthData: runtime.healthData,
    growthData: runtime.growthData,
    goldenHour: runtime.goldenHour,
    decisionBar: runtime.decisionBar,
    earlyPerfData: runtime.earlyPerfData,
    packContext: runtime.packContext,
    campaignStats: runtime.campaignStats,
    externalDrop: runtime.externalDrop,
    kpiHistory: runtime.kpiHistory,
    autoAlertTasks: runtime.autoAlertTasks,
    underperformingVideos: runtime.underperformingVideos,
    isLoading: runtime.isLoading,
    hasDiagIssues: runtime.hasDiagIssues,
    diagHighlighted: interactions.diagHighlighted,
    actionStartedId: interactions.actionStartedId,
    autoExpandDiagVideo: interactions.autoExpandDiagVideo,
    refs: interactions.refs,
  };

  // ── DashboardActions — Block이 호출할 수 있는 핸들러 ─────────────────────────
  const dashActions: DashboardActions = {
    setSelectedVideo: interactions.setSelectedVideo,
    setAutoAlertTasks: interactions.setAutoAlertTasks,
    handleCommandAction: interactions.handleCommandAction,
    handleStrategyAction: interactions.handleStrategyAction,
    handleOpportunityClick: interactions.handleOpportunityClick,
    navigateToPanel: interactions.navigateToPanel,
    setRightPanelFocus: interactions.setRightPanelFocus,
    setKpiInspector: interactions.setKpiInspector,
    handleVideoIdClick: interactions.handleVideoIdClick,
  };

  // ── Block System (Context 공유) ──────────────────────────────────────────────
  const {
    pinnedOrder, draggableOrder, defs: blockDefs,
    isDragging, activeDragId, lastInsertedId,
  } = useBlocks();

  return (
    <DashboardProviders
      suggestedThemes={runtime.suggestedThemes}
      reachRows={runtime.reachRows}
      videoTrendMap={runtime.videoTrendMap}
      videoTrafficMap={runtime.videoTrafficMap}
      redirectMap={runtime.redirectMap}
    >

      {/* ── [sticky] CRITICAL 긴급 배너 ───────────────────────────────── */}
      <CriticalAlertBanner
        criticalAlerts={runtime.criticalAlerts}
        onAction={interactions.handleCriticalAction}
      />

      <div style={{
        display:       "flex",
        flexDirection: "column",
        gap:           T.spacing.xl,
        maxWidth:      1440,
        margin:        "0 auto",
        width:         "100%",
        padding:       "16px 32px 32px",
      }}>

        {BLOCK_REGISTRY.insight?.(dashData, dashActions)}

        {/* ── 저장 상태 뱃지 + 데이터 갱신 상태 ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: -T.spacing.md }}>
          <SaveStatusBadge />
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, fontSize: T.font.size.xs, color: T.sub }}>
            {runtime.lastReachUpdated && (
              <span>
                Last updated · {runtime.lastReachUpdated.getHours().toString().padStart(2, "0")}:{runtime.lastReachUpdated.getMinutes().toString().padStart(2, "0")}
              </span>
            )}
            <button
              onClick={runtime.refreshReach}
              style={{
                background:  "none",
                border:      `1px solid ${T.borderSoft}`,
                borderRadius: T.radius.sm,
                color:        T.sub,
                cursor:       "pointer",
                fontSize:     T.font.size.xs,
                padding:      "2px 8px",
              }}
            >
              새로고침
            </button>
          </div>
        </div>

        <DashboardBlockStack
          pinnedOrder={pinnedOrder}
          draggableOrder={draggableOrder}
          blockDefs={blockDefs}
          registry={BLOCK_REGISTRY}
          dashData={dashData}
          dashActions={dashActions}
          isDragging={isDragging}
          activeDragId={activeDragId}
          lastInsertedId={lastInsertedId}
          hiddenIds={["insight"]}
        />

        {/* UX 1: 드래그 중 힌트 (fixed 하단) */}
        {isDragging && (
          <div style={{
            position:      "fixed",
            bottom:        32,
            left:          "50%",
            transform:     "translateX(-50%)",
            zIndex:        50,
            background:    T.primarySoft,
            border:        `1px dashed ${T.primary}`,
            borderRadius:  T.component.radius.control,
            padding:       `${T.spacing.sm}px ${T.spacing.lg}px`,
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         T.primary,
            pointerEvents: "none",
            letterSpacing: "0.06em",
          }}>
            ↓ 대시보드에 배치하세요
          </div>
        )}

        {/* ── Video Detail Modal ───────────────────────────────────────── */}
        <VideoDetailModal
          video={interactions.selectedVideo}
          channelAvgCTR={runtime.channelAvgCTR}
          onClose={() => interactions.setSelectedVideo(null)}
          diagnostics={runtime.videoDiagnostics}
          autoAlertTasks={runtime.autoAlertTasks}
        />
      </div>

      {/* ── 완료 확인 모달 — strategy/upload 아이템 ────────────────────── */}
      <ActionConfirmModal
        item={interactions.confirmItem}
        onDone={interactions.handleConfirmDone}
        onCancel={interactions.handleConfirmCancel}
        onNavigate={interactions.navigateToPanel}
      />

    </DashboardProviders>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

// AnalyticsProvider + ContentPackProvider는 App.jsx 레벨에서 제공 (BlocksContext 상위)
export default function DashboardPage() {
  return <DashboardContent />;
}
