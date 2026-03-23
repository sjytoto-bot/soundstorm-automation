// ─── ChannelKPIAdapter ────────────────────────────────────────────────────────
// Google Sheets `Channel_KPI` 시트 → 채널 KPI 데이터 파싱
//
// 시트 컬럼 (date 오름차순 정렬):
//   date, subscribers, views_30d, avg_views, watch_time_min,
//   subscriber_change, algorithm_score,
//   estimated_revenue_usd, estimated_revenue_krw

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface ChannelKPIRow {
  date:                 string;
  subscribers:          number;
  views30d:             number;
  avgViews:             number;
  watchTimeMin:         number;
  subscriberChange:     number;
  algorithmScore:       number;
  estimatedRevenueUsd:  number;
  estimatedRevenueKrw:  number;
}

export interface ChannelKPIResult {
  /** 가장 최신 행 (date 기준 내림차순 첫 번째) */
  latest:  ChannelKPIRow | null;
  /** 전체 이력 (date 오름차순) — 시계열 그래프용 */
  history: ChannelKPIRow[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === "" || v === "API" || v === "합산") return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

// 알려진 헤더 별칭
const COL: Record<keyof ChannelKPIRow, string[]> = {
  date:                ["date", "Date", "날짜"],
  subscribers:         ["subscribers", "Subscribers", "구독자"],
  views30d:            ["views_30d", "views30d", "30일조회수"],
  avgViews:            ["avg_views", "avgViews", "평균조회수"],
  watchTimeMin:        ["watch_time_min", "watchTimeMin"],
  subscriberChange:    ["subscriber_change", "subscriberChange", "구독자변화"],
  algorithmScore:      ["algorithm_score", "algorithmScore", "알고리즘점수"],
  estimatedRevenueUsd: ["estimated_revenue_usd", "revenueUsd"],
  estimatedRevenueKrw: ["estimated_revenue_krw", "revenueKrw"],
};

function pick(row: Record<string, string>, aliases: string[]): string {
  for (const key of aliases) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function parseRow(row: Record<string, string>): ChannelKPIRow | null {
  const date = pick(row, COL.date).trim();
  if (!date) return null;
  return {
    date,
    subscribers:         toNum(pick(row, COL.subscribers)),
    views30d:            toNum(pick(row, COL.views30d)),
    avgViews:            toNum(pick(row, COL.avgViews)),
    watchTimeMin:        toNum(pick(row, COL.watchTimeMin)),
    subscriberChange:    toNum(pick(row, COL.subscriberChange)),
    algorithmScore:      toNum(pick(row, COL.algorithmScore)),
    estimatedRevenueUsd: toNum(pick(row, COL.estimatedRevenueUsd)),
    estimatedRevenueKrw: toNum(pick(row, COL.estimatedRevenueKrw)),
  };
}

// ─── KPI 스냅샷 (localStorage) ────────────────────────────────────────────────

const KPI_SNAPSHOT_KEY = "soundstorm_kpi_snapshot_v1";

interface KPISnapshot {
  savedAt: string;
  latest:  ChannelKPIRow;
  history: ChannelKPIRow[];
}

function saveKPISnapshot(latest: ChannelKPIRow, history: ChannelKPIRow[]): void {
  try {
    const snap: KPISnapshot = { savedAt: new Date().toISOString(), latest, history };
    localStorage.setItem(KPI_SNAPSHOT_KEY, JSON.stringify(snap));
    console.log(`[ChannelKPI] 스냅샷 저장 — ${snap.savedAt.slice(0, 16)}`);
  } catch (e) {
    console.warn("[ChannelKPI] 스냅샷 저장 실패:", e);
  }
}

function loadKPISnapshot(): KPISnapshot | null {
  try {
    const raw = localStorage.getItem(KPI_SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw) as KPISnapshot;
  } catch {}
  return null;
}

// ─── fetchChannelKPI ──────────────────────────────────────────────────────────

/**
 * Google Sheets `Channel_KPI` 시트에서 채널 KPI 이력을 읽어온다.
 * 실패 시 localStorage 스냅샷으로 폴백한다.
 */
export async function fetchChannelKPI(): Promise<ChannelKPIResult> {
  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) throw new Error("IPC bridge 없음 (Electron 외부 환경)");

    const result: Record<string, Record<string, string>[]> =
      await api.fetchSheetVideos(["Channel_KPI"]);

    const rawRows: Record<string, string>[] = result["Channel_KPI"] ?? [];

    if (rawRows.length === 0) throw new Error("[ChannelKPI] Channel_KPI 시트 데이터 없음");

    console.log("[ChannelKPI] HEADERS:", Object.keys(rawRows[0]));
    console.log("[ChannelKPI] ROW COUNT:", rawRows.length);

    const parsed = rawRows
      .map(parseRow)
      .filter((r): r is ChannelKPIRow => r !== null);

    if (parsed.length === 0) throw new Error("[ChannelKPI] 유효한 행 없음");

    parsed.sort((a, b) => a.date.localeCompare(b.date));
    const latest = parsed[parsed.length - 1];
    console.log("[ChannelKPI] latest:", latest);

    // 성공 → 스냅샷 저장
    saveKPISnapshot(latest, parsed);
    return { latest, history: parsed };

  } catch (err) {
    console.warn("[ChannelKPIAdapter] fetchChannelKPI 실패:", err);

    // 스냅샷 폴백
    const snap = loadKPISnapshot();
    if (snap) {
      console.warn(`[ChannelKPI] 스냅샷 폴백 사용 — ${snap.savedAt.slice(0, 16)}`);
      return { latest: snap.latest, history: snap.history };
    }

    return { latest: null, history: [] };
  }
}
