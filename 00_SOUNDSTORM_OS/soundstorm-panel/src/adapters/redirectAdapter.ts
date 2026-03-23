// ─── redirectAdapter v1 ────────────────────────────────────────────────────────
// Redirect Tracker 데이터 → 프론트엔드 브릿지
//
// 역할:
//   1. redirectLinks.json  → slug→video_id 매핑 로드
//   2. redirect_logs.csv   → 클릭 로그 (기존 readRedirectLogs 사용)
//   3. reachRows (ReachRow[]) → video_id별 views 룩업
//   4. CampaignStat[] 계산 — conversionRate = views / clicks
//
// conversionRate 포맷:
//   "discord_dnd  243 클릭 → 180 조회 (74%)"
//
// Electron IPC:
//   readRedirectLogs()  → RedirectLog[]  (기존)
//   readRedirectLinks() → RedirectLinkMap (신규)

import type { ReachRow } from "./reachAdapter";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** redirectLinks.json 내 단일 슬러그 항목 */
export interface RedirectLink {
  video:    string;   // YouTube video_id ("" = 미연결)
  playlist: string;
  campaign: string;
}

/** redirectLinks.json 전체 맵 */
export type RedirectLinkMap = Record<string, RedirectLink>;

/** 캠페인별 성과 지표 (UI 표시용) */
export interface CampaignStat {
  slug:            string;
  campaign:        string;
  platform:        string;
  clicks:          number;
  videoId:         string;
  views:           number;             // reachRows 기준 조회수
  conversionRate:  number;             // 0-1 (views / clicks)
  conversionPct:   string;             // "74%"
  conversionLabel: string;             // "243 클릭 → 180 조회 (74%)"
  quality:         "high" | "medium" | "low" | "no_data";
  /** 클릭 >= 10 이면서 quality "low" → 비타겟 유입 가능성 높음 */
  isNontargetRisk: boolean;
}

export interface ExternalDropStat {
  slug: string;
  campaign: string;
  platform: string;
  videoId: string;
  prevClicks: number;
  recentClicks: number;
  dropRate: number;
  status: "DEAD" | "DROPPING";
}

export interface ExternalDropSummary {
  drops: ExternalDropStat[];
  totalCampaigns: number;
  healthyCampaigns: number;
  windowDays: number;
}

// ─── redirectLinks.json 로드 ──────────────────────────────────────────────────

/**
 * Electron IPC를 통해 redirectLinks.json을 로드한다.
 * IPC 없음 / 실패 시 빈 객체 반환.
 */
export async function fetchRedirectLinks(): Promise<RedirectLinkMap> {
  try {
    const api = (window as any).api;
    if (!api?.readRedirectLinks) {
      console.warn("[redirectAdapter] readRedirectLinks IPC 없음");
      return {};
    }
    const result = await api.readRedirectLinks();
    return (result as RedirectLinkMap) ?? {};
  } catch (err) {
    console.warn("[redirectAdapter] fetchRedirectLinks 실패:", err);
    return {};
  }
}

// ─── reachRows → video_id 뷰 맵 ──────────────────────────────────────────────

function buildViewsMap(reachRows: ReachRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of reachRows) {
    if (row.video_id) map.set(row.video_id, row.views);
  }
  return map;
}

// ─── 품질 분류 ────────────────────────────────────────────────────────────────

function classifyQuality(rate: number, views: number): CampaignStat["quality"] {
  if (views === 0) return "no_data";
  if (rate >= 0.7) return "high";
  if (rate >= 0.4) return "medium";
  return "low";
}

// ─── 전환 레이블 ─────────────────────────────────────────────────────────────

function buildConversionLabel(clicks: number, views: number, pct: string): string {
  if (views === 0) return `${clicks.toLocaleString("ko-KR")} 클릭 → 조회 데이터 없음`;
  return `${clicks.toLocaleString("ko-KR")} 클릭 → ${views.toLocaleString("ko-KR")} 조회 (${pct})`;
}

// ─── 메인 계산 함수 ───────────────────────────────────────────────────────────

/**
 * 클릭 로그 + 링크 맵 + reach 데이터 → CampaignStat[]
 *
 * @param logs       - window.api.readRedirectLogs() 결과
 * @param links      - fetchRedirectLinks() 결과
 * @param reachRows  - fetchReachData() 결과 (_RawData_Master 기반)
 */
export function computeCampaignStats(
  logs:      { campaign: string; link_slug: string; platform: string; target_video?: string }[],
  links:     RedirectLinkMap,
  reachRows: ReachRow[],
): CampaignStat[] {
  if (!logs.length) return [];

  const viewsMap = buildViewsMap(reachRows);

  // slug별 집계
  const slugMap = new Map<string, {
    campaign: string;
    platform: string;
    clicks:   number;
    videoId:  string;
  }>();

  for (const log of logs) {
    const slug = log.link_slug || log.campaign || "unknown";
    if (!slugMap.has(slug)) {
      // links 맵에서 video_id 우선 조회 (log.target_video는 빈 경우 많음)
      const videoId = links[slug]?.video || log.target_video || "";
      slugMap.set(slug, {
        campaign: log.campaign || slug,
        platform: log.platform || "DIRECT",
        clicks:   0,
        videoId,
      });
    }
    slugMap.get(slug)!.clicks += 1;
  }

  return Array.from(slugMap.entries())
    .map(([slug, entry]) => {
      const views          = entry.videoId ? (viewsMap.get(entry.videoId) ?? 0) : 0;
      const conversionRate = entry.clicks > 0 && views > 0 ? views / entry.clicks : 0;
      const conversionPct  = `${Math.round(conversionRate * 100)}%`;
      return {
        slug,
        campaign:        entry.campaign,
        platform:        entry.platform,
        clicks:          entry.clicks,
        videoId:         entry.videoId,
        views,
        conversionRate,
        conversionPct,
        conversionLabel: buildConversionLabel(entry.clicks, views, conversionPct),
        quality:         classifyQuality(conversionRate, views),
        isNontargetRisk: entry.clicks >= 10 && classifyQuality(conversionRate, views) === "low",
      } satisfies CampaignStat;
    })
    .sort((a, b) => b.clicks - a.clicks);
}

function getDayStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseLogDate(log: { timestamp?: string }): Date | null {
  if (!log.timestamp) return null;
  const d = new Date(log.timestamp);
  return isNaN(d.getTime()) ? null : d;
}

export function computeExternalDrop(
  logs: { timestamp?: string; campaign: string; link_slug: string; platform: string; target_video?: string }[],
  links: RedirectLinkMap,
  windowDays = 7,
): ExternalDropSummary {
  if (!logs.length) {
    return {
      drops: [],
      totalCampaigns: 0,
      healthyCampaigns: 0,
      windowDays,
    };
  }

  const datedLogs = logs
    .map(log => ({ ...log, parsedDate: parseLogDate(log) }))
    .filter(log => log.parsedDate) as Array<typeof logs[number] & { parsedDate: Date }>;

  if (!datedLogs.length) {
    return {
      drops: [],
      totalCampaigns: 0,
      healthyCampaigns: 0,
      windowDays,
    };
  }

  const latestDate = datedLogs.reduce((max, log) => (
    log.parsedDate.getTime() > max.getTime() ? log.parsedDate : max
  ), datedLogs[0].parsedDate);

  const recentStart = getDayStart(new Date(latestDate.getTime() - (windowDays - 1) * 86400000));
  const prevStart = getDayStart(new Date(recentStart.getTime() - windowDays * 86400000));

  const campaignMap = new Map<string, {
    slug: string;
    campaign: string;
    platform: string;
    videoId: string;
    prevClicks: number;
    recentClicks: number;
  }>();

  for (const log of datedLogs) {
    const slug = log.link_slug || log.campaign || "unknown";
    if (!campaignMap.has(slug)) {
      campaignMap.set(slug, {
        slug,
        campaign: log.campaign || slug,
        platform: log.platform || "DIRECT",
        videoId: links[slug]?.video || log.target_video || "",
        prevClicks: 0,
        recentClicks: 0,
      });
    }

    const entry = campaignMap.get(slug)!;
    if (log.parsedDate >= recentStart) {
      entry.recentClicks += 1;
    } else if (log.parsedDate >= prevStart) {
      entry.prevClicks += 1;
    }
  }

  const rows = Array.from(campaignMap.values());
  const drops = rows
    .filter(row => row.prevClicks >= 3 && row.recentClicks < row.prevClicks)
    .map(row => {
      const dropRate = row.prevClicks > 0 ? (row.prevClicks - row.recentClicks) / row.prevClicks : 0;
      const status: "DEAD" | "DROPPING" = row.recentClicks === 0 || dropRate >= 0.85 ? "DEAD" : "DROPPING";
      return {
        ...row,
        dropRate,
        status,
      } satisfies ExternalDropStat;
    })
    .filter(row => row.dropRate >= 0.5)
    .sort((a, b) => b.dropRate - a.dropRate || b.prevClicks - a.prevClicks);

  return {
    drops,
    totalCampaigns: rows.length,
    healthyCampaigns: Math.max(0, rows.length - drops.length),
    windowDays,
  };
}

// ─── reachRows → DimensionRow 변환 ───────────────────────────────────────────
// ConversionAnalyzer.analyzeConversions() 호환 포맷으로 변환

export function reachRowsToDimensionRows(reachRows: ReachRow[]): { key: string; views: number; ratio: number }[] {
  const totalViews = reachRows.reduce((s, r) => s + r.views, 0);
  return reachRows
    .filter(r => r.video_id && r.views > 0)
    .map(r => ({
      key:   r.video_id,
      views: r.views,
      ratio: totalViews > 0 ? r.views / totalViews : 0,
    }));
}
