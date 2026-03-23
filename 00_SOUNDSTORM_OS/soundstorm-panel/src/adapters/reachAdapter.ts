// ─── reachAdapter v1 ──────────────────────────────────────────────────────────
// _RawData_Master 시트에서 Reach 관련 필드만 추출한다.
//
// 추출 필드:
//   video_id    — 영상 ID (primary key)
//   views       — 총 조회수
//   impressions — 노출수
//   ctr         — 클릭률 (0~1 또는 % 형식 모두 지원)
//
// Electron IPC bridge (window.api.fetchSheetVideos) 를 통해 호출한다.
// 연결 실패 시 빈 배열을 반환한다 (fallback 없음 — 데이터 없으면 분석 불가).

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ReachRow {
  /** YouTube video ID */
  video_id: string;
  /** 영상 제목 (있는 경우) */
  title?: string;
  /** 업로드 날짜 (ISO 8601 또는 YYYY-MM-DD) */
  published_at?: string;
  /** 총 조회수 */
  views: number;
  /** 노출수 (impressions) — 시트 컬럼 없으면 null (0은 실제 0) */
  impressions: number | null;
  /** 클릭률 (0~1 범위로 정규화) — 시트 컬럼 없으면 null (0은 실제 0) */
  ctr: number | null;
  /** 좋아요 수 */
  likes: number;
  /** 누적 시청시간 (분) — _RawData_Master: total_watch_time_min */
  watchTimeMin: number;
  /** 평균 시청 시간 (초) — _RawData_Master: avg_watch_time_sec */
  avgDurationSec: number;
  /** 영상 길이 (초) — _RawData_Master: runtime_sec */
  runtimeSec: number;
  /** 댓글 수 */
  comments: number;
  /** 공유 수 */
  shares: number;
  /** 영상에서 유입된 구독자 수 */
  subscribersGained: number;
  /** 데이터 마지막 갱신 시각 (ISO string) — _RawData_Master: ctr_updated_at (generate_active_uploads.py write-back 시 기록) */
  ctrUpdatedAt: string | null;
}

// ─── 열 별칭 ─────────────────────────────────────────────────────────────────

const VIDEO_ID_KEYS  = ["video_id", "videoId", "VIDEO_ID", "id"];
const TITLE_KEYS     = ["곡명", "track_name", "youtube_title", "title", "제목"];
const PUB_DATE_KEYS  = ["upload_date", "published_at", "uploadDate", "업로드일", "Published At"];
const VIEWS_KEYS     = ["views", "조회수", "Views"];
const IMP_KEYS       = ["impressions", "노출수", "Impressions"];
const CTR_KEYS       = ["ctr", "impressionsCtr", "클릭률", "CTR", "impressions_ctr"];
const LIKES_KEYS     = ["likes", "좋아요", "좋아요 수", "likes_count", "like_count"];
const WATCH_KEYS     = ["total_watch_time_min", "watch_time_min", "watchTimeMin", "watch_time", "시청시간", "시청 시간(분)", "estimatedMinutesWatched", "watch_time_minutes"];
const AVG_DUR_KEYS   = ["avg_watch_time_sec", "avg_duration_sec", "avgDurationSec", "avg_view_duration", "averageViewDuration", "평균시청시간", "평균 시청 시간(초)", "average_view_duration"];
const RUNTIME_KEYS   = ["runtime_sec", "runtimeSec", "duration_sec", "video_duration", "영상길이"];
const COMMENTS_KEYS  = ["comments", "댓글", "댓글수", "comment_count", "comments_count"];
const SHARES_KEYS    = ["shares", "공유", "공유수", "share_count", "shares_count"];
const SUBS_KEYS      = ["subscribers_gained", "subscribersGained", "new_subscribers", "구독자증가"];
const CTR_UPDATED_AT_KEYS = ["ctr_updated_at", "ctrUpdatedAt"];

function pickVal(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
}

// ─── 입력 정규화 레이어 ───────────────────────────────────────────────────────
// Raw → Normalize → Adapter → UI
//
// 모든 시트 값은 이 두 함수를 통해 숫자로 정규화된다.
// Google Sheets API는 셀 포맷에 따라 다양한 문자열을 반환할 수 있음:
//   - 천 단위 쉼표:  "2,260"  → 2260
//   - 공백 구분:    "1 234"  → 1234
//   - % 포함:       "3.14%" → 0.0314
//   - 유럽식 소수점: "3,14%" → 0.0314  (쉼표=소수점 처리)
//   - 빈 셀:        ""      → null (데이터 없음)

/**
 * 숫자 정규화 (impressions, views, likes 등 정수/실수)
 * 빈 값 → null (데이터 없음과 실제 0을 구분)
 * 파싱 실패 → null + console.warn
 */
function normalizeNumber(v: string | undefined | null, field = "unknown"): number | null {
  if (v == null || v === "") return null;

  // 천 단위 구분자 제거 (쉼표, 공백)
  const cleaned = v.trim().replace(/,/g, "").replace(/\s/g, "");
  if (cleaned === "") return null;

  const n = Number(cleaned);
  if (isNaN(n)) {
    console.warn(`[reachAdapter] ⚠ normalizeNumber 파싱 실패 — field="${field}" value="${v}"`);
    return null;
  }
  return n;
}

/**
 * 퍼센트 정규화 → 항상 0~1 범위로 변환 (CTR 전용)
 * 빈 값 → null
 * 지원 포맷:
 *   "3.14%"  → 0.0314  (Google Sheets % 셀 포맷)
 *   "3.14"   → 0.0314  (1 이상 → % 형식으로 간주)
 *   "0.0314" → 0.0314  (이미 0~1)
 *   "3,14%"  → 0.0314  (유럽식 쉼표 소수점)
 */
function normalizePercent(v: string | undefined | null, field = "unknown"): number | null {
  if (v == null || v === "") return null;

  const trimmed = v.trim();

  // "3.14%" 또는 "3,14%" — % 기호 있는 경우
  if (trimmed.endsWith("%")) {
    const numPart = trimmed.slice(0, -1).replace(/,/g, ".");
    const n = Number(numPart);
    if (isNaN(n)) {
      console.warn(`[reachAdapter] ⚠ normalizePercent 파싱 실패 — field="${field}" value="${v}"`);
      return null;
    }
    return n / 100;
  }

  // % 없는 경우 — 쉼표/공백 제거 후 숫자 변환
  const cleaned = trimmed.replace(/,/g, "").replace(/\s/g, "");
  const n = Number(cleaned);
  if (isNaN(n)) {
    console.warn(`[reachAdapter] ⚠ normalizePercent 파싱 실패 — field="${field}" value="${v}"`);
    return null;
  }
  if (n === 0) return 0;
  // 1 이상 → % 형식으로 간주 (CTR 100% 초과 불가)
  return n >= 1 ? n / 100 : n;
}

// 내부 헬퍼 (정수 필드 전용 — 0 fallback)
function toNum(v: string, fallback = 0): number {
  return normalizeNumber(v) ?? fallback;
}

function mapRow(row: Record<string, string>): ReachRow | null {
  const video_id = pickVal(row, VIDEO_ID_KEYS).trim();
  if (!video_id) return null;

  return {
    video_id,
    title:             pickVal(row, TITLE_KEYS)    || undefined,
    published_at:      pickVal(row, PUB_DATE_KEYS) || undefined,
    views:             toNum(pickVal(row, VIEWS_KEYS)),
    impressions:       normalizeNumber(pickVal(row, IMP_KEYS) || null,  "impressions"),
    ctr:               normalizePercent(pickVal(row, CTR_KEYS) || null, "ctr"),
    likes:             toNum(pickVal(row, LIKES_KEYS)),
    watchTimeMin:      toNum(pickVal(row, WATCH_KEYS)),
    avgDurationSec:    toNum(pickVal(row, AVG_DUR_KEYS)),
    runtimeSec:        toNum(pickVal(row, RUNTIME_KEYS)),
    comments:          toNum(pickVal(row, COMMENTS_KEYS)),
    shares:            toNum(pickVal(row, SHARES_KEYS)),
    subscribersGained: toNum(pickVal(row, SUBS_KEYS)),
    ctrUpdatedAt:      pickVal(row, CTR_UPDATED_AT_KEYS) || null,
  };
}

// ─── getChannelAvgCTR ─────────────────────────────────────────────────────────

/** period → 밀리초 윈도우 변환 */
function periodToMs(period: "7d" | "30d" | "all"): number | null {
  if (period === "7d")  return  7 * 24 * 60 * 60 * 1000;
  if (period === "30d") return 30 * 24 * 60 * 60 * 1000;
  return null; // "all" — 기간 제한 없음
}

/**
 * 채널 평균 CTR 계산 — 판단 문장 기준선으로 사용
 *
 * 기준: period 내 영상 중 impressions >= 1000인 것들의 CTR 평균
 * → 노출 적은 영상(노이즈)을 제외하여 "알고리즘 검증된 영상" 기준만 반영
 *
 * @param period "7d" | "30d" | "all" — 기간 선택기와 연동
 * 반환: null if 조건 충족 영상 없음
 */
export function getChannelAvgCTR(rows: ReachRow[], period: "7d" | "30d" | "all" = "30d"): number | null {
  const windowMs = periodToMs(period);
  const cutoff   = windowMs != null ? Date.now() - windowMs : null;

  const eligible = rows.filter(r => {
    if (r.impressions == null || r.impressions < 1000 || r.ctr == null || r.ctr <= 0) return false;
    if (cutoff == null) return true;  // "all" — 기간 제한 없음
    if (!r.published_at) return false;
    return new Date(r.published_at).getTime() >= cutoff;
  });

  if (eligible.length === 0) return null;

  const sum = eligible.reduce((acc, r) => acc + (r.ctr ?? 0), 0);
  return sum / eligible.length;
}

/**
 * CTR 성장률 계산 — 현재 period vs 이전 동일 기간 채널 평균 CTR 비교
 *
 * 기준: 각 기간 내 impressions >= 1000 영상의 CTR 평균 비교
 * @param period "7d" | "30d" | "all" — 기간 선택기와 연동 ("all"은 growth 계산 불가 → null)
 * 반환: 소수점 1자리 % (예: +12.5, -8.3) | null if 어느 한쪽 데이터 없음
 */
export function getChannelCTRGrowth(rows: ReachRow[], period: "7d" | "30d" | "all" = "30d"): number | null {
  const windowMs = periodToMs(period);
  if (windowMs == null) return null;  // "all" — 비교 기준 없음

  const now     = Date.now();
  const current = now - windowMs;
  const prev    = now - windowMs * 2;

  function periodAvg(from: number, to: number): number | null {
    const eligible = rows.filter(r => {
      if (!r.published_at || r.impressions == null || r.impressions < 1000 || r.ctr == null || r.ctr <= 0) return false;
      const t = new Date(r.published_at).getTime();
      return t >= from && t < to;
    });
    if (eligible.length === 0) return null;
    return eligible.reduce((acc, r) => acc + (r.ctr ?? 0), 0) / eligible.length;
  }

  const curAvg  = periodAvg(current, now);
  const prevAvg = periodAvg(prev, current);

  if (curAvg == null || prevAvg == null || prevAvg === 0) return null;
  return Math.round((curAvg - prevAvg) / Math.abs(prevAvg) * 1000) / 10;
}

// ─── fetchReachData ───────────────────────────────────────────────────────────

/**
 * _RawData_Master 시트에서 Reach 데이터를 읽어 ReachRow[] 로 반환한다.
 *
 * - impressions / ctr 컬럼이 없는 행은 0 값으로 포함된다.
 * - video_id가 없는 행은 제외된다.
 * - IPC bridge 없음 / 연결 실패 시 빈 배열 반환.
 */
// ─── HourlyViewRow ────────────────────────────────────────────────────────────

export interface HourlyViewRow {
  hour:  number;   // 0~23 (KST)
  views: number;
}

/**
 * _Hourly_Views 시트에서 시간대별 조회수를 읽는다.
 * api_data_shuttler.py가 수집한 최근 30일 YouTube Analytics hour dimension 데이터.
 * 연결 실패 / 시트 없으면 빈 배열 반환.
 */
export async function fetchHourlyViews(): Promise<HourlyViewRow[]> {
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) return [];

    const result: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["_Hourly_Views"]);

    const rawRows = result["_Hourly_Views"] ?? [];
    return rawRows
      .map(r => ({ hour: Number(r.hour ?? 0), views: Number(r.views ?? 0) }))
      .filter(r => r.hour >= 0 && r.hour <= 23 && r.views >= 0);
  } catch {
    return [];
  }
}

export async function fetchReachData(): Promise<ReachRow[]> {
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) {
      throw new Error("IPC bridge 없음 (Electron 외부 환경)");
    }

    // _RawData_Master를 우선 읽고, 보완 시트는 실패해도 전체 fetch를 깨지 않게 분리 호출한다.
    const masterResult: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["_RawData_Master"]);
    const masterRows: Record<string, string>[] = masterResult["_RawData_Master"] ?? [];

    let finalRows: Record<string, string>[] = [];
    try {
      const finalResult: Record<string, Record<string, string>[]> =
        await api.fetchSheetVideos(["SS_음원마스터_최종"]);
      finalRows = finalResult["SS_음원마스터_최종"] ?? [];
    } catch (err) {
      console.warn("[reachAdapter] SS_음원마스터_최종 로드 실패 — _RawData_Master만 사용:", err);
    }

    // ── _RawData_Master 파싱 → Map ────────────────────────────────────────────
    const masterMap = new Map<string, ReachRow>();
    for (const row of masterRows) {
      const r = mapRow(row);
      if (r) masterMap.set(r.video_id, r);
    }

    // ── SS_음원마스터_최종으로 impressions/ctr 보완 ───────────────────────────
    // 조건: _RawData_Master에 해당 video_id가 있고, impressions=0 또는 null인 경우만 보완
    for (const row of finalRows) {
      const f = mapRow(row);
      if (!f) continue;

      const existing = masterMap.get(f.video_id);
      if (existing && !existing.impressions && f.impressions) {
        existing.impressions = f.impressions;
        existing.ctr         = existing.ctr ?? f.ctr;
      } else if (!existing && f.impressions) {
        masterMap.set(f.video_id, f);
      }
    }

    const mapped = [...masterMap.values()];

    // ── 재발 방지: impressions/CTR 누락 비율 진단 ─────────────────────────────
    if (mapped.length > 0) {
      const missingImp = mapped.filter(r => !r.impressions).length;
      const missingCtr = mapped.filter(r => r.ctr == null).length;
      const impRate    = Math.round(missingImp / mapped.length * 100);
      const ctrRate    = Math.round(missingCtr / mapped.length * 100);
      if (impRate >= 50) {
        console.warn(
          `[reachAdapter] ⚠ impressions 누락 ${missingImp}/${mapped.length}개 (${impRate}%)` +
          ` — studio_csv_ingestor.py 실행 또는 YouTube Studio CSV 수동 업로드 필요`
        );
      }
      if (ctrRate >= 50) {
        console.warn(
          `[reachAdapter] ⚠ CTR 누락 ${missingCtr}/${mapped.length}개 (${ctrRate}%)`
        );
      }
    }

    return mapped;

  } catch (err) {
    console.warn("[reachAdapter] fetchReachData 실패 — 빈 배열 반환:", err);
    return [];
  }
}
