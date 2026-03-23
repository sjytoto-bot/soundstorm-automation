// ─── VideoTrendAdapter ────────────────────────────────────────────────────────
// _VideoTrend 시트 → Map<videoId, TrendPoint[]>
//
// 소스: studio_csv_ingestor.py → _VideoTrend 시트
// 컬럼: video_id | date | views
//
// 특성:
//   - 다운로드 기간(보통 28일) 한정 데이터
//   - 날짜 오름차순 정렬 (차트 렌더용)
//   - video_id 없는 행은 무시

import type { TrendPoint } from "./AnalyticsAdapter";

export function buildVideoTrendMap(
  rows: Record<string, string>[],
): Map<string, TrendPoint[]> {
  const map = new Map<string, TrendPoint[]>();

  for (const row of rows) {
    const videoId = (row["video_id"] ?? "").trim();
    const date    = (row["date"]     ?? "").trim();
    const views   = Number(row["views"] ?? 0);

    if (!videoId || !date) continue;

    if (!map.has(videoId)) map.set(videoId, []);
    map.get(videoId)!.push({ date, views });
  }

  // 날짜 오름차순 정렬 (오래된 날짜 → 최근 날짜)
  for (const [, points] of map) {
    points.sort((a, b) => a.date.localeCompare(b.date));
  }

  return map;
}
