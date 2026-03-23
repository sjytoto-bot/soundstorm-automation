// ─── trafficGrowthEngine v1 ───────────────────────────────────────────────────
// 영상별 조회수 증가 속도(velocity)와 가속도(acceleration)를 분석한다.
//
// 입력:
//   data          — NormalizedVideo[]
//   perVideoDaily — Map<videoId, number[]>  (인덱스 0 = 가장 오래된 날, -1 = 오늘)
//                   미제공 시: views / daysSinceUpload 기반 추정 모드로 동작
//
// 계산 정의:
//   growthRate(i)  = (day[i] - day[i-1]) / max(1, day[i-1])
//   velocity       = 최근 7일 growthRate 평균  (추정 모드: avgDaily / channelMedianDaily - 1)
//   acceleration   = mean(growthRates[-3:]) - mean(growthRates[-6:-3])
//                   (추정 모드: 0)
//
// 판단 기준:
//   velocity > 0.30           → "Exploding"
//   0.10 ≤ velocity ≤ 0.30   → "Growing"
//   velocity < 0.10           → "Flat"

import type { NormalizedVideo } from "../core/types/normalized";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface TrafficGrowthOptions {
  /**
   * 영상별 일별 조회수 배열.
   * 인덱스 0 = 가장 오래된 날, 마지막 = 오늘.
   * 미제공 시 views / daysSinceUpload 기반 추정으로 fallback.
   */
  perVideoDaily?: Map<string, number[]>;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export type GrowthStatus = "Exploding" | "Growing" | "Flat";

export interface VideoTrafficGrowth {
  videoId:      string;
  /** 최근 7일 일평균 조회수 증가율 (0~∞) */
  velocity:     number;
  /** 최근 3일 증가율 − 직전 3일 증가율 (양수 = 가속, 음수 = 감속) */
  acceleration: number;
  growthStatus: GrowthStatus;
  /** 추정값 여부 (perVideoDaily 미제공 시 true) */
  estimated:    boolean;
}

export interface TrafficGrowthResult {
  byVideo:        VideoTrafficGrowth[];
  explodingCount: number;
  growingCount:   number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function daysSince(publishedAt: string): number {
  if (!publishedAt) return 1;
  const d = new Date(publishedAt);
  if (isNaN(d.getTime())) return 1;
  return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

/** dailyArr로부터 growthRate 배열을 계산한다. */
function computeGrowthRates(dailyArr: number[]): number[] {
  const rates: number[] = [];
  for (let i = 1; i < dailyArr.length; i++) {
    const prev = Math.max(1, dailyArr[i - 1]);
    rates.push((dailyArr[i] - dailyArr[i - 1]) / prev);
  }
  return rates;
}

function toStatus(velocity: number): GrowthStatus {
  if (velocity > 0.30)  return "Exploding";
  if (velocity >= 0.10) return "Growing";
  return "Flat";
}

// ─── 실제 시계열 모드 ──────────────────────────────────────────────────────────

function analyzeWithTimeSeries(
  videoId:  string,
  daily:    number[],
): VideoTrafficGrowth {
  const rates = computeGrowthRates(daily);

  // velocity: 최근 7일 증가율 평균
  const last7 = rates.slice(-7);
  const velocity = mean(last7);

  // acceleration: 최근 3일 평균 − 직전 3일 평균
  const recent3 = rates.slice(-3);
  const prior3  = rates.slice(-6, -3);
  const acceleration = mean(recent3) - mean(prior3);

  return { videoId, velocity, acceleration, growthStatus: toStatus(velocity), estimated: false };
}

// ─── 추정 모드 (시계열 없음) ──────────────────────────────────────────────────
// avgDailyViews / channelMedianDailyViews - 1 을 velocity로 사용.
// 채널 중앙값보다 빠르게 조회수를 쌓으면 양수, 느리면 음수.

function analyzeEstimated(
  v:                   NormalizedVideo,
  channelMedianDaily:  number,
): VideoTrafficGrowth {
  const avgDaily   = v.views / daysSince(v.publishedAt);
  const velocity   = channelMedianDaily > 0
    ? avgDaily / channelMedianDaily - 1
    : 0;
  return {
    videoId:      v.videoId,
    velocity,
    acceleration: 0,   // 시계열 없이 가속도 계산 불가
    growthStatus: toStatus(velocity),
    estimated:    true,
  };
}

// ─── run ──────────────────────────────────────────────────────────────────────

/**
 * 영상별 조회수 증가 속도를 분석한다.
 *
 * @param data           NormalizedVideo[]
 * @param options        TrafficGrowthOptions
 * @returns              TrafficGrowthResult
 */
export function run(
  data:    NormalizedVideo[],
  options: TrafficGrowthOptions = {},
): TrafficGrowthResult {
  const { perVideoDaily } = options;

  // 채널 중앙값 일평균 조회수 (추정 모드 velocity 기준점)
  const channelMedianDaily = median(
    data.map(v => v.views / daysSince(v.publishedAt)),
  );

  const byVideo: VideoTrafficGrowth[] = data.map(v => {
    const daily = perVideoDaily?.get(v.videoId);
    return daily && daily.length >= 2
      ? analyzeWithTimeSeries(v.videoId, daily)
      : analyzeEstimated(v, channelMedianDaily);
  });

  return {
    byVideo,
    explodingCount: byVideo.filter(r => r.growthStatus === "Exploding").length,
    growingCount:   byVideo.filter(r => r.growthStatus === "Growing").length,
  };
}
