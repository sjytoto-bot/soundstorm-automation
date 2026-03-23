import { useEffect, useMemo, useRef, useState } from "react";
import { useAnalyticsContext } from "../controllers/useAnalyticsController";
import { useYouTubeController }  from "../components/youtube/useYouTubeController";
import { useExecutionController } from "../controllers/useExecutionController";
import { fetchReachData, fetchHourlyViews, getChannelAvgCTR, getChannelCTRGrowth, type ReachRow, type HourlyViewRow } from "../adapters/reachAdapter";
import { fetchChannelKPI } from "../adapters/ChannelKPIAdapter";
import { computeCampaignStats, computeExternalDrop, fetchRedirectLinks } from "../adapters/redirectAdapter";
import { getRecentPerformanceVideos } from "../lib/recentPerformance";
import { getUnderperformingVideos } from "../lib/getUnderperformingVideos";
import { computeDataHealth } from "../utils/dataHealthReport";
import {
  computeDailyStrategy,
  computeVideoPortfolio,
  computeChannelHealth,
  computeGrowthData,
  computeGoldenHour,
} from "../engine/strategyEngine";
import { generateThemeSuggestions, toThemeStrings } from "../engines/themeIntelligenceEngine";
import { useTodayActionController } from "../controllers/useTodayActionController";
import { useDiagnosticsController } from "../controllers/useDiagnosticsController";
import { buildVideoTrendMap } from "../adapters/VideoTrendAdapter";
import { buildVideoTrafficMap } from "../adapters/VideoTrafficAdapter";
import { buildRedirectMap } from "../controllers/RedirectStatsContext";
import type { AutoAlertTask } from "../types/alertTypes";
import type { EarlyPerfData } from "../components/dashboard/EarlyPerformanceCompact";

export function useDashboardRuntime() {
  const { analytics, videoDiagnostics, period } = useAnalyticsContext();
  const { tracksWithScore, opportunityVideos, syncError: _syncError, lastSyncAt: _lastSyncAt } = useYouTubeController();
  const syncError  = _syncError as string | null;
  const lastSyncAt = _lastSyncAt as string | null;
  const execution  = useExecutionController({ tracksWithScore, opportunityVideos });

  const packContext = useMemo(() => ({
    keywords:    execution.topicMomentum.map(t => t.topic),
    topVideos:   tracksWithScore.slice(0, 5).map(t => ({ title: t.name, views: undefined })),
    opportunity: opportunityVideos.slice(0, 3).map(v => v.title),
  }), [execution.topicMomentum, tracksWithScore, opportunityVideos]);

  const [reachRows,         setReachRows]        = useState<ReachRow[]>([]);
  const [hourlyViews,       setHourlyViews]      = useState<HourlyViewRow[]>([]);
  const [lastReachUpdated,  setLastReachUpdated] = useState<Date | null>(null);
  const isFetchingReachRef = useRef(false);
  const prevReachHashRef   = useRef("");

  useEffect(() => {
    const fetchWithGuard = async () => {
      if (isFetchingReachRef.current) return;
      isFetchingReachRef.current = true;
      try {
        const data = await fetchReachData();
        const hash = JSON.stringify(data);
        if (hash !== prevReachHashRef.current) {
          setReachRows(data);
          setLastReachUpdated(new Date());
          prevReachHashRef.current = hash;
        }
      } catch {
        // keep last good state
      } finally {
        isFetchingReachRef.current = false;
      }
    };

    fetchWithGuard();
    const interval = setInterval(fetchWithGuard, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { fetchHourlyViews().then(setHourlyViews).catch(() => {}); }, []);

  const suggestedThemes = useMemo(() => {
    const suggestions = generateThemeSuggestions(
      reachRows,
      [],
      execution.topicMomentum,
      opportunityVideos.slice(0, 5).map(v => v.title),
    );
    return toThemeStrings(suggestions);
  }, [reachRows, execution.topicMomentum, opportunityVideos]);

  const [autoAlertTasks, setAutoAlertTasks] = useState<AutoAlertTask[]>([]);
  useEffect(() => {
    const api = window.api;
    if (!api?.loadTasks) return;
    api.loadTasks()
      .then((tasks: AutoAlertTask[]) => {
        setAutoAlertTasks(
          tasks.filter(t =>
            t.source === "auto_alert" &&
            t.priority === "CRITICAL" &&
            t.status !== "done" &&
            t.status !== "DONE",
          ),
        );
      })
      .catch(() => {});
  }, []);

  const [videoTrendMap, setVideoTrendMap] = useState(() => new Map());
  useEffect(() => {
    const api = window.api;
    if (!api?.fetchSheetVideos) return;
    api.fetchSheetVideos(["_VideoTrend"])
      .then((result: Record<string, Record<string, string>[]>) => {
        setVideoTrendMap(buildVideoTrendMap(result["_VideoTrend"] ?? []));
      })
      .catch(() => {});
  }, []);

  const [videoTrafficMap, setVideoTrafficMap] = useState(() => new Map());
  useEffect(() => {
    const api = window.api;
    if (!api?.fetchSheetVideos) return;
    api.fetchSheetVideos(["_VideoTraffic"])
      .then((result: Record<string, Record<string, string>[]>) => {
        setVideoTrafficMap(buildVideoTrafficMap(result["_VideoTraffic"] ?? []));
      })
      .catch(() => {});
  }, []);

  const [redirectMap, setRedirectMap] = useState(() => new Map());
  useEffect(() => {
    const api = window.api;
    if (!api?.readRedirectLogs) return;
    api.readRedirectLogs()
      .then((logs: Record<string, string>[]) => setRedirectMap(buildRedirectMap(logs)))
      .catch(() => {});
  }, []);

  const [kpiHistory, setKpiHistory] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    (fetchChannelKPI as any)()
      .then(({ history }: any) => {
        if (!cancelled && history?.length) setKpiHistory(history);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const [typeRates, setTypeRates] = useState<Record<string, number>>({});
  useEffect(() => {
    const api = window.api;
    if (!api?.loadActionTypeRates) return;
    api.loadActionTypeRates().then((r: any) => { if (r) setTypeRates(r); }).catch(() => {});
  }, []);

  const [campaignStats, setCampaignStats] = useState<any[]>([]);
  const [externalDrop, setExternalDrop] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const api = window.api;
        if (!api?.readRedirectLogs) return;
        const [logs, links, rows] = await Promise.all([
          api.readRedirectLogs(),
          (fetchRedirectLinks as any)(),
          fetchReachData(),
        ]);
        if (cancelled) return;
        setCampaignStats((computeCampaignStats as any)(logs, links, rows));
        setExternalDrop((computeExternalDrop as any)(logs, links, 7));
      } catch {
        // noop
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const channelAvgCTR = useMemo(() => getChannelAvgCTR(reachRows, period), [reachRows, period]);
  const ctrGrowth     = useMemo(() => getChannelCTRGrowth(reachRows, period), [reachRows, period]);

  const earlyPerfData: EarlyPerfData | null = useMemo(() => {
    if (reachRows.length === 0) return null;
    const sorted = [...reachRows]
      .filter(r => r.published_at)
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    const latest = sorted[0] ?? reachRows[0];
    return {
      videoId:         latest.video_id,
      videoTitle:      latest.title ?? latest.video_id,
      publishedAt:     latest.published_at ?? "",
      views:           latest.views > 0 ? latest.views : null,
      impressions:     latest.impressions != null && latest.impressions > 0 ? latest.impressions : null,
      ctr:             latest.ctr != null && latest.ctr > 0 ? latest.ctr : null,
      avgViewDuration: null,
      channelAvgCTR,
    };
  }, [reachRows, channelAvgCTR]);

  const { diagnostics, recentPerfVideos, dataHealth } = useMemo(() => {
    const reachTitleMap = new Map(reachRows.map(r => [r.video_id, r.title ?? ""]));
    const hitTitleMap   = new Map((analytics?.hitVideos ?? []).map(h => [h.key, h.title ?? ""]));

    const diagnostics = !videoDiagnostics.length
      ? videoDiagnostics
      : videoDiagnostics.map((d: any) => {
          if (d.title) return d;
          const title = reachTitleMap.get(d.videoId) || hitTitleMap.get(d.videoId) || "";
          return title ? { ...d, title } : d;
        });

    const recentPerfVideos = getRecentPerformanceVideos(
      execution.uploadedThisWeek,
      reachRows,
      30,
      diagnostics,
    );

    const dataHealth = computeDataHealth(reachRows, execution.uploadedThisWeek);
    return { diagnostics, recentPerfVideos, dataHealth };
  }, [videoDiagnostics, reachRows, analytics?.hitVideos, execution.uploadedThisWeek]);

  const strategy = useMemo(() => (computeDailyStrategy as any)(diagnostics, typeRates), [diagnostics, typeRates]);
  const portfolio = useMemo(() => (computeVideoPortfolio as any)(diagnostics), [diagnostics]);
  const healthData = useMemo(() => (computeChannelHealth as any)(diagnostics, kpiHistory, diagnostics), [diagnostics, kpiHistory]);
  const growthData = useMemo(() => (computeGrowthData as any)(kpiHistory), [kpiHistory]);
  const goldenHour = useMemo(() => (computeGoldenHour as any)(kpiHistory, reachRows, hourlyViews), [kpiHistory, reachRows, hourlyViews]);
  const underperformingVideos = useMemo(
    () => getUnderperformingVideos({ videoDiagnostics: diagnostics, kpiHistory }),
    [diagnostics, kpiHistory],
  );

  const { decisionBar, criticalAlerts, primaryAction, secondaryActions, urgent } = useTodayActionController({
    diagnostics, strategy, goldenHour, typeRates,
  });

  const { hasAnyIssue: hasDiagIssues } = useDiagnosticsController({ diagnostics, externalDrop });
  const isLoading = diagnostics.length === 0 && kpiHistory.length === 0;

  function refreshReach() {
    prevReachHashRef.current = "";
    isFetchingReachRef.current = false;
    fetchReachData()
      .then(data => {
        setReachRows(data);
        setLastReachUpdated(new Date());
        prevReachHashRef.current = JSON.stringify(data);
      })
      .catch(() => {});
  }

  return {
    analytics,
    videoDiagnostics,
    syncError,
    lastSyncAt,
    execution,
    packContext,
    reachRows,
    lastReachUpdated,
    videoTrendMap,
    videoTrafficMap,
    redirectMap,
    kpiHistory,
    channelAvgCTR,
    ctrGrowth,
    diagnostics,
    recentPerfVideos,
    dataHealth,
    strategy,
    portfolio,
    healthData,
    growthData,
    goldenHour,
    decisionBar,
    criticalAlerts,
    primaryAction,
    secondaryActions,
    urgent,
    earlyPerfData,
    campaignStats,
    externalDrop,
    underperformingVideos,
    autoAlertTasks,
    setAutoAlertTasks,
    isLoading,
    hasDiagIssues,
    suggestedThemes,
    refreshReach,
  };
}
