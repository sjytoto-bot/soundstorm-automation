// ─── VideoDiagnosticsAdapter ──────────────────────────────────────────────────
// Video_Diagnostics 시트에서 영상별 진단 데이터를 읽는다.

export interface VideoDiagnostic {
  videoId:            string;
  title:              string;    // 영상 제목
  trackName?:         string;    // 곡명/track_name fallback
  ctr:                number;
  impressions:        number;
  impressionsPrev:    number;    // 직전 실행 노출수 (IMPRESSION_DROP 감지용)
  impressionsChange:  number | null; // (impressions - prev) / prev — null=prev 없음
  views:              number;
  avgWatchTime:       number | null;  // 평균 시청 시간 (초) — RETENTION_WEAK 진단용
  retentionRate:      number | null;  // 시청유지율 (0~1) — null 허용
  // 진단 3계층
  problemType:        string;    // IMPRESSION_DROP | CTR_WEAK | RETENTION_WEAK | NORMAL 등
  trafficSourceType:  string;    // BROWSE | SUGGESTED | EXTERNAL | UNKNOWN | NONE
  severity:           string;    // CRITICAL | HIGH | MEDIUM | NONE
  diagnosis:          string;    // 세부 진단 코드 (BROWSE_DROP / THUMBNAIL_WEAK 등)
  confidence:         number;
  recommendation:     string;
  // 중복 row 처리용 — 시트 내 행 순서 (높을수록 최신)
  rowIndex:           number;
}

function toNum(v: string, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function toNumOrNull(v: string | undefined): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function mapRow(row: Record<string, string>, rowIndex: number): VideoDiagnostic | null {
  const videoId = (row["video_id"] ?? "").trim();
  if (!videoId) return null;

  const impChangeRaw = row["impressions_change"];
  const impressionsChange =
    impChangeRaw === "" || impChangeRaw == null ? null : toNum(impChangeRaw);

  return {
    videoId,
    title:              (row["title"]               ?? "").trim(),
    trackName:          ((row["track_name"] ?? row["곡명"] ?? "").trim()) || undefined,
    ctr:                toNum(row["ctr"]),
    impressions:        toNum(row["impressions"]),
    impressionsPrev:    toNum(row["impressions_prev"]),
    impressionsChange,
    views:              toNum(row["views"]),
    avgWatchTime:       toNumOrNull(row["avg_watch_time"]),
    retentionRate:      toNumOrNull(row["retention_rate"]),
    problemType:        (row["problem_type"]         ?? "NORMAL").trim(),
    trafficSourceType:  (row["traffic_source_type"]  ?? "NONE").trim(),
    severity:           (row["severity"]             ?? "NONE").trim(),
    diagnosis:          (row["diagnosis"]            ?? "").trim(),
    confidence:         toNum(row["confidence"]),
    recommendation:     (row["recommendation"]       ?? "").trim(),
    rowIndex,
  };
}

export async function fetchVideoDiagnostics(): Promise<VideoDiagnostic[]> {
  console.log("[VideoDiagnosticsAdapter] fetchVideoDiagnostics 호출");
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) throw new Error("IPC bridge 없음");

    const result: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["Video_Diagnostics"]);

    const rows = result["Video_Diagnostics"] ?? [];
    // rowIndex: 시트 내 행 순서 — 높을수록 최신 (중복 row 처리 시 기준)
    const mapped = rows
      .map((row, i) => mapRow(row, i))
      .filter((r): r is VideoDiagnostic => r !== null);

    console.log(`[VideoDiagnosticsAdapter] ${mapped.length}행 로드`);
    return mapped;
  } catch (err) {
    console.warn("[VideoDiagnosticsAdapter] 실패 — 빈 배열 반환:", err);
    return [];
  }
}
