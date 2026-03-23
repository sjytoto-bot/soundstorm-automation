// ─── ActionGenerator ─────────────────────────────────────────────────────────
// PHASE 8E+ — 모든 엔진 결과 → ActionCard[] 통합 생성
//
// 입력:
//   InsightV3[]       (InsightEngine    → FIX 카드)
//   OpportunityResult (OpportunityEngine → OPPORTUNITY 카드)
//   StrategyResult    (StrategyEngine   → STRATEGY 카드)
//
// 출력: ActionCard[]  — impact 기준 정렬 (HIGH → MEDIUM → LOW)
//
// 매핑 규칙:
//   InsightV3.level = "danger"  → FIX / HIGH
//   InsightV3.level = "warning" → FIX / MEDIUM
//   searchOpp(hot)              → OPPORTUNITY / HIGH
//   searchOpp(growing)          → OPPORTUNITY / MEDIUM
//   algorithmOpp(high_retention)→ OPPORTUNITY / HIGH
//   algorithmOpp(viral)         → OPPORTUNITY / MEDIUM
//   externalOpp(trending)       → OPPORTUNITY / HIGH
//   externalOpp(active)         → OPPORTUNITY / MEDIUM
//   contentStrategy(high)       → STRATEGY / HIGH
//   seoStrategy(high)           → STRATEGY / HIGH
//   uploadStrategy(conf>=0.7)   → STRATEGY / HIGH

import type { InsightV3 }        from "@/engines/insightEngineV3";
import type { OpportunityResult } from "@/engines/opportunity/OpportunityEngine";
import type { StrategyResult }    from "@/engines/strategy/StrategyEngine";

// ─── ActionCard 타입 ──────────────────────────────────────────────────────────

export type ActionCardType   = "FIX" | "OPPORTUNITY" | "STRATEGY";
export type ActionCardImpact = "HIGH" | "MEDIUM" | "LOW";

export interface ActionCard {
  id:          string;
  type:        ActionCardType;
  title:       string;
  description: string;
  impact:      ActionCardImpact;
  confidence?: number;           // 0.0–1.0
  metrics?: {
    growthRate?:   number;       // % (양수 = 성장, 음수 = 하락)
    retention?:    number;       // ratio (0–1)
    viewsChange?:  number;       // %
  };
  tags?: string[];
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

/** generateActionCards 호출 당 독립 카운터 — 모듈 재사용 시 key 충돌 방지 */
function makeIdFactory() {
  let seq = 0;
  return (prefix: string) => `${prefix}_${++seq}`;
}

function impactOrder(impact: ActionCardImpact): number {
  return impact === "HIGH" ? 0 : impact === "MEDIUM" ? 1 : 2;
}

/** undefined / 잘못된 값에 대한 impact 기본값 */
function safeImpact(v: ActionCardImpact | undefined): ActionCardImpact {
  return v === "HIGH" || v === "MEDIUM" || v === "LOW" ? v : "MEDIUM";
}

// ─── FIX 카드 생성 (InsightV3 → FIX) ─────────────────────────────────────────

function buildFixCards(
  insights: InsightV3[],
  nextId:   (prefix: string) => string,
): ActionCard[] {
  const cards: ActionCard[] = [];
  for (const ins of insights) {
    if (ins.level !== "danger" && ins.level !== "warning") continue;
    const rawImpact: ActionCardImpact = ins.level === "danger" ? "HIGH" : "MEDIUM";
    const metricVal = ins.metric ? parseFloat(ins.metric) : undefined;
    cards.push({
      id:          nextId("fix"),
      type:        "FIX",
      title:       ins.action,
      description: ins.insight,
      impact:      safeImpact(rawImpact),
      confidence:  ins.confidence_score / 100,
      metrics: {
        viewsChange: metricVal && !isNaN(metricVal) ? metricVal : undefined,
      },
    });
  }
  return cards;
}

// ─── OPPORTUNITY 카드 생성 ────────────────────────────────────────────────────
// opportunityActions(최대 3개)를 ActionCard로 변환
// 기존 searchOpportunities/algorithmOpportunities/externalOpportunities 루프 제거

function buildOpportunityCards(
  opp:    OpportunityResult,
  nextId: (prefix: string) => string,
): ActionCard[] {
  return opp.opportunityActions.map(a => {
    // actionType → impact 매핑
    const impact: ActionCardImpact =
      a.actionType === "METADATA_OPTIMIZATION" && a.growthRate > 15 ? "HIGH"
      : a.actionType === "NEW_SERIES_TEST"      && a.growthRate > 15 ? "HIGH"
      : a.actionType === "FORMAT_EXPANSION"                          ? "HIGH"
      : a.priority > 0.65                                            ? "MEDIUM"
      : "LOW";

    return {
      id:          nextId("opp"),
      type:        "OPPORTUNITY" as const,
      title:       a.title,
      description: a.description,
      impact:      safeImpact(impact),
      confidence:  a.confidence,
      metrics:     { growthRate: a.growthRate },
    };
  });
}

// ─── STRATEGY 카드 생성 ───────────────────────────────────────────────────────

function buildStrategyCards(
  strat:  StrategyResult,
  nextId: (prefix: string) => string,
): ActionCard[] {
  const cards: ActionCard[] = [];

  // 콘텐츠 전략
  for (const c of strat.contentStrategies.slice(0, 4)) {
    const impact: ActionCardImpact =
      c.priority === "high" ? "HIGH" : c.priority === "medium" ? "MEDIUM" : "LOW";
    cards.push({
      id:          nextId("strat_content"),
      type:        "STRATEGY",
      title:       c.title,
      description: c.reason,
      impact:      safeImpact(impact),
      tags:        c.tags.filter(Boolean).slice(0, 4),
    });
  }

  // SEO 전략 (hot/growing만, 태그 포함)
  for (const s of strat.seoStrategies.filter(x => x.priority !== "low").slice(0, 3)) {
    const impact: ActionCardImpact = s.priority === "high" ? "HIGH" : "MEDIUM";
    cards.push({
      id:          nextId("strat_seo"),
      type:        "STRATEGY",
      title:       `"${s.keyword}" 키워드 콘텐츠 최적화`,
      description: `제목 템플릿: ${s.titleTemplate}`,
      impact:      safeImpact(impact),
      metrics:     { growthRate: parseFloat(s.ratioLabel) },
      tags:        s.tags.slice(0, 5),
    });
  }

  // 업로드 전략 (전체 포함 — fallback 포함)
  for (const u of strat.uploadStrategies) {
    const impact: ActionCardImpact =
      u.confidence >= 0.7 ? "HIGH" : u.confidence >= 0.5 ? "MEDIUM" : "LOW";
    cards.push({
      id:          nextId("strat_upload"),
      type:        "STRATEGY",
      title:       u.recommendation,
      description: `[${u.typeLabel}] ${u.reason}`,
      impact:      safeImpact(impact),
      confidence:  u.confidence,
    });
  }

  return cards;
}

// ─── 메인 생성 함수 ───────────────────────────────────────────────────────────

export function generateActionCards(
  insights: InsightV3[],
  opp:      OpportunityResult,
  strat:    StrategyResult,
): ActionCard[] {
  // 호출당 독립 ID 팩토리 — React key 충돌 방지
  const nextId = makeIdFactory();

  const fixCards   = buildFixCards(insights, nextId);
  const oppCards   = buildOpportunityCards(opp, nextId);   // opportunityActions 기반, 최대 3개
  const stratCards = buildStrategyCards(strat, nextId);

  const cards: ActionCard[] = [
    ...fixCards,
    ...oppCards,
    ...stratCards,
  ];

  // impact 순(HIGH→MEDIUM→LOW), 같은 impact 내에서 type 순(FIX→OPPORTUNITY→STRATEGY)
  const impactOrd: Record<ActionCardImpact, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const typeOrd:   Record<ActionCardType,   number> = { FIX: 0, OPPORTUNITY: 1, STRATEGY: 2 };

  return cards.sort((a, b) => {
    const byImpact = impactOrd[a.impact] - impactOrd[b.impact];
    if (byImpact !== 0) return byImpact;
    return typeOrd[a.type] - typeOrd[b.type];
  });
}
