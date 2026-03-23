// ─── useTodayActionController ────────────────────────────────────────────────
// 행동 A (오늘 할 일) 단일 판단 지점
//
// 역할: decisionBar 계산 + criticalAlerts 필터링을 한 곳에서 처리
// 원칙: 판단은 한 곳, 렌더는 여러 곳
//
// PHASE 1: 신규 생성 — 기존 코드 무변경
// PHASE 2: DashboardPage에서 read-only 병렬 연결 (검증)
// PHASE 3: DashboardPage inline useMemo + CriticalAlertBanner 내부 필터 제거

import { useMemo } from "react";
import { computeDecisionBar } from "../engine/strategyEngine";

const CRITICAL_PRIORITY: Record<string, number> = {
  RETENTION_WEAK:  3,
  IMPRESSION_DROP: 2,
  CTR_WEAK:        1,
};

interface TodayActionControllerInput {
  diagnostics: any[];
  strategy:    any | null;
  goldenHour:  any | null;
  typeRates:   Record<string, number>;
}

export function useTodayActionController({
  diagnostics,
  strategy,
  goldenHour,
  typeRates,
}: TodayActionControllerInput) {
  const decisionBar = useMemo(
    () => (computeDecisionBar as any)(diagnostics, strategy, goldenHour, typeRates),
    [diagnostics, strategy, goldenHour, typeRates],
  );

  const criticalAlerts = useMemo(
    () =>
      (diagnostics ?? [])
        .filter(
          d => d.severity === "CRITICAL" && d.problemType !== "INSUFFICIENT_DATA",
        )
        .sort(
          (a, b) =>
            (CRITICAL_PRIORITY[b.problemType] ?? 0) -
            (CRITICAL_PRIORITY[a.problemType] ?? 0),
        ),
    [diagnostics],
  );

  const items = decisionBar?.items ?? [];

  return {
    decisionBar,
    criticalAlerts,
    primaryAction:    items[0] ?? null,
    secondaryActions: items.slice(1, 3),
    urgent:           decisionBar?.urgent ?? false,
    hasCritical:      criticalAlerts.length > 0,
  };
}
