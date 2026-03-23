// ─── ExternalOpportunityAnalyzer ─────────────────────────────────────────────
// PHASE 8D — 외부 커뮤니티 반응 기반 기회 탐지
//
// 입력: RedirectMarketingInsights (Phase 8C 출력)
// 출력: ExternalOpportunity[]
//
// 신호 분류:
//   clicks > 100 → "trending"  (활발한 외부 반응)
//   clicks > 30  → "active"    (안정적 관심)
//   그 외        → "emerging"  (초기 반응)

import type { RedirectMarketingInsights } from "@/engines/redirectIntelligence/RedirectMarketingEngine";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type ExternalSignal = "trending" | "active" | "emerging";

export interface ExternalOpportunity {
  community:    string;          // campaign 태그 (e.g. "discord_dnd")
  clicks:       number;
  topSlug:      string;          // 가장 많이 클릭된 slug
  signal:       ExternalSignal;
  signalLabel:  string;
  action:       string;
}

// ─── 분류 ─────────────────────────────────────────────────────────────────────

function classifySignal(clicks: number): ExternalSignal {
  if (clicks > 100) return "trending";
  if (clicks > 30)  return "active";
  return "emerging";
}

function signalLabel(s: ExternalSignal): string {
  if (s === "trending")  return "트렌딩";
  if (s === "active")    return "활성";
  return "초기 반응";
}

function buildAction(community: string, signal: ExternalSignal, topSlug: string): string {
  const c = community.replace(/_/g, " ");
  const s = topSlug ? `/${topSlug} 링크` : "리다이렉트 링크";
  if (signal === "trending")  return `${c} — ${s} 캠페인 즉시 강화`;
  if (signal === "active")    return `${c} — ${s} 콘텐츠 주기적 업데이트`;
  return `${c} — ${s} 반응 모니터링 및 신규 콘텐츠 테스트`;
}

// ─── 분석 ─────────────────────────────────────────────────────────────────────

export function analyzeExternalOpportunities(
  marketing: RedirectMarketingInsights,
): ExternalOpportunity[] {
  if (!marketing.hasData) return [];

  return marketing.communities
    .filter(c => c.clicks > 0)
    .map(c => {
      const signal   = classifySignal(c.clicks);
      const topSlug  = c.slugs[0] ?? "";
      return {
        community:   c.community,
        clicks:      c.clicks,
        topSlug,
        signal,
        signalLabel: signalLabel(signal),
        action:      buildAction(c.community, signal, topSlug),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}
