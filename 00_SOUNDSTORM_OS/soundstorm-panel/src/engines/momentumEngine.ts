// ─── momentumEngine v1 ────────────────────────────────────────────────────────
// 영상별 성장 모멘텀 산출 — 조기 vs 최근 기간 조회수 비교로 가속도를 측정한다.
// NormalizedVideo는 일별 데이터가 없으므로 publishedAt 기준 age × views 추정 사용.

import type { NormalizedVideo } from "../core/types/normalized";

// ─── Options ──────────────────────────────────────────────────────────────────

export interface MomentumOptions {
  /** 비교 기준일 (기본값: 현재 시각) */
  referenceDate?: Date;
  /** "최근" 기간 임계값 (일 기준, 기본값: 30) */
  recentDays?: number;
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export type MomentumLabel = "Rising" | "Stable" | "Declining" | "Unknown";

export interface VideoMomentum {
  videoId: string;

  /** 업로드 후 경과일 */
  ageDays: number;

  /** 일평균 조회수 (totalViews / ageDays) */
  dailyAvgViews: number;

  /**
   * 모멘텀 지수 (0~1+)
   * 30일 미만 신규 영상 → 1.0 (판단 불가)
   * 30일 이상 → dailyAvgViews / channelDailyAvg
   */
  momentumIndex: number;

  /** 모멘텀 레이블 */
  label: MomentumLabel;
}

export interface MomentumResult {
  byVideo:           VideoMomentum[];
  channelDailyAvg:   number;
  risingCount:       number;
  decliningCount:    number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysBetween(isoDate: string, ref: Date): number {
  if (!isoDate) return 0;
  const ms = ref.getTime() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function toLabel(index: number, ageDays: number): MomentumLabel {
  if (ageDays < 30) return "Unknown";   // 신규 영상 — 판단 유보
  if (index >= 1.2) return "Rising";
  if (index >= 0.8) return "Stable";
  return "Declining";
}

// ─── run ──────────────────────────────────────────────────────────────────────

export function run(
  data:    NormalizedVideo[],
  options: MomentumOptions = {},
): MomentumResult {
  const ref       = options.referenceDate ?? new Date();
  const recentDays = options.recentDays   ?? 30;

  // 채널 일평균 조회수 산출 (ageDays > recentDays 영상만 참여)
  const mature = data.filter(v => daysBetween(v.publishedAt, ref) > recentDays);
  const channelDailyAvg = mature.length > 0
    ? mature.reduce((s, v) => {
        const age = Math.max(1, daysBetween(v.publishedAt, ref));
        return s + (v.views / age);
      }, 0) / mature.length
    : 0;

  const byVideo: VideoMomentum[] = data.map(v => {
    const ageDays      = Math.max(1, daysBetween(v.publishedAt, ref));
    const dailyAvgViews = v.views / ageDays;
    const momentumIndex = channelDailyAvg > 0
      ? dailyAvgViews / channelDailyAvg
      : 1.0;
    const label = toLabel(momentumIndex, ageDays);
    return { videoId: v.videoId, ageDays, dailyAvgViews, momentumIndex, label };
  });

  return {
    byVideo,
    channelDailyAvg,
    risingCount:   byVideo.filter(v => v.label === "Rising").length,
    decliningCount: byVideo.filter(v => v.label === "Declining").length,
  };
}
