// ─── ThumbnailStyleAdapter ────────────────────────────────────────────────────
// Thumbnail_Style_Performance 시트에서 스타일별 CTR 성능 데이터를 읽는다.

export interface ThumbnailStyle {
  style:            string;
  videos:           number;
  weightedCtr:      number;
  avgCtr:           number;
  medianCtr:        number;
  totalImpressions: number;
}

function toNum(v: string, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function mapRow(row: Record<string, string>): ThumbnailStyle | null {
  const style = (row["style_tag"] ?? "").trim();
  if (!style) return null;

  return {
    style,
    videos:           toNum(row["video_count"]),
    weightedCtr:      toNum(row["weighted_ctr"]),
    avgCtr:           toNum(row["avg_ctr"]),
    medianCtr:        toNum(row["median_ctr"]),
    totalImpressions: toNum(row["total_impressions"]),
  };
}

export async function fetchThumbnailStyles(): Promise<ThumbnailStyle[]> {
  console.log("[ThumbnailStyleAdapter] fetchThumbnailStyles 호출");
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) throw new Error("IPC bridge 없음");

    const result: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["Thumbnail_Style_Performance"]);

    const rows = result["Thumbnail_Style_Performance"] ?? [];
    const mapped = rows.map(mapRow).filter((r): r is ThumbnailStyle => r !== null);

    // weighted_ctr DESC 정렬
    mapped.sort((a, b) => b.weightedCtr - a.weightedCtr);

    console.log(`[ThumbnailStyleAdapter] ${mapped.length}개 스타일 로드`);
    return mapped;
  } catch (err) {
    console.warn("[ThumbnailStyleAdapter] 실패 — 빈 배열 반환:", err);
    return [];
  }
}
