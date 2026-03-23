// ─── RedirectMarketingEngine ──────────────────────────────────────────────────
// PHASE 8C — Redirect Marketing Intelligence 통합 엔진
//
// 파이프라인:
//   RedirectLog[]
//     → CampaignAnalyzer    (campaign × clicks × uniqueUsers × platformBreakdown)
//     → CommunityAnalyzer   (community × clicks × slugs)
//     → ContentReactionAnalyzer (slug × clicks × campaigns)
//     → TimePatternAnalyzer (hour × clicks)
//   → RedirectMarketingInsights

import type { RedirectLog } from "@/engines/externalTraffic/CampaignAnalyzer";
import { analyzeCampaigns,         type CampaignResult }    from "./CampaignAnalyzer";
import { analyzeCommunities,       type CommunityResult }   from "./CommunityAnalyzer";
import { analyzeContentReactions,  type ContentReaction }   from "./ContentReactionAnalyzer";
import { analyzeTimePatterns,      type TimePattern }        from "./TimePatternAnalyzer";

// ─── 공개 타입 re-export ──────────────────────────────────────────────────────

export type { CampaignResult }   from "./CampaignAnalyzer";
export type { CommunityResult }  from "./CommunityAnalyzer";
export type { ContentReaction }  from "./ContentReactionAnalyzer";
export type { TimePattern }      from "./TimePatternAnalyzer";
export type { RedirectLog }      from "@/engines/externalTraffic/CampaignAnalyzer";

// ─── 통합 결과 타입 ───────────────────────────────────────────────────────────

export interface RedirectMarketingInsights {
  campaigns:       CampaignResult[];
  communities:     CommunityResult[];
  contentReaction: ContentReaction[];
  timePatterns:    TimePattern[];
  hasData:         boolean;
  totalClicks:     number;
}

// ─── 통합 분석 함수 ───────────────────────────────────────────────────────────

export function analyzeRedirectMarketing(
  logs: RedirectLog[],
): RedirectMarketingInsights {
  if (!logs || logs.length === 0) {
    return {
      campaigns:       [],
      communities:     [],
      contentReaction: [],
      timePatterns:    [],
      hasData:         false,
      totalClicks:     0,
    };
  }

  const campaigns       = analyzeCampaigns(logs);
  const communities     = analyzeCommunities(logs);
  const contentReaction = analyzeContentReactions(logs);
  const timePatterns    = analyzeTimePatterns(logs);
  const totalClicks     = logs.length;

  return {
    campaigns,
    communities,
    contentReaction,
    timePatterns,
    hasData:     true,
    totalClicks,
  };
}
