// ─── AudienceAnalyzer ────────────────────────────────────────────────────────
// 분석 파이프라인 4단계: platform → audience → consumption reason
//
// ClassifiedReferrer를 AudienceEnrichedReferrer로 확장.
// EXTERNAL_PLATFORM_PROFILES 기반으로 사용자 유형·소비 이유·전략을 부착.

import type { ClassifiedReferrer } from "./ReferrerClassifier";
import { EXTERNAL_PLATFORM_PROFILES, type PlatformProfile } from "./externalPlatformProfiles";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface AudienceEnrichedReferrer extends ClassifiedReferrer {
  audienceProfile: PlatformProfile | null;
  audience:        string;   // 편의 접근자
  consumptionReason: string; // 편의 접근자
  suggestedStrategy: string; // 편의 접근자
}

// ─── 분석 함수 ────────────────────────────────────────────────────────────────

export function enrichWithAudience(
  ref: ClassifiedReferrer,
): AudienceEnrichedReferrer {
  const profile = EXTERNAL_PLATFORM_PROFILES[ref.platform] ?? null;

  return {
    ...ref,
    audienceProfile:   profile,
    audience:          profile?.audience  ?? "일반 사용자",
    consumptionReason: profile?.reason    ?? "외부 링크 유입",
    suggestedStrategy: profile?.strategy  ?? "유입 채널 모니터링",
  };
}

export function enrichAll(
  classified: ClassifiedReferrer[],
): AudienceEnrichedReferrer[] {
  return classified.map(enrichWithAudience);
}

// ─── 도메인별 audience 요약 ───────────────────────────────────────────────────

export interface AudienceSummaryItem {
  audience:  string;
  reason:    string;
  platforms: string[];
  views:     number;
}

export function summarizeAudiences(
  enriched: AudienceEnrichedReferrer[],
): AudienceSummaryItem[] {
  const map = new Map<string, { reason: string; platforms: string[]; views: number }>();

  for (const ref of enriched) {
    const existing = map.get(ref.audience) ?? {
      reason:    ref.consumptionReason,
      platforms: [],
      views:     0,
    };
    existing.views += ref.views;
    if (!existing.platforms.includes(ref.platformLabel)) {
      existing.platforms.push(ref.platformLabel);
    }
    map.set(ref.audience, existing);
  }

  return Array.from(map.entries())
    .map(([audience, { reason, platforms, views }]) => ({
      audience,
      reason,
      platforms,
      views,
    }))
    .sort((a, b) => b.views - a.views);
}
