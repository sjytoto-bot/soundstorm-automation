// ─── GoogleSheetAdapter v2 ─────────────────────────────────────────────────────
// Google Sheets 원본 행 데이터를 NormalizedVideo 배열로 변환한다.
// 실제 API 연동 전 단계 — 행 구조는 추후 확정 후 매핑 업데이트 필요.

import type { NormalizedVideo } from "../core/types/normalized";

// ─── 원본 행 타입 (Google Sheets gspread 반환 구조 기준) ──────────────────────
// 열 순서: 곡명 | video_id | 조회수 | 좋아요 | 댓글 | 수익 | 업로드일
export interface SheetRow {
  video_id: string;
  title?: string;
  views?: string | number;
  likes?: string | number;
  comments?: string | number;
  revenue?: string | number;
  published_at?: string;
  watch_time_min?: string | number;
  avg_view_duration?: string | number;
  subscriber_change?: string | number;
  thumbnail_url?: string;
  tags?: string;        // comma-separated
  duration_sec?: string | number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | undefined, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map(t => t.trim()).filter(Boolean);
}

/**
 * 컬럼 헤더 정규화: 소문자 변환 + 공백/언더스코어 제거
 * "업로드일" / "Published At" / "upload_date" → 전부 동일 키로 매칭
 */
function normalize(key: string): string {
  return key.toLowerCase().replace(/[\s_]/g, "");
}

// ─── adapt ────────────────────────────────────────────────────────────────────
// @param  rows  Google Sheets에서 읽어온 원본 행 배열
// @returns NormalizedVideo[]  (video_id가 없는 행은 필터링됨)

// ─── RawVideoRow ──────────────────────────────────────────────────────────────
// Google Sheets에서 읽어온 영상 기본 데이터 (엔진 파이프라인 투입 전 단계)

export interface RawVideoRow {
  videoId: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  watchTimeMinutes: number;
  uploadDate: string;
  thumbnailUrl: string;
  fetchedAt?: string;   // data_fetched_at (조회수 추이 계산용)
  // ── 트래픽 소스 비율 (옵션) ──────────────────────────────────────────────
  trafficSuggestedPct?: number;
  trafficSearchPct?:    number;
  trafficBrowsePct?:    number;
  trafficInternalPct?:  number;
  trafficExternalPct?:  number;
}

// 알려진 열 이름 패턴 (영문 키 + 한국어 헤더 + 실제 시트 헤더 모두 지원)
const COL_ALIASES: Record<string, string[]> = {
  videoId: ["video_id", "videoId", "영상ID", "Video ID"],
  title: ["youtube_title", "track_name", "title", "곡명", "제목", "Title"],
  views: ["views", "조회수", "Views"],
  likes: ["likes", "좋아요", "Likes"],
  comments: ["comments", "댓글", "Comments"],
  watchTimeMinutes: ["total_watch_time_min", "watch_time_min", "watchTimeMinutes", "시청시간(분)", "Watch Time (minutes)"],
  uploadDate: ["upload_date", "published_at", "uploadDate", "업로드일", "Published At"],
  thumbnailUrl: ["썸네일URL", "thumbnail_url", "thumbnailUrl"],
  fetchedAt: ["data_fetched_at", "fetched_at", "fetchedAt"],
  // ── 트래픽 소스 열 별칭 ──────────────────────────────────────────────────
  trafficSuggestedPct: ["traffic_suggested_pct", "suggested_pct"],
  trafficSearchPct:    ["traffic_search_pct",    "search_pct"],
  trafficBrowsePct:    ["traffic_browse_pct",    "browse_pct"],
  trafficInternalPct:  ["traffic_internal_pct",  "internal_pct", "internal_ratio"],
  trafficExternalPct:  ["traffic_external_pct",  "external_pct"],
};

/**
 * 정규화된 키 기준으로 행에서 값을 찾는다.
 * 실제 시트 헤더가 aliases 중 어느 것과도 정확히 일치하지 않아도
 * normalize() 후 일치하면 매칭된다.
 */
function pickVal(row: Record<string, string>, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalize);
  for (const [k, v] of Object.entries(row)) {
    if (normalizedAliases.includes(normalize(k))) return v;
  }
  return "";
}

const POSSIBLE_VIDEO_ID_KEYS = ["video_id", "videoId", "VIDEO_ID", "id"];

function mapRow(row: Record<string, string>): RawVideoRow | null {
  const videoIdKey = Object.keys(row).find(k => POSSIBLE_VIDEO_ID_KEYS.includes(k));
  if (!videoIdKey) {
    console.warn("[Sheets] video_id column not found in row:", row);
  }
  const videoId = pickVal(row, COL_ALIASES.videoId).trim();
  if (!videoId) return null;
  function buildThumbnailUrl(vId: string): string {
    return `https://i.ytimg.com/vi/${vId}/maxresdefault.jpg`;
  }

  const uploadDate = pickVal(row, COL_ALIASES.uploadDate);
  if (!uploadDate) {
    console.warn("[Sheets] ❌ uploadDate missing — videoId:", videoId, "| row keys:", Object.keys(row));
  }

  return {
    videoId,
    title: pickVal(row, COL_ALIASES.title),
    views: toNum(pickVal(row, COL_ALIASES.views)),
    likes: toNum(pickVal(row, COL_ALIASES.likes)),
    comments: toNum(pickVal(row, COL_ALIASES.comments)),
    watchTimeMinutes: toNum(pickVal(row, COL_ALIASES.watchTimeMinutes)),
    uploadDate,
    thumbnailUrl: pickVal(row, COL_ALIASES.thumbnailUrl) || buildThumbnailUrl(videoId),
    fetchedAt:    pickVal(row, COL_ALIASES.fetchedAt) || undefined,
    // ── 트래픽 소스 (있는 경우에만 파싱) ────────────────────────────────
    trafficSuggestedPct: toNum(pickVal(row, COL_ALIASES.trafficSuggestedPct)) || undefined,
    trafficSearchPct:    toNum(pickVal(row, COL_ALIASES.trafficSearchPct))    || undefined,
    trafficBrowsePct:    toNum(pickVal(row, COL_ALIASES.trafficBrowsePct))    || undefined,
    trafficInternalPct:  toNum(pickVal(row, COL_ALIASES.trafficInternalPct))  || undefined,
    trafficExternalPct:  toNum(pickVal(row, COL_ALIASES.trafficExternalPct))  || undefined,
  };
}

const PRIMARY_SHEET_NAME = "_RawData_Master" as const;
const FALLBACK_SHEET_NAME = "SS_음원마스터_최종" as const;

// ─── 에러 코드 ────────────────────────────────────────────────────────────────
// null          : 정상
// "SYNC_FAILED" : Sheets 연결 실패, 스냅샷도 없음
// "STALE_SNAPSHOT:ISO_DATE" : 스냅샷 데이터 사용 중 (날짜 포함)

export type SyncError = null | "SYNC_FAILED" | `STALE_SNAPSHOT:${string}`;

export interface FetchSheetVideosResult {
  videos: RawVideoRow[];
  error:  SyncError;
}

// ─── 스냅샷 (localStorage + IPC 파일 이중화) ─────────────────────────────────
// Primary     : Google Sheets fetch
// Fallback 1  : localStorage (빠른 접근)
// Fallback 2  : IPC 파일 (logs/video_snapshot.json) — localStorage 초기화 생존
// 단일 장애 지점(Single Point of Failure) 방지

const SNAPSHOT_KEY = "soundstorm_video_snapshot_v1";

interface VideoSnapshot {
  savedAt: string;    // ISO timestamp
  videos:  RawVideoRow[];
}

function saveSnapshot(videos: RawVideoRow[]): void {
  const snapshot: VideoSnapshot = { savedAt: new Date().toISOString(), videos };

  // localStorage 저장
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    console.log(`[Snapshot] ✅ localStorage 저장 — ${videos.length}개 영상, ${snapshot.savedAt.slice(0, 16)}`);
  } catch (e) {
    console.warn("[Snapshot] localStorage 저장 실패 (용량 초과 가능):", e);
  }

  // IPC 파일 저장 (Electron 환경만)
  try {
    const api = (window as any).api;
    if (api?.saveVideoSnapshot) {
      api.saveVideoSnapshot(snapshot).then((res: any) => {
        if (res?.ok) {
          console.log(`[Snapshot] ✅ IPC 파일 저장 완료 — ${snapshot.savedAt.slice(0, 16)}`);
        } else {
          console.warn("[Snapshot] IPC 파일 저장 실패:", res?.error);
        }
      });
    }
  } catch (e) {
    console.warn("[Snapshot] IPC 저장 실패:", e);
  }
}

function loadSnapshot(): VideoSnapshot | null {
  // 1차: localStorage
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw) as VideoSnapshot;
  } catch {
    // localStorage 실패 시 IPC로 fall through
  }
  return null;
}

async function loadSnapshotWithIPCFallback(): Promise<VideoSnapshot | null> {
  // 1차: localStorage
  const local = loadSnapshot();
  if (local) return local;

  // 2차: IPC 파일 (Electron)
  try {
    const api = (window as any).api;
    if (api?.loadVideoSnapshot) {
      const snapshot = await api.loadVideoSnapshot();
      if (snapshot && Array.isArray(snapshot.videos) && snapshot.videos.length > 0) {
        console.log(`[Snapshot] IPC 파일 폴백 사용 — ${snapshot.videos.length}개 영상, ${snapshot.savedAt?.slice(0, 16)}`);
        return snapshot as VideoSnapshot;
      }
    }
  } catch (e) {
    console.warn("[Snapshot] IPC 로드 실패:", e);
  }
  return null;
}

/**
 * Google Sheets에서 영상 데이터를 읽어 반환한다.
 * Electron IPC bridge (window.api.fetchSheetVideos) 를 통해 호출한다.
 *
 * 성공: { videos, error: null } + localStorage 스냅샷 갱신
 * 실패 + 스냅샷 있음: { videos: 스냅샷, error: "STALE_SNAPSHOT:ISO" }
 * 실패 + 스냅샷 없음: { videos: [], error: "SYNC_FAILED" }
 */
export async function fetchSheetVideos(): Promise<FetchSheetVideosResult> {
  console.log("[Sheets] fetchSheetVideos called");
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) throw new Error("IPC bridge 없음 (Electron 외부 환경)");

    const primaryResult: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos([PRIMARY_SHEET_NAME]);
    let rawRows: Record<string, string>[] = primaryResult[PRIMARY_SHEET_NAME] ?? [];
    let usedSheet = PRIMARY_SHEET_NAME;

    if (!rawRows.length) {
      try {
        const fallbackResult: Record<string, Record<string, string>[]> =
          await api.fetchSheetVideos([FALLBACK_SHEET_NAME]);
        rawRows = fallbackResult[FALLBACK_SHEET_NAME] ?? [];
        if (rawRows.length) usedSheet = FALLBACK_SHEET_NAME;
      } catch (fallbackErr) {
        console.warn("[Sheets] fallback sheet 로드 실패:", fallbackErr);
      }
    }

    console.log("[Sheets] Using sheet:", usedSheet);
    console.log("[Sheets] raw rows:", rawRows.length);

    // ── 실제 시트 헤더 진단 ────────────────────────────────────────────────
    if (rawRows.length > 0) {
      console.log("[Sheets] ACTUAL COLUMN HEADERS:", Object.keys(rawRows[0]));
      console.log("[Sheets] FIRST ROW SAMPLE:", rawRows[0]);
    }

    const mapped = rawRows
      .map(mapRow)
      .filter((r): r is RawVideoRow => r !== null);

    console.log("[Sheets] mapped rows:", mapped.length, "/ total:", rawRows.length);
    if (mapped.length === 0) throw new Error("유효한 video_id 행 없음");

    // uploadDate 전체 누락 경고
    const missingDateCount = mapped.filter(r => !r.uploadDate).length;
    if (missingDateCount > 0) {
      console.warn(
        `[Sheets] ⚠️ uploadDate 없는 행: ${missingDateCount}/${mapped.length}`,
        "— 시트 upload_date / published_at / 업로드일 컬럼 확인 필요",
      );
    }

    // 성공 → 스냅샷 갱신
    saveSnapshot(mapped);
    return { videos: mapped, error: null };

  } catch (err) {
    console.error("[GoogleSheetAdapter] fetchSheetVideos 실패:", err);

    // 스냅샷 폴백 (localStorage → IPC 파일 순)
    const snapshot = await loadSnapshotWithIPCFallback();
    if (snapshot && snapshot.videos.length > 0) {
      const staleError: SyncError = `STALE_SNAPSHOT:${snapshot.savedAt}`;
      console.warn(
        `[GoogleSheetAdapter] 스냅샷 폴백 사용 — ${snapshot.videos.length}개 영상`,
        `| 저장 시각: ${snapshot.savedAt.slice(0, 16)}`,
      );
      return { videos: snapshot.videos, error: staleError };
    }

    return { videos: [], error: "SYNC_FAILED" };
  }
}

// ─── adapt ────────────────────────────────────────────────────────────────────
// @param  rows  Google Sheets에서 읽어온 원본 행 배열
// @returns NormalizedVideo[]  (video_id가 없는 행은 필터링됨)

export function adapt(rows: SheetRow[]): NormalizedVideo[] {
  return rows
    .filter(row => Boolean(row.video_id?.trim()))
    .map<NormalizedVideo>(row => ({
      videoId: row.video_id.trim(),
      title: row.title ?? "",
      publishedAt: row.published_at ?? "",
      views: toNum(row.views),
      likes: toNum(row.likes),
      comments: toNum(row.comments),
      watchTimeMinutes: toNum(row.watch_time_min),
      averageViewDuration: toNum(row.avg_view_duration),
      estimatedRevenue: toNum(row.revenue),
      subscriberChange: toNum(row.subscriber_change),
      trafficSources: {},   // Google Sheets에서는 트래픽 소스 미제공
      thumbnailUrl: row.thumbnail_url || `https://i.ytimg.com/vi/${row.video_id.trim()}/maxresdefault.jpg`,
      tags: parseTags(row.tags),
      durationSeconds: toNum(row.duration_sec),
      source: "google_sheet",
    }));
}
