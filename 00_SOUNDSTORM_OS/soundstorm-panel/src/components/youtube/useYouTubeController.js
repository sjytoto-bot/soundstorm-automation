import { useState, useMemo, useEffect, useRef } from "react";
import { fetchSheetVideos } from "@/adapters/GoogleSheetAdapter";
import { fetchChannelKPI }  from "@/adapters/ChannelKPIAdapter";
import { normalizeVideos }  from "@/adapters/dataNormalizer";
import { CHANNEL_KPI, DAILY_STATS, TRAFFIC_STATS, TOP_VIDEOS } from "../../data/channelData";
import { runFullAnalysis } from "../../core/enginePipeline";
import { sortTracks } from "../../utils/strategyScore";
import { saveSnapshot, getSnapshots, deleteSnapshot } from "../../utils/strategySnapshot";
import { getDataSyncStatus } from "../../utils/dataSyncGuard";

// ─── 전략 문장 한국어 번역 ────────────────────────────────────────────────────
function translateStrategy(text) {
  if (!text) return text;

  // "Create more X content" → "X 콘텐츠 제작 강화"
  const createMore = text.match(/^Create more (.+?) content$/i);
  if (createMore) {
    const terms = createMore[1].split(/\s+/).slice(0, 5).join(" / ");
    return `${terms} 콘텐츠 제작 강화`;
  }

  // "Focus on X content" → "X 콘텐츠 집중 전략"
  const focusOn = text.match(/^Focus on (.+?) content$/i);
  if (focusOn) return `${focusOn[1]} 콘텐츠 집중 전략`;

  // "Decrease X in thumbnails" → "썸네일 X를 낮추고 대비를 높이세요"
  const thumbDec = text.match(/^Decrease (.+?) in thumbnails$/i);
  if (thumbDec) return `썸네일 ${thumbDec[1]}을 낮추고 대비를 높이세요`;

  // "Increase X in thumbnails" → "썸네일 X를 높이세요"
  const thumbInc = text.match(/^Increase (.+?) in thumbnails$/i);
  if (thumbInc) return `썸네일 ${thumbInc[1]}을 높이세요`;

  // "Upload around X:00" → "X:00에 업로드 권장"
  const uploadAt = text.match(/^Upload around (\d+):00$/i);
  if (uploadAt) return `${uploadAt[1]}:00에 업로드 권장`;

  return text;
}

// ─── useYouTubeController v3 ──────────────────────────────────────────────────
// UI → Controller → EnginePipeline 단일 흐름.
// 상태: videos(Sheets), period, weights, selectedTrackId, snapshots, loading
// 파생값: runFullAnalysis(videos, options) useMemo로 캐시
// 데이터: fetchSheetVideos() → normalizeVideos() → videos (실패 시 mock fallback)

export function useYouTubeController() {
  // ── 상태 ──────────────────────────────────────────────────────────────────
  const [videos, setVideos]                   = useState([]);
  const [rawVideoRows, setRawVideoRows]       = useState([]);  // RawVideoRow[] (fetchedAt 포함)
  const [loading, setLoading]                 = useState(true);
  // null = 정상 | "SYNC_FAILED" = 연결 실패 | "STALE_SNAPSHOT:ISO" = 스냅샷 사용 중
  const [syncError, setSyncError]             = useState(null);
  // 마지막 Sheets 성공 동기화 시각 (ISO string) — DataHealthBar 시간 표시용
  const [lastSyncAt, setLastSyncAt]           = useState(null);
  const [period, setPeriod]                   = useState("30");
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [weights, setWeights]                 = useState({
    growth:       0.25,
    reach:        0.25,
    engagement:   0.30,
    monetization: 0.20,
  });
  const [snapshots, setSnapshots]             = useState(() => getSnapshots());

  // ── Channel_KPI 상태 ────────────────────────────────────────────────────
  const [channelKPI, setChannelKPI]         = useState(null);
  const [channelKPIHistory, setChannelKPIHistory] = useState([]);

  // ── refs: 중복 실행 방지 + 데이터 변경 감지 ──────────────────────────────
  const loadingRef  = useRef(false);
  const prevHashRef = useRef("");
  const kpiLoadingRef = useRef(false);

  // ── 데이터 로드 함수 (초기 + polling 공유) ────────────────────────────────
  async function loadVideos() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      console.log("[YouTubeController] Loading videos from Sheets");
      const { videos: raw, error } = await fetchSheetVideos();
      setSyncError(error);
      if (!error) setLastSyncAt(new Date().toISOString());  // 성공 시만 갱신

      if (error === "SYNC_FAILED") {
        console.error("[YouTubeController] ❌ Sheets 연결 실패, 스냅샷도 없음");
        setVideos([]);
        setRawVideoRows([]);
        return;
      }

      if (error?.startsWith("STALE_SNAPSHOT:")) {
        console.warn("[YouTubeController] ⚠ 스냅샷 데이터 사용 중:", error);
        // 스냅샷 데이터로도 정상 분석 진행
      }

      console.log("[YouTubeController] Raw rows:", raw.length);
      const normalized = normalizeVideos(raw);
      console.log("[YouTubeController] Normalized videos:", normalized.length);
      if (normalized.length === 0) {
        console.warn("[YouTubeController] No normalized videos — check column mapping");
      }
      const hash       = JSON.stringify(normalized);
      if (hash !== prevHashRef.current) {
        prevHashRef.current = hash;
        setVideos(normalized);
        setRawVideoRows(raw);  // RawVideoRow[] 보존 (fetchedAt 조회수 추이용)
      }
    } catch (err) {
      console.error("[useYouTubeController] loadVideos 실패:", err);
    } finally {
      loadingRef.current = false;
    }
  }

  // ── Channel_KPI 로드 함수 ─────────────────────────────────────────────────
  async function loadChannelKPI() {
    if (kpiLoadingRef.current) return;
    kpiLoadingRef.current = true;
    try {
      const { latest, history } = await fetchChannelKPI();
      if (latest) {
        setChannelKPI(latest);
        setChannelKPIHistory(history);
        console.log("[useYouTubeController] Channel_KPI loaded:", latest);
      }
    } catch (err) {
      console.warn("[useYouTubeController] loadChannelKPI 실패:", err);
    } finally {
      kpiLoadingRef.current = false;
    }
  }

  // ── 초기 로드 + 5분 polling ───────────────────────────────────────────────
  useEffect(() => {
    loadVideos().finally(() => setLoading(false));
    loadChannelKPI();

    const intervalId = setInterval(() => {
      loadVideos();
      loadChannelKPI();
    }, 300_000);
    return () => clearInterval(intervalId);
  }, []);

  // ── 데이터 동기화 상태 (순수 계산 — 리렌더 없음) ──────────────────────────
  const syncStatus = getDataSyncStatus(DAILY_STATS, TRAFFIC_STATS);

  // ── 엔진 파이프라인 실행 (period + weights 변경 시 자동 재계산) ────────────
  const result = useMemo(() =>
    runFullAnalysis(videos, {
      period,
      dailyStats:  DAILY_STATS,
      channelInfo: CHANNEL_KPI,
      weights,
    }),
    [videos, period, weights],
  );

  // ── track 목록 (strategy 기준 내림차순 정렬) ──────────────────────────────
  const tracksWithScore = sortTracks(result.tracks, "strategy");

  // ── Content Clusters 조합 ────────────────────────────────────────────────
  const contentClusters = (result.contentClusters?.clusters ?? []).map(c => ({
    name:       c.cluster,
    videoCount: c.videoCount,
    avgViews:   c.avgViews,
    engagement: c.avgEngagement,
  }));

  // ── Trend Clusters 조합 (trendDetection + contentClusters join) ──────────
  const trendClusters = (() => {
    const trends   = result.trendDetection   ?? [];
    const clusterMap = new Map(
      (result.contentClusters?.clusters ?? []).map(c => [c.cluster, c])
    );
    return trends.map(t => ({
      name:     t.cluster,
      trend:    t.trendStatus,           // "Trending" | "Stable" | "Declining"
      momentum: t.trendScore,            // 0~1
      avgViews: clusterMap.get(t.cluster)?.avgViews ?? 0,
    }));
  })();

  // ── Algorithm Signals 데이터 조합 ────────────────────────────────────────
  const algorithmSignals = (() => {
    // Momentum: 최근 7일 영상 중 Rising 비율 (%)
    const em = result.earlyMomentum;
    const momentum = em?.earlyCount > 0
      ? Math.round((em.risingCount / em.earlyCount) * 100)
      : null;

    // Velocity: trafficGrowth byVideo 기준 채널 전반 상태
    const byVideo = result.trafficGrowth?.byVideo ?? [];
    const explodingCnt = byVideo.filter(v => v.growthStatus === "Exploding").length;
    const growingCnt   = byVideo.filter(v => v.growthStatus === "Growing").length;
    const velocity = explodingCnt > 0 ? "Exploding"
                   : growingCnt   > 0 ? "Growing"
                   : "Flat";

    // Algorithm Entry: boostCount > 0 → "Algorithm Boost", enteringCount > 0 → "Entering"
    const ae = result.algorithmEntry;
    const algorithmEntry = ae?.boostCount > 0    ? "Algorithm Boost"
                         : ae?.enteringCount > 0 ? "Entering"
                         : "Normal";

    // Recommendation Traffic: SUGGESTED_VIDEO 키 비율 (channelTraffic.groups)
    const groups = result.channelTraffic?.groups ?? {};
    const recKeys = ["SUGGESTED_VIDEO", "RELATED_VIDEO", "WHAT_TO_WATCH"];
    const recRatio = recKeys.reduce((s, k) => s + (groups[k] ?? 0), 0);
    const recommendationTraffic = recRatio > 0 ? Math.round(recRatio * 100) : null;

    return { momentum, velocity, algorithmEntry, recommendationTraffic };
  })();

  // ── Opportunity Videos — Rising / Exploding / Algorithm Boost 영상 ─────────
  const opportunityVideos = (() => {
    const algoMap = new Map(
      (result.algorithmEntry?.byVideo ?? [])
        .filter(v => v.entryStatus === "Boost" || v.entryStatus === "Entering")
        .map(v => [v.videoId, v.entryStatus])
    );
    const seen = new Set();
    const opps = [];
    for (const t of tracksWithScore) {
      if (opps.length >= 5) break;
      if (seen.has(t.videoId)) continue;
      let signal = null;
      if (t.earlyMomentum?.momentumStatus === "Rising") {
        signal = "모멘텀 ↑";
      } else if (algoMap.get(t.videoId) === "Boost") {
        signal = "알고리즘 부스트";
      } else if (algoMap.has(t.videoId)) {
        signal = "알고리즘 진입";
      } else if (t.trafficGrowth?.growthStatus === "Exploding") {
        signal = "조회수 폭발";
      } else if (t.trafficGrowth?.growthStatus === "Growing") {
        signal = "조회수 상승";
      }
      if (signal) {
        seen.add(t.videoId);
        opps.push({
          videoId: t.videoId,
          title:   t.name,
          signal,
          insight: {
            strategyScore:  t.strategy?.total   ?? undefined,
            strategyGrade:  t.strategy?.grade   ?? undefined,
            growthStatus:   t.trafficGrowth?.growthStatus   ?? undefined,
            momentumStatus: t.earlyMomentum?.momentumStatus ?? undefined,
          },
        });
      }
    }
    return opps;
  })();

  // ── Next Strategy 데이터 조합 ─────────────────────────────────────────────
  const { strategyOptimizer, performancePrediction, uploadTiming, recommendations } = result;
  const nextStrategy = {
    nextContent:      translateStrategy(strategyOptimizer?.contentStrategy   ?? null),
    expectedViews:    performancePrediction?.predictedViews
                        ? Math.round(performancePrediction.predictedViews * 0.8)
                        : null,
    expectedViewsHigh: performancePrediction?.predictedViews
                        ? Math.round(performancePrediction.predictedViews * 1.2)
                        : null,
    bestUploadTime:   uploadTiming?.bestHour >= 0
                        ? `${uploadTiming.bestHour}:00`
                        : null,
    thumbnailAdvice:  translateStrategy(strategyOptimizer?.thumbnailStrategy ?? null),
    strategicNote:    translateStrategy(recommendations?.[0]?.message        ?? strategyOptimizer?.contentStrategy ?? null),
    confidence:       performancePrediction?.confidence     ?? 0,
  };

  // ── track 선택 상태 ────────────────────────────────────────────────────────
  const selectTrack   = id => setSelectedTrackId(prev => prev === id ? null : id);
  const selectedTrack = result.tracks.find(t => t.id === selectedTrackId) ?? null;

  // ── Snapshot 핸들러 ────────────────────────────────────────────────────────
  const handleSaveSnapshot = (label) => {
    const snapshot = {
      id:        Date.now().toString(),
      label,
      period,
      weights,
      tracks:    result.tracks.map(t => ({
        id:    t.id,
        total: t.strategy.total,
        grade: t.strategy.grade,
        delta: t.strategy.delta,
      })),
      createdAt: Date.now(),
    };
    saveSnapshot(snapshot);
    setSnapshots(getSnapshots());
  };

  const handleLoadSnapshot = (snapshot) => {
    setPeriod(snapshot.period);
    setWeights(snapshot.weights);
    // period + weights 복원 후 useMemo 자동 재계산
  };

  const handleDeleteSnapshot = (id) => {
    deleteSnapshot(id);
    setSnapshots(getSnapshots());
  };

  // ── _RawData_Master 기반 조회수 추이 (data_fetched_at 기준 집계) ────────────
  // 스펙: 조회수 추이 → _RawData_Master → 날짜별 조회수
  const masterTrendData = useMemo(() => {
    const dateMap = new Map();
    for (const v of rawVideoRows) {
      if (!v.fetchedAt) continue;
      const date = v.fetchedAt.slice(0, 10);   // "2026-03-10 11:52:26" → "2026-03-10"
      dateMap.set(date, (dateMap.get(date) ?? 0) + (v.views ?? 0));
    }
    if (dateMap.size < 2) return null;          // 단일 스냅샷이면 추이 없음 → fallback
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, views]) => ({ date: date.slice(5), views })); // "03-10" 형식
  }, [rawVideoRows]);

  // ── Channel_KPI 기반 차트 데이터 변환 (date "2026-03-10" → "03-10") ─────────
  const kpiChartData = channelKPIHistory.length >= 2
    ? channelKPIHistory.map(r => ({
        date:    r.date.slice(5),
        views:   r.views30d,
        revenue: r.estimatedRevenueKrw,
      }))
    : null;

  return {
    // ── 채널 / KPI — Channel_KPI 시트 우선, fallback: result.kpis → mock ────
    // 조회수 추이: _RawData_Master → Channel_KPI → mock 순으로 fallback
    dailyStats:       masterTrendData ?? kpiChartData ?? DAILY_STATS,
    topVideos:        TOP_VIDEOS,
    subscribers:      channelKPI?.subscribers          ?? result.kpis?.subscribers      ?? CHANNEL_KPI.subscribers,
    subscriberChange: channelKPI?.subscriberChange     ?? result.kpis?.subscriberChange ?? CHANNEL_KPI.subscriberChange,
    total30Views:     channelKPI?.views30d             ?? result.kpis?.total30Views     ?? 0,
    total30Revenue:   channelKPI?.estimatedRevenueKrw  ?? result.kpis?.total30Revenue   ?? 0,
    avgDailyViews:    channelKPI?.avgViews             ?? result.kpis?.avgDailyViews    ?? 0,
    // Channel_KPI.algorithm_score 직접 전달 (null이면 ChannelOverviewPanel에서 신호 기반 계산)
    algorithmFitness: channelKPI?.algorithmScore       ?? null,
    // ── 원본 영상 목록 (publishedAt 기반 최신 영상 탐지용) ───────────────
    videos,
    // ── 트랙 ──────────────────────────────────────────────────────────────
    tracksWithScore,
    selectedTrack,
    selectTrack,
    // ── 필터 + 가중치 ──────────────────────────────────────────────────────
    period,
    setPeriod,
    weights,
    setWeights,
    // ── 스냅샷 ────────────────────────────────────────────────────────────
    snapshots,
    handleSaveSnapshot,
    handleLoadSnapshot,
    handleDeleteSnapshot,
    // ── 로딩 / 동기화 상태 ───────────────────────────────────────────────
    loading,
    syncError,   // null | "SYNC_FAILED" | "STALE_SNAPSHOT:ISO"
    lastSyncAt,  // ISO string | null — 마지막 Sheets 성공 동기화 시각
    // ── 동기화 상태 ────────────────────────────────────────────────────────
    syncStatus,
    // ── Internal Influence 분석 ────────────────────────────────────────────
    internalAnalysis: result.internalAnalysis,
    // ── Early Momentum 분석 ────────────────────────────────────────────────
    earlyMomentum: result.earlyMomentum,
    // ── Content Clusters ──────────────────────────────────────────────────────
    contentClusters,
    // ── Trend Clusters ────────────────────────────────────────────────────────
    trendClusters,
    // ── Algorithm Signals ──────────────────────────────────────────────────────
    algorithmSignals,
    // ── Next Strategy 요약 ─────────────────────────────────────────────────────
    nextStrategy,
    // ── 채널 트래픽 집계 ─────────────────────────────────────────────────
    channelTraffic:       result.channelTraffic,
    channelInternalRatio: result.channelInternalRatio,
    // ── 기회 영상 ────────────────────────────────────────────────────────
    opportunityVideos,
  };
}
