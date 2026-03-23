// ─── recentPerformance selector ──────────────────────────────────────────────
// JOIN 전담 레이어 — UI 컴포넌트는 이 함수 반환값만 소비한다.
//
// 원칙:
//   - UploadedVideo (useExecutionController) × ReachRow (reachAdapter)
//   - video_id 기준 JOIN
//   - publishedAt 기준 기간 필터
//   - UI 레이어에서 JOIN 로직 절대 금지

import type { UploadedVideo } from "@/controllers/useExecutionController";
import type { ReachRow }       from "@/adapters/reachAdapter";
import { normalizeMetrics }    from "@/lib/buildSelectedVideo";

// ─── fallback 소스 최소 타입 ──────────────────────────────────────────────────
// Video_Diagnostics 시트 행 — impressions/ctr이 reachRows에 없을 때 보완.
// 전체 VideoDiagnostic 타입 의존 없이 필요한 필드만 선언.
interface DiagFallback {
  videoId:      string;
  impressions?: number | null;
  ctr?:         number | null;
}

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface RecentPerfVideo {
  videoId:        string;
  title:          string;
  publishedAt:    string;
  views:          number | null;
  impressions:    number | null;
  ctr:            number | null;
  /** views + impressions + ctr 모두 존재 여부 — UI 분기용 */
  hasFullMetrics: boolean;
}

// ─── getRecentPerformanceVideos ───────────────────────────────────────────────

/**
 * 최근 N일 업로드된 영상에 ReachRow 지표를 JOIN해 반환한다.
 *
 * impressions/ctr은 _RawData_Master에 컬럼이 없으면 0으로 채워지는 어댑터 한계가 있다.
 * diagnostics(Video_Diagnostics 시트)를 전달하면 0인 경우 실값으로 보완한다.
 * buildSelectedVideo와 동일한 fallback 전략.
 *
 * @param uploadedVideos useExecutionController.uploadedThisWeek
 * @param reachRows      reachAdapter.fetchReachData()
 * @param days           기간 (기본 30일)
 * @param diagnostics    Video_Diagnostics 행 배열 (선택) — impressions/ctr fallback
 */
export function getRecentPerformanceVideos(
  uploadedVideos: UploadedVideo[],
  reachRows:      ReachRow[],
  days = 30,
  diagnostics:    DiagFallback[] = [],
): RecentPerfVideo[] {
  const cutoff  = Date.now() - days * 24 * 60 * 60 * 1000;
  const diagMap = new Map(diagnostics.map(d => [d.videoId, d]));

  return uploadedVideos
    .filter(v => v.publishedAt && new Date(v.publishedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map(v => {
      const reach = reachRows.find(r => r.video_id === v.videoId);
      const diag  = diagMap.get(v.videoId);

      const views = (reach?.views ?? 0) > 0 ? reach!.views : null;

      // impressions/ctr: normalizeMetrics()로 통일 (buildSelectedVideo와 동일 fallback 체인)
      const { impressions, ctr } = normalizeMetrics({
        reachImpressions: reach?.impressions,
        reachCtr:         reach?.ctr,
        diagImpressions:  diag?.impressions,
        diagCtr:          diag?.ctr,
      });

      return {
        videoId:        v.videoId,
        title:          v.title,
        publishedAt:    v.publishedAt,
        views,
        impressions,
        ctr,
        hasFullMetrics: views != null && impressions != null && ctr != null,
      };
    });
}
