// ─── PlatformMapper ───────────────────────────────────────────────────────────
// 분류된 referrer 목록을 카테고리별로 집계
//
// 출력: CategoryGroup[] — 카테고리별 플랫폼 목록 + 합산 지표

import type { ClassifiedReferrer } from "./ReferrerClassifier";
import { PlatformCategory, CATEGORY_LABEL } from "./externalPlatformCategory";

export interface CategoryGroup {
  category:      PlatformCategory;
  categoryLabel: string;
  totalViews:    number;
  totalRatio:    number;
  platforms:     ClassifiedReferrer[];
  topPlatform:   ClassifiedReferrer;
}

export function groupByCategory(classified: ClassifiedReferrer[]): CategoryGroup[] {
  const map = new Map<PlatformCategory, ClassifiedReferrer[]>();

  for (const ref of classified) {
    const group = map.get(ref.category) ?? [];
    group.push(ref);
    map.set(ref.category, group);
  }

  return Array.from(map.entries())
    .map(([category, platforms]) => {
      platforms.sort((a, b) => b.views - a.views);
      return {
        category,
        categoryLabel: CATEGORY_LABEL[category],
        totalViews:    platforms.reduce((s, p) => s + p.views, 0),
        totalRatio:    platforms.reduce((s, p) => s + p.ratio, 0),
        platforms,
        topPlatform:   platforms[0],
      };
    })
    .filter(g => g.category !== PlatformCategory.UNKNOWN)
    .sort((a, b) => b.totalViews - a.totalViews);
}
