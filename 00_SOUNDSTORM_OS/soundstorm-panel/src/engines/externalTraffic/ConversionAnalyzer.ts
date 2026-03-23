// ─── ConversionAnalyzer ───────────────────────────────────────────────────────
// PHASE 8B — 캠페인 클릭 × YouTube 조회수 → 전환율 계산
//
// conversion_rate = youtube_views / redirect_clicks
//
// 데이터 결합:
//   CampaignResult.target_video (video_id)
//   + DimensionRow.key (video_id) → DimensionRow.views
//
// 예:
//   Discord DND campaign  clicks=120, youtube_views=80 → 66%

import type { DimensionRow }   from "@/adapters/AnalyticsAdapter";
import type { CampaignResult } from "./CampaignAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ConversionResult {
  campaign:         string;
  platform:         string;
  link_slug:        string;
  clicks:           number;
  youtube_views:    number;   // YouTube Analytics에서 조회된 해당 영상 조회수
  conversion_rate:  number;   // 0-1 (youtube_views / clicks)
  conversion_pct:   string;   // "66%" 형식
  quality:          "high" | "medium" | "low";
}

// ─── 전환율 품질 분류 ─────────────────────────────────────────────────────────

function classifyQuality(rate: number): "high" | "medium" | "low" {
  if (rate >= 0.7) return "high";
  if (rate >= 0.4) return "medium";
  return "low";
}

// ─── 분석 함수 ────────────────────────────────────────────────────────────────

export function analyzeConversions(
  campaigns:  CampaignResult[],
  videoRows:  DimensionRow[],
): ConversionResult[] {
  if (campaigns.length === 0) return [];

  // video_id → views 룩업 테이블
  const viewsMap = new Map<string, number>();
  for (const row of videoRows) {
    viewsMap.set(row.key, row.views);
  }

  return campaigns
    .filter(c => c.target_video && c.clicks > 0)
    .map(c => {
      const youtube_views   = viewsMap.get(c.target_video) ?? 0;
      const conversion_rate = youtube_views / c.clicks;

      return {
        campaign:        c.campaign,
        platform:        c.platform,
        link_slug:       c.link_slug,
        clicks:          c.clicks,
        youtube_views,
        conversion_rate,
        conversion_pct:  `${Math.round(conversion_rate * 100)}%`,
        quality:         classifyQuality(conversion_rate),
      };
    })
    .sort((a, b) => b.clicks - a.clicks);
}

// ─── 전체 통계 요약 ───────────────────────────────────────────────────────────

export interface ConversionSummary {
  total_clicks:      number;
  total_views:       number;
  avg_conversion:    number;
  best_campaign:     ConversionResult | null;
  campaign_count:    number;
}

export function summarizeConversions(conversions: ConversionResult[]): ConversionSummary {
  if (conversions.length === 0) {
    return { total_clicks: 0, total_views: 0, avg_conversion: 0, best_campaign: null, campaign_count: 0 };
  }

  const total_clicks = conversions.reduce((s, c) => s + c.clicks, 0);
  const total_views  = conversions.reduce((s, c) => s + c.youtube_views, 0);
  const avg_conversion = total_clicks > 0 ? total_views / total_clicks : 0;
  const best_campaign  = [...conversions].sort((a, b) => b.conversion_rate - a.conversion_rate)[0];

  return {
    total_clicks,
    total_views,
    avg_conversion,
    best_campaign,
    campaign_count: conversions.length,
  };
}
