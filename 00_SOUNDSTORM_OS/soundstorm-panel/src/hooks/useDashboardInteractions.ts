import { useCallback, useRef, useState } from "react";
import { buildSelectedVideo } from "../lib/buildSelectedVideo";
import type { KpiInspectorData, VideoClickContext } from "../types/dashboardData";
import { useDashboardDiagFilter } from "../contexts/DashboardDiagFilterContext";
import { getRightPanelFocusFromContext, type RightPanelFocus } from "../components/layout/rightPanelFocus";

export function useDashboardInteractions({
  analytics,
  execution,
  reachRows,
  videoDiagnostics,
  videoTrendMap,
  setAutoAlertTasks,
}: {
  analytics: any;
  execution: any;
  reachRows: any[];
  videoDiagnostics: any[];
  videoTrendMap: Map<string, any[]>;
  setAutoAlertTasks: any;
}) {
  const { setActiveDiagFilter, setSelectedKpiInspector } = useDashboardDiagFilter();
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [autoExpandDiagVideo, setAutoExpandDiagVideo] = useState<string | null>(null);
  const [actionStartedId, setActionStartedId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<any>(null);
  const [diagHighlighted, setDiagHighlighted] = useState(false);
  const [channelPulseExpanded, setChannelPulseExpanded] = useState(false);

  const diagSectionRef   = useRef<HTMLDivElement>(null);
  const todayBriefRef    = useRef<HTMLDivElement>(null);
  const strategyPanelRef = useRef<HTMLDivElement>(null);

  function flashDiagnostics() {
    requestAnimationFrame(() => {
      diagSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        setDiagHighlighted(true);
        setTimeout(() => setDiagHighlighted(false), 2000);
      }, 400);
    });
  }

  function handleCommandAction(item: any) {
    if (item.type === "danger" || item.type === "warning") {
      if (item.videoId) {
        window.api?.registerActionStart?.({
          video_id:     item.videoId,
          action_type:  item.problemType ?? item.type.toUpperCase(),
          action_label: item.label,
          source:       "command_bar",
        }).catch(() => {});
        setActionStartedId(item.id);
        setTimeout(() => setActionStartedId(null), 2000);
        setAutoExpandDiagVideo(item.videoId);
      }
      flashDiagnostics();
      if (item.videoId) {
        setTimeout(() => {
          window.api?.registerActionComplete?.({
            video_id:     item.videoId,
            action_type:  (item.problemType ?? item.type ?? "DANGER").toUpperCase(),
            action_label: item.label,
            source:       "command_bar",
            pattern_tags: item.pattern_tags ?? [],
          }).catch(() => {});
        }, 2500);
      }
    } else {
      setConfirmItem(item);
    }
  }

  function navigateToPanel(item: any) {
    setConfirmItem(null);
    if (item.type === "strategy") {
      strategyPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (item.type === "upload") {
      todayBriefRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (item.type === "diagnosis") {
      flashDiagnostics();
    }
  }

  function handleCriticalAction(d: any) {
    if (d.videoId) {
      setAutoExpandDiagVideo(d.videoId);
      window.api?.registerActionStart?.({
        video_id:     d.videoId,
        action_type:  d.problemType ?? "CRITICAL",
        action_label: d.label ?? "Critical Alert",
        source:       "critical_banner",
      }).catch(() => {});
    }
    flashDiagnostics();
    if (d.videoId) {
      setTimeout(() => {
        window.api?.registerActionComplete?.({
          video_id:     d.videoId,
          action_type:  (d.problemType ?? "CRITICAL").toUpperCase(),
          action_label: d.label ?? "Critical Alert",
          source:       "critical_banner",
          pattern_tags: [],
        }).catch(() => {});
      }, 2500);
    }
  }

  function handleOpportunityClick(videoId: string) {
    setSelectedKpiInspector(null);
    setActiveDiagFilter("STRATEGY");
    setSelectedVideo(buildSelectedVideo(
      videoId,
      execution.uploadedThisWeek,
      reachRows,
      analytics?.hitVideos ?? [],
      videoDiagnostics,
      { videoTrendMap },
    ));
  }

  function setRightPanelFocus(focus: RightPanelFocus) {
    setSelectedKpiInspector(null);
    setActiveDiagFilter(focus);
  }

  function setKpiInspector(data: KpiInspectorData | null) {
    setSelectedKpiInspector(data);
    setActiveDiagFilter(data?.focus ?? null);
  }

  const handleVideoIdClick = useCallback(({ videoId, context }: { videoId: string; context: VideoClickContext }) => {
    setSelectedKpiInspector(null);
    setActiveDiagFilter(getRightPanelFocusFromContext(context));
    setSelectedVideo(buildSelectedVideo(
      videoId,
      execution.uploadedThisWeek,
      reachRows,
      analytics?.hitVideos ?? [],
      videoDiagnostics,
      { clickContext: context, videoTrendMap },
    ));
  }, [
    analytics?.hitVideos,
    execution.uploadedThisWeek,
    reachRows,
    setActiveDiagFilter,
    setSelectedKpiInspector,
    videoDiagnostics,
    videoTrendMap,
  ]);

  function handleStrategyAction(action: any, topIssue: any) {
    if (!topIssue?.videoId) return;
    window.api?.registerActionStart?.({
      video_id:     topIssue.videoId,
      action_type:  action.action_type ?? "STRATEGY",
      action_label: action.key ?? action.label,
      source:       "today_brief",
    }).catch(() => {});
    setAutoExpandDiagVideo(topIssue.videoId);
    flashDiagnostics();
    setTimeout(() => {
      window.api?.registerActionComplete?.({
        video_id:     topIssue.videoId,
        action_type:  (action.action_type ?? "STRATEGY").toUpperCase(),
        action_label: action.key ?? action.label ?? "",
        source:       "today_brief",
        pattern_tags: [],
      }).catch(() => {});
    }, 2500);
  }

  return {
    selectedVideo,
    setSelectedVideo,
    autoExpandDiagVideo,
    actionStartedId,
    confirmItem,
    setConfirmItem,
    diagHighlighted,
    channelPulseExpanded,
    setChannelPulseExpanded,
    refs: { diagSectionRef, todayBriefRef, strategyPanelRef },
    handleCommandAction,
    handleCriticalAction,
    handleOpportunityClick,
    handleVideoIdClick,
    handleStrategyAction,
    navigateToPanel,
    setRightPanelFocus,
    setKpiInspector,
    handleConfirmDone: () => setConfirmItem(null),
    handleConfirmCancel: () => setConfirmItem(null),
    flashDiagnostics,
    setAutoAlertTasks,
  };
}
