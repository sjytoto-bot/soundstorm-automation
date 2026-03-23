// ─── Reach Intelligence Engine v1 ─────────────────────────────────────────────
// views / impressions / ctr 를 입력받아 영상을 세 카테고리로 분류한다.
//
// 출력:
//   low_ctr_videos          — CTR 낮은 영상 (노출 대비 클릭 부진)
//   high_impression_low_ctr — 노출은 높지만 CTR이 낮은 영상 (썸네일·제목 개선 후보)
//   high_ctr_videos         — CTR 높은 영상 (알고리즘 친화적 참조 영상)
//
// 임계값 (기본값):
//   CTR_LOW_THRESHOLD   = 0.02  (2%)
//   CTR_HIGH_THRESHOLD  = 0.05  (5%)
//   IMP_HIGH_PERCENTILE = 0.5   (상위 50% = 중앙값 기준)
//
// 순수 함수 — IPC / API 호출 없음. 테스트 가능.

import type { ReachRow } from "../adapters/reachAdapter";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ReachVideoEntry {
  video_id: string;
  title?: string;
  views: number;
  impressions: number;
  ctr: number;
  /** CTR을 퍼센트 문자열로 표현 (예: "3.41%") */
  ctr_pct: string;
}

export interface ReachIntelligenceResult {
  /** CTR < CTR_LOW_THRESHOLD 인 영상 (CTR 오름차순) */
  low_ctr_videos: ReachVideoEntry[];
  /** impressions >= imp_median AND CTR < CTR_HIGH_THRESHOLD 인 영상 (impressions 내림차순) */
  high_impression_low_ctr: ReachVideoEntry[];
  /** CTR >= CTR_HIGH_THRESHOLD 인 영상 (CTR 내림차순) */
  high_ctr_videos: ReachVideoEntry[];
  /** 분석 메타데이터 */
  meta: {
    total_input: number;
    imp_median: number;
    ctr_low_threshold: number;
    ctr_high_threshold: number;
    analyzed_at: string;
  };
}

export interface ReachEngineOptions {
  /** CTR 낮음 기준 (기본 0.02 = 2%) */
  ctrLowThreshold?: number;
  /** CTR 높음 기준 (기본 0.05 = 5%) */
  ctrHighThreshold?: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toEntry(row: ReachRow): ReachVideoEntry {
  return {
    video_id:    row.video_id,
    title:       row.title,
    views:       row.views,
    impressions: row.impressions ?? 0,
    ctr:         row.ctr ?? 0,
    ctr_pct:     `${((row.ctr ?? 0) * 100).toFixed(2)}%`,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ─── analyzeReach ──────────────────────────────────────────────────────────────

/**
 * Reach 데이터를 분류·분석한다.
 *
 * @param rows    reachAdapter.fetchReachData() 결과
 * @param options 임계값 오버라이드 (선택)
 */
export function analyzeReach(
  rows: ReachRow[],
  options: ReachEngineOptions = {},
): ReachIntelligenceResult {
  const CTR_LOW  = options.ctrLowThreshold  ?? 0.02;
  const CTR_HIGH = options.ctrHighThreshold ?? 0.05;

  // impressions가 0인 행은 분석에서 제외 (데이터 없음)
  const valid = rows.filter(r => (r.impressions ?? 0) > 0);

  const impValues  = valid.map(r => r.impressions ?? 0);
  const impMedian  = median(impValues);

  console.log(
    `[reachIntelligenceEngine] 입력: ${rows.length}행 / 유효(imp>0): ${valid.length}행 ` +
    `/ imp_median: ${impMedian} / CTR_LOW: ${CTR_LOW} / CTR_HIGH: ${CTR_HIGH}`
  );

  // ── 분류 ─────────────────────────────────────────────────────────────────

  const low_ctr_videos = valid
    .filter(r => (r.ctr ?? 1) < CTR_LOW)
    .sort((a, b) => (a.ctr ?? 0) - (b.ctr ?? 0))                // CTR 낮은 순
    .map(toEntry);

  const high_impression_low_ctr = valid
    .filter(r => (r.impressions ?? 0) >= impMedian && (r.ctr ?? 1) < CTR_HIGH)
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)) // 노출 높은 순
    .map(toEntry);

  const high_ctr_videos = valid
    .filter(r => (r.ctr ?? 0) >= CTR_HIGH)
    .sort((a, b) => (b.ctr ?? 0) - (a.ctr ?? 0))                // CTR 높은 순
    .map(toEntry);

  console.log(
    `[reachIntelligenceEngine] 결과 — ` +
    `low_ctr: ${low_ctr_videos.length} / ` +
    `high_imp_low_ctr: ${high_impression_low_ctr.length} / ` +
    `high_ctr: ${high_ctr_videos.length}`
  );

  return {
    low_ctr_videos,
    high_impression_low_ctr,
    high_ctr_videos,
    meta: {
      total_input:         rows.length,
      imp_median:          impMedian,
      ctr_low_threshold:   CTR_LOW,
      ctr_high_threshold:  CTR_HIGH,
      analyzed_at:         new Date().toISOString(),
    },
  };
}
