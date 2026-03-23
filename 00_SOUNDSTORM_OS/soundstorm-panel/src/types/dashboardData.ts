// ─── Dashboard Data Contract ──────────────────────────────────────────────────
// DashboardContent가 계산한 모든 데이터 + 액션을 타입으로 정의
//
// 규칙:
//   DashboardData  — 읽기 전용 데이터. Block은 이 값을 렌더에만 사용.
//   DashboardActions — Block이 호출할 수 있는 핸들러 함수들.
//
// Block 안에서 직접 데이터를 생성하거나 API를 호출하지 않는다.
// 모든 데이터 흐름: Engine → DashboardContent → DashboardData → Block(props)

import type React from "react";
import type { AutoAlertTask } from "./alertTypes";
import type { EarlyPerfData } from "@/components/dashboard/EarlyPerformanceCompact";
import type { SelectedVideo } from "@/components/dashboard/VideoDetailModal";
import type { ReachRow } from "@/adapters/reachAdapter";
import type { UnderperformingVideo } from "@/lib/getUnderperformingVideos";
import type { RightPanelFocus } from "@/components/layout/rightPanelFocus";

export interface DashboardRefs {
  diagSectionRef:   React.RefObject<HTMLDivElement | null>;
  todayBriefRef:    React.RefObject<HTMLDivElement | null>;
  strategyPanelRef: React.RefObject<HTMLDivElement | null>;
}

export interface DashboardData {
  // 채널 실행 데이터
  execution:        any;
  analytics:        any;
  videoDiagnostics: any[];
  suggestedThemes:  string[];
  syncError:        string | null;
  lastSyncAt:       string | null;

  // Reach 데이터
  reachRows:        ReachRow[];
  channelAvgCTR:    number | null;
  ctrGrowth:        number | null;

  // 진단 + 전략
  diagnostics:      any[];
  recentPerfVideos: any[];
  dataHealth:       any | null;
  strategy:         any | null;
  portfolio:        any | null;
  healthData:       any | null;
  growthData:       any | null;
  goldenHour:       any | null;
  decisionBar:      any | null;
  primaryAction:    any | null;
  secondaryActions: any[];
  earlyPerfData:    EarlyPerfData | null;

  // Pack + 캠페인
  packContext:      any;
  campaignStats:    any[];
  externalDrop:     any | null;
  kpiHistory:       any[];
  autoAlertTasks:   AutoAlertTask[];
  underperformingVideos: UnderperformingVideo[];

  // 계산 플래그
  isLoading:        boolean;
  hasDiagIssues:    boolean;

  // 애니메이션 / 인터랙션 상태 (Block은 읽기만)
  diagHighlighted:     boolean;
  actionStartedId:     string | null;
  autoExpandDiagVideo: string | null;

  // DOM 참조 (scroll anchor 용)
  refs: DashboardRefs;
}

// ─── VideoClickContext ─────────────────────────────────────────────────────────
// 모든 영상 드릴다운 진입 시 컨텍스트 전달 — "왜 이 영상을 보게 됐는지"를 모달에 표시

export type VideoClickSource =
  | "CTR_INTELLIGENCE"
  | "DIAGNOSTICS"
  | "TOP_VIDEOS"
  | "OPPORTUNITY"
  | "RETENTION"
  | "CHANNEL_STATUS"
  | "INSIGHT"
  | "EXECUTION";

export type VideoClickMetric = "CTR" | "IMPRESSIONS" | "RETENTION" | "VIEWS";

export interface VideoClickContext {
  source:          VideoClickSource;
  triggerMetric?:  VideoClickMetric;
}

export interface KpiInspectorStatus {
  label: string;
  severity: string;
}

export interface KpiInspectorDetailRow {
  label: string;
  value: string;
  color?: string;
}

export interface KpiInspectorCauseItem {
  metric: string;
  delta: number | null;
  interpretation: string;
  action: string;
}

export interface KpiInspectorData {
  label: string;
  icon: string;
  value: string;
  growthValue: number | null;
  status: KpiInspectorStatus | null;
  interpretation: string | null;
  detail: KpiInspectorDetailRow[];
  causes: KpiInspectorCauseItem[];
  actions: string[];
  underperformingVideos: UnderperformingVideo[];
  focus: RightPanelFocus;
}

export interface DashboardActions {
  setSelectedVideo:       (v: SelectedVideo | null) => void;
  setAutoAlertTasks:      (fn: (prev: AutoAlertTask[]) => AutoAlertTask[]) => void;
  handleCommandAction:    (item: any) => void;
  handleStrategyAction:   (action: any, topIssue: any) => void;
  handleOpportunityClick: (videoId: string) => void;
  navigateToPanel:        (item: any) => void;
  setRightPanelFocus:     (focus: RightPanelFocus) => void;
  setKpiInspector:        (data: KpiInspectorData | null) => void;
  /** 모든 드릴다운 진입점에서 videoId + 컨텍스트로 VideoDetailModal 오픈 */
  handleVideoIdClick:     (params: { videoId: string; context: VideoClickContext }) => void;
}
