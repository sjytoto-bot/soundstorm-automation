// ─── CampaignAnalyzer ────────────────────────────────────────────────────────
// PHASE 8B — Redirect Tracker 클릭 로그 → 캠페인별 집계
//
// RedirectLog[] (redirect_logs.csv에서 로드)
//   → campaign 기준 집계
//   → CampaignResult[] (clicks, platform, target 등)

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface RedirectLog {
  timestamp:        string;
  platform:         string;   // "DISCORD", "INSTAGRAM" 등
  campaign:         string;   // "discord_dnd", "reddit_gaming" 등
  link_slug:        string;   // "assassin", "war_drums" 등
  target_video:     string;   // YouTube video_id
  target_playlist:  string;   // YouTube playlist_id
  user_agent:       string;
  ip_hash:          string;
}

export interface CampaignResult {
  campaign:         string;
  platform:         string;
  link_slug:        string;
  clicks:           number;
  target_video:     string;
  target_playlist:  string;
  first_seen:       string;
  last_seen:        string;
}

// ─── 집계 함수 ────────────────────────────────────────────────────────────────

export function analyzeCampaigns(logs: RedirectLog[]): CampaignResult[] {
  if (!logs || logs.length === 0) return [];

  const map = new Map<string, CampaignResult>();

  for (const log of logs) {
    const key = log.campaign || log.link_slug || "unknown";

    if (!map.has(key)) {
      map.set(key, {
        campaign:        key,
        platform:        log.platform,
        link_slug:       log.link_slug,
        clicks:          0,
        target_video:    log.target_video,
        target_playlist: log.target_playlist,
        first_seen:      log.timestamp,
        last_seen:       log.timestamp,
      });
    }

    const entry = map.get(key)!;
    entry.clicks += 1;
    if (log.timestamp > entry.last_seen) entry.last_seen  = log.timestamp;
    if (log.timestamp < entry.first_seen) entry.first_seen = log.timestamp;
  }

  return Array.from(map.values())
    .sort((a, b) => b.clicks - a.clicks);
}

// ─── 플랫폼별 집계 ────────────────────────────────────────────────────────────

export interface PlatformCampaignSummary {
  platform: string;
  clicks:   number;
  campaigns: string[];
}

export function summarizePlatformCampaigns(
  campaigns: CampaignResult[],
): PlatformCampaignSummary[] {
  const map = new Map<string, { clicks: number; campaigns: string[] }>();

  for (const c of campaigns) {
    const existing = map.get(c.platform) ?? { clicks: 0, campaigns: [] };
    existing.clicks += c.clicks;
    if (!existing.campaigns.includes(c.campaign)) {
      existing.campaigns.push(c.campaign);
    }
    map.set(c.platform, existing);
  }

  return Array.from(map.entries())
    .map(([platform, { clicks, campaigns }]) => ({ platform, clicks, campaigns }))
    .sort((a, b) => b.clicks - a.clicks);
}
