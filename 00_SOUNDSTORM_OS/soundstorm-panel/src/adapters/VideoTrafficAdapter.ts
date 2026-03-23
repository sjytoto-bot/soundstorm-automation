// ─── VideoTrafficAdapter ──────────────────────────────────────────────────────
// _VideoTraffic 시트 → Map<videoId, DimensionRow[]>
//
// 소스: api_data_shuttler.py → _VideoTraffic 시트
// 컬럼: video_id | traffic_source | views | ratio | fetched_at
//
// 특성:
//   - 최근 30일 이내 업로드 영상만 수집 (quota 절약)
//   - API 반환값 → 정규화 키로 통일 (SOURCE_NORMALIZE)
//   - views 내림차순 정렬 (비율 높은 소스 먼저)
//   - ratio = 0 안전 처리 (divide by zero 방지)

import type { DimensionRow } from "./AnalyticsAdapter";

// YouTube Analytics API v2 insightTrafficSourceType 정규화
// 구버전(RELATED_VIDEO) → 현재 키(SUGGESTED_VIDEO) 통일
const SOURCE_NORMALIZE: Record<string, string> = {
  RELATED_VIDEO:        "SUGGESTED_VIDEO",  // legacy alias
  BROWSE:               "BROWSE_FEATURES",  // legacy alias
  YT_SEARCH_SUGGESTION: "YT_SEARCH",        // legacy alias
};

function normalizeSource(raw: string): string {
  return SOURCE_NORMALIZE[raw] ?? raw;
}

export function buildVideoTrafficMap(
  rows: Record<string, string>[],
): Map<string, DimensionRow[]> {
  // videoId → normalizedSource → views 합산
  const viewsMap = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const videoId = (row["video_id"]       ?? "").trim();
    const rawSrc  = (row["traffic_source"] ?? "").trim();
    const views   = Number(row["views"]    ?? 0);

    if (!videoId || !rawSrc) continue;

    const source = normalizeSource(rawSrc);
    if (!viewsMap.has(videoId)) viewsMap.set(videoId, new Map());
    const sm = viewsMap.get(videoId)!;
    sm.set(source, (sm.get(source) ?? 0) + views);
  }

  const result = new Map<string, DimensionRow[]>();
  for (const [videoId, sourceMap] of viewsMap) {
    const total = Array.from(sourceMap.values()).reduce((a, b) => a + b, 0);
    if (total === 0) continue;   // ratio 계산 안전성: 전체 0이면 skip
    const dimRows: DimensionRow[] = Array.from(sourceMap.entries())
      .map(([key, views]) => ({
        key,
        views,
        ratio: views / total,   // total > 0 보장됨
      }))
      .sort((a, b) => b.ratio - a.ratio);
    result.set(videoId, dimRows);
  }

  return result;
}
