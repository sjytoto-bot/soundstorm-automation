// ─── InsightEngine v3 Core ─────────────────────────────────────────────────────
// Architecture:
//   MetricAnalyzer   — raw metric delta extraction (analyzeMetrics)
//   CorrelationEngine — multi-metric correlation diagnosis (detectCorrelations)
//   PatternDetector  — pattern rule matching (PATTERNS)
//   StrategyMapper   — pattern → Problem / Insight / Strategy / Action
//
// Each InsightV3 carries:
//   impact_score     — 비즈니스 영향도 (0–100)
//   confidence_score — 분석 신뢰도 (0–100, from correlation engine)
//   priority_score   — impact × confidence × level_weight (computed)
//
// Output: InsightV3[] sorted by priority_score descending

import type { AnalyticsData } from "@/adapters/AnalyticsAdapter";
import type { GrowthResult }  from "@/controllers/useAnalyticsController";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightLevel = "danger" | "warning" | "success" | "info";

/** 1. MetricAnalyzer 출력 */
export interface MetricSnapshot {
  views_change:        number | null;   // % change vs prev period
  watchtime_change:    number | null;
  avg_duration_change: number | null;
  likes_change:        number | null;
  subscriber_change:   number | null;
  keyword_ratio:       number | null;   // top keyword share
  mobile_ratio:        number | null;   // MOBILE device share
  related_ratio:       number | null;   // RELATED_VIDEO traffic share
  search_ratio:        number | null;   // YT_SEARCH traffic share
  young_ratio:         number | null;   // 13–24 age share
}

/** 4. StrategyMapper 출력 — Problem / Insight / Strategy / Action */
export interface InsightV3 {
  id:               string;
  level:            InsightLevel;
  problem:          string;         // 문제 분류 레이블 (예: "CTR 문제")
  insight:          string;         // 상세 분석 텍스트
  metric:           string | null;  // 강조 수치 배지 (예: "-33%")
  strategy:         string;         // 전략 방향 (예: "썸네일 전략 수정")
  action:           string;         // 실행 가능 액션
  action_tag:       string;         // SEO / 콘텐츠 / 알고리즘 / 기술 / 전략
  impact_score:     number;         // 0–100
  confidence_score: number;         // 0–100
  priority_score:   number;         // computed
}

// ─── 1. MetricAnalyzer ────────────────────────────────────────────────────────

export function analyzeMetrics(
  current: AnalyticsData | null,
  growth:  GrowthResult,
): MetricSnapshot {
  const devices        = current?.devices        ?? [];
  const keywords       = current?.keywords       ?? [];
  const trafficSources = current?.trafficSources ?? [];
  const age            = current?.age            ?? [];

  const mobile   = devices.find(d => d.key.toUpperCase() === "MOBILE");
  const related  = trafficSources.find(t => t.key === "RELATED_VIDEO");
  const ytSearch = trafficSources.find(t => t.key === "YT_SEARCH");
  const topKw    = keywords[0];

  const youngRatio = age
    .filter(a =>
      ["13-17", "18-24", "1317", "1824"].some(k =>
        a.key.replace(/\D/g, "").includes(k.replace(/\D/g, ""))
      )
    )
    .reduce((s, a) => s + a.ratio, 0);

  return {
    views_change:        growth.views       ?? null,
    watchtime_change:    growth.watchTime   ?? null,
    avg_duration_change: growth.avgDuration ?? null,
    likes_change:        growth.likes       ?? null,
    subscriber_change:   growth.subscribers ?? null,
    mobile_ratio:        mobile?.ratio      ?? null,
    related_ratio:       related?.ratio     ?? null,
    search_ratio:        ytSearch?.ratio    ?? null,
    keyword_ratio:       topKw?.ratio       ?? null,
    young_ratio:         youngRatio > 0     ? youngRatio : null,
  };
}

// ─── 2. CorrelationEngine ─────────────────────────────────────────────────────

interface Correlation {
  type:       string;
  confidence: number;  // 0–100
}

/**
 * 지표 간 상관관계 분석.
 * 여러 지표가 동시에 움직이는 패턴을 감지하고 신뢰도를 계산합니다.
 */
export function detectCorrelations(m: MetricSnapshot): Correlation[] {
  const c: Correlation[] = [];

  // ── Danger ──────────────────────────────────────────────────────────────
  // 조회수↓ + 시청시간↓ → 콘텐츠 품질 하락 (인트로 이탈 패턴)
  if (m.views_change != null && m.views_change < -5 &&
      m.avg_duration_change != null && m.avg_duration_change < -5)
    c.push({ type: "content_quality_decline", confidence: 88 });

  // 조회수↓ + 시청시간 유지 → CTR 문제 (썸네일/제목 클릭률)
  if (m.views_change != null && m.views_change < -5 &&
      (m.avg_duration_change == null || m.avg_duration_change >= -3))
    c.push({ type: "ctr_issue", confidence: 80 });

  // ── Warning ─────────────────────────────────────────────────────────────
  // 조회수↓ + 모바일 비율 높음 → 모바일 썸네일 불일치
  if (m.views_change != null && m.views_change < -5 &&
      m.mobile_ratio != null && m.mobile_ratio > 0.55)
    c.push({ type: "thumbnail_mobile_mismatch", confidence: 74 });

  // 시청시간↓ (조회수 정상) → Retention 구조 문제
  if (m.watchtime_change != null && m.watchtime_change < -15 &&
      (m.views_change == null || m.views_change > -5))
    c.push({ type: "retention_issue", confidence: 78 });

  // 구독 정체 (조회수 정상) → CTA 전환 병목
  if (m.subscriber_change != null && Math.abs(m.subscriber_change) < 5 &&
      (m.views_change == null || m.views_change > -5))
    c.push({ type: "cta_flat", confidence: 70 });

  // 모바일 높음 (단독) → 최적화 기회
  if (m.mobile_ratio != null && m.mobile_ratio > 0.6 &&
      !c.some(x => x.type === "thumbnail_mobile_mismatch"))
    c.push({ type: "mobile_high", confidence: 72 });

  // ── Success ─────────────────────────────────────────────────────────────
  // 검색 유입↑ + 키워드 집중 → SEO 성공 패턴
  if (m.search_ratio != null && m.search_ratio > 0.3 &&
      m.keyword_ratio != null && m.keyword_ratio > 0.12)
    c.push({ type: "seo_success", confidence: 88 });

  // 추천 트래픽 강함 → 알고리즘 추천 사이클 활성
  if (m.related_ratio != null && m.related_ratio > 0.35)
    c.push({ type: "algo_momentum", confidence: 84 });

  // 조회수 급성장 → 모멘텀 (즉시 활용)
  if (m.views_change != null && m.views_change > 20)
    c.push({ type: "growth_surge", confidence: 92 });

  // 시청시간↑ → 콘텐츠 품질 개선
  if (m.avg_duration_change != null && m.avg_duration_change > 10)
    c.push({ type: "quality_improved", confidence: 82 });

  // ── Info ─────────────────────────────────────────────────────────────────
  // 젊은 시청자(13-24) 우세
  if (m.young_ratio != null && m.young_ratio > 0.5)
    c.push({ type: "young_dominant", confidence: 85 });

  return c;
}

// ─── 3. PatternDetector + 4. StrategyMapper ───────────────────────────────────

/** 패턴 룰 정의: correlation type → Problem/Insight/Strategy/Action */
interface PatternRule {
  id:          string;
  level:       InsightLevel;
  problem:     string;
  insightFn:   (m: MetricSnapshot) => string;
  metricFn:    (m: MetricSnapshot) => string | null;
  strategy:    string;
  action:      string;
  action_tag:  string;
  impact:      number;      // base impact score 0–100
  correlation: string;      // required correlation type
}

const PATTERNS: PatternRule[] = [
  // ── Danger ──────────────────────────────────────────────────────────────
  {
    id:         "content_decline",
    level:      "danger",
    problem:    "콘텐츠 품질 저하",
    insightFn:  m => `조회수(${m.views_change}%)와 평균 시청시간(${m.avg_duration_change}%)이 동시에 하락하며 초반 구간 이탈 패턴이 감지되었습니다`,
    metricFn:   m => m.views_change != null ? `${m.views_change}%` : null,
    strategy:   "콘텐츠 구조 재검토",
    action:     "인트로를 20초 이내로 단축하세요",
    action_tag: "콘텐츠",
    impact:     92,
    correlation: "content_quality_decline",
  },
  {
    id:         "ctr_issue",
    level:      "danger",
    problem:    "CTR 문제",
    insightFn:  m => `조회수가 ${m.views_change}% 하락했지만 시청시간은 유지되어 클릭 유입(CTR) 문제로 분석됩니다`,
    metricFn:   m => m.views_change != null ? `${m.views_change}%` : null,
    strategy:   "썸네일 · 제목 전략 수정",
    action:     "썸네일과 제목을 즉시 A/B 테스트하세요",
    action_tag: "전략",
    impact:     87,
    correlation: "ctr_issue",
  },
  // ── Warning ─────────────────────────────────────────────────────────────
  {
    id:         "thumbnail_mobile",
    level:      "warning",
    problem:    "모바일 썸네일 불일치",
    insightFn:  m => `조회수 감소와 높은 모바일 비율(${m.mobile_ratio != null ? (m.mobile_ratio * 100).toFixed(0) : "—"}%)이 겹쳐 모바일 최적화 부재가 원인일 수 있습니다`,
    metricFn:   m => m.mobile_ratio != null ? `모바일 ${(m.mobile_ratio * 100).toFixed(0)}%` : null,
    strategy:   "모바일 최적화 썸네일 제작",
    action:     "모바일 환경에 맞는 썸네일을 제작하세요",
    action_tag: "기술",
    impact:     78,
    correlation: "thumbnail_mobile_mismatch",
  },
  {
    id:         "retention_issue",
    level:      "warning",
    problem:    "Retention 하락",
    insightFn:  m => `조회수는 유지됐지만 총 시청시간이 ${m.watchtime_change}% 감소하여 영상 후반부 이탈 패턴이 확인됩니다`,
    metricFn:   m => m.watchtime_change != null ? `${m.watchtime_change}%` : null,
    strategy:   "영상 구조 재편집",
    action:     "Retention 곡선을 분석하고 이탈 구간을 재편집하세요",
    action_tag: "콘텐츠",
    impact:     72,
    correlation: "retention_issue",
  },
  {
    id:         "cta_flat",
    level:      "warning",
    problem:    "구독 전환 정체",
    insightFn:  m => `구독 전환율이 ${m.subscriber_change != null ? m.subscriber_change + "%" : "—"} 정체되어 시청 → 구독 전환 구간에 병목이 있습니다`,
    metricFn:   m => m.subscriber_change != null ? `${m.subscriber_change}%` : null,
    strategy:   "CTA 전략 강화",
    action:     "영상 말미에 구독 CTA를 강화하세요",
    action_tag: "콘텐츠",
    impact:     66,
    correlation: "cta_flat",
  },
  // ── Info ─────────────────────────────────────────────────────────────────
  {
    id:         "mobile_high",
    level:      "info",
    problem:    "모바일 최적화 기회",
    insightFn:  m => `모바일 시청 비율이 ${m.mobile_ratio != null ? (m.mobile_ratio * 100).toFixed(0) : "—"}%로 높아 최적화 적용 시 CTR 향상을 기대할 수 있습니다`,
    metricFn:   m => m.mobile_ratio != null ? `${(m.mobile_ratio * 100).toFixed(0)}%` : null,
    strategy:   "모바일 UX 최적화",
    action:     "썸네일을 세로형 레이아웃으로 최적화하세요",
    action_tag: "기술",
    impact:     56,
    correlation: "mobile_high",
  },
  {
    id:         "young_dominant",
    level:      "info",
    problem:    "젊은 시청자층",
    insightFn:  m => `10~20대 시청자 비중이 ${m.young_ratio != null ? (m.young_ratio * 100).toFixed(0) : "—"}%로 높아 트렌디 콘텐츠와 숏폼이 효과적입니다`,
    metricFn:   m => m.young_ratio != null ? `${(m.young_ratio * 100).toFixed(0)}%` : null,
    strategy:   "숏폼 콘텐츠 병행",
    action:     "Shorts 콘텐츠를 병행 제작하세요",
    action_tag: "전략",
    impact:     52,
    correlation: "young_dominant",
  },
  // ── Success ─────────────────────────────────────────────────────────────
  {
    id:         "seo_success",
    level:      "success",
    problem:    "SEO 성과",
    insightFn:  m => `검색 유입(${m.search_ratio != null ? (m.search_ratio * 100).toFixed(0) : "—"}%)과 키워드 집중도가 높아 SEO 최적화 효과가 나타나고 있습니다`,
    metricFn:   m => m.search_ratio != null ? `검색 ${(m.search_ratio * 100).toFixed(0)}%` : null,
    strategy:   "SEO 모멘텀 확장",
    action:     "강세 키워드 기반의 시리즈 영상을 기획하세요",
    action_tag: "SEO",
    impact:     72,
    correlation: "seo_success",
  },
  {
    id:         "algo_momentum",
    level:      "success",
    problem:    "알고리즘 활성",
    insightFn:  m => `추천 트래픽이 ${m.related_ratio != null ? (m.related_ratio * 100).toFixed(0) : "—"}%로 높아 알고리즘 추천 사이클이 활성화되어 있습니다`,
    metricFn:   m => m.related_ratio != null ? `추천 ${(m.related_ratio * 100).toFixed(0)}%` : null,
    strategy:   "추천 최적화 유지",
    action:     "관련 영상 시리즈를 확장해 연속 시청을 유도하세요",
    action_tag: "알고리즘",
    impact:     75,
    correlation: "algo_momentum",
  },
  {
    id:         "growth_surge",
    level:      "success",
    problem:    "성장 모멘텀",
    insightFn:  m => `조회수가 +${m.views_change}% 급성장 중으로 현재 전략이 알고리즘과 정렬된 상태입니다`,
    metricFn:   m => m.views_change != null ? `+${m.views_change}%` : null,
    strategy:   "모멘텀 가속화",
    action:     "업로드 빈도를 높이고 성공 포맷을 복제하세요",
    action_tag: "전략",
    impact:     82,
    correlation: "growth_surge",
  },
  {
    id:         "quality_improved",
    level:      "success",
    problem:    "콘텐츠 품질 향상",
    insightFn:  m => `평균 시청시간이 +${m.avg_duration_change}% 상승하여 콘텐츠 품질 개선이 확인됩니다`,
    metricFn:   m => m.avg_duration_change != null ? `+${m.avg_duration_change}%` : null,
    strategy:   "현재 구성 유지",
    action:     "현재 영상 구성과 길이를 유지하세요",
    action_tag: "콘텐츠",
    impact:     62,
    correlation: "quality_improved",
  },
];

// priority_score = impact × confidence / 100 × level_weight
const LEVEL_WEIGHT: Record<InsightLevel, number> = {
  danger:  1.5,
  warning: 1.2,
  success: 0.9,
  info:    0.7,
};

const LEVEL_ORDER: Record<InsightLevel, number> = {
  danger: 0, warning: 1, success: 2, info: 3,
};

// ─── detectInsights (main entry point) ───────────────────────────────────────

export function detectInsights(
  current: AnalyticsData | null,
  growth:  GrowthResult,
): InsightV3[] {
  const metrics      = analyzeMetrics(current, growth);
  const correlations = detectCorrelations(metrics);
  const corrMap      = new Map(correlations.map(c => [c.type, c.confidence]));

  const results: InsightV3[] = [];

  for (const rule of PATTERNS) {
    const confidence = corrMap.get(rule.correlation);
    if (confidence == null) continue;

    const priority = Math.round(
      (rule.impact * confidence / 100) * LEVEL_WEIGHT[rule.level]
    );

    results.push({
      id:               rule.id,
      level:            rule.level,
      problem:          rule.problem,
      insight:          rule.insightFn(metrics),
      metric:           rule.metricFn(metrics),
      strategy:         rule.strategy,
      action:           rule.action,
      action_tag:       rule.action_tag,
      impact_score:     rule.impact,
      confidence_score: confidence,
      priority_score:   priority,
    });
  }

  // stable fallback
  if (results.length === 0) {
    results.push({
      id:               "stable",
      level:            "success",
      problem:          "전 지표 안정",
      insight:          "주요 지표 변화 없음 — 현재 전략이 안정적으로 유지 중",
      metric:           null,
      strategy:         "현재 전략 유지",
      action:           "주간 지표 정기 모니터링 유지",
      action_tag:       "전략",
      impact_score:     30,
      confidence_score: 90,
      priority_score:   27,
    });
  }

  return results.sort(
    (a, b) =>
      b.priority_score - a.priority_score ||
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
  );
}

// ─── buildSummaryV3 (legacy) ──────────────────────────────────────────────────

export function buildSummaryV3(insights: InsightV3[]): string {
  if (insights.length === 0) return "데이터 분석 중";

  const lines: string[] = [];
  const top = insights[0];
  lines.push(`[${top.problem}] ${top.insight}`);

  const second = insights.find(
    i => i.id !== top.id && (i.level === "danger" || i.level === "warning")
  );
  if (second) lines.push(`[${second.problem}] ${second.insight}`);

  const success = insights.find(i => i.level === "success" && i.id !== top.id);
  if (success) lines.push(`[${success.problem}] ${success.insight}`);

  return lines.join("\n");
}

// ─── buildActionSummary — Action 기반 AI Summary ──────────────────────────────

/**
 * 상위 우선순위 인사이트에서 action 문장(명령형)을 추출해
 * AI Summary 섹션에 표시할 bullet 목록을 생성합니다.
 */
export function buildActionSummary(insights: InsightV3[]): string[] {
  if (insights.length === 0) return [];

  // danger/warning 우선 → 그 다음 success
  const critical  = insights.filter(i => i.level === "danger" || i.level === "warning").slice(0, 2);
  const positive  = insights.filter(i => i.level === "success").slice(0, 1);

  return [...critical, ...positive].map(i => i.action);
}
