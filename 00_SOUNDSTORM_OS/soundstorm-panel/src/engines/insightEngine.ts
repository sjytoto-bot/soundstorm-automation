// ─── insightEngine v1 ─────────────────────────────────────────────────────────
// NormalizedVideo 배열 전체 패턴에서 채널 레벨 자동 인사이트를 생성한다.
// 기존 strategyInsight.js(영상 단위)와 달리 이 엔진은 채널 단위 분석을 담당한다.

import type { NormalizedVideo } from "../core/types/normalized";
import type { MetricResult }    from "./metricEngine";
import type { MomentumResult }  from "./momentumEngine";
import type { TrafficResult }   from "./trafficEngine";

// ─── Result Types ─────────────────────────────────────────────────────────────

export type InsightType     = "positive" | "warning" | "critical" | "info";
export type InsightCategory = "growth" | "revenue" | "engagement" | "traffic" | "content";

export interface Insight {
  id:         string;
  type:       InsightType;
  category:   InsightCategory;
  title:      string;
  message:    string;
  /** 관련 videoId 목록 (없으면 채널 전체 인사이트) */
  relatedIds: string[];
}

export interface InsightResult {
  insights: Insight[];
  /** 타입별 요약 카운트 */
  summary: Record<InsightType, number>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;
function nextId(): string {
  return `insight_${++_seq}`;
}

// ─── rule functions ────────────────────────────────────────────────────────────

function ruleRisingVideos(momentum: MomentumResult): Insight[] {
  const rising = momentum.byVideo.filter(v => v.label === "Rising");
  if (rising.length === 0) return [];
  return [{
    id:         nextId(),
    type:       "positive",
    category:   "growth",
    title:      `${rising.length}개 영상 상승 모멘텀 확인`,
    message:    `채널 일평균 대비 1.2배 이상 성장 중인 영상이 ${rising.length}개입니다. 해당 콘텐츠 패턴 분석을 권장합니다.`,
    relatedIds: rising.map(v => v.videoId),
  }];
}

function ruleDecliningMajority(momentum: MomentumResult, total: number): Insight[] {
  if (total === 0) return [];
  const ratio = momentum.decliningCount / total;
  if (ratio < 0.5) return [];
  return [{
    id:         nextId(),
    type:       "critical",
    category:   "growth",
    title:      "과반수 영상 모멘텀 하락",
    message:    `전체 영상의 ${Math.round(ratio * 100)}%가 채널 평균 이하 성장률입니다. 업로드 주기 또는 콘텐츠 방향 재검토가 필요합니다.`,
    relatedIds: momentum.byVideo.filter(v => v.label === "Declining").map(v => v.videoId),
  }];
}

function ruleLowRetention(metrics: MetricResult): Insight[] {
  const LOW_RETENTION = 0.3;
  const low = metrics.metrics.filter(m => m.retentionRate < LOW_RETENTION && m.retentionRate > 0);
  if (low.length === 0) return [];
  return [{
    id:         nextId(),
    type:       "warning",
    category:   "engagement",
    title:      `시청 지속률 저조 영상 ${low.length}개`,
    message:    `시청 지속률이 30% 미만인 영상이 ${low.length}개입니다. 인트로 개선 또는 제목·썸네일 기대값 조정을 고려하세요.`,
    relatedIds: low.map(m => m.videoId),
  }];
}

function ruleLowRevenue(metrics: MetricResult): Insight[] {
  const LOW_CPM = 0.5;
  const low = metrics.metrics.filter(m => m.estimatedCpm < LOW_CPM && m.estimatedCpm > 0);
  if (low.length === 0) return [];
  return [{
    id:         nextId(),
    type:       "warning",
    category:   "revenue",
    title:      `CPM 저조 영상 ${low.length}개`,
    message:    `추정 CPM이 $0.50 미만인 영상이 ${low.length}개입니다. 광고 친화적 콘텐츠 비율 점검을 권장합니다.`,
    relatedIds: low.map(m => m.videoId),
  }];
}

function ruleChannelInternalRatio(traffic: TrafficResult): Insight[] {
  const ratio = traffic.channelInternalRatio;
  if (ratio > 0.65) {
    return [{
      id:         nextId(),
      type:       "warning",
      category:   "traffic",
      title:      "알고리즘 의존 채널",
      message:    `내부 유입 비율이 ${Math.round(ratio * 100)}%입니다. 알고리즘 변화에 취약하므로 썸네일·제목 전략 강화를 권장합니다.`,
      relatedIds: [],
    }];
  }
  if (ratio < 0.35) {
    return [{
      id:         nextId(),
      type:       "info",
      category:   "traffic",
      title:      "검색/외부 기반 채널",
      message:    `내부 유입 비율이 ${Math.round(ratio * 100)}%입니다. SEO 최적화로 검색 유입을 강화하면 알고리즘 추천 진입이 유리합니다.`,
      relatedIds: [],
    }];
  }
  return [];
}

function ruleSearchTrafficLow(traffic: TrafficResult): Insight[] {
  const searchRatio = traffic.channelAvgSources["YT_SEARCH"] ?? 0;
  if (searchRatio >= 0.2) return [];
  return [{
    id:         nextId(),
    type:       "info",
    category:   "traffic",
    title:      "YouTube 검색 유입 낮음",
    message:    `채널 평균 검색 유입 비율이 ${Math.round(searchRatio * 100)}%입니다. 제목·설명·태그 SEO 최적화를 검토하세요.`,
    relatedIds: [],
  }];
}

// ─── run ──────────────────────────────────────────────────────────────────────

export function run(
  data:     NormalizedVideo[],
  metrics:  MetricResult,
  momentum: MomentumResult,
  traffic:  TrafficResult,
): InsightResult {
  _seq = 0;   // 결정적 ID를 위해 리셋

  const insights: Insight[] = [
    ...ruleRisingVideos(momentum),
    ...ruleDecliningMajority(momentum, data.length),
    ...ruleLowRetention(metrics),
    ...ruleLowRevenue(metrics),
    ...ruleChannelInternalRatio(traffic),
    ...ruleSearchTrafficLow(traffic),
  ];

  const summary: Record<InsightType, number> = {
    positive: 0,
    warning:  0,
    critical: 0,
    info:     0,
  };
  for (const ins of insights) {
    summary[ins.type] = (summary[ins.type] ?? 0) + 1;
  }

  return { insights, summary };
}
