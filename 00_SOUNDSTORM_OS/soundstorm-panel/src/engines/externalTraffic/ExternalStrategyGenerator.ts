// ─── ExternalStrategyGenerator ───────────────────────────────────────────────
// AudienceEnrichedReferrer[] → ExternalInsight[] 생성
//
// 파이프라인:
//   AudienceEnrichedReferrer[]   (audience 정보 포함)
//   → EXTERNAL_INSIGHT_RULES 순서대로 매칭
//   → impact / confidence 보정 (QualityAnalyzer)
//   → audience / consumptionReason 부착
//   → 중복 rule 제거 (같은 rule id는 최다 조회수 1개만)
//   → priority_score 정렬
//   → 최대 5개 반환

import type { AudienceEnrichedReferrer } from "./AudienceAnalyzer";
import { EXTERNAL_INSIGHT_RULES, type ExternalInsight } from "./externalInsightRules";
import { calcImpact, calcConfidence }                   from "./ExternalQualityAnalyzer";

export function generateExternalInsights(
  enriched:              AudienceEnrichedReferrer[],
  channelAvgDurationSec: number = 0,
): ExternalInsight[] {
  if (enriched.length === 0) return [];

  const totalViews  = enriched.reduce((s, r) => s + r.views, 0);
  const usedRuleIds = new Set<string>();
  const insights: ExternalInsight[] = [];

  // views 내림차순으로 정렬된 referrer에 대해 규칙 적용
  const sorted = [...enriched].sort((a, b) => b.views - a.views);

  for (const ref of sorted) {
    for (const rule of EXTERNAL_INSIGHT_RULES) {
      if (usedRuleIds.has(rule.id)) continue;
      if (!rule.match(ref)) continue;

      const { action, reason } = rule.build(ref);
      const impact     = calcImpact(ref, totalViews, rule.baseImpact);
      const confidence = calcConfidence(ref, rule.baseConfidence);

      insights.push({
        platform:          ref.platform,
        category:          ref.categoryLabel,
        intent:            ref.intentLabel,
        audience:          ref.audience,
        consumptionReason: ref.consumptionReason,
        action,
        reason,
        impact,
        confidence,
      });

      usedRuleIds.add(rule.id);
      break;
    }

    if (insights.length >= 5) break;
  }

  // priority_score = impact × confidence / 100 기준 정렬
  return insights
    .sort((a, b) => (b.impact * b.confidence) - (a.impact * a.confidence))
    .slice(0, 5);
}
