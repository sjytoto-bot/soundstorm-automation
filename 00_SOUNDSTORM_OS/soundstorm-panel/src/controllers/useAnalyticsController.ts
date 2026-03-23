// ─── useAnalyticsController v2 ────────────────────────────────────────────────
// Analytics 전용 컨트롤러 훅 (TypeScript).
//
// 역할:
//   - period 상태 관리 ("7d" | "30d" | "all")
//   - AnalyticsAdapter.fetchAnalytics() 호출 및 결과 보관
//   - calcGrowth()로 현재/이전 기간 성장율 계산
//   - loadingAnalytics 로딩 상태 관리
//   - periodRef로 stale 응답 방지
//
// 반환:
//   analytics        — AnalyticsResult | null
//   growth           — GrowthResult
//   period           — "7d" | "30d" | "all"
//   setPeriod        — Dispatch
//   loadingAnalytics — boolean
//
// 데이터 흐름:
//   period 변경
//     → fetchAnalytics(period)   [AnalyticsAdapter.ts]
//       → _Analytics_Snapshot    (primary)
//       → _RawData_FullPeriod    (fallback)
//       → Analytics_* + Channel_KPI
//     → AnalyticsResult → setAnalytics()
//     → calcGrowth(current, prev30) → growth

import { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext, Dispatch, SetStateAction } from "react";
import type { ReactNode } from "react";
import { createElement } from "react";
import {
  fetchAnalytics,
  AnalyticsResult,
  AnalyticsSummary,
} from "@/adapters/AnalyticsAdapter";
import { fetchVideoDiagnostics, type VideoDiagnostic } from "@/adapters/VideoDiagnosticsAdapter";
import { fetchThumbnailStyles,  type ThumbnailStyle  } from "@/adapters/ThumbnailStyleAdapter";
import { fetchReferenceVideos,  type ReferenceVideo  } from "@/adapters/ReferenceVideosAdapter";
import { fetchVideoTitleMap }                          from "@/adapters/VideoTitleMapAdapter";

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export type Period = "7d" | "30d" | "all";

/** calcGrowth 반환 구조 — 각 항목은 소수점 1자리 %, 기준값 없으면 null */
export interface GrowthResult {
  views:       number | null;
  likes:       number | null;
  watchTime:   number | null;
  avgDuration: number | null;
  subscribers: number | null;
  revenue:     number | null;
}

/** CTR 분포 버킷 — 히스토그램용 */
export interface CtrBucket {
  bucket: string;  // "0-2%", "2-4%", …, "10%+"
  value:  number;  // 해당 버킷 영상 수
}

/** Video_Diagnostics 진단 유형별 영상 수 */
export interface RiskSummary {
  thumbnailWeak:  number;  // THUMBNAIL_WEAK
  titleWeak:      number;  // TITLE_DISCOVERY_WEAK
  retentionWeak:  number;  // CONTENT_RETENTION_WEAK
  algoLow:        number;  // ALGORITHM_DISTRIBUTION_LOW
  total:          number;  // 이상 영상 합계 (NORMAL 제외)
}

export interface AnalyticsControllerResult {
  analytics:          AnalyticsResult | null;
  growth:             GrowthResult;
  period:             Period;
  setPeriod:          Dispatch<SetStateAction<Period>>;
  loadingAnalytics:   boolean;
  fetchedAt:          Date | null;
  refresh:            () => void;
  // ── 신규 Analytics 데이터 ─────────────────────────────────────────────────
  videoDiagnostics:   VideoDiagnostic[];
  thumbnailStyles:    ThumbnailStyle[];
  referenceVideos:    ReferenceVideo[];
  risk:               RiskSummary;
  ctrBuckets:         CtrBucket[];
}

export type { VideoDiagnostic, ThumbnailStyle, ReferenceVideo };

// ─── calcGrowth ───────────────────────────────────────────────────────────────

/**
 * 현재 기간과 이전 기간 summary를 비교해 성장율(%)을 반환한다.
 *
 * 공식: (current - prev30) / |prev30| × 100  (소수점 1자리 반올림)
 * 기준값이 0이거나 누락이면 null 반환.
 *
 * @param current  현재 기간 AnalyticsSummary
 * @param prev     이전 30일 AnalyticsSummary (prev30)
 */
export function calcGrowth(
  current: AnalyticsSummary | null | undefined,
  prev:    AnalyticsSummary | null | undefined,
): GrowthResult {
  /** 단일 지표 성장율 계산 */
  function pct(cur: number | undefined, prv: number | undefined): number | null {
    if (prv == null || prv === 0 || cur == null) return null;
    const raw = (cur - prv) / Math.abs(prv) * 100;
    return Math.round(raw * 10) / 10;
  }

  const empty: GrowthResult = {
    views: null, likes: null, watchTime: null, avgDuration: null, subscribers: null, revenue: null,
  };

  if (!current || !prev) return empty;

  return {
    views:       pct(current.views,            prev.views),
    likes:       pct(current.likes,            prev.likes),
    watchTime:   pct(current.watchTimeMin,     prev.watchTimeMin),
    avgDuration: pct(current.avgDurationSec,   prev.avgDurationSec),
    subscribers: pct(current.subscriberChange, prev.subscriberChange),
    // revenue: current.summary에 revenuePrev가 함께 저장됨 — prev30이 아닌 current 기준
    revenue:     pct(current.revenue, current.revenuePrev),
  };
}

// ─── useAnalyticsController ───────────────────────────────────────────────────

export function useAnalyticsController(): AnalyticsControllerResult {
  const [period, setPeriod]               = useState<Period>("30d");
  const [refreshKey, setRefreshKey]       = useState<number>(0);
  const [analytics, setAnalytics]         = useState<AnalyticsResult | null>(null);
  const [loadingAnalytics, setLoading]    = useState<boolean>(true);
  const [fetchedAt, setFetchedAt]         = useState<Date | null>(null);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  const [rawDiagnostics,  setDiagnostics] = useState<VideoDiagnostic[]>([]);
  const [thumbnailStyles, setStyles]      = useState<ThumbnailStyle[]>([]);
  const [rawReferences,   setReferences]  = useState<ReferenceVideo[]>([]);
  const [videoTitleMap,   setTitleMap]    = useState<Record<string, string>>({});

  // stale 응답 방지: 응답 도착 시점의 period와 요청 시점을 비교
  const periodRef = useRef<Period>(period);

  // ── 마운트 시 Analytics 부가 데이터 로드 (period 무관) ───────────────────
  useEffect(() => {
    fetchVideoDiagnostics().then(setDiagnostics).catch(() => {});
    fetchThumbnailStyles().then(setStyles).catch(() => {});
    fetchReferenceVideos().then(setReferences).catch(() => {});
    fetchVideoTitleMap().then(setTitleMap).catch(() => {});
  }, []);

  // ── period 변경 시 Analytics 재로드 ──────────────────────────────────────
  useEffect(() => {
    periodRef.current = period;
    setLoading(true);

    console.log(`[useAnalyticsController] period 변경 — ${period} 로드 시작`);

    fetchAnalytics(period)
      .then(result => {
        // 응답이 도착했을 때 period가 이미 변경되어 있으면 무시 (stale 방지)
        if (periodRef.current !== period) {
          console.log(
            `[useAnalyticsController] stale 응답 무시`
            + ` (요청: ${period}, 현재: ${periodRef.current})`
          );
          return;
        }
        console.log(
          `[useAnalyticsController] 로드 완료`
          + ` — source: ${result.source}`
          + `, current: ${result.current ? "OK" : "null"}`
          + `, hitVideos: ${result.hitVideos.length}개`
        );
        // source: "none" + current null = 시트 일시 비어있는 상태일 가능성
        // 기존 데이터가 있으면 덮어쓰지 않고 유지 (Snapshot clear→write 공백 보호)
        setAnalytics(prev => {
          if (result.source === "none" && !result.current && prev?.current) {
            console.warn("[useAnalyticsController] 빈 결과 수신 — 기존 데이터 유지 (stale protection)");
            return prev;
          }
          return result;
        });
        setFetchedAt(new Date());
      })
      .catch(err => {
        console.error("[useAnalyticsController] fetchAnalytics 오류:", err);
        // 오류 시 기존 데이터 유지 — null로 덮어 UI 빈 화면 방지
        setAnalytics(prev => {
          if (prev?.current) {
            console.warn("[useAnalyticsController] fetch 오류 — 기존 데이터 유지");
            return prev;
          }
          return { current: null, prev30: null, hitVideos: [], period, source: "none" };
        });
      })
      .finally(() => {
        // 현재 period가 요청 period와 동일할 때만 로딩 해제
        if (periodRef.current === period) {
          setLoading(false);
        }
      });
  }, [period, refreshKey]);

  // ── 성장율 계산 (메모이즈) ─────────────────────────────────────────────────
  const growth = useMemo<GrowthResult>(
    () => calcGrowth(analytics?.current?.summary, analytics?.prev30 ?? undefined),
    [analytics],
  );

  // ── videoDiagnostics title 보강 ──────────────────────────────────────────
  // 우선순위: d.title(시트) → hitVideos → videoTitleMap(_RawData_Master)
  // getSafeTitle은 UI 계층에서 적용 — 여기선 원본 문자열만 보강.
  const videoDiagnostics = useMemo<VideoDiagnostic[]>(() => {
    if (!rawDiagnostics.length) return rawDiagnostics;
    const hitTitleMap = new Map<string, string>(
      (analytics?.hitVideos ?? []).map(h => [h.key, (h.title ?? "").trim()])
    );
    return rawDiagnostics.map(d => {
      // videoId 형식이 아닌 실제 title이 있으면 그대로
      if (d.title && !/^[a-zA-Z0-9_-]{11}$/.test(d.title)) return d;
      const title =
        hitTitleMap.get(d.videoId) ||
        videoTitleMap[d.videoId]   ||
        "";
      return title ? { ...d, title } : d;
    });
  }, [rawDiagnostics, analytics?.hitVideos, videoTitleMap]);

  // ── referenceVideos title 보강 ────────────────────────────────────────────
  // Reference_Videos 시트에 title 컬럼이 없을 수 있으므로 videoTitleMap으로 보완.
  const referenceVideos = useMemo<ReferenceVideo[]>(() => {
    if (!rawReferences.length) return rawReferences;
    const hitTitleMap = new Map<string, string>(
      (analytics?.hitVideos ?? []).map(h => [h.key, (h.title ?? "").trim()])
    );
    return rawReferences.map(v => {
      if (v.title && !/^[a-zA-Z0-9_-]{11}$/.test(v.title)) return v;
      const title =
        hitTitleMap.get(v.videoId)  ||
        videoTitleMap[v.videoId]    ||
        "";
      return title ? { ...v, title } : v;
    });
  }, [rawReferences, analytics?.hitVideos, videoTitleMap]);

  // ── CTR 분포 버킷 (videoDiagnostics 변경 시 재계산) ─────────────────────
  const ctrBuckets = useMemo<CtrBucket[]>(() => {
    const counts: Record<string, number> = {
      "0-2%": 0, "2-4%": 0, "4-6%": 0, "6-8%": 0, "8-10%": 0, "10%+": 0,
    };
    for (const v of videoDiagnostics) {
      const pct = v.ctr * 100;
      if      (pct < 2)  counts["0-2%"]++;
      else if (pct < 4)  counts["2-4%"]++;
      else if (pct < 6)  counts["4-6%"]++;
      else if (pct < 8)  counts["6-8%"]++;
      else if (pct < 10) counts["8-10%"]++;
      else               counts["10%+"]++;
    }
    return Object.entries(counts).map(([bucket, value]) => ({ bucket, value }));
  }, [videoDiagnostics]);

  // ── 채널 리스크 요약 (videoDiagnostics 변경 시 재계산) ────────────────────
  const risk = useMemo<RiskSummary>(() => {
    const thumbnailWeak = videoDiagnostics.filter(v => v.diagnosis === "THUMBNAIL_WEAK").length;
    const titleWeak     = videoDiagnostics.filter(v => v.diagnosis === "TITLE_DISCOVERY_WEAK").length;
    const retentionWeak = videoDiagnostics.filter(v => v.diagnosis === "CONTENT_RETENTION_WEAK").length;
    const algoLow       = videoDiagnostics.filter(v => v.diagnosis === "ALGORITHM_DISTRIBUTION_LOW").length;
    return {
      thumbnailWeak,
      titleWeak,
      retentionWeak,
      algoLow,
      total: thumbnailWeak + titleWeak + retentionWeak + algoLow,
    };
  }, [videoDiagnostics]);

  return {
    analytics,
    growth,
    period,
    setPeriod,
    loadingAnalytics,
    fetchedAt,
    refresh,
    videoDiagnostics,
    thumbnailStyles,
    referenceVideos,
    risk,
    ctrBuckets,
  };
}

// ─── AnalyticsContext ─────────────────────────────────────────────────────────
// DashboardPage에서 한 번만 fetch → 모든 하위 패널이 공유
//
// 사용법:
//   <AnalyticsProvider> ... </AnalyticsProvider>  — 페이지 최상단
//   const data = useAnalyticsContext();            — 하위 컴포넌트

export const AnalyticsContext = createContext<AnalyticsControllerResult | null>(null);

/** DashboardPage 루트에서 감싸서 period 상태를 공유한다 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const value = useAnalyticsController();
  return createElement(AnalyticsContext.Provider, { value }, children);
}

/**
 * Analytics 데이터에 접근하는 훅.
 * AnalyticsProvider 안에서만 사용 가능.
 * Provider 없이 호출하면 에러를 던진다.
 */
export function useAnalyticsContext(): AnalyticsControllerResult {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    throw new Error(
      "[useAnalyticsContext] AnalyticsProvider 안에서만 사용 가능합니다.\n" +
      "DashboardPage를 <AnalyticsProvider>로 감싸세요.",
    );
  }
  return ctx;
}
