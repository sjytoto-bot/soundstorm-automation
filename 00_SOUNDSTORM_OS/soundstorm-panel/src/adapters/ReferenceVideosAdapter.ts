// ─── ReferenceVideosAdapter ───────────────────────────────────────────────────
// Reference_Videos 시트에서 성공 영상 데이터를 읽는다.

export interface ReferenceVideo {
  videoId:     string;
  title:       string;  // 영상 제목 (없으면 videoId로 표시)
  ctr:         number;
  impressions: number;
  views:       number;
  score:       number;
  why:         string;
}

function toNum(v: string, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function mapRow(row: Record<string, string>): ReferenceVideo | null {
  const videoId = (row["video_id"] ?? "").trim();
  if (!videoId) return null;

  return {
    videoId,
    title:       (row["title"] ?? "").trim(),
    ctr:         toNum(row["ctr"]),
    impressions: toNum(row["impressions"]),
    views:       toNum(row["views"]),
    score:       toNum(row["reference_score"]),
    why:         (row["why"] ?? "").trim(),
  };
}

export async function fetchReferenceVideos(): Promise<ReferenceVideo[]> {
  console.log("[ReferenceVideosAdapter] fetchReferenceVideos 호출");
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) throw new Error("IPC bridge 없음");

    const result: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["Reference_Videos"]);

    const rows = result["Reference_Videos"] ?? [];
    const mapped = rows
      .map(mapRow)
      .filter((r): r is ReferenceVideo => r !== null && r.score > 0);

    // reference_score DESC 정렬
    mapped.sort((a, b) => b.score - a.score);

    console.log(`[ReferenceVideosAdapter] ${mapped.length}개 영상 로드`);
    return mapped;
  } catch (err) {
    console.warn("[ReferenceVideosAdapter] 실패 — 빈 배열 반환:", err);
    return [];
  }
}
