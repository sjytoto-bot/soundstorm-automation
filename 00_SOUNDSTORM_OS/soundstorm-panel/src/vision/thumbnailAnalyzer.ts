// ─── thumbnailAnalyzer v1 (stub) ──────────────────────────────────────────────
// 썸네일 비주얼 분석 엔진 — 현재 버전은 stub 반환.
// 추후 Google Cloud Vision API 또는 로컬 ONNX 모델로 교체 예정.
//
// 실제 구현 시 교체 포인트:
//   1. fetchThumbnailBase64(url)     → 썸네일 이미지 다운로드
//   2. callVisionApi(base64)         → Cloud Vision API 호출
//   3. parseDominantColors(response) → 색상 팔레트 추출
//   4. detectText(response)          → OCR 결과 파싱
//   5. detectFaces(response)         → 얼굴 감지

import type { ThumbnailFeature, ThumbnailComparison } from "../core/types/normalized";

// ─── analyzeThumbnail ─────────────────────────────────────────────────────────
// @param  videoId  분석할 YouTube 영상 ID
// @param  _url     썸네일 URL (현재 stub에서는 미사용)
// @returns ThumbnailFeature (stub 기본값)

export async function analyzeThumbnail(
  videoId: string,
  _url?:   string,
): Promise<ThumbnailFeature> {
  // TODO: 실제 Vision API 연동으로 교체
  return {
    videoId,
    dominantColors: ["#FFFFFF", "#000000"],
    hasText:        false,
    detectedText:   "",
    faceCount:      0,
    brightness:     0.5,
    contrast:       0.5,
    confidence:     0,           // 0 = stub (신뢰할 수 없음 표시)
    analyzedAt:     new Date().toISOString(),
  };
}

// ─── compareThumbnails ────────────────────────────────────────────────────────
// 두 ThumbnailFeature 간 유사도를 계산한다.
// 현재 버전: 색상 배열 길이 + 텍스트 유무 기반 간이 비교.
// @returns ThumbnailComparison

export function compareThumbnails(
  a: ThumbnailFeature,
  b: ThumbnailFeature,
): ThumbnailComparison {
  // 색상 유사도 — 공통 색상 수 / 최대 색상 수
  const setA = new Set(a.dominantColors.map(c => c.toLowerCase()));
  const setB = new Set(b.dominantColors.map(c => c.toLowerCase()));
  const intersection = [...setA].filter(c => setB.has(c)).length;
  const colorSimilarity =
    Math.max(setA.size, setB.size) > 0
      ? intersection / Math.max(setA.size, setB.size)
      : 0;

  // 구성 유사도 — 텍스트 유무 + 얼굴 수 차이 (간이)
  const textMatch    = a.hasText === b.hasText ? 1 : 0;
  const faceDelta    = Math.abs(a.faceCount - b.faceCount);
  const faceScore    = Math.max(0, 1 - faceDelta / 3);
  const compositionSimilarity = (textMatch + faceScore) / 2;

  const overallSimilarity =
    Math.round((colorSimilarity * 0.5 + compositionSimilarity * 0.5) * 1000) / 1000;

  return {
    videoIdA: a.videoId,
    videoIdB: b.videoId,
    colorSimilarity:      Math.round(colorSimilarity * 1000) / 1000,
    compositionSimilarity: Math.round(compositionSimilarity * 1000) / 1000,
    overallSimilarity,
    meta: {
      method:      "histogram",   // stub 구현 기준
      comparedAt:  new Date().toISOString(),
    },
  };
}

// ─── batchAnalyze ─────────────────────────────────────────────────────────────
// 여러 영상을 순차적으로 분석한다 (API 요청 수 제한 고려).
// @param videos  [{ videoId, thumbnailUrl }] 배열

export async function batchAnalyze(
  videos: { videoId: string; thumbnailUrl: string }[],
): Promise<ThumbnailFeature[]> {
  const results: ThumbnailFeature[] = [];
  for (const { videoId, thumbnailUrl } of videos) {
    const feature = await analyzeThumbnail(videoId, thumbnailUrl);
    results.push(feature);
  }
  return results;
}
