// ─── StrategyEngine ───────────────────────────────────────────────────────────
// PHASE 8E — 전략 엔진 통합
//
// 파이프라인:
//   OpportunityResult + TimePattern[]
//     → ContentStrategyGenerator
//     → SEOStrategyGenerator
//     → UploadStrategyGenerator
//   → StrategyResult

import type { OpportunityResult }         from "@/engines/opportunity/OpportunityEngine";
import type { TimePattern }               from "@/engines/redirectIntelligence/TimePatternAnalyzer";
import { generateContentStrategies, type ContentStrategy } from "./ContentStrategyGenerator";
import { generateSEOStrategies,     type SEOStrategy }     from "./SEOStrategyGenerator";
import { generateUploadStrategies,  type UploadStrategy }  from "./UploadStrategyGenerator";

// ─── 공개 타입 re-export ──────────────────────────────────────────────────────

export type { ContentStrategy } from "./ContentStrategyGenerator";
export type { SEOStrategy }     from "./SEOStrategyGenerator";
export type { UploadStrategy }  from "./UploadStrategyGenerator";

// ─── 통합 결과 타입 ───────────────────────────────────────────────────────────

export interface StrategyResult {
  contentStrategies: ContentStrategy[];
  seoStrategies:     SEOStrategy[];
  uploadStrategies:  UploadStrategy[];
  hasData:           boolean;
  totalStrategies:   number;
}

// ─── 통합 분석 함수 ───────────────────────────────────────────────────────────

export function analyzeStrategies(
  opp:          OpportunityResult,
  timePatterns: TimePattern[] = [],
): StrategyResult {
  // opp.hasData 여부와 무관하게 항상 실행
  // - contentStrategies / seoStrategies: opp 데이터 없으면 자연스럽게 빈 배열 반환
  // - uploadStrategies: timePatterns · algorithmOpps · externalOpps 로 독립 생성
  const contentStrategies = generateContentStrategies(opp);
  const seoStrategies     = generateSEOStrategies(opp.searchOpportunities);
  const uploadStrategies  = generateUploadStrategies(
    timePatterns,
    opp.algorithmOpportunities,
    opp.externalOpportunities,
  );

  const totalStrategies =
    contentStrategies.length + seoStrategies.length + uploadStrategies.length;

  return {
    contentStrategies,
    seoStrategies,
    uploadStrategies,
    hasData:         totalStrategies > 0,
    totalStrategies,
  };
}
