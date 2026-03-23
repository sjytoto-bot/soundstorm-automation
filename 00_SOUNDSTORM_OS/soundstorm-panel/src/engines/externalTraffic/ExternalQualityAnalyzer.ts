// ─── ExternalQualityAnalyzer ─────────────────────────────────────────────────
// 외부 플랫폼별 유입 품질 점수 계산
//
// quality_score = views × avgDurationSec  (raw engagement proxy)
// retention_ratio = avgDurationSec / channelAvgDurationSec  (상대적 시청 유지율)
// normalized_score = 0-100 (데이터셋 내 상대 정규화)

import type { ClassifiedReferrer } from "./ReferrerClassifier";

export interface QualityScore {
  platform:        string;
  platformLabel:   string;
  views:           number;
  avgDurationSec:  number;
  retentionRatio:  number;   // 0-2+ (1.0 = 채널 평균과 동일)
  qualityScore:    number;   // 0-100 (정규화)
  rawEngagement:   number;   // views × avgDurationSec
}

export function computeQualityScores(
  classified:           ClassifiedReferrer[],
  channelAvgDurationSec: number = 0,
): QualityScore[] {
  // raw engagement 계산
  const raws = classified.map(r => ({
    platform:       r.platform,
    platformLabel:  r.platformLabel,
    views:          r.views,
    avgDurationSec: r.avgDurationSec,
    raw:            r.views * Math.max(r.avgDurationSec, 1),
  }));

  const maxRaw = Math.max(...raws.map(r => r.raw), 1);

  return raws.map(r => {
    const retentionRatio = channelAvgDurationSec > 0
      ? r.avgDurationSec / channelAvgDurationSec
      : 1;

    return {
      platform:       r.platform,
      platformLabel:  r.platformLabel,
      views:          r.views,
      avgDurationSec: r.avgDurationSec,
      retentionRatio,
      qualityScore:   Math.round((r.raw / maxRaw) * 100),
      rawEngagement:  r.raw,
    };
  }).sort((a, b) => b.qualityScore - a.qualityScore);
}

// impact 보정: views 비중 + quality score 혼합
export function calcImpact(
  ref:        ClassifiedReferrer,
  totalViews: number,
  baseImpact: number,
): number {
  const viewsRatio = totalViews > 0 ? ref.views / totalViews : 0;
  const bonus = Math.min(viewsRatio * 30, 20);
  return Math.min(Math.round(baseImpact + bonus), 100);
}

// confidence 보정: avgDuration 데이터 존재 시 +10
export function calcConfidence(
  ref:            ClassifiedReferrer,
  baseConfidence: number,
): number {
  const hasDuration = ref.avgDurationSec > 0;
  return Math.min(baseConfidence + (hasDuration ? 10 : 0), 100);
}
