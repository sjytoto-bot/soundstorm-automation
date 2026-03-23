// ─── ExternalTrafficEngine ───────────────────────────────────────────────────
// PHASE 8A + 8B — External Traffic + Redirect Tracker 통합 엔진
//
// 최종 분석 파이프라인:
//   DimensionRow[] (Sheets/CSV)   +   RedirectLog[] (Redirect Tracker)
//   ↓                                 ↓
//   classifyAll()         ReferrerClassifier   (referrer → platform)
//   enrichAll()           AudienceAnalyzer     (platform → audience)
//   groupByCategory()     PlatformMapper       (카테고리별 집계)
//   summarizeIntents()    IntentAnalyzer       (intent 요약)
//   summarizeAudiences()  AudienceAnalyzer     (audience 요약)
//   computeQualityScores() ExternalQualityAnalyzer
//   generateExternalInsights() ExternalStrategyGenerator
//   ─────────────────────────────────────────────
//   analyzeCampaigns()    CampaignAnalyzer     (redirect log → campaign)
//   analyzeConversions()  ConversionAnalyzer   (campaign × YouTube views)
//   → ExternalTrafficResult

import type { DimensionRow }                    from "@/adapters/AnalyticsAdapter";
import { classifyAll }                           from "./ReferrerClassifier";
import { enrichAll, summarizeAudiences }         from "./AudienceAnalyzer";
import { groupByCategory }                       from "./PlatformMapper";
import { summarizeIntents }                      from "./IntentAnalyzer";
import { computeQualityScores }                  from "./ExternalQualityAnalyzer";
import { generateExternalInsights }              from "./ExternalStrategyGenerator";
import { analyzeCampaigns, summarizePlatformCampaigns } from "./CampaignAnalyzer";
import { analyzeConversions, summarizeConversions }      from "./ConversionAnalyzer";
import type { AudienceEnrichedReferrer, AudienceSummaryItem } from "./AudienceAnalyzer";
import type { CategoryGroup }                    from "./PlatformMapper";
import type { IntentSummary }                    from "./IntentAnalyzer";
import type { QualityScore }                     from "./ExternalQualityAnalyzer";
import type { ExternalInsight }                  from "./externalInsightRules";
import type { RedirectLog, CampaignResult, PlatformCampaignSummary } from "./CampaignAnalyzer";
import type { ConversionResult, ConversionSummary }                  from "./ConversionAnalyzer";

// ─── 공개 타입 re-export ──────────────────────────────────────────────────────

export type { ExternalInsight }              from "./externalInsightRules";
export type { AudienceEnrichedReferrer }     from "./AudienceAnalyzer";
export type { AudienceSummaryItem }          from "./AudienceAnalyzer";
export type { CategoryGroup }                from "./PlatformMapper";
export type { IntentSummary }                from "./IntentAnalyzer";
export type { QualityScore }                 from "./ExternalQualityAnalyzer";
export type { RedirectLog, CampaignResult, PlatformCampaignSummary } from "./CampaignAnalyzer";
export type { ConversionResult, ConversionSummary }                  from "./ConversionAnalyzer";
export { parseExternalTrafficCSV }           from "./ExternalCSVParser";
export type { CSVParseResult }               from "./ExternalCSVParser";

// ─── 결과 타입 ────────────────────────────────────────────────────────────────

export interface ExternalTrafficResult {
  // Phase 8A — YouTube Analytics 기반
  enriched:          AudienceEnrichedReferrer[];
  categoryGroups:    CategoryGroup[];
  intentSummary:     IntentSummary[];
  audienceSummary:   AudienceSummaryItem[];
  qualityScores:     QualityScore[];
  insights:          ExternalInsight[];
  totalViews:        number;
  hasData:           boolean;

  // Phase 8B — Redirect Tracker 기반
  campaigns:         CampaignResult[];
  platformCampaigns: PlatformCampaignSummary[];
  conversions:       ConversionResult[];
  conversionSummary: ConversionSummary;
  hasCampaignData:   boolean;
}

// ─── 메인 분석 함수 ───────────────────────────────────────────────────────────

export function analyzeExternalTraffic(
  internalInfluence:      DimensionRow[],
  channelAvgDurationSec:  number = 0,
  redirectLogs?:          RedirectLog[],   // Phase 8B: Redirect Tracker 로그
  videoRows?:             DimensionRow[],  // Phase 8B: 전환율 계산용 영상 조회수
): ExternalTrafficResult {

  // ── Phase 8A: YouTube Analytics 파이프라인 ─────────────────────────────────

  const emptyBase = {
    enriched:        [] as AudienceEnrichedReferrer[],
    categoryGroups:  [] as CategoryGroup[],
    intentSummary:   [] as IntentSummary[],
    audienceSummary: [] as AudienceSummaryItem[],
    qualityScores:   [] as QualityScore[],
    insights:        [] as ExternalInsight[],
    totalViews:      0,
    hasData:         false,
  };

  let analyticsResult = emptyBase;

  if (internalInfluence && internalInfluence.length > 0) {
    const classified     = classifyAll(internalInfluence);
    const enriched       = enrichAll(classified);
    const categoryGroups = groupByCategory(enriched);
    const intentSummary  = summarizeIntents(enriched);
    const audienceSummary = summarizeAudiences(enriched);
    const qualityScores  = computeQualityScores(enriched, channelAvgDurationSec);
    const insights       = generateExternalInsights(enriched, channelAvgDurationSec);
    const totalViews     = enriched.reduce((s, r) => s + r.views, 0);

    analyticsResult = {
      enriched,
      categoryGroups,
      intentSummary,
      audienceSummary,
      qualityScores,
      insights,
      totalViews,
      hasData: enriched.length > 0,
    };
  }

  // ── Phase 8B: Redirect Tracker 파이프라인 ─────────────────────────────────

  const logs       = redirectLogs ?? [];
  const campaigns  = analyzeCampaigns(logs);
  const platformCampaigns = summarizePlatformCampaigns(campaigns);
  const conversions = analyzeConversions(campaigns, videoRows ?? []);
  const conversionSummary = summarizeConversions(conversions);

  return {
    ...analyticsResult,
    campaigns,
    platformCampaigns,
    conversions,
    conversionSummary,
    hasCampaignData: campaigns.length > 0,
  };
}
