// ─── SearchOpportunityAnalyzer ────────────────────────────────────────────────
// PHASE 8D — 검색 트래픽 키워드 기반 콘텐츠 기회 탐지
//
// 입력: keywords: DimensionRow[]  (key = 검색어, views, ratio)
// 출력: SearchOpportunity[]
//
// 신호 분류:
//   ratio > 0.20 → "hot"     (전체 검색 유입 중 20% 이상 차지)
//   ratio > 0.08 → "growing" (주요 키워드)
//   그 외        → "niche"   (틈새 키워드)

import type { DimensionRow } from "@/adapters/AnalyticsAdapter";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type SearchSignal = "hot" | "growing" | "niche";

export interface SearchOpportunity {
  keyword:  string;
  views:    number;
  ratio:    number;
  signal:   SearchSignal;
  ratioLabel: string;       // "21.3%"
  action:   string;         // 액션 제안 문장
}

// ─── 분류 ─────────────────────────────────────────────────────────────────────

function classifySignal(ratio: number): SearchSignal {
  if (ratio > 0.20) return "hot";
  if (ratio > 0.08) return "growing";
  return "niche";
}

function buildAction(keyword: string, signal: SearchSignal): string {
  if (signal === "hot")     return `"${keyword}" 키워드 중심 콘텐츠 우선 제작`;
  if (signal === "growing") return `"${keyword}" 관련 시리즈 확장 검토`;
  return `"${keyword}" 틈새 수요 대응 콘텐츠 제작`;
}

// ─── 분석 ─────────────────────────────────────────────────────────────────────

export function analyzeSearchOpportunities(
  keywords: DimensionRow[],
): SearchOpportunity[] {
  if (!keywords || keywords.length === 0) return [];

  return keywords
    .filter(k => k.key && k.views > 0)
    .map(k => {
      const signal = classifySignal(k.ratio);
      return {
        keyword:    k.key,
        views:      k.views,
        ratio:      k.ratio,
        signal,
        ratioLabel: `${(k.ratio * 100).toFixed(1)}%`,
        action:     buildAction(k.key, signal),
      };
    })
    .sort((a, b) => b.views - a.views);
}
