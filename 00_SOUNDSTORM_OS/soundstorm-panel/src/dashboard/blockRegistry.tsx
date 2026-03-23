// ─── blockRegistry ────────────────────────────────────────────────────────────
// Dashboard 블록 컴포넌트 레지스트리
//
// 개발 규칙:
//   - 새 기능 = 새 Block + 여기 등록 → DashboardPage 수정 금지
//   - Block은 DashboardData + DashboardActions만으로 렌더 (데이터 생성·fetch 금지)
//   - 모든 데이터 흐름: Engine → DashboardPage(조립) → blockRegistry(렌더)
//
// 등록 순서 = 화면 렌더 순서 (BLOCK_DEFS 배열 기준)

import type { ReactNode } from "react";
import type { DashboardData, DashboardActions } from "../types/dashboardData";
import type { BlockId } from "../types/dashboardBlock";
import { T } from "../styles/tokens";

import ExecutionPanel                from "../components/dashboard/ExecutionPanel";
import ContentPackManager            from "../components/dashboard/ContentPackManager";
import UploadAssistant               from "../components/dashboard/UploadAssistant";
import GrowthLoopMonitor             from "../components/dashboard/GrowthLoopMonitor";
import DataHealthIssues              from "../components/dashboard/DataHealthIssues";
import DashboardDiagnosticsSection   from "../components/dashboard/DashboardDiagnosticsSection";
import NextUploadCard                from "../components/dashboard/NextUploadCard";
import ChannelStatusPanel            from "../components/dashboard/ChannelStatusPanel";
import AnalyticsHeader               from "../components/dashboard/AnalyticsHeader";
import KPICards                      from "../components/dashboard/KPICards";
import ActionResultPanel             from "../components/dashboard/ActionResultPanel";
import DashboardGrid                 from "../components/dashboard/DashboardGrid";
import ThumbnailAnalyzerBlock        from "../components/dashboard/ThumbnailAnalyzerBlock";

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type BlockComponent = (data: DashboardData, actions: DashboardActions) => ReactNode;

function CompactHealthStrip({ healthData }: { healthData: any | null }) {
  if (!healthData) return null;

  const score = healthData.score ?? "—";
  const grade = healthData.grade ?? "—";
  const topIssue = healthData.topIssue?.reason ?? healthData.label ?? "채널 상태 요약";
  const gradeColor =
    grade === "A" ? T.success :
    grade === "B" ? T.primary :
    grade === "C" ? T.warn :
    T.danger;
  const gradeBg =
    grade === "A" ? T.successBg :
    grade === "B" ? T.primarySoft :
    grade === "C" ? T.warnBg :
    T.dangerBg;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto minmax(160px, 1fr) minmax(180px, 1fr) auto auto",
      alignItems: "center",
      gap: T.spacing.sm,
      padding: `${T.spacing.sm}px ${T.spacing.md}px`,
      background: "transparent",
      border: "none",
      borderRadius: 0,
    }}>
      <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.muted, letterSpacing: "0.08em" }}>
        CHANNEL HEALTH
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, minWidth: 0 }}>
        <div style={{ flex: 1, height: T.component.size.progressSm, background: T.border, borderRadius: T.radius.pill, overflow: "hidden" }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, Number(score) || 0))}%`,
            height: "100%",
            background: gradeColor,
            borderRadius: T.radius.pill,
          }} />
        </div>
        <span style={{ fontSize: T.font.size.lg, fontWeight: T.font.weight.bold, fontFamily: T.font.familyMono, color: gradeColor }}>
          {score}
        </span>
      </div>

      <span style={{ fontSize: T.font.size.sm, color: T.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: T.font.weight.medium }}>
        {topIssue}
      </span>

        <span style={{
        fontSize: T.font.size.xs,
        fontWeight: T.font.weight.bold,
        fontFamily: T.font.familyMono,
        color: gradeColor,
        background: gradeBg,
        borderRadius: T.radius.badge,
        padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
        whiteSpace: "nowrap",
      }}>
        {grade} {healthData.label ?? ""}
      </span>

      <span style={{ fontSize: T.font.size.sm, color: T.muted, fontFamily: T.font.familyMono }}>
        {healthData.trend === "up" ? "상승" : healthData.trend === "down" ? "하락" : "보합"}
      </span>
    </div>
  );
}

// ─── 레지스트리 ───────────────────────────────────────────────────────────────
// 새 블록 추가: 여기에만 등록, DashboardPage는 건드리지 않는다.

export const BLOCK_REGISTRY: Record<BlockId, BlockComponent> = {

  // ── execution: 단일 카드 내 1fr|1fr 그리드 + ContentPackManager ─────────────
  execution: (data, actions) => (
    <>
      <div style={{
        background:    T.bgCard,
        border:        `1px solid ${T.border}`,
        borderRadius:  T.radius.card,
        padding:       T.spacing.xl,
        boxShadow:     T.shadow.card,
        display:       "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap:           T.spacing.xl,
        alignItems:    "start",
      }}>
        {/* 좌: 콘텐츠 실행 */}
        <ExecutionPanel
          {...data.execution}
          suggestedThemes={data.suggestedThemes}
          syncError={data.syncError}
          lastSyncAt={data.lastSyncAt}
          recentPerfVideos={data.recentPerfVideos}
          channelAvgCTR={data.channelAvgCTR}
          autoAlertTasks={data.autoAlertTasks}
          goldenHour={data.goldenHour}
          noCard
          onDismissAutoTask={(id: string) =>
            actions.setAutoAlertTasks(prev => prev.filter(t => t.id !== id))
          }
          onRowClick={v => actions.handleVideoIdClick({
            videoId: v.videoId,
            context: { source: "EXECUTION" },
          })}
        />
        {/* 우: 다음 업로드 추천 — 좌측 구분선 */}
        <div style={{ borderLeft: `1px solid ${T.borderSoft}`, paddingLeft: T.spacing.xl }}>
          <NextUploadCard
            nextUploadDate={data.execution.nextUploadDate}
            avgIntervalDays={data.execution.avgIntervalDays}
            isOverdue={data.execution.isOverdue}
            overdueDays={data.execution.overdueDays}
            goldenHour={data.goldenHour}
            recentUploads={data.execution.uploadedThisWeek}
            weeklyTarget={3}
            noCard
          />
        </div>
      </div>
      <ContentPackManager
        context={data.packContext}
        onOpenSunoPrompt={() => console.log("[blockRegistry] open_suno_prompt")}
      />
    </>
  ),

  // ── upload: ready 팩 업로드 가이드 + GoldenHour 타이밍 ──────────────────────
  upload: (data) => (
    <UploadAssistant goldenHour={data.goldenHour} />
  ),

  // ── growth: 크리에이터 성장 루프 9단계 시각화 ────────────────────────────────
  growth: (data) => (
    <GrowthLoopMonitor
      syncError={data.syncError}
    />
  ),

  // ── strategy: ChannelStatusPanel only — CTR intelligence lives in right panel ──
  strategy: (data, actions) => (
    <div ref={data.refs.strategyPanelRef} style={{ display: "flex", flexDirection: "column", gap: T.spacing.xl }}>
      <ChannelStatusPanel
        topicMomentum={data.execution.topicMomentum}
        onFocusDiagnosis={(diagnosis) => actions.setRightPanelFocus(
          diagnosis === "CONTENT_RETENTION_WEAK" ? "RETENTION_WEAK"
            : diagnosis === "ALGORITHM_DISTRIBUTION_LOW" ? "VIEWS"
            : diagnosis === "THUMBNAIL_WEAK" || diagnosis === "TITLE_DISCOVERY_WEAK" ? "CTR"
            : "STRATEGY"
        )}
        onSelectVideo={({ videoId, diagnosis }) => actions.handleVideoIdClick({
          videoId,
          context: {
            source: "CHANNEL_STATUS",
            triggerMetric:
              diagnosis === "CONTENT_RETENTION_WEAK" ? "RETENTION"
                : diagnosis === "ALGORITHM_DISTRIBUTION_LOW" ? "VIEWS"
                : diagnosis === "THUMBNAIL_WEAK" || diagnosis === "TITLE_DISCOVERY_WEAK" ? "CTR"
                : undefined,
          },
        })}
      />
    </div>
  ),

  // ── insight: Channel Insight 통합 — HealthBar + KPI + 진단 이슈 ──────────────
  insight: (data, actions) => (
    <>
      <DataHealthIssues dataHealth={data.dataHealth} />

      <div style={{
        background:    T.bgCard,
        border:        `1px solid ${T.border}`,
        borderRadius:  T.radius.card,
        padding:       T.spacing.xl,
        display:       "flex",
        flexDirection: "column",
        gap:           T.spacing.md,
        boxShadow:     T.shadow.card,
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: T.spacing.sm,
          padding: T.spacing.md,
          background: T.semantic.surface.insetTint,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: T.component.radius.inset,
        }}>
          <AnalyticsHeader syncError={data.syncError} lastSyncAt={data.lastSyncAt} />
          <div style={{ height: 1, background: T.borderSoft }} />
          <CompactHealthStrip healthData={data.healthData} />
        </div>
        <KPICards
          channelAvgCTR={data.channelAvgCTR}
          ctrGrowth={data.ctrGrowth}
          underperformingVideos={data.underperformingVideos}
          onFocusMetric={actions.setRightPanelFocus}
          onOpenInspector={actions.setKpiInspector}
          onVideoClick={actions.handleVideoIdClick}
        />
        <ActionResultPanel />
      </div>

      {/* 영상 진단 — 이슈 있을 때만 타이틀 + 내용 표시 */}
      {data.hasDiagIssues && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
            <span style={{
              fontSize:      T.font.size.xs,
              fontFamily:    T.font.familyMono,
              fontWeight:    T.font.weight.bold,
              color:         T.muted,
              letterSpacing: "0.1em",
              whiteSpace:    "nowrap",
            }}>
              영상 진단
            </span>
            <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
          </div>
          <div
            ref={data.refs.diagSectionRef}
            style={{
              borderRadius: T.radius.card,
              outline:      data.diagHighlighted
                ? `2px solid ${T.color.primary}`
                : "2px solid transparent",
              transition: "outline-color 0.2s ease",
            }}
          >
            <DashboardDiagnosticsSection
              diagnostics={data.diagnostics}
              campaignStats={data.campaignStats}
              externalDrop={data.externalDrop}
              onVideoClick={(d: any) => actions.handleVideoIdClick({
                videoId: d.videoId,
                context: {
                  source:         "DIAGNOSTICS",
                  triggerMetric:  d.problemType === "CTR_WEAK"        ? "CTR"
                                : d.problemType === "IMPRESSION_DROP" ? "IMPRESSIONS"
                                : d.problemType === "RETENTION_WEAK"  ? "RETENTION"
                                : undefined,
                },
              })}
              onCreatePack={(videoId: string) =>
                console.log("[blockRegistry] pack:", videoId)
              }
              autoExpandVideoId={data.autoExpandDiagVideo}
            />
          </div>
        </>
      )}

      <DashboardGrid onVideoClick={actions.setSelectedVideo} />
    </>
  ),

  // ── thumbnailAnalyzer: ThumbnailAnalyzer ────────────────────────────────────────
  thumbnailAnalyzer: (data, actions) => (
    <ThumbnailAnalyzerBlock data={data} actions={actions} />
  ),
};
