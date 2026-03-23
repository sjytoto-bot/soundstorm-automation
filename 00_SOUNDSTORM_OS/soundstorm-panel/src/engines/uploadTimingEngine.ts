// ─── uploadTimingEngine v1 ────────────────────────────────────────────────────
// 영상 업로드 시간대별 성과를 분석하고 최적 업로드 시간을 추천한다.
//
// 입력: TrackResult[]
//   — publishedAt, avgViews, engagementRate, retentionRate 참조
//
// 분석 단계:
//   1. publishedAt → getHours() 로 hour(0~23) 추출
//   2. hour별 TrackResult 그룹화
//   3. 시간대별 avgViews / avgEngagement / avgRetention 계산
//   4. timeScore = avgViews*0.5 + avgEngagement*0.3 + avgRetention*0.2
//   5. score 최고 hour → bestHour
//
// publishedAt 누락 영상은 분석에서 제외한다.

import type { TrackResult } from "../core/enginePipeline";

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface HourDistribution {
  hour:       number;
  score:      number;
  videoCount: number;
}

export interface UploadTimingResult {
  /** 최적 업로드 시간 (0~23, 분석 대상 없으면 -1) */
  bestHour:     number;
  /** 최적 시간대의 timeScore */
  bestScore:    number;
  /** 시간대별 분포 (score 내림차순) */
  distribution: HourDistribution[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function parseHour(publishedAt: string | undefined): number | null {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (isNaN(d.getTime())) return null;
  return d.getHours();
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 업로드 시간대별 성과를 분석하고 최적 업로드 시간을 반환한다.
 *
 * @param tracks  TrackResult[]  enginePipeline tracks 출력 (mutate 완료 상태)
 * @returns       UploadTimingResult
 */
export function run(tracks: TrackResult[]): UploadTimingResult {
  // hour별 버킷
  interface Bucket {
    views:      number[];
    engagement: number[];
    retention:  number[];
  }

  const buckets = new Map<number, Bucket>();

  for (const t of tracks) {
    const hour = parseHour(t.publishedAt);
    if (hour === null) continue;

    if (!buckets.has(hour)) {
      buckets.set(hour, { views: [], engagement: [], retention: [] });
    }
    const b = buckets.get(hour)!;
    b.views.push(t.avgViews);
    b.engagement.push(t.engagementRate);
    b.retention.push(t.retentionRate ?? 0);
  }

  if (buckets.size === 0) {
    return { bestHour: -1, bestScore: 0, distribution: [] };
  }

  // 시간대별 score 계산
  const distribution: HourDistribution[] = Array.from(buckets.entries())
    .map(([hour, b]) => {
      const avgViews      = mean(b.views);
      const avgEngagement = mean(b.engagement);
      const avgRetention  = mean(b.retention);
      const score =
        avgViews      * 0.5 +
        avgEngagement * 0.3 +
        avgRetention  * 0.2;
      return {
        hour,
        score:      Math.max(0, score),
        videoCount: b.views.length,
      };
    })
    // score 내림차순 정렬
    .sort((a, b) => b.score - a.score);

  const best = distribution[0];

  return {
    bestHour:     best.hour,
    bestScore:    best.score,
    distribution,
  };
}
