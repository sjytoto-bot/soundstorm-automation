// ─── featureJoin v1 ───────────────────────────────────────────────────────────
// NormalizedVideo 배열과 ThumbnailFeature 배열을 videoId 기준으로 조인한다.
// 엔진 파이프라인 이전 단계로, 피처가 보강된 데이터를 생성한다.

import type {
  NormalizedVideo,
  ThumbnailFeature,
  NormalizedVideoWithFeature,
} from "./types/normalized";

// ─── enrichWithThumbnail ──────────────────────────────────────────────────────
// @param  videos            NormalizedVideo 배열
// @param  thumbnailFeatures ThumbnailFeature 배열 (videoId가 일치하는 항목만 조인)
// @returns NormalizedVideoWithFeature[]
//          thumbnailFeature가 없는 영상은 thumbnailFeature: undefined로 반환

export function enrichWithThumbnail(
  videos:            NormalizedVideo[],
  thumbnailFeatures: ThumbnailFeature[],
): NormalizedVideoWithFeature[] {
  const featureMap = new Map<string, ThumbnailFeature>(
    thumbnailFeatures.map(f => [f.videoId, f])
  );

  return videos.map(v => ({
    ...v,
    thumbnailFeature: featureMap.get(v.videoId),
  }));
}

// ─── filterByConfidence ───────────────────────────────────────────────────────
// 썸네일 분석 신뢰도 threshold 이상인 영상만 필터링한다.
// @param  enriched    enrichWithThumbnail 결과
// @param  minConfidence  0~1 (기본값 0.5)

export function filterByConfidence(
  enriched:      NormalizedVideoWithFeature[],
  minConfidence: number = 0.5,
): NormalizedVideoWithFeature[] {
  return enriched.filter(v =>
    v.thumbnailFeature === undefined ||
    v.thumbnailFeature.confidence >= minConfidence
  );
}

// ─── groupByThumbnailSimilarity ───────────────────────────────────────────────
// thumbnailFeature.dominantColors 유사성 기준으로 영상을 클러스터링한다.
// 현재 구현: 단순 hasText 기준 2-그룹 (텍스트 있음 / 없음)
// @returns { withText: string[], withoutText: string[] }  (videoId 배열)

export function groupByThumbnailSimilarity(
  enriched: NormalizedVideoWithFeature[],
): { withText: string[]; withoutText: string[] } {
  const withText:    string[] = [];
  const withoutText: string[] = [];

  for (const v of enriched) {
    if (v.thumbnailFeature?.hasText) {
      withText.push(v.videoId);
    } else {
      withoutText.push(v.videoId);
    }
  }

  return { withText, withoutText };
}
