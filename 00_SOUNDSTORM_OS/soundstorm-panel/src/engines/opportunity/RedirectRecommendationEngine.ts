// ─── RedirectRecommendationEngine ────────────────────────────────────────────
// PHASE 8D — 외부 홍보용 콘텐츠 추천
//
// 가장 성과가 높은 영상을 가장 반응이 좋은 커뮤니티에 매칭
//
// 입력:
//   videos:      DimensionRow[]       (hitVideos — all-time rankings)
//   communities: CommunityResult[]    (Phase 8C — redirect 커뮤니티)
//
// 출력: RedirectRecommendation[]
//
// 매칭 전략:
//   1) 커뮤니티 slug 키워드 ↔ 영상 제목 키워드 매칭 (slug에서 키워드 추출)
//   2) 매칭 없으면 상위 영상 × 상위 커뮤니티 직접 조합
//   confidence = (clicks / maxClicks) * 0.5 + (views / maxViews) * 0.5

import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import type { CommunityResult } from "@/engines/redirectIntelligence/CommunityAnalyzer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface RedirectRecommendation {
  slug:            string;     // 추천 링크 슬러그 (커뮤니티 topSlug or 신규)
  videoId:         string;
  title:           string;
  targetCommunity: string;
  reason:          string;
  confidence:      number;     // 0.0 – 1.0
  confidenceLabel: string;     // "높음" | "중간" | "낮음"
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function confidenceLabel(c: number): string {
  if (c >= 0.7) return "높음";
  if (c >= 0.4) return "중간";
  return "낮음";
}

/** slug 문자열에서 검색 키워드 추출 (underscore/hyphen → words) */
function slugKeywords(slug: string): string[] {
  return slug.toLowerCase().split(/[_\-\s]+/).filter(w => w.length > 1);
}

/** 영상 제목이 slug 키워드를 포함하면 매칭 점수 반환 (0 = 불일치) */
function matchScore(title: string, slugWords: string[]): number {
  const t = title.toLowerCase();
  return slugWords.filter(w => t.includes(w)).length;
}

// ─── 추천 생성 ────────────────────────────────────────────────────────────────

export function generateRedirectRecommendations(
  videos:      DimensionRow[],
  communities: CommunityResult[],
): RedirectRecommendation[] {
  if (videos.length === 0 || communities.length === 0) return [];

  const maxViews  = videos[0]?.views ?? 1;
  const maxClicks = communities[0]?.clicks ?? 1;

  const results: RedirectRecommendation[] = [];
  const usedPairs = new Set<string>();

  // 1차: slug 키워드 ↔ 영상 제목 매칭
  for (const comm of communities.slice(0, 5)) {
    const allSlugs = comm.slugs.length > 0 ? comm.slugs : [comm.community];
    let bestVideo: DimensionRow | null = null;
    let bestSlug  = allSlugs[0];
    let bestScore = 0;

    for (const slug of allSlugs) {
      const words = slugKeywords(slug);
      for (const video of videos.slice(0, 10)) {
        const score = matchScore(video.title ?? "", words);
        if (score > bestScore) {
          bestScore = score;
          bestVideo = video;
          bestSlug  = slug;
        }
      }
    }

    if (bestVideo && bestScore > 0) {
      const pairKey = `${comm.community}::${bestVideo.key}`;
      if (!usedPairs.has(pairKey)) {
        usedPairs.add(pairKey);
        const confidence = Math.min(
          (comm.clicks / maxClicks) * 0.5 + (bestVideo.views / maxViews) * 0.5,
          1.0,
        );
        results.push({
          slug:            bestSlug,
          videoId:         bestVideo.key,
          title:           bestVideo.title ?? bestVideo.key,
          targetCommunity: comm.community,
          reason:          `"${bestSlug}" 링크와 영상 주제 키워드 일치`,
          confidence:      Math.round(confidence * 100) / 100,
          confidenceLabel: confidenceLabel(confidence),
        });
      }
    }
  }

  // 2차: 매칭 없는 커뮤니티 → 상위 영상 직접 매핑
  for (const comm of communities.slice(0, 5)) {
    const alreadyMatched = results.some(r => r.targetCommunity === comm.community);
    if (alreadyMatched) continue;

    for (const video of videos.slice(0, 3)) {
      const pairKey = `${comm.community}::${video.key}`;
      if (!usedPairs.has(pairKey)) {
        usedPairs.add(pairKey);
        const confidence = Math.min(
          (comm.clicks / maxClicks) * 0.4 + (video.views / maxViews) * 0.4,
          0.75,
        );
        const slug = comm.slugs[0] ?? comm.community;
        results.push({
          slug,
          videoId:         video.key,
          title:           video.title ?? video.key,
          targetCommunity: comm.community,
          reason:          `${comm.community.replace(/_/g, " ")} 커뮤니티 engagement 기반 추천`,
          confidence:      Math.round(confidence * 100) / 100,
          confidenceLabel: confidenceLabel(confidence),
        });
        break;
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
