import type { VideoClickContext } from "@/types/dashboardData";

export type RightPanelFocus =
  | "CTR"
  | "VIEWS"
  | "RETENTION_WEAK"
  | "EXTERNAL_DROP"
  | "STRATEGY"
  | null;

export interface StrategyFocusVisibility {
  showCtrPanel: boolean;
  showFixGroup: boolean;
  showProductionGroup: boolean;
  showOpsGroup: boolean;
  showKeywordGroup: boolean;
}

export function getRightPanelSection(focus: RightPanelFocus): string | null {
  if (focus === "RETENTION_WEAK") return "retention";
  if (focus === "EXTERNAL_DROP") return "external";
  if (focus === "CTR" || focus === "VIEWS" || focus === "STRATEGY") return "strategy";
  return null;
}

export function getRightPanelFocusLabel(focus: RightPanelFocus): string | null {
  if (focus === "CTR") return "CTR 관련 데이터";
  if (focus === "VIEWS") return "조회수/노출 관련 데이터";
  if (focus === "RETENTION_WEAK") return "시청유지율 관련 데이터";
  if (focus === "EXTERNAL_DROP") return "외부 유입 관련 데이터";
  if (focus === "STRATEGY") return "콘텐츠 전략 관련 데이터";
  return null;
}

export function getStrategyFocusVisibility(focus: RightPanelFocus): StrategyFocusVisibility {
  const isCtrFocus = focus === "CTR";
  const isViewsFocus = focus === "VIEWS";
  const isRetentionFocus = focus === "RETENTION_WEAK";

  return {
    showCtrPanel: isCtrFocus,
    showFixGroup: !isRetentionFocus,
    showProductionGroup: !isCtrFocus && !isViewsFocus && !isRetentionFocus,
    showOpsGroup: !isCtrFocus && !isRetentionFocus,
    showKeywordGroup: !isViewsFocus && !isRetentionFocus,
  };
}

export function getRightPanelFocusFromContext(ctx?: VideoClickContext): RightPanelFocus {
  if (!ctx) return null;
  if (ctx.triggerMetric === "CTR") return "CTR";
  if (ctx.triggerMetric === "RETENTION") return "RETENTION_WEAK";
  if (ctx.triggerMetric === "IMPRESSIONS") return "VIEWS";
  if (ctx.triggerMetric === "VIEWS") return "VIEWS";
  if (ctx.source === "CHANNEL_STATUS") return "STRATEGY";
  return null;
}
