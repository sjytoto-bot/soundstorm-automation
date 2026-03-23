// ─── redirectIntelligence / CampaignAnalyzer ─────────────────────────────────
// PHASE 8C — campaign 기준 클릭 집계 + 유니크 사용자 + 플랫폼 분포
//
// 입력: RedirectLog[]
// 출력: CampaignResult[]
//
// ip_hash 기준으로 uniqueUsers 계산
// platformBreakdown: 각 플랫폼에서 몇 번 클릭됐는지

import type { RedirectLog } from "@/engines/externalTraffic/CampaignAnalyzer";

export type { RedirectLog };

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface CampaignResult {
  campaign:          string;
  clicks:            number;
  uniqueUsers:       number;
  platformBreakdown: Record<string, number>;
}

// ─── 집계 ─────────────────────────────────────────────────────────────────────

export function analyzeCampaigns(logs: RedirectLog[]): CampaignResult[] {
  if (!logs || logs.length === 0) return [];

  const map = new Map<string, {
    clicks:    number;
    users:     Set<string>;
    platforms: Record<string, number>;
  }>();

  for (const log of logs) {
    const key = log.campaign || log.link_slug || "unknown";

    if (!map.has(key)) {
      map.set(key, { clicks: 0, users: new Set(), platforms: {} });
    }

    const entry = map.get(key)!;
    entry.clicks += 1;
    if (log.ip_hash) entry.users.add(log.ip_hash);

    const platform = log.platform || "DIRECT";
    entry.platforms[platform] = (entry.platforms[platform] ?? 0) + 1;
  }

  return Array.from(map.entries())
    .map(([campaign, { clicks, users, platforms }]) => ({
      campaign,
      clicks,
      uniqueUsers:       users.size,
      platformBreakdown: platforms,
    }))
    .sort((a, b) => b.clicks - a.clicks);
}
