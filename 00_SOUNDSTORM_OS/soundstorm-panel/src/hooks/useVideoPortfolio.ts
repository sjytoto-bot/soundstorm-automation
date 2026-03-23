// ─── useVideoPortfolio ────────────────────────────────────────────────────────
// computeVideoPortfolio() 단일 캐시 hook
//
// DashboardPortfolioSection + RightSidePanel 양쪽에서 직접 사용.
// DashboardPage prop 경유 없이 analytics context에서 직접 계산 → 중복 계산·
// useMemo 캐시 깨짐 방지.
//
// Section 9-D 선행 필수 작업

import { useMemo } from "react";
import { useAnalyticsContext } from "../controllers/useAnalyticsController";
import { computeVideoPortfolio } from "../engine/strategyEngine";

export function useVideoPortfolio() {
  const { videoDiagnostics } = useAnalyticsContext();
  return useMemo(
    () => (computeVideoPortfolio as any)(videoDiagnostics ?? []),
    [videoDiagnostics],
  );
}
