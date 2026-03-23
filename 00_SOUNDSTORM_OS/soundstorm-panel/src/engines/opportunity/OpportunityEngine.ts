// ─── OpportunityEngine ────────────────────────────────────────────────────────
// PHASE 8D+ — Opportunity Engine 통합 (Signal → Action 파이프라인)
//
// 파이프라인:
//   Analytics + RedirectMarketingInsights
//     → SearchOpportunityAnalyzer   (raw signals)
//     → AlgorithmOpportunityAnalyzer (raw signals)
//     → ExternalOpportunityAnalyzer  (raw signals)
//     ↓
//   mergeSignals()
//     ↓
//   mapSignalsToActions()
//     ↓
//   prioritizeActions()
//     ↓
//   topActions(3)  → opportunityActions
//
// 핵심 변경:
//   - 각 Analyzer는 Signal만 제공 (텍스트 생성 없음)
//   - Action 생성 / 우선순위 / 중복 제거는 OpportunityEngine 전담
//   - 최종 OPPORTUNITY 카드 수: 최대 3개

import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import type { RedirectMarketingInsights } from "@/engines/redirectIntelligence/RedirectMarketingEngine";

import { analyzeSearchOpportunities,    type SearchOpportunity }      from "./SearchOpportunityAnalyzer";
import { analyzeAlgorithmOpportunities, type AlgorithmOpportunity }   from "./AlgorithmOpportunityAnalyzer";
import { analyzeExternalOpportunities,  type ExternalOpportunity }    from "./ExternalOpportunityAnalyzer";
import { generateRedirectRecommendations, type RedirectRecommendation } from "./RedirectRecommendationEngine";

// ─── 공개 타입 re-export ──────────────────────────────────────────────────────

export type { SearchOpportunity }       from "./SearchOpportunityAnalyzer";
export type { AlgorithmOpportunity }    from "./AlgorithmOpportunityAnalyzer";
export type { ExternalOpportunity }     from "./ExternalOpportunityAnalyzer";
export type { RedirectRecommendation }  from "./RedirectRecommendationEngine";

// ─── Signal 통합 타입 ─────────────────────────────────────────────────────────

export type OpportunitySignalType = "SEARCH" | "ALGORITHM" | "EXTERNAL";

export interface OpportunitySignal {
  type:            OpportunitySignalType;
  keyword:         string;          // 키워드 또는 영상 제목
  growthRate:      number;          // 0–100 (검색 비율 × 100 or retentionRatio × 50)
  confidence:      number;          // 0.0–1.0
  existingContent: boolean;         // 채널에 해당 키워드 관련 영상 존재 여부
  retentionRatio?: number;          // 알고리즘 신호용 (avgDuration / channelAvg)
  clicks?:         number;          // 외부 신호용
}

// ─── Action 타입 ──────────────────────────────────────────────────────────────

export type OpportunityActionType =
  | "METADATA_OPTIMIZATION"   // 기존 콘텐츠 제목/설명/태그 최적화
  | "PLAYLIST_EXPANSION"      // 재생목록 확장
  | "NEW_SERIES_TEST"         // 신규 시리즈 테스트
  | "FORMAT_EXPANSION";       // 포맷 확장 (롱폼/플레이리스트)

export interface OpportunityAction {
  actionType:  OpportunityActionType;
  keyword:     string;
  title:       string;          // ActionCard.title
  description: string;          // ActionCard.description
  priority:    number;          // 0.0–1.0 (높을수록 우선)
  confidence:  number;          // 0.0–1.0
  growthRate:  number;          // 표시용 성장률
  signal:      OpportunitySignalType;
}

// ─── 통합 결과 타입 ───────────────────────────────────────────────────────────

export interface OpportunityResult {
  // raw signals (하위 호환 — ActionGenerator 마이그레이션 완료 후 제거 가능)
  searchOpportunities:      SearchOpportunity[];
  algorithmOpportunities:   AlgorithmOpportunity[];
  externalOpportunities:    ExternalOpportunity[];
  redirectRecommendations:  RedirectRecommendation[];
  // 최종 액션 (최대 3개)
  opportunityActions:       OpportunityAction[];
  hasData:                  boolean;
}

// ─── Signal 생성 ──────────────────────────────────────────────────────────────

/** hitVideos 제목에 keyword가 포함되면 existingContent = true */
function hasExistingContent(keyword: string, hitVideos: DimensionRow[]): boolean {
  const kw = keyword.toLowerCase();
  return hitVideos.some(v => (v.title ?? v.key).toLowerCase().includes(kw));
}

function mergeSignals(
  search:    SearchOpportunity[],
  algo:      AlgorithmOpportunity[],
  external:  ExternalOpportunity[],
  hitVideos: DimensionRow[],
): OpportunitySignal[] {
  const signals: OpportunitySignal[] = [];

  // 검색 신호
  for (const s of search) {
    const growthRate = s.ratio * 100;
    const confidence =
      s.signal === "hot"     ? 0.90
      : s.signal === "growing" ? 0.70
      : 0.45;
    signals.push({
      type:            "SEARCH",
      keyword:         s.keyword,
      growthRate,
      confidence,
      existingContent: hasExistingContent(s.keyword, hitVideos),
    });
  }

  // 알고리즘 신호
  for (const a of algo) {
    if (a.signal === "steady") continue;
    const growthRate = a.retentionRatio * 50; // retentionRatio를 성장률 스케일로 변환
    const confidence =
      a.signal === "high_retention" ? 0.88
      : 0.65;
    signals.push({
      type:            "ALGORITHM",
      keyword:         a.title,
      growthRate,
      confidence,
      existingContent: true,          // 알고리즘 신호는 항상 기존 콘텐츠 기반
      retentionRatio:  a.retentionRatio,
    });
  }

  // 외부 신호
  for (const e of external) {
    if (e.signal === "emerging") continue;
    const growthRate = e.signal === "trending" ? 80 : 40;
    const confidence = e.signal === "trending" ? 0.82 : 0.60;
    signals.push({
      type:            "EXTERNAL",
      keyword:         e.community.replace(/_/g, " "),
      growthRate,
      confidence,
      existingContent: hasExistingContent(e.topSlug, hitVideos),
      clicks:          e.clicks,
    });
  }

  return signals;
}

// ─── Action 매핑 ──────────────────────────────────────────────────────────────

function mapSignalToAction(sig: OpportunitySignal): OpportunityAction {
  const kw = sig.keyword;
  let actionType: OpportunityActionType;
  let title: string;
  let description: string;

  if (sig.type === "ALGORITHM") {
    // 유지율 높은 영상 → 포맷 확장 or 재생목록
    const ratio = sig.retentionRatio ?? 1;
    if (ratio > 2.0) {
      actionType  = "FORMAT_EXPANSION";
      title       = `"${kw}" 포맷을 확장하세요`;
      description = `채널 평균 대비 ${(ratio * 100).toFixed(0)}% 시청 유지 — 롱폼·플레이리스트로 확장 시 알고리즘 노출 증가 기대`;
    } else {
      actionType  = "PLAYLIST_EXPANSION";
      title       = `"${kw}" 관련 영상을 재생목록으로 묶으세요`;
      description = `시청 유지율 상위 영상 — 재생목록 연결로 연속 시청 유도 가능`;
    }
  } else if (sig.existingContent) {
    // 키워드 상승 + 콘텐츠 존재 → 메타데이터 최적화
    actionType  = "METADATA_OPTIMIZATION";
    title       = `신규 영상 제목에 "${kw}" 키워드를 포함하세요`;
    description = `검색 유입 ${sig.growthRate.toFixed(1)}% 성장 중 — 제목·설명·해시태그에 "${kw}" 통일 적용으로 검색 노출 확대`;
  } else {
    // 키워드 상승 + 콘텐츠 없음 → 신규 시리즈 테스트
    actionType  = "NEW_SERIES_TEST";
    title       = `"${kw}" 주제로 신규 시리즈를 테스트하세요`;
    description = `성장률 ${sig.growthRate.toFixed(1)}% — 채널에 해당 키워드 콘텐츠 없음, 소규모 테스트 업로드로 수요 검증 권장`;
  }

  // 우선순위 점수: growth(0.4) + confidence(0.3) + engagementImpact(0.3)
  const normalizedGrowth    = Math.min(sig.growthRate / 100, 1.0);
  const engagementImpact    =
    sig.type === "EXTERNAL"  ? Math.min((sig.clicks ?? 0) / 200, 1.0)
    : sig.type === "ALGORITHM" ? Math.min((sig.retentionRatio ?? 1) / 3, 1.0)
    : normalizedGrowth;

  const priority =
    normalizedGrowth * 0.4 +
    sig.confidence   * 0.3 +
    engagementImpact * 0.3;

  return {
    actionType,
    keyword:     kw,
    title,
    description,
    priority:    Math.round(priority * 1000) / 1000,
    confidence:  sig.confidence,
    growthRate:  sig.growthRate,
    signal:      sig.type,
  };
}

// ─── 중복 제거 + 우선순위 정렬 + 제한 ────────────────────────────────────────

function prioritizeActions(actions: OpportunityAction[], limit = 3): OpportunityAction[] {
  // 중복 제거: actionType + keyword 조합 기준
  const seen = new Set<string>();
  const unique = actions.filter(a => {
    const key = `${a.actionType}::${a.keyword.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 우선순위 내림차순
  unique.sort((a, b) => b.priority - a.priority);

  // 액션 타입 다양성 보장: 같은 actionType 연속 방지 (가능하면)
  const result: OpportunityAction[] = [];
  const usedTypes = new Set<OpportunityActionType>();

  // 1차: 각 타입별 최우선 1개씩
  for (const a of unique) {
    if (result.length >= limit) break;
    if (!usedTypes.has(a.actionType)) {
      usedTypes.add(a.actionType);
      result.push(a);
    }
  }

  // 2차: 남은 슬롯 채우기 (우선순위순)
  for (const a of unique) {
    if (result.length >= limit) break;
    if (!result.includes(a)) result.push(a);
  }

  return result.slice(0, limit);
}

// ─── 통합 분석 함수 ───────────────────────────────────────────────────────────

export function analyzeOpportunities(
  keywords:              DimensionRow[],
  hitVideos:             DimensionRow[],
  channelAvgDurationSec: number,
  marketing:             RedirectMarketingInsights,
): OpportunityResult {
  const searchOpportunities    = analyzeSearchOpportunities(keywords);
  const algorithmOpportunities = analyzeAlgorithmOpportunities(hitVideos, channelAvgDurationSec);
  const externalOpportunities  = analyzeExternalOpportunities(marketing);
  const redirectRecommendations = generateRedirectRecommendations(
    hitVideos,
    marketing.communities,
  );

  // Signal 통합 → Action 매핑 → 우선순위 정렬 → 최대 3개
  const signals          = mergeSignals(searchOpportunities, algorithmOpportunities, externalOpportunities, hitVideos);
  const actions          = signals.map(mapSignalToAction);
  const opportunityActions = prioritizeActions(actions, 3);

  const hasData =
    searchOpportunities.length > 0 ||
    algorithmOpportunities.length > 0 ||
    externalOpportunities.length > 0;

  return {
    searchOpportunities,
    algorithmOpportunities,
    externalOpportunities,
    redirectRecommendations,
    opportunityActions,
    hasData,
  };
}
