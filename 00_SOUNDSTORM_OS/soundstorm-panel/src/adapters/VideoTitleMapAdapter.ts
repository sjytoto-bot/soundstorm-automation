// ─── VideoTitleMapAdapter ─────────────────────────────────────────────────────
// _RawData_Master / SS_음원마스터_최종 시트에서 video_id → 표시 제목 매핑을 읽는다.
//
// 컬럼 우선순위:
//   1. 곡명
//   2. track_name
//   3. youtube_title
//   4. title
// 반환: Record<videoId, 표시 제목>

const TITLE_KEYS = ["곡명", "track_name", "youtube_title", "title", "Title", "제목"];

function pickTitle(row: Record<string, string>): string {
  for (const key of TITLE_KEYS) {
    const v = (row[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

export async function fetchVideoTitleMap(): Promise<Record<string, string>> {
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) return {};

    const primary: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["_RawData_Master"]);
    let rows: Record<string, string>[] = primary["_RawData_Master"] ?? [];

    if (!rows.length) {
      try {
        const fallback: Record<string, Record<string, string>[]> =
          await api.fetchSheetVideos(["SS_음원마스터_최종"]);
        rows = fallback["SS_음원마스터_최종"] ?? [];
      } catch (err) {
        console.warn("[VideoTitleMapAdapter] SS_음원마스터_최종 fallback 실패:", err);
      }
    }

    const map: Record<string, string> = {};
    for (const row of rows) {
      const videoId = (row["video_id"] ?? row["videoId"] ?? "").trim();
      if (!videoId) continue;
      const title = pickTitle(row);
      if (title) map[videoId] = title;
    }

    console.log(`[VideoTitleMapAdapter] ${Object.keys(map).length}개 매핑 로드`);
    return map;
  } catch (err) {
    console.warn("[VideoTitleMapAdapter] 실패 — 빈 맵 반환:", err);
    return {};
  }
}
