// ─── useDiagnosticsController ────────────────────────────────────────────────
// 진단 4축 플래그 단일 판단 지점
//
// 역할: impression / CTR / retention / external 4개 진단 플래그를 한 곳에서 계산
// 원칙: 판단은 한 곳, 렌더는 여러 곳
//       DiagnosticsPanel 내부 필터 로직 → 이 컨트롤러로 이동 (PHASE 3)
//
// PHASE 1: 신규 생성 — 기존 코드 무변경
// PHASE 2: DashboardPage에서 read-only 병렬 연결 (검증)
// PHASE 3: DiagnosticsPanel 내부 필터 제거, 컨트롤러 출력으로 대체
// NOTE:    Section 9 (RightSidePanel)보다 반드시 먼저 구현되어야 함

import { useMemo } from "react";

interface DiagnosticsControllerInput {
  diagnostics:  any[];
  externalDrop?: any;
}

export function useDiagnosticsController({
  diagnostics,
  externalDrop = null,
}: DiagnosticsControllerInput) {
  return useMemo(() => {
    const actionable = (diagnostics ?? []).filter(
      d => d.problemType !== "INSUFFICIENT_DATA",
    );

    const hasImpression = actionable.some(
      d => d.problemType === "IMPRESSION_DROP",
    );
    const hasRetention = actionable.some(
      d => d.problemType === "RETENTION_WEAK",
    );
    // CTR은 Retention이 없을 때만 독립 플래그로 활성화 (우선순위 규칙)
    const hasCTR = !hasRetention && actionable.some(
      d => d.problemType === "CTR_WEAK",
    );
    const hasExternal = (externalDrop?.drops?.length ?? 0) > 0;
    const hasAnyIssue = hasImpression || hasCTR || hasRetention || hasExternal;

    return {
      actionable,
      hasImpression,
      hasCTR,
      hasRetention,
      hasExternal,
      hasAnyIssue,
    };
  }, [diagnostics, externalDrop]);
}
