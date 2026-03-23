// ─── enginePipeline v2 ────────────────────────────────────────────────────────
// 모든 엔진을 순서대로 실행하고 단일 AnalysisResult를 반환한다.
// v2: TrackResult / AnalysisKPIs / InternalAnalysis 타입 추가,
//     dailyStats + channelInfo + weights + period 옵션 추가.

import type { NormalizedVideo } from "./types/normalized";
import type { RawAnalyticsRow } from "../adapters/YouTubeApiAdapter";
import { mergeAnalyticsIntoNormalized } from "../adapters/YouTubeApiAdapter";

import * as metricEngine        from "../engines/metricEngine";
import * as trafficEngine       from "../engines/trafficEngine";
import * as momentumEngine      from "../engines/momentumEngine";
import * as strategyScoreEngine from "../engines/strategyScoreEngine";
import * as correlationEngine      from "../engines/correlationEngine";
import * as insightEngine          from "../engines/insightEngine";
import * as earlyMomentumEngine    from "../engines/earlyMomentumEngine";
import * as trafficGrowthEngine    from "../engines/trafficGrowthEngine";
import * as contentClusterEngine   from "../engines/contentClusterEngine";
import * as algorithmEntryEngine   from "../engines/algorithmEntryEngine";
import * as thumbnailAnalyzerEngine        from "../engines/thumbnailAnalyzerEngine";
import * as strategyRecommendationEngine  from "../engines/strategyRecommendationEngine";
import * as uploadTimingEngine           from "../engines/uploadTimingEngine";
import * as trendDetectionEngine           from "../engines/trendDetectionEngine";
import * as performancePredictionEngine  from "../engines/performancePredictionEngine";
import * as strategyOptimizerEngine     from "../engines/strategyOptimizerEngine";

import type { MetricResult }         from "../engines/metricEngine";
import type { TrafficResult }        from "../engines/trafficEngine";
import type { MomentumResult, MomentumOptions } from "../engines/momentumEngine";
import type {
  VideoStrategyScore,
  StrategyScoreResult,
  StrategyScoreOptions,
  StrategyWeights,
} from "../engines/strategyScoreEngine";
import type { CorrelationResult, InternalCorrelationResult } from "../engines/correlationEngine";
import type { InsightResult }        from "../engines/insightEngine";
import type { EarlyMomentumResult, EarlyTrackMeta } from "../engines/earlyMomentumEngine";
import type { TrafficGrowthResult, TrafficGrowthOptions } from "../engines/trafficGrowthEngine";
import type { ContentClusterResult }    from "../engines/contentClusterEngine";
import type { AlgorithmEntryAnalysis } from "../engines/algorithmEntryEngine";
import type { ThumbnailAnalysisResult } from "../engines/thumbnailAnalyzerEngine";
import type { RecommendationResult }    from "../engines/strategyRecommendationEngine";
import type { UploadTimingResult }      from "../engines/uploadTimingEngine";
import type { TrendResult }            from "../engines/trendDetectionEngine";
import type { PredictionResult }       from "../engines/performancePredictionEngine";
import type { StrategyPlan }          from "../engines/strategyOptimizerEngine";

import { computeInternalRatio }      from "../engines/trafficEngine";
import { computeInternalCorrelations } from "../engines/correlationEngine";
import { generateDataHealthReport }   from "../utils/dataHealthReport";

// ─── Channel Data Row Types ────────────────────────────────────────────────────

export interface DailyStatRow {
  date:    string;
  views:   number;
  revenue: number;
}

export interface ChannelInfo {
  subscribers:      number;
  subscriberChange: number;
}

// ─── KPI Result ───────────────────────────────────────────────────────────────

export interface AnalysisKPIs {
  total30Views:     number;
  total30Revenue:   number;
  avgDailyViews:    number;
  subscribers:      number;
  subscriberChange: number;
}

// ─── Track Result ─────────────────────────────────────────────────────────────
// NormalizedVideo → 엔진 결과를 조합한 UI 소비 단위

export interface TrackResult {
  /** = videoId (AssetPanel · sortTracks 하위 호환) */
  id:                 string;
  videoId:            string;
  /** = title */
  name:               string;
  /** = views (AssetPanel 하위 호환) */
  avgViews:           number;
  /** subscriberChange / views (0~1) */
  subGrowthRate:      number;
  /** (likes + comments) / views (0~1) */
  engagementRate:     number;
  /** subGrowthRate * 0.6 + engagementRate * 0.4 */
  earlyMomentumScore: number;

  // ── 엔진 보강 필드 (옵셔널) ────────────────────────────────────────────────
  // 파이프라인 실행 후 채워진다. UI·하위 엔진이 맵 없이 직접 참조 가능.

  /** metricEngine.retentionRate (averageViewDuration, 0~1) */
  retentionRate?:  number;
  /** trafficGrowthEngine.velocity */
  velocity?:       number;
  /** earlyMomentumEngine.momentumScore (7일 이내 영상만, 그 외 undefined) */
  momentumScore?:  number;

  /** 썸네일 URL (thumbnailAnalyzerEngine 참조용) */
  thumbnailUrl?:   string;
  /** 영상 태그 (contentClusterEngine 클러스터 키 결정용) */
  tags?:           string[];
  /** 업로드 일시 ISO 8601 (uploadTimingEngine 참조용) */
  publishedAt?:    string;

  trafficGrowth?: {
    velocity:     number;
    acceleration: number;
    growthStatus: string;
  };

  earlyMomentum?: {
    momentumScore:  number;
    momentumStatus: string;
  };

  traffic: {
    totalViews:    number;
    groups:        Record<string, number>;
    internalRatio: number;
  };
  strategy: {
    // ── flat fields (AssetPanel / VideoDetailPanel / sortTracks 호환) ──
    growth:       number;
    reach:        number;
    engagement:   number;
    monetization: number;
    total:        number;
    grade:        string;
    confidence:   string;
    reachRaw:     number;
    /** current.total − baseline.total */
    delta:        number;
    // ── nested (pipeline consumer) ──
    current:  VideoStrategyScore;
    baseline: VideoStrategyScore;
  };
}

// ─── Channel Traffic Aggregate ────────────────────────────────────────────────

export interface ChannelTrafficSummary {
  /** 전체 트랙 totalViews 합산 (view-weighted 집계 기반) */
  totalViews:    number;
  /** 소스별 view-weighted 평균 비율 맵 */
  groups:        Record<string, number>;
  /** INTERNAL_SOURCES 합산 비율 (0~1) */
  internalRatio: number;
}

// ─── Internal Influence Analysis ──────────────────────────────────────────────

export interface InternalAnalysis {
  correlations: InternalCorrelationResult | null;
  /** internalRatio 내림차순 Top5 */
  internalTop:  TrackResult[];
  /** earlyMomentumScore 내림차순 Top5 */
  momentumTop:  TrackResult[];
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface PipelineOptions {
  /** 채널 일평균 조회수 (dailyStats 미전달 시 fallback) */
  channelAvgViews?:  number;
  strategyScore?:    StrategyScoreOptions;
  momentum?:         MomentumOptions;
  /**
   * window.api.fetchYTAnalytics() 결과 ([videoId, impressions, ctr][])
   * 제공 시 NormalizedVideo에 impressions/ctr를 join한다.
   */
  analyticsRows?:    RawAnalyticsRow[];
  // ── v2 ──
  /** 전략 점수 가중치 (4축 합계 1.0) */
  weights?:          StrategyWeights;
  /** 기간 슬라이스 ("7" | "30" | "90" | "all") */
  period?:           string;
  /** 채널 일별 조회수 + 수익 배열 — KPI 계산 + period-based channelAvgViews에 사용 */
  dailyStats?:       DailyStatRow[];
  /** 채널 구독자 정보 — kpis.subscribers / subscriberChange에 사용 */
  channelInfo?:      ChannelInfo;
  /** 영상별 일별 조회수 배열 — trafficGrowthEngine에 전달 (미제공 시 추정 모드) */
  perVideoDaily?:    TrafficGrowthOptions["perVideoDaily"];
}

// ─── Analysis Result ──────────────────────────────────────────────────────────

export interface AnalysisResult {
  videoCount:    number;
  analyzedAt:    string;

  // ── 기존 엔진 결과 ──
  metrics:       MetricResult;
  traffic:       TrafficResult;
  momentum:      MomentumResult;
  strategyScore: StrategyScoreResult;
  correlation:   CorrelationResult;
  insights:      InsightResult;

  // ── v2 추가 ──
  /** 채널 KPI (dailyStats 제공 시에만 채워짐) */
  kpis:             AnalysisKPIs | null;
  /** NormalizedVideo + 엔진 결과 조합 단위 */
  tracks:           TrackResult[];
  /** Internal Influence 분석 */
  internalAnalysis: InternalAnalysis;
  /** 채널 전체 트래픽 집계 (view-weighted) */
  channelTraffic: ChannelTrafficSummary;
  /** 채널 전체 내부 유입 비율 (0~1) */
  channelInternalRatio: number;
  /** 업로드 후 7일 이내 영상 초반 성과 분석 */
  earlyMomentum: EarlyMomentumResult;
  /** 영상별 조회수 증가 속도 분석 */
  trafficGrowth: TrafficGrowthResult;
  /** 콘텐츠 유형별 클러스터 성과 분석 */
  contentClusters: ContentClusterResult;
  /** 알고리즘 추천 진입 상태 분석 */
  algorithmEntry: AlgorithmEntryAnalysis;
  /** 썸네일 특성 ↔ CTR proxy 상관관계 분석 */
  thumbnailAnalysis: ThumbnailAnalysisResult;
  /** 콘텐츠·썸네일·알고리즘 전략 추천 */
  recommendations: RecommendationResult[];
  /** 업로드 시간대별 성과 분석 및 최적 시간 추천 */
  uploadTiming: UploadTimingResult;
  /** 콘텐츠 유형별 트렌드 탐지 (trendScore 내림차순) */
  trendDetection: TrendResult[];
  /** 다음 영상 예상 성과 예측 */
  performancePrediction: PredictionResult;
  /** 다음 업로드 최적 전략 플랜 */
  strategyOptimizer: StrategyPlan;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** dailyStats 기간 슬라이스의 일평균 조회수 (0 방어) */
function sliceAvgViews(dailyStats: DailyStatRow[], period: string): number {
  const n = period === "all"
    ? dailyStats.length
    : Math.min(Number(period) || 30, dailyStats.length);
  const slice = dailyStats.slice(-n);
  if (slice.length === 0) return 0;
  return slice.reduce((s, d) => s + d.views, 0) / slice.length;
}

// ─── runFullAnalysis ──────────────────────────────────────────────────────────
// @param  data     NormalizedVideo 배열 (어댑터 출력)
// @param  options  엔진 옵션 + 채널 데이터
// @returns AnalysisResult

export function runFullAnalysis(
  data:    NormalizedVideo[],
  options: PipelineOptions = {},
): AnalysisResult {
  const { dailyStats, channelInfo, period = "30", weights } = options;

  // 0. Analytics join (impressions/ctr) — 제공된 경우만
  const enriched = options.analyticsRows?.length
    ? mergeAnalyticsIntoNormalized(data, options.analyticsRows)
    : data;

  // 1. 기본 지표
  const metrics = metricEngine.run(enriched);

  // 2. 트래픽 소스
  const traffic = trafficEngine.run(enriched);

  // 3. 모멘텀
  const momentum = momentumEngine.run(enriched, options.momentum);

  // 4. 전략 점수 — period 기반 channelAvgViews (current + baseline)
  let periodAvgViews:   number;
  let baselineAvgViews: number;

  if (dailyStats && dailyStats.length > 0) {
    periodAvgViews   = sliceAvgViews(dailyStats, period)  || 1;
    baselineAvgViews = sliceAvgViews(dailyStats, "30")    || 1;
  } else {
    const fallback =
      options.channelAvgViews ??
      (enriched.length > 0
        ? enriched.reduce((s, v) => s + v.views, 0) / enriched.length
        : 1);
    periodAvgViews   = fallback;
    baselineAvgViews = fallback;
  }

  const scoreOpts: StrategyScoreOptions = weights ? { weights } : (options.strategyScore ?? {});
  const currentScores  = strategyScoreEngine.run(enriched, periodAvgViews,   scoreOpts);
  const baselineScores = strategyScoreEngine.run(enriched, baselineAvgViews, scoreOpts);

  // 5. 상관관계
  const correlation = correlationEngine.run(enriched);

  // 6. 인사이트
  const insights = insightEngine.run(enriched, metrics, momentum, traffic);

  // 7. 조회수 증가 속도
  const trafficGrowth = trafficGrowthEngine.run(enriched, {
    perVideoDaily: options.perVideoDaily,
  });

  // ── KPIs ────────────────────────────────────────────────────────────────────
  let kpis: AnalysisKPIs | null = null;
  if (dailyStats && dailyStats.length > 0) {
    const daily30 = dailyStats.slice(-30);
    kpis = {
      total30Views:     daily30.reduce((s, d) => s + d.views,   0),
      total30Revenue:   daily30.reduce((s, d) => s + d.revenue, 0),
      avgDailyViews:    Math.round(daily30.reduce((s, d) => s + d.views, 0) / daily30.length),
      subscribers:      channelInfo?.subscribers      ?? 0,
      subscriberChange: channelInfo?.subscriberChange ?? 0,
    };
  }

  // ── TrackResult 빌드 ─────────────────────────────────────────────────────────
  // byVideo / scores 를 Map으로 빌드 → videoId lookup O(1)
  const metricsMap  = new Map(metrics.metrics.map(m => [m.videoId, m]));
  const trafficMap  = new Map(traffic.byVideo.map(b  => [b.videoId,  b]));
  const currentMap  = new Map(currentScores.scores.map(s  => [s.videoId,  s]));
  const baselineMap = new Map(baselineScores.scores.map(s => [s.videoId, s]));

  const tracks: TrackResult[] = enriched.map(v => {
    const tb = trafficMap.get(v.videoId);
    const cs = currentMap.get(v.videoId)
      ?? { videoId: v.videoId, growth: 0, reach: 0, engagement: 0, monetization: 0, total: 0, grade: "D" as const, confidence: "Low" as const, reachRaw: 0 };
    const bs = baselineMap.get(v.videoId) ?? cs;

    const groups        = tb?.sources ?? v.trafficSources;
    const totalViews    = Object.values(groups).reduce((s, x) => s + x, 0);
    const internalRatio = tb?.internalRatio ?? computeInternalRatio(v.trafficSources);

    const subGrowthRate  = clamp01(v.subscriberChange / Math.max(v.views, 1));
    const engagementRate = clamp01((v.likes + v.comments) / Math.max(v.views, 1));
    const earlyMomentumScore = subGrowthRate * 0.6 + engagementRate * 0.4;

    const delta = cs.total - bs.total;

    return {
      id:                 v.videoId,
      videoId:            v.videoId,
      name:               v.title,
      avgViews:           v.views,
      subGrowthRate,
      engagementRate,
      earlyMomentumScore,
      retentionRate: metricsMap.get(v.videoId)?.retentionRate,
      thumbnailUrl:  v.thumbnailUrl,
      tags:          v.tags,
      publishedAt:   v.publishedAt,
      traffic: { totalViews, groups, internalRatio },
      strategy: {
        growth:       cs.growth,
        reach:        cs.reach,
        engagement:   cs.engagement,
        monetization: cs.monetization,
        total:        cs.total,
        grade:        cs.grade,
        confidence:   cs.confidence,
        reachRaw:     cs.reachRaw,
        delta,
        current:  cs,
        baseline: bs,
      },
    };
  });

  // trackById: 이후 뮤테이션에서 O(1) 조회용
  const trackById = new Map(tracks.map(t => [t.videoId, t]));

  // ── channelTraffic (view-weighted aggregate across all tracks) ───────────────
  const totalAllViews = tracks.reduce((s, t) => s + t.traffic.totalViews, 0) || 1;
  const channelGroups: Record<string, number> = {};
  for (const t of tracks) {
    const weight = t.traffic.totalViews / totalAllViews;
    for (const [k, v] of Object.entries(t.traffic.groups)) {
      channelGroups[k] = (channelGroups[k] ?? 0) + v * weight;
    }
  }
  const channelInternalRatio = computeInternalRatio(channelGroups);
  const channelTraffic: ChannelTrafficSummary = {
    totalViews:    totalAllViews,
    groups:        channelGroups,
    internalRatio: channelInternalRatio,
  };

  // trafficGrowthEngine 결과를 tracks에 직접 뮤테이션
  for (const g of trafficGrowth.byVideo) {
    const t = trackById.get(g.videoId);
    if (t) {
      t.velocity     = g.velocity;
      t.trafficGrowth = { velocity: g.velocity, acceleration: g.acceleration, growthStatus: g.growthStatus };
    }
  }

  // 8. 콘텐츠 클러스터 분석 — tracks에서 직접 읽음 (velocity 뮤테이션 완료 후)
  const contentClusters = contentClusterEngine.run(tracks);

  // ── earlyMomentumEngine — 7일 이내 영상 초반 성과 ────────────────────────────
  const now = Date.now();
  const earlyMetaMap = new Map<string, EarlyTrackMeta>(
    enriched.map(v => {
      const d = v.publishedAt ? new Date(v.publishedAt) : null;
      const daysSinceUpload = (d && !isNaN(d.getTime()))
        ? Math.max(0, Math.floor((now - d.getTime()) / 86_400_000))
        : 999;
      // retentionRate는 이미 tracks에 뮤테이션되어 있음
      const retentionRate = trackById.get(v.videoId)?.retentionRate ?? 0;
      return [v.videoId, { retentionRate, daysSinceUpload }];
    }),
  );

  const earlyMomentum = earlyMomentumEngine.run(tracks, earlyMetaMap);

  // earlyMomentumEngine 결과를 tracks에 직접 뮤테이션
  for (const e of earlyMomentum.byVideo) {
    const t = trackById.get(e.videoId);
    if (t) {
      t.momentumScore = e.momentumScore;
      t.earlyMomentum = { momentumScore: e.momentumScore, momentumStatus: e.momentumStatus };
    }
  }

  // 9. 알고리즘 진입 감지 — TrackResult 뮤테이션 완료 후 직접 실행
  const algorithmEntry = algorithmEntryEngine.run(tracks);

  // 10. 썸네일 특성 ↔ CTR proxy 상관관계 분석
  const thumbnailAnalysis = thumbnailAnalyzerEngine.run(tracks);

  // ── InternalAnalysis ──────────────────────────────────────────────────────
  const internalTop = [...tracks]
    .sort((a, b) => b.traffic.internalRatio - a.traffic.internalRatio)
    .slice(0, 5);

  const momentumTop = [...tracks]
    .sort((a, b) => b.earlyMomentumScore - a.earlyMomentumScore)
    .slice(0, 5);

  const corrInputs = tracks.map(t => ({
    internalRatio: t.traffic.internalRatio,
    growthRate:    t.subGrowthRate,
    retentionRate: t.engagementRate,
  }));

  const internalAnalysis: InternalAnalysis = {
    correlations: computeInternalCorrelations(corrInputs, 3),
    internalTop,
    momentumTop,
  };

  // ── 최종 결과 조립 ──────────────────────────────────────────────────────────
  const result: AnalysisResult = {
    videoCount:  enriched.length,
    analyzedAt:  new Date().toISOString(),
    metrics,
    traffic,
    momentum,
    strategyScore: currentScores,
    correlation,
    insights,
    kpis,
    tracks,
    internalAnalysis,
    channelTraffic,
    channelInternalRatio,
    earlyMomentum,
    trafficGrowth,
    contentClusters,
    algorithmEntry,
    thumbnailAnalysis,
    uploadTiming:    { bestHour: -1, bestScore: 0, distribution: [] }, // 임시 — 아래에서 채움
    trendDetection:        [],                                                        // 임시 — 아래에서 채움
    performancePrediction: { predictedViews: 0, predictedScore: 0, confidence: 0 },           // 임시 — 아래에서 채움
    strategyOptimizer:     { contentStrategy: "", thumbnailStrategy: "", timingStrategy: "", expectedViews: 0, confidence: 0 }, // 임시 — 아래에서 채움
    recommendations:       [],                                                        // 임시 — 아래에서 채움
  };

  // 11. 업로드 시간대 분석
  result.uploadTiming = uploadTimingEngine.run(tracks);

  // 12. 트렌드 탐지 — contentClusters 완료 후 실행
  result.trendDetection = trendDetectionEngine.run(result);

  // 13. 성과 예측 — trendDetection 완료 후 실행
  result.performancePrediction = performancePredictionEngine.run(result);

  // 14. 전략 최적화 — performancePrediction 완료 후 실행
  result.strategyOptimizer = strategyOptimizerEngine.run(result);

  // 15. 전략 추천 — 완성된 AnalysisResult를 입력으로 사용
  result.recommendations = strategyRecommendationEngine.run(result);

  // 16. 데이터 헬스 보고서 — 콘솔 출력 전용, 결과 불변
  generateDataHealthReport(enriched, result);

  return result;
}
