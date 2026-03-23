// ─── thumbnailAnalyzerEngine v1 ───────────────────────────────────────────────
// 썸네일 특성(밝기·대비·색상분산)과 영상 성과(CTR proxy)의 상관관계를 분석한다.
//
// 입력: TrackResult[]
//   — thumbnailUrl, avgViews, engagementRate, retentionRate 를 참조
//
// 썸네일 특성 추출:
//   현재 단계 — Vision API 미연결, videoId 기반 결정적 더미값 생성
//   TODO      — Vision API 연결 후 실제 이미지 분석으로 교체
//
// 더미값 생성 방식:
//   seededRandom(videoId + salt) → 동일 videoId = 항상 동일한 결과
//   brightness     : 0.3 ~ 0.8
//   contrast       : 0.2 ~ 0.9
//   colorVariance  : 0.1 ~ 0.7
//
// CTR proxy:
//   ctrProxy = engagementRate * 0.6 + retentionRate * 0.4
//
// 상관관계: Pearson r (brightness↔ctr, contrast↔ctr, colorVariance↔ctr)

import type { TrackResult } from "../core/enginePipeline";

// ─── 더미 특성 ────────────────────────────────────────────────────────────────

interface ThumbnailFeatures {
  brightness:    number;
  contrast:      number;
  colorVariance: number;
}

/**
 * videoId 문자열을 시드로 0~1 범위 결정적 난수를 생성한다.
 * 동일한 videoId + salt 조합은 항상 동일한 값을 반환한다.
 */
function seededRandom(seed: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 0xffffffff;
}

function inRange(seed: string, salt: number, min: number, max: number): number {
  return min + seededRandom(seed, salt) * (max - min);
}

/**
 * TODO: Vision API 연결 후 실제 이미지 분석으로 교체
 * 현재는 videoId 기반 결정적 더미값 반환
 */
function extractFeatures(videoId: string, _thumbnailUrl: string): ThumbnailFeatures {
  return {
    brightness:    inRange(videoId, 1, 0.3, 0.8),
    contrast:      inRange(videoId, 2, 0.2, 0.9),
    colorVariance: inRange(videoId, 3, 0.1, 0.7),
  };
}

// ─── Pearson 상관계수 ─────────────────────────────────────────────────────────

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;

  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num  += dx * dy;
    dx2  += dx * dx;
    dy2  += dy * dy;
  }

  const den = Math.sqrt(dx2 * dy2);
  if (den === 0) return 0;
  return Math.round((num / den) * 1000) / 1000;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ThumbnailAnalysisResult {
  /** brightness ↔ ctrProxy 상관계수 (-1 ~ +1) */
  brightnessCorrelation:    number;
  /** contrast ↔ ctrProxy 상관계수 (-1 ~ +1) */
  contrastCorrelation:      number;
  /** colorVariance ↔ ctrProxy 상관계수 (-1 ~ +1) */
  colorCorrelation:         number;
  /** 분석된 영상 수 */
  sampleSize:               number;
  /** Vision API 연결 여부 (현재 항상 false) */
  visionApiConnected:       boolean;
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 썸네일 특성과 영상 성과의 상관관계를 분석한다.
 *
 * @param tracks  TrackResult[]  thumbnailUrl, engagementRate, retentionRate 필요
 * @returns       ThumbnailAnalysisResult
 */
export function run(tracks: TrackResult[]): ThumbnailAnalysisResult {
  const brightnessVals:    number[] = [];
  const contrastVals:      number[] = [];
  const colorVarianceVals: number[] = [];
  const ctrProxyVals:      number[] = [];

  for (const t of tracks) {
    const features = extractFeatures(t.videoId, t.thumbnailUrl ?? "");

    // CTR proxy: engagementRate * 0.6 + retentionRate * 0.4
    const ctrProxy = t.engagementRate * 0.6 + (t.retentionRate ?? 0) * 0.4;

    brightnessVals.push(features.brightness);
    contrastVals.push(features.contrast);
    colorVarianceVals.push(features.colorVariance);
    ctrProxyVals.push(ctrProxy);
  }

  return {
    brightnessCorrelation: pearson(brightnessVals,    ctrProxyVals),
    contrastCorrelation:   pearson(contrastVals,       ctrProxyVals),
    colorCorrelation:      pearson(colorVarianceVals,  ctrProxyVals),
    sampleSize:            tracks.length,
    visionApiConnected:    false,
  };
}
