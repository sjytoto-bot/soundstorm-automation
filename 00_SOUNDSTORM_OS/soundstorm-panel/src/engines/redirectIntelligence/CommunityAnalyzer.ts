// ─── redirectIntelligence / CommunityAnalyzer ────────────────────────────────
// PHASE 8C — 외부 커뮤니티 분석
//
// community = campaign 태그 (e.g. "discord_dnd", "reddit_gaming")
// clicks    = 해당 커뮤니티의 총 클릭 수
// slugs     = 해당 커뮤니티에서 사용된 link_slug 목록
//
// 입력: RedirectLog[]
// 출력: CommunityResult[]

import type { RedirectLog } from "@/engines/externalTraffic/CampaignAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface CommunityResult {
  community: string;    // campaign 태그 (e.g. "discord_dnd")
  clicks:    number;
  slugs:     string[];  // 해당 커뮤니티에서 사용된 link_slug 목록
}

// ─── 분석 ─────────────────────────────────────────────────────────────────────

export function analyzeCommunities(logs: RedirectLog[]): CommunityResult[] {
  if (!logs || logs.length === 0) return [];

  const map = new Map<string, { clicks: number; slugs: Set<string> }>();

  for (const log of logs) {
    const community = log.campaign || log.link_slug || "unknown";

    if (!map.has(community)) {
      map.set(community, { clicks: 0, slugs: new Set() });
    }

    const entry = map.get(community)!;
    entry.clicks += 1;
    if (log.link_slug) entry.slugs.add(log.link_slug);
  }

  return Array.from(map.entries())
    .map(([community, { clicks, slugs }]) => ({
      community,
      clicks,
      slugs: Array.from(slugs),
    }))
    .sort((a, b) => b.clicks - a.clicks);
}
