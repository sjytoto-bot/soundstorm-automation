// ─── StrategyEngine ───────────────────────────────────────────────────────────
// Analytics 데이터셋 → 고수준 콘텐츠 전략 생성
//
// 입력: StrategyEngineInput
// 출력: Strategy[]

import type { ThumbnailStyle }  from "@/adapters/ThumbnailStyleAdapter";
import type { VideoDiagnostic } from "@/adapters/VideoDiagnosticsAdapter";
import type { ReferenceVideo }  from "@/adapters/ReferenceVideosAdapter";
import type { CtrBucket }       from "@/controllers/useAnalyticsController";

// ─── 입력 타입 ────────────────────────────────────────────────────────────────

export interface StrategyEngineInput {
  diagnostics:     VideoDiagnostic[];   // Video_Diagnostics
  thumbnailStyles: ThumbnailStyle[];    // Thumbnail_Style_Performance
  referenceVideos: ReferenceVideo[];    // Reference_Videos
  ctrBuckets:      CtrBucket[];         // CTR Distribution
}

// ─── Strategy 타입 ────────────────────────────────────────────────────────────

export interface Strategy {
  id:           string;
  type:         "fix" | "production" | "operation" | "keyword";
  title:        string;
  description:  string;
  impact?:      string;
  data?:        unknown;
}

// ─── generateStrategies ───────────────────────────────────────────────────────

export function generateStrategies(
  input: StrategyEngineInput,
): Strategy[] {
  const { diagnostics, thumbnailStyles, referenceVideos } = input;

  const strategies: Strategy[] = [];

  // ── Strategy #1: Thumbnail Style Strategy ────────────────────────────────
  if (thumbnailStyles.length > 0) {
    const topStyles = [...thumbnailStyles]
      .sort((a, b) => b.weightedCtr - a.weightedCtr)
      .slice(0, 3);

    strategies.push({
      id:          "thumbnail-style",
      type:        "production",
      title:       "어두운 고대비 썸네일 전략 추천",
      description: "채널 평균 CTR보다 높은 썸네일 스타일 발견",
      data:        { topStyles },
    });
  }

  // ── Strategy #2: Thumbnail Test Strategy ─────────────────────────────────
  const weakThumbnailVideos = diagnostics.filter(
    d => d.diagnosis === "THUMBNAIL_WEAK",
  );

  if (weakThumbnailVideos.length > 0) {
    strategies.push({
      id:          "thumbnail-test",
      type:        "fix",
      title:       "썸네일 교체 테스트 필요 영상 발견",
      description: `썸네일 개선 필요 영상 ${weakThumbnailVideos.length}개 발견`,
      impact:      "CTR 개선 가능",
      data:        { weakThumbnailVideos },
    });
  }

  // ── Strategy #3: CTR Pattern Strategy ────────────────────────────────────
  if (referenceVideos.length >= 3) {
    strategies.push({
      id:          "ctr-pattern",
      type:        "production",
      title:       "초반 CTR 강한 영상 패턴 발견",
      description: "CTR 상위 영상에서 콘텐츠 패턴 발견",
      data:        { referenceVideos },
    });
  }

  return strategies;
}
