import { T } from "../styles/tokens";

export function getDashboardHeaderLayout(primaryActionType?: string | null) {
  return {
    showTodayDecision: false,
    decisionGridTemplateColumns: "minmax(320px, 1fr)",
    pageGap: T.spacing.xl,
  };
}
