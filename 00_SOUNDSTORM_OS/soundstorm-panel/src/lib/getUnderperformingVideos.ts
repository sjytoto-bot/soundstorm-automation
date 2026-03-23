import type { VideoDiagnostic } from "@/adapters/VideoDiagnosticsAdapter";
import type { ChannelKPIRow } from "@/adapters/ChannelKPIAdapter";
import { getSafeTitle } from "@/utils/videoTitle";

export interface UnderperformingVideo {
  videoId: string;
  title: string;
  views: number;
  viewsDeltaPercent: number;
  ctr: number;
  ctrDelta: number;
  reason: string;
}

interface Params {
  videoDiagnostics: VideoDiagnostic[];
  kpiHistory: ChannelKPIRow[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avgCtr(rows: VideoDiagnostic[]): number {
  const ctrRows = rows.filter(row => Number.isFinite(row.ctr) && row.ctr > 0);
  if (!ctrRows.length) return 0;
  return ctrRows.reduce((sum, row) => sum + row.ctr, 0) / ctrRows.length;
}

function buildReason(row: VideoDiagnostic, channelAvgViews: number, channelAvgCtr: number): string {
  const ctrLow = channelAvgCtr > 0 && row.ctr < channelAvgCtr * 0.7;
  const viewsLow = channelAvgViews > 0 && row.views < channelAvgViews * 0.8;
  const trafficLow = (row.impressionsChange ?? 0) <= -0.2;

  if (trafficLow) return "추천 노출 감소";
  if (ctrLow) return "클릭률 저조";
  if (viewsLow) return "조회수 하락";
  return "성과 저하";
}

export function getUnderperformingVideos({
  videoDiagnostics,
  kpiHistory,
}: Params): UnderperformingVideo[] {
  if (!videoDiagnostics.length || !kpiHistory.length) return [];

  const latestKpi = [...kpiHistory]
    .filter(row => row?.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);

  const channelAvgViews = latestKpi?.avgViews ?? 0;
  if (channelAvgViews <= 0) return [];

  const recentVideos = [...videoDiagnostics]
    .sort((a, b) => (b.rowIndex ?? 0) - (a.rowIndex ?? 0))
    .slice(0, 10);

  const channelAvgCtr = avgCtr(recentVideos) || avgCtr(videoDiagnostics);
  if (channelAvgCtr <= 0) return [];

  return recentVideos
    .filter(row => {
      const viewsLow = row.views < channelAvgViews * 0.8;
      const ctrLow = row.ctr < channelAvgCtr * 0.7;
      return viewsLow || ctrLow;
    })
    .map(row => ({
      videoId: row.videoId,
      title: getSafeTitle(row.trackName ?? row.title),
      views: row.views,
      viewsDeltaPercent: round1(((row.views - channelAvgViews) / channelAvgViews) * 100),
      ctr: row.ctr,
      ctrDelta: round1((row.ctr - channelAvgCtr) * 100),
      reason: buildReason(row, channelAvgViews, channelAvgCtr),
    }))
    .sort((a, b) => a.viewsDeltaPercent - b.viewsDeltaPercent);
}
