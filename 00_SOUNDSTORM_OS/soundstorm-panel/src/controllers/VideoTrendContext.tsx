// ─── VideoTrendContext ────────────────────────────────────────────────────────
// 영상별 일별 조회수 추세 Map을 전역 제공한다.
//
// DashboardPage에서 _VideoTrend 시트 로드 후 VideoTrendProvider로 래핑.
// VideoDetailModal에서 useVideoTrend(videoId)로 해당 영상 TrendPoint[] 조회.

import { createContext, useContext } from "react";
import type { TrendPoint } from "@/adapters/AnalyticsAdapter";

const VideoTrendContext = createContext<Map<string, TrendPoint[]>>(new Map());

export function VideoTrendProvider({
  data,
  children,
}: {
  data:     Map<string, TrendPoint[]>;
  children: React.ReactNode;
}) {
  return (
    <VideoTrendContext.Provider value={data}>
      {children}
    </VideoTrendContext.Provider>
  );
}

/** video_id에 해당하는 TrendPoint[] 반환. 없으면 빈 배열. */
export function useVideoTrend(videoId: string): TrendPoint[] {
  const map = useContext(VideoTrendContext);
  return map.get(videoId) ?? [];
}
