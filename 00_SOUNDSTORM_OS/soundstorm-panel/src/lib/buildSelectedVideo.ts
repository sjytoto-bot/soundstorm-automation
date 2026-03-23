// ─── buildSelectedVideo selector ─────────────────────────────────────────────
// video_id 기준 4개 소스 JOIN → SelectedVideo 반환
//
// 원칙:
//   - null = 데이터 없음. 0 = 실제 0. (reachAdapter v2부터 impressions/ctr은 null 반환)
//   - onClick 안에서 이 함수를 인라인하지 않는다.
//   - 모든 KPI fallback은 normalizeMetrics()로 통일한다.
//
// 필드별 우선 소스:
//   views             → reachRows 우선 (실시간성)
//   likes             → reachRows 우선 (_RawData_Master), hitVideos fallback
//   watchTimeMin      → reachRows 우선 (total_watch_time_min), hitVideos fallback
//   avgDurationSec    → reachRows 우선 (avg_watch_time_sec), hitVideos fallback
//   impressions       → reach(null-safe) → diagnostics fallback
//   ctr               → reach(null-safe) → diagnostics fallback
//   title             → base → hit → diag → "Untitled Video"
//   comments/shares/runtimeSec/subscribersGained → reachRows 전용

import type { UploadedVideo }    from "@/controllers/useExecutionController";
import type { ReachRow }         from "@/adapters/reachAdapter";
import type { DimensionRow, TrendPoint } from "@/adapters/AnalyticsAdapter";
import type { SelectedVideo }    from "@/components/dashboard/VideoDetailModal";
import type { VideoClickContext } from "@/types/dashboardData";
import { getSafeTitle }          from "@/utils/videoTitle";

// ─── normalizeMetrics ─────────────────────────────────────────────────────────
// 모든 KPI 계산에서 동일한 fallback 체인을 보장하는 헬퍼.
// reach → diagnostics 순서로 null-safe하게 조회.
// reachAdapter v2부터 impressions/ctr은 빈 셀 → null 반환 (0 ≠ absent).

interface MetricSources {
  reachImpressions: number | null | undefined;
  reachCtr:         number | null | undefined;
  diagImpressions?: number | null;
  diagCtr?:         number | null;
}

export function normalizeMetrics(src: MetricSources): {
  impressions: number | null;
  ctr:         number | null;
} {
  return {
    impressions: src.reachImpressions ?? src.diagImpressions ?? null,
    ctr:         src.reachCtr         ?? src.diagCtr         ?? null,
  };
}

/**
 * video_id 기준으로 4개 소스를 JOIN해 SelectedVideo를 반환한다.
 * Map 기반 O(1) 조회. impressions/ctr fallback은 normalizeMetrics()로 통일.
 *
 * @param diagnostics - Video_Diagnostics 시트 데이터 (선택적).
 *   impressions/ctr/title이 reachRows에 없을 때 fallback으로 사용.
 * @param clickContext - 드릴다운 진입 컨텍스트 (선택적). 모달 상단 배너 표시용.
 */
export function buildSelectedVideo(
  videoId:        string,
  uploadedVideos: UploadedVideo[],
  reachRows:      ReachRow[],
  hitVideos:      DimensionRow[],
  diagnostics?:   any[],
  options?: {
    clickContext?: VideoClickContext;
    videoTrendMap?: Map<string, TrendPoint[]>;
  },
): SelectedVideo {
  const reachMap = new Map(reachRows.map(r => [r.video_id, r]));
  const hitMap   = new Map(hitVideos.map(h => [h.key,      h]));
  const diagMap  = new Map((diagnostics ?? []).map((d: any) => [d.videoId, d]));

  const base  = uploadedVideos.find(v => v.videoId === videoId);
  const reach = reachMap.get(videoId);
  const hit   = hitMap.get(videoId);
  const diag  = diagMap.get(videoId);

  // reachRows(_RawData_Master) 우선, hitVideos(Analytics_all) fallback
  const likes =
    (reach?.likes          != null) ? reach.likes          :
    (hit?.likes            != null) ? hit.likes            : null;
  const watchTimeMin =
    (reach?.watchTimeMin   != null) ? reach.watchTimeMin   :
    (hit?.watchTimeMin     != null) ? hit.watchTimeMin     : null;
  const avgDurationSec =
    (reach?.avgDurationSec != null) ? reach.avgDurationSec :
    (hit?.avgDurationSec   != null) ? hit.avgDurationSec   : null;

  // impressions/ctr: normalizeMetrics()로 통일 (reach → diag fallback)
  const { impressions, ctr } = normalizeMetrics({
    reachImpressions: reach?.impressions,
    reachCtr:         reach?.ctr,
    diagImpressions:  diag?.impressions,
    diagCtr:          diag?.ctr,
  });

  const latestTrendDate = options?.videoTrendMap?.get(videoId)?.at(-1)?.date ?? null;
  const dataLastUpdated = latestTrendDate
    ? new Date(`${latestTrendDate}T00:00:00Z`).toISOString()
    : (reach?.ctrUpdatedAt ?? null);

  // title: 등록 영상 → Reach(track_name fallback) → 진단 track_name → 히트 영상 → 진단 제목
  const title = getSafeTitle(
    base?.title ??
    reach?.title ??
    diag?.trackName ??
    hit?.title ??
    diag?.title,
  );

  return {
    key:               videoId,
    title,
    views:             reach?.views ?? hit?.views ?? diag?.views ?? 0,
    likes,
    watchTimeMin,
    avgDurationSec,
    impressions,
    ctr,
    comments:          (reach?.comments          != null) ? reach.comments          : null,
    shares:            (reach?.shares            != null) ? reach.shares            : null,
    runtimeSec:        (reach?.runtimeSec        != null) ? reach.runtimeSec        : null,
    subscribersGained: (reach?.subscribersGained != null) ? reach.subscribersGained : null,
    dataLastUpdated,
    clickContext:      options?.clickContext,
  };
}
