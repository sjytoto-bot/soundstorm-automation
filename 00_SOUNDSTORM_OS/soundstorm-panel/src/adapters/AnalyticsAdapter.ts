// ─── AnalyticsAdapter v4 ──────────────────────────────────────────────────────
// Google Sheets Analytics 데이터를 AnalyticsData 구조로 변환한다.
// Electron IPC bridge (window.api.fetchSheetVideos) 를 통해 호출한다.
//
// ── STEP 2: Snapshot Migration ────────────────────────────────────────────────
// 차원 분석 데이터 소스 우선순위:
//   1) _Analytics_Snapshot  (primary)   ← analytics_snapshot_engine.py 가 생성
//   2) _RawData_FullPeriod  (fallback)  ← 스냅샷 없을 때 기존 방식으로 파싱
//
// _Analytics_Snapshot 컬럼:
//   snapshot_date | metric_type | dim_1 | dim_2 | value
//
// 패널별 데이터 소스:
//   KpiCardsPanel      → Analytics_30d           (type=SUMMARY)
//   GrowthPanel        → Analytics_30d + Analytics_prev30
//   DemographicsPanel  → _Analytics_Snapshot     (metric_type=DEMOGRAPHICS)
//   CountryPanel       → _Analytics_Snapshot     (metric_type=COUNTRY)
//   KeywordPanel       → _Analytics_Snapshot     (metric_type=KEYWORD, dim_2=search)
//   DevicePanel        → _Analytics_Snapshot     (metric_type=DEVICE)
//   TrafficSourcePanel → _Analytics_Snapshot     (metric_type=EXTERNAL)
//   InternalInfluence  → _Analytics_Snapshot     (metric_type=EXTERNAL_DETAIL)
//   HitVideosPanel     → Analytics_all           (type=VIDEO)  ← 항상 전체 기간
//
// metric_type 매핑:
//   DEMOGRAPHICS  — dim_1 startsWith "age" → age[]
//                   dim_1 = male/female     → gender[]
//   COUNTRY       — dim_1=country code      → countries[]
//   KEYWORD       — dim_2="search"          → keywords[]
//   DEVICE        — dim_1=device type       → devices[]
//   EXTERNAL      — dim_1=source type       → trafficSources[]
//   EXTERNAL_DETAIL — dim_1=referrer        → internalInfluence[]

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  views: number;
  likes: number;
  watchTimeMin: number;
  avgDurationSec: number;
  subscriberChange: number;
  revenue?: number;   // 예상 수익 (KRW)
}

export interface DimensionRow {
  key: string;
  views: number;
  ratio: number;

  rank?: number;
  title?: string;

  likes?: number;
  watchTimeMin?: number;
  avgDurationSec?: number;
  subscriberChange?: number;

  impressions?: number;
  ctr?: number;

  subtitle?: string;
}

/** collected_at 별 조회수 추세 포인트 */
export interface TrendPoint {
  date: string;
  views: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  age: DimensionRow[];
  gender: DimensionRow[];
  countries: DimensionRow[];
  devices: DimensionRow[];
  keywords: DimensionRow[];
  videos: DimensionRow[];   // 기간별 VIDEO 행 (precomputed 전용)
  trafficSources: DimensionRow[];   // EXTERNAL — 전체 트래픽 소스
  internalInfluence: DimensionRow[];   // EXTERNAL 내부 소스 + EXTERNAL_DETAIL 집계
  trendHistory: TrendPoint[];     // collected_at 기준 추세 (collected_at 컬럼 필요)
}

export interface AnalyticsResult {
  current: AnalyticsData | null;    // period 기준 데이터
  prev30: AnalyticsSummary | null; // Analytics_prev30 (성장율 계산용)
  hitVideos: DimensionRow[];          // Analytics_all VIDEO 행 (항상 전체 기간)
  period: "7d" | "30d" | "all";
  source: "snapshot" | "precomputed" | "raw" | "none";
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function toNum(v: string | number | undefined | null, fallback = 0): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function emptyData(): AnalyticsData {
  return {
    summary: { views: 0, likes: 0, watchTimeMin: 0, avgDurationSec: 0, subscriberChange: 0 },
    age: [],
    gender: [],
    countries: [],
    devices: [],
    keywords: [],
    videos: [],
    trafficSources: [],
    internalInfluence: [],
    trendHistory: [],
  };
}

// ─── Analytics_* 시트 파서 ───────────────────────────────────────────────────
// type | key | views | likes | watch_time_min | avg_duration_sec |
// subscriber_change | ratio | rank | title

function parseAnalyticsRows(rows: Record<string, string>[]): AnalyticsData {
  const data = emptyData();

  for (const row of rows) {
    const type = (row["type"] ?? row["TYPE"] ?? "").toUpperCase().trim();
    const key = row["key"] ?? row["KEY"] ?? "";

    switch (type) {
      case "SUMMARY":
        data.summary.views = toNum(row["views"]);
        data.summary.likes = toNum(row["likes"]);
        data.summary.watchTimeMin = toNum(row["watch_time_min"]);
        data.summary.avgDurationSec = toNum(row["avg_duration_sec"]);
        data.summary.subscriberChange = toNum(row["subscriber_change"]);
        if (row["revenue"] !== undefined && row["revenue"] !== "")
          data.summary.revenue = toNum(row["revenue"]);
        break;

      case "AGE":
        data.age.push({ key, views: toNum(row["views"]), ratio: toNum(row["ratio"]) });
        break;

      case "GENDER":
        data.gender.push({ key, views: toNum(row["views"]), ratio: toNum(row["ratio"]) });
        break;

      case "COUNTRY":
        data.countries.push({
          key,
          views: toNum(row["views"]),
          ratio: toNum(row["ratio"]),
          rank: toNum(row["rank"]) || undefined,
        });
        break;

      case "DEVICE":
        data.devices.push({ key, views: toNum(row["views"]), ratio: toNum(row["ratio"]) });
        break;

      case "KEYWORD":
        data.keywords.push({
          key,
          views: toNum(row["views"]),
          ratio: toNum(row["ratio"]),
          rank: toNum(row["rank"]) || undefined,
        });
        break;

      case "TRAFFIC":
        data.trafficSources.push({ key, views: toNum(row["views"]), ratio: toNum(row["ratio"]) });
        break;

      case "VIDEO":
        data.videos.push({
          key,
          views: toNum(row["views"]),
          likes: toNum(row["likes"]),
          watchTimeMin: toNum(row["watch_time_min"]),
          avgDurationSec: toNum(row["avg_duration_sec"]),
          subscriberChange: toNum(row["subscriber_change"]),
          impressions: toNum(row["impressions"]),
          ctr: toNum(row["ctr"]),
          ratio: row["ratio"] ? toNum(row["ratio"]) : 0,
          rank: toNum(row["rank"]) || undefined,
          title: row["title"] ?? key
        });
        break;

      default:
        break;
    }
  }

  // rank 기준 오름차순 정렬
  const sortByRank = (a: DimensionRow, b: DimensionRow) =>
    (a.rank ?? Infinity) - (b.rank ?? Infinity);

  data.countries.sort(sortByRank);
  data.keywords.sort(sortByRank);
  data.videos.sort(sortByRank);

  return data;
}

/** Analytics_all에서 VIDEO 행만 추출한다 (HitVideosPanel 전용). */
function parseHitVideos(rows: Record<string, string>[]): DimensionRow[] {
  const videos: DimensionRow[] = [];
  for (const row of rows) {
    const type = (row["type"] ?? row["TYPE"] ?? "").toUpperCase().trim();
    if (type === "VIDEO") {
      const key = row["key"] ?? row["KEY"] ?? "";
      videos.push({
        key,
        views: toNum(row["views"]),
        likes: toNum(row["likes"]),
        watchTimeMin: toNum(row["watch_time_min"]),
        avgDurationSec: toNum(row["avg_duration_sec"]),
        subscriberChange: toNum(row["subscriber_change"]),
        ratio: row["ratio"] ? toNum(row["ratio"]) : 0,
        rank: toNum(row["rank"]) || undefined,
        title: row["title"] ?? key
      });
    }
  }
  videos.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  return videos;
}

function parseSummaryOnly(rows: Record<string, string>[]): AnalyticsSummary | null {
  for (const row of rows) {
    const type = (row["type"] ?? row["TYPE"] ?? "").toUpperCase().trim();
    if (type === "SUMMARY") {
      const s: AnalyticsSummary = {
        views: toNum(row["views"]),
        likes: toNum(row["likes"]),
        watchTimeMin: toNum(row["watch_time_min"]),
        avgDurationSec: toNum(row["avg_duration_sec"]),
        subscriberChange: toNum(row["subscriber_change"]),
      };
      if (row["revenue"] !== undefined && row["revenue"] !== "")
        s.revenue = toNum(row["revenue"]);
      return s;
    }
  }
  return null;
}

// ─── _Analytics_Snapshot 파서 ────────────────────────────────────────────────
// snapshot_date | metric_type | dim_1 | dim_2 | value
// analytics_snapshot_engine.py 가 생성하는 Dashboard 전용 시트.
// filterLatestSnapshot 불필요 — 이미 최신 스냅샷만 저장된 상태.

function parseAnalyticsSnapshot(rows: Record<string, string>[]): AnalyticsData {
  console.log(`[AnalyticsAdapter] parseAnalyticsSnapshot 시작 — ${rows.length}행`);

  const data = emptyData();

  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  const countryMap = new Map<string, number>();
  const keywordMap = new Map<string, number>();
  const trafficMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const referrerMap = new Map<string, number>();
  const referrerTypeMap = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const metricType = (row["metric_type"] ?? "").toUpperCase().trim();
    const dim1 = (row["dim_1"] ?? "").trim();
    const dim2 = (row["dim_2"] ?? "").trim();
    const value = toNum(row["value"]);

    switch (metricType) {
      case "DEMOGRAPHICS": {
        // dim_1 패턴 기반 분류
        //   "age*" 시작 → 연령 그룹
        //   "male" | "female" | "unknown" → 성별
        // value = ratio (비율값 직접 사용)
        const dim1Lower = dim1.toLowerCase();
        if (dim1Lower.startsWith("age")) {
          ageMap.set(dim1, (ageMap.get(dim1) ?? 0) + value);
        } else if (dim1Lower === "male" || dim1Lower === "female" || dim1Lower === "unknown") {
          genderMap.set(dim1, (genderMap.get(dim1) ?? 0) + value);
        } else {
          // fallback: dim_2 기반 판단
          const category = dim2.toLowerCase();
          if (category === "gender") {
            genderMap.set(dim1, (genderMap.get(dim1) ?? 0) + value);
          } else if (category.includes("age")) {
            ageMap.set(dim1, (ageMap.get(dim1) ?? 0) + value);
          }
        }
        break;
      }

      case "COUNTRY":
        if (dim1) countryMap.set(dim1, (countryMap.get(dim1) ?? 0) + value);
        break;

      case "KEYWORD":
        // dim_2 = "search" 인 행만 집계
        if (dim1 && dim2.toLowerCase() === "search") {
          keywordMap.set(dim1, (keywordMap.get(dim1) ?? 0) + value);
        }
        break;

      case "DEVICE":
        if (dim1) deviceMap.set(dim1.toLowerCase(), (deviceMap.get(dim1.toLowerCase()) ?? 0) + value);
        break;

      case "EXTERNAL":
        if (dim1) trafficMap.set(dim1, (trafficMap.get(dim1) ?? 0) + value);
        break;

      case "EXTERNAL_DETAIL":
        if (dim1) {
          referrerMap.set(dim1, (referrerMap.get(dim1) ?? 0) + value);
          if (!referrerTypeMap.has(dim1)) referrerTypeMap.set(dim1, new Map());
          const typeM = referrerTypeMap.get(dim1)!;
          if (dim2) typeM.set(dim2, (typeM.get(dim2) ?? 0) + value);
        }
        break;
    }
  }

  // ── Map → DimensionRow[] 변환 ────────────────────────────────────────────
  function toRows(m: Map<string, number>): DimensionRow[] {
    const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
    return Array.from(m.entries())
      .map(([key, views]) => ({ key, views, ratio: total > 0 ? views / total : 0 }))
      .sort((a, b) => b.views - a.views);
  }

  // age / gender: value = ratio 직접 사용 (재계산 없이 내림차순)
  data.age = Array.from(ageMap.entries())
    .map(([key, ratio]) => ({ key, views: 0, ratio }))
    .sort((a, b) => b.ratio - a.ratio);
  data.gender = Array.from(genderMap.entries())
    .map(([key, ratio]) => ({ key, views: 0, ratio }))
    .sort((a, b) => b.ratio - a.ratio);

  data.devices = toRows(deviceMap);
  data.trafficSources = toRows(trafficMap);

  // internalInfluence: EXTERNAL_DETAIL Top 10
  const referrerTotal = Array.from(referrerMap.values()).reduce((s, v) => s + v, 0);
  data.internalInfluence = Array.from(referrerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, views], i) => {
      const typeM = referrerTypeMap.get(key);
      const dominantType = typeM
        ? Array.from(typeM.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
        : "";
      return {
        key,
        views,
        ratio: referrerTotal > 0 ? views / referrerTotal : 0,
        rank: i + 1,
        subtitle: dominantType,
      };
    });

  // 국가: top 10 + rank
  data.countries = toRows(countryMap)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // 키워드: top 10 + rank
  data.keywords = toRows(keywordMap)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  console.log("[AnalyticsAdapter] snapshot 파싱 완료 — age:", data.age.length,
    "gender:", data.gender.length, "countries:", data.countries.length,
    "keywords:", data.keywords.length, "traffic:", data.trafficSources.length,
    "internalInfluence:", data.internalInfluence.length, "devices:", data.devices.length);

  return data;
}

// ─── _RawData_FullPeriod 파서 ────────────────────────────────────────────────

// ─── 스냅샷 행 정규화 ────────────────────────────────────────────────────────
// _RawData_FullPeriod에는 세 가지 행 형식이 혼재한다:
//
// [AGG] 4컬럼 집계행 (헤더와 1:1):
//       metric_type | dim_1 | dim_2 | value
//       예: DEMOGRAPHICS, male, gender, 82.8
//
// [SNAP-A] 8컬럼 스냅샷행 구버전 (col3 = collected_at):
//       snapshot_id | period_start | period_end | collected_at | metric_type | dim_1 | dim_2 | value
//
// [SNAP-B] 8컬럼 스냅샷행 신버전 (col3 = metric_type):
//       snapshot_id | period_start | period_end | metric_type | dim_1 | dim_2 | value | collected_at
//
// 스냅샷 행 판별: col0(metric_type) 값이 YYYYmmdd_HHmmss_xxxxxxxx 패턴
// 스키마 A/B 구분: col3(row["value"])이 datetime 패턴이면 SNAP-A, 아니면 SNAP-B
const SNAPSHOT_ID_RE = /^\d{8}_\d{6}_[a-f0-9]{8}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * 행을 정규화된 { metricType, dim1, dim2, value, collectedAt } 형태로 반환한다.
 */
function normalizeRow(row: Record<string, string>): {
  metricType: string;
  dim1: string;
  dim2: string;
  value: number;
  collectedAt: string;
} {
  const rawCol0 = (row["metric_type"] ?? "").trim();

  if (SNAPSHOT_ID_RE.test(rawCol0)) {
    const col3 = (row["value"] ?? "").trim();  // 헤더의 4번째 컬럼

    if (DATETIME_RE.test(col3)) {
      // [SNAP-A] col3 = collected_at, col4 = metric_type, col5 = dim_1, col6 = dim_2, col7 = value
      return {
        metricType: (row["_ext4"] ?? "").toUpperCase().trim(),
        dim1: (row["_ext5"] ?? "").trim(),
        dim2: (row["_ext6"] ?? "").trim(),
        value: toNum(row["_ext7"]),
        collectedAt: col3,
      };
    } else {
      // [SNAP-B] col3 = metric_type, col4 = dim_1, col5 = dim_2, col6 = value, col7 = collected_at
      return {
        metricType: col3.toUpperCase(),
        dim1: (row["_ext4"] ?? "").trim(),
        dim2: (row["_ext5"] ?? "").trim(),
        value: toNum(row["_ext6"]),
        collectedAt: (row["_ext7"] ?? "").trim(),
      };
    }
  }

  // [AGG] 4컬럼 집계행
  return {
    metricType: rawCol0.toUpperCase(),
    dim1: (row["dim_1"] ?? "").trim(),
    dim2: (row["dim_2"] ?? "").trim(),
    value: toNum(row["value"]),
    collectedAt: (row["collected_at"] ?? "").trim(),
  };
}

/**
 * 전체 rows에서 MAX(collected_at) 스냅샷만 필터링한다.
 * collected_at 컬럼이 없으면 전체 행을 사용한다.
 */
function filterLatestSnapshot(rows: Record<string, string>[]): Record<string, string>[] {
  if (rows.length === 0) return [];

  // collected_at을 Date 객체로 변환해서 비교 (단일 자리 시간 "8:xx" vs "20:xx" 문자열 비교 오류 방지)
  let maxTs = -Infinity;
  let maxAt = "";

  for (const row of rows) {
    const at = normalizeRow(row).collectedAt;
    if (!at) continue;
    const ts = new Date(at).getTime();
    if (!isNaN(ts) && ts > maxTs) {
      maxTs = ts;
      maxAt = at;
    }
  }

  if (!maxAt) {
    console.warn("[AnalyticsAdapter] collected_at 없음 — 전체 행 사용");
    return rows;
  }

  // 같은 timestamp의 모든 행 포함 (string 비교 대신 Date 비교)
  const filtered = rows.filter(r => {
    const at = normalizeRow(r).collectedAt;
    if (!at) return false;
    const ts = new Date(at).getTime();
    return !isNaN(ts) && ts === maxTs;
  });

  console.log(`[AnalyticsAdapter] 최신 snapshot: ${maxAt} (${filtered.length}행)`);
  return filtered;
}

// 실제 dim_1 값 목록 (EXTERNAL metric_type)
// SUBSCRIBER | RELATED_VIDEO | PLAYLIST | YT_CHANNEL | YT_SEARCH |
// NO_LINK_OTHER | YT_OTHER_PAGE | END_SCREEN | EXT_URL | NOTIFICATION

/**
 * _RawData_FullPeriod 행 배열을 AnalyticsData 로 변환한다.
 *
 * - DEMOGRAPHICS:    dim_2("gender"|"age") 기준으로 age / gender 분리
 * - COUNTRY:         dim_1 = country code
 * - KEYWORD:         dim_1 = keyword, dim_2 = "search" 필터
 * - EXTERNAL:        dim_1 = source type → trafficSources 전체
 *                    내부 소스(INTERNAL_SOURCE_KEYS) → internalInfluence 추가
 * - EXTERNAL_DETAIL: 집계 합산 → internalInfluence에 단일 항목으로 추가
 *
 * summary, devices, hitVideos는 FullPeriod에 포함되지 않으므로 기본값 유지.
 */
function parseRawFullPeriod(allRows: Record<string, string>[]): AnalyticsData {
  console.log(`[AnalyticsAdapter] parseRawFullPeriod 시작 — 전체 ${allRows.length}행`);

  // ── 진단: 첫 행 raw 구조 출력 ────────────────────────────────────────────
  if (allRows.length > 0) {
    const first = allRows[0];
    console.log("[AnalyticsAdapter] 첫 행 keys:", Object.keys(first));
    console.log("[AnalyticsAdapter] 첫 행 값:", first);
    const snapshotSample = allRows.find(r => SNAPSHOT_ID_RE.test((r["metric_type"] ?? "").trim()));
    if (snapshotSample) {
      console.log("[AnalyticsAdapter] 스냅샷 행 샘플 keys:", Object.keys(snapshotSample));
      console.log("[AnalyticsAdapter] 스냅샷 행 샘플 값:", snapshotSample);
      console.log("[AnalyticsAdapter] normalizeRow(스냅샷 행):", normalizeRow(snapshotSample));
    } else {
      console.warn("[AnalyticsAdapter] 스냅샷 행 없음 — 전체가 4컬럼 집계행");
    }
  }

  const latest = filterLatestSnapshot(allRows);
  console.log(`[AnalyticsAdapter] filterLatestSnapshot 결과: ${latest.length}행`);

  // ── 진단: 필터 결과 metric_type 분포 ────────────────────────────────────
  const typeCounts: Record<string, number> = {};
  for (const row of latest) {
    const { metricType } = normalizeRow(row);
    typeCounts[metricType] = (typeCounts[metricType] ?? 0) + 1;
  }
  console.log("[AnalyticsAdapter] 필터 후 metric_type 분포:", typeCounts);

  const data = emptyData();

  const ageMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  const countryMap = new Map<string, number>();
  const keywordMap = new Map<string, number>();
  const trafficMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  // EXTERNAL_DETAIL: dim_1 = referrer, dim_2 = traffic type
  const referrerMap = new Map<string, number>();
  const referrerTypeMap = new Map<string, Map<string, number>>();

  for (const row of latest) {
    const { metricType, dim1, dim2, value } = normalizeRow(row);

    switch (metricType) {
      case "AGE":
      case "GENDER":
      case "DEMOGRAPHICS": {
        // dim_1 패턴 기반 직접 분류 (primary):
        //   "age*" 시작 → 연령 그룹 (age13-17, age18-24 등)
        //   "male" | "female" | "unknown" → 성별
        // value = ratio (비율값 직접 사용)
        const dim1Lower = dim1.toLowerCase();
        if (dim1Lower.startsWith("age")) {
          ageMap.set(dim1, (ageMap.get(dim1) ?? 0) + value);
        } else if (dim1Lower === "male" || dim1Lower === "female" || dim1Lower === "unknown") {
          genderMap.set(dim1, (genderMap.get(dim1) ?? 0) + value);
        } else {
          // fallback: dim_2 기반 판단
          const category = dim2.toLowerCase();
          if (category === "gender") {
            genderMap.set(dim1, (genderMap.get(dim1) ?? 0) + value);
          } else if (category.includes("age")) {
            ageMap.set(dim1, (ageMap.get(dim1) ?? 0) + value);
          }
        }
        break;
      }

      case "COUNTRY":
        if (dim1) countryMap.set(dim1, (countryMap.get(dim1) ?? 0) + value);
        break;

      case "KEYWORD":
        // dim_2 = "search" 인 행만 집계
        if (dim1 && dim2.toLowerCase() === "search") {
          keywordMap.set(dim1, (keywordMap.get(dim1) ?? 0) + value);
        }
        break;

      case "DEVICE":
        // dim_1 = mobile | desktop | tablet | tv (소문자 기준)
        if (dim1) deviceMap.set(dim1.toLowerCase(), (deviceMap.get(dim1.toLowerCase()) ?? 0) + value);
        break;

      case "TRAFFIC":
      case "EXTERNAL":
        // 전체 트래픽 소스 집계 (dim_1 = SUBSCRIBER, RELATED_VIDEO, YT_SEARCH, ...)
        if (dim1) trafficMap.set(dim1, (trafficMap.get(dim1) ?? 0) + value);
        break;

      case "EXTERNAL_DETAIL":
        // Top Referrer 집계 (dim_1 = video ID / URL, dim_2 = traffic type)
        if (dim1) {
          referrerMap.set(dim1, (referrerMap.get(dim1) ?? 0) + value);
          if (!referrerTypeMap.has(dim1)) referrerTypeMap.set(dim1, new Map());
          const typeM = referrerTypeMap.get(dim1)!;
          if (dim2) typeM.set(dim2, (typeM.get(dim2) ?? 0) + value);
        }
        break;
    }
  }

  // Map → DimensionRow[] 변환 (ratio 자동 계산, views 내림차순)
  function toRows(m: Map<string, number>): DimensionRow[] {
    const total = Array.from(m.values()).reduce((s, v) => s + v, 0);
    return Array.from(m.entries())
      .map(([key, views]) => ({ key, views, ratio: total > 0 ? views / total : 0 }))
      .sort((a, b) => b.views - a.views);
  }

  console.log("[AnalyticsAdapter] Map 크기 — age:", ageMap.size, "gender:", genderMap.size,
    "country:", countryMap.size, "keyword:", keywordMap.size,
    "traffic:", trafficMap.size, "device:", deviceMap.size, "referrer:", referrerMap.size);

  // age / gender: value = ratio 직접 사용 (재계산 없이 내림차순 정렬)
  data.age = Array.from(ageMap.entries())
    .map(([key, ratio]) => ({ key, views: 0, ratio }))
    .sort((a, b) => b.ratio - a.ratio);
  data.gender = Array.from(genderMap.entries())
    .map(([key, ratio]) => ({ key, views: 0, ratio }))
    .sort((a, b) => b.ratio - a.ratio);
  data.devices = toRows(deviceMap);
  data.trafficSources = toRows(trafficMap);

  // internalInfluence: EXTERNAL_DETAIL Top 10 (dim_1 기준 집계, 주요 dim_2 포함)
  const referrerTotal = Array.from(referrerMap.values()).reduce((s, v) => s + v, 0);
  data.internalInfluence = Array.from(referrerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, views], i) => {
      const typeM = referrerTypeMap.get(key);
      const dominantType = typeM
        ? Array.from(typeM.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
        : "";
      return {
        key,
        views,
        ratio: referrerTotal > 0 ? views / referrerTotal : 0,
        rank: i + 1,
        subtitle: dominantType,
      };
    });

  // 국가: top 10 + rank
  data.countries = toRows(countryMap)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // 키워드: top 10 + rank
  data.keywords = toRows(keywordMap)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  console.log("[AnalyticsAdapter] 최종 결과 — age:", data.age.length,
    "gender:", data.gender.length, "countries:", data.countries.length,
    "keywords:", data.keywords.length, "traffic:", data.trafficSources.length,
    "internalInfluence:", data.internalInfluence.length, "devices:", data.devices.length);

  // 추세 히스토리: collected_at 별 COUNTRY 총합으로 근사
  const trendMap = new Map<string, number>();
  for (const row of allRows) {
    const { metricType, value, collectedAt } = normalizeRow(row);
    if (!collectedAt || metricType !== "COUNTRY") continue;
    trendMap.set(collectedAt, (trendMap.get(collectedAt) ?? 0) + value);
  }
  if (trendMap.size > 0) {
    data.trendHistory = Array.from(trendMap.entries())
      .map(([date, views]) => ({ date, views }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return data;
}

// ─── fetchAnalytics ───────────────────────────────────────────────────────────

/**
 * Analytics 데이터를 읽어 AnalyticsResult로 반환한다.
 *
 * ── STEP 2: Snapshot Migration ─────────────────────────────────────────────
 * 차원 분석(age/gender/countries/devices/keywords/traffic/influence) 데이터 소스:
 *   1순위: _Analytics_Snapshot  (analytics_snapshot_engine.py 생성, 경량·고속)
 *   2순위: _RawData_FullPeriod  (스냅샷 없을 때 기존 방식 fallback)
 *
 * 세 소스를 병렬 로드 후 머지:
 *   1) Analytics_* 시트    → summary (KPI), hitVideos (영상 순위)
 *   2) _Analytics_Snapshot → 차원 분석 (primary)
 *   3) _RawData_FullPeriod → 차원 분석 (fallback)
 *   4) Channel_KPI         → estimated_revenue_krw
 *
 * period → Analytics 시트 매핑:
 *   "7d"  → Analytics_7d  + Analytics_prev30 + Analytics_all
 *   "30d" → Analytics_30d + Analytics_prev30 + Analytics_all
 *   "all" → Analytics_all
 */
export async function fetchAnalytics(period: "7d" | "30d" | "all"): Promise<AnalyticsResult> {
  console.log(`[AnalyticsAdapter] fetchAnalytics — period: ${period}`);

  const emptyResult: AnalyticsResult = {
    current: null, prev30: null, hitVideos: [], period, source: "none",
  };

  try {
    const api = (window as any).api;
    if (!api?.fetchSheetVideos) {
      throw new Error("IPC bridge 없음 (Electron 외부 환경)");
    }

    // ── 병렬 로드: Analytics_* + Snapshot + RawData(fallback) + Channel_KPI ─
    const analyticsSheets =
      period === "7d" ? ["Analytics_7d", "Analytics_prev30", "Analytics_all"] :
        period === "30d" ? ["Analytics_30d", "Analytics_prev30", "Analytics_all"] :
          ["Analytics_all"];

    console.log(`[AnalyticsAdapter] 병렬 로드 — Analytics:`, analyticsSheets,
      `+ _Analytics_Snapshot + _RawData_FullPeriod(fallback) + Channel_KPI`);

    const [analyticsResult, snapshotResult, rawResult, kpiResult] = await Promise.all([
      api.fetchSheetVideos(analyticsSheets) as Promise<Record<string, Record<string, string>[]>>,
      api.fetchSheetVideos(["_Analytics_Snapshot"]) as Promise<Record<string, Record<string, string>[]>>,
      api.fetchSheetVideos(["_RawData_FullPeriod"]) as Promise<Record<string, Record<string, string>[]>>,
      api.fetchSheetVideos(["Channel_KPI"]) as Promise<Record<string, Record<string, string>[]>>,
    ]);

    // ── hitVideos: Analytics_all → VIDEO 행 ──────────────────────────────
    const allRows = analyticsResult["Analytics_all"] ?? [];
    const hitVideos = allRows.length > 0 ? parseHitVideos(allRows) : [];
    console.log(`[AnalyticsAdapter] hitVideos: ${hitVideos.length}개`);

    // ── summary: Analytics_* SUMMARY 행 ──────────────────────────────────
    const currentKey =
      period === "7d" ? "Analytics_7d" :
        period === "30d" ? "Analytics_30d" :
          "Analytics_all";
    const currentRows = analyticsResult[currentKey] ?? [];
    const analyticsData = currentRows.length > 0 ? parseAnalyticsRows(currentRows) : null;

    // ── 차원 분석: Snapshot 우선, RawData fallback ─────────────────────────
    const snapshotRows = snapshotResult["_Analytics_Snapshot"] ?? [];
    const rawRows = rawResult["_RawData_FullPeriod"] ?? [];

    let dimensionData: AnalyticsData | null = null;
    let dimensionSource: "snapshot" | "raw" | null = null;

    if (snapshotRows.length > 0) {
      dimensionData = parseAnalyticsSnapshot(snapshotRows);
      dimensionSource = "snapshot";
      console.log(`[AnalyticsAdapter] 차원 분석 소스: _Analytics_Snapshot (${snapshotRows.length}행)`);
    } else if (rawRows.length > 0) {
      dimensionData = parseRawFullPeriod(rawRows);
      dimensionSource = "raw";
      console.warn(`[AnalyticsAdapter] _Analytics_Snapshot 없음 — fallback: _RawData_FullPeriod (${rawRows.length}행)`);
    } else {
      console.warn("[AnalyticsAdapter] 차원 분석 데이터 없음 (Snapshot · RawData 모두 비어있음)");
    }

    // ── Channel_KPI: estimated_revenue_krw ───────────────────────────────
    let revenueKrw: number | undefined;
    const channelKpiRows = kpiResult["Channel_KPI"] ?? [];
    if (channelKpiRows.length > 0) {
      const latest = [...channelKpiRows].sort(
        (a, b) => new Date(b["date"] ?? "").getTime() - new Date(a["date"] ?? "").getTime()
      )[0];
      const raw = latest["estimated_revenue_krw"];
      if (raw !== undefined && raw !== "") {
        const n = toNum(raw);
        if (!isNaN(n)) revenueKrw = n;
      }
      console.log(`[AnalyticsAdapter] Channel_KPI 최신행 date: ${latest["date"]}, estimated_revenue_krw: ${revenueKrw}`);
    } else {
      console.warn("[AnalyticsAdapter] Channel_KPI 없음 — 수익 표시 불가");
    }

    // ── 머지 ─────────────────────────────────────────────────────────────
    // summary/videos : Analytics_* 우선 (Snapshot·RawData에는 없음)
    // 차원 분석      : dimensionData (Snapshot → RawData 순)
    let current: AnalyticsData | null = null;
    let source: AnalyticsResult["source"] = "none";

    if (analyticsData || dimensionData) {
      const baseSummary = analyticsData?.summary ?? dimensionData?.summary ?? emptyData().summary;
      if (revenueKrw !== undefined) baseSummary.revenue = revenueKrw;

      current = {
        summary: baseSummary,
        age: dimensionData?.age ?? analyticsData?.age ?? [],
        gender: dimensionData?.gender ?? analyticsData?.gender ?? [],
        countries: dimensionData?.countries ?? analyticsData?.countries ?? [],
        devices: dimensionData?.devices ?? analyticsData?.devices ?? [],
        keywords: dimensionData?.keywords ?? analyticsData?.keywords ?? [],
        videos: analyticsData?.videos ?? dimensionData?.videos ?? [],
        trafficSources: dimensionData?.trafficSources ?? analyticsData?.trafficSources ?? [],
        internalInfluence: dimensionData?.internalInfluence ?? analyticsData?.internalInfluence ?? [],
        trendHistory: dimensionData?.trendHistory ?? analyticsData?.trendHistory ?? [],
      };

      source = dimensionSource === "snapshot" ? "snapshot"
        : dimensionSource === "raw" ? (analyticsData ? "precomputed" : "raw")
          : "precomputed";
    }

    // ── prev30 (7d / 30d 모드만) ──────────────────────────────────────────
    let prev30: AnalyticsSummary | null = null;
    if (period === "7d" || period === "30d") {
      const prevRows = analyticsResult["Analytics_prev30"] ?? [];
      if (prevRows.length > 0) prev30 = parseSummaryOnly(prevRows);
      if (!prev30) console.warn("[AnalyticsAdapter] Analytics_prev30 없음 — 성장율 계산 불가");
    }

    console.log(`[AnalyticsAdapter] 완료 — source: ${source}, dimensionSource: ${dimensionSource ?? "none"}, hitVideos: ${hitVideos.length}`);
    console.log(`[AnalyticsAdapter] 머지 결과 — age: ${current?.age.length}, gender: ${current?.gender.length}, countries: ${current?.countries.length}, devices: ${current?.devices.length}, keywords: ${current?.keywords.length}, traffic: ${current?.trafficSources.length}, influence: ${current?.internalInfluence.length}`);
    return { current, prev30, hitVideos, period, source };

  } catch (err) {
    console.warn("[AnalyticsAdapter] fetchAnalytics 실패:", err);
    return emptyResult;
  }
}
