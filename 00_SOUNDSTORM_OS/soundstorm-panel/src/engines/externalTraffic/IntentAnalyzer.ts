// ─── IntentAnalyzer ───────────────────────────────────────────────────────────
// category 그룹 → dominant intent 파악
// 다수 플랫폼이 같은 intent를 가질 때 해당 intent를 그룹의 대표 intent로 선택

import type { ClassifiedReferrer } from "./ReferrerClassifier";
import type { ExternalIntent }     from "./externalIntentMap";
import { INTENT_LABEL }            from "./externalIntentMap";

export interface IntentSummary {
  intent:      ExternalIntent;
  intentLabel: string;
  views:       number;
  platforms:   string[];
}

export function summarizeIntents(classified: ClassifiedReferrer[]): IntentSummary[] {
  const intentMap = new Map<ExternalIntent, { views: number; platforms: string[] }>();

  for (const ref of classified) {
    const existing = intentMap.get(ref.intent) ?? { views: 0, platforms: [] };
    existing.views += ref.views;
    if (!existing.platforms.includes(ref.platformLabel)) {
      existing.platforms.push(ref.platformLabel);
    }
    intentMap.set(ref.intent, existing);
  }

  return Array.from(intentMap.entries())
    .map(([intent, { views, platforms }]) => ({
      intent,
      intentLabel: INTENT_LABEL[intent],
      views,
      platforms,
    }))
    .sort((a, b) => b.views - a.views);
}
