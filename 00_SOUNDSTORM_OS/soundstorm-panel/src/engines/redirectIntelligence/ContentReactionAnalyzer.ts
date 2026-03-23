// ─── redirectIntelligence / ContentReactionAnalyzer ──────────────────────────
// PHASE 8C — 어떤 콘텐츠(slug)가 외부에서 반응하는지 분석
//
// slug 기준으로 클릭을 집계하고, 해당 slug에서 사용된 campaign 목록을 추출
//
// 입력: RedirectLog[]
// 출력: ContentReaction[]

import type { RedirectLog } from "@/engines/externalTraffic/CampaignAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ContentReaction {
  slug:      string;    // link_slug (e.g. "dungeon", "assassin")
  clicks:    number;
  campaigns: string[]; // 해당 slug에서 발생한 campaign 목록
}

// ─── 분석 ─────────────────────────────────────────────────────────────────────

export function analyzeContentReactions(logs: RedirectLog[]): ContentReaction[] {
  if (!logs || logs.length === 0) return [];

  const map = new Map<string, { clicks: number; campaigns: Set<string> }>();

  for (const log of logs) {
    const slug = log.link_slug || "unknown";

    if (!map.has(slug)) {
      map.set(slug, { clicks: 0, campaigns: new Set() });
    }

    const entry = map.get(slug)!;
    entry.clicks += 1;
    if (log.campaign) entry.campaigns.add(log.campaign);
  }

  return Array.from(map.entries())
    .map(([slug, { clicks, campaigns }]) => ({
      slug,
      clicks,
      campaigns: Array.from(campaigns),
    }))
    .sort((a, b) => b.clicks - a.clicks);
}
