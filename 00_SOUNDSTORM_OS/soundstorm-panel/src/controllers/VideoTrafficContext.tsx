// ─── VideoTrafficContext ───────────────────────────────────────────────────────
// 영상별 트래픽 소스 Map을 전역 제공한다.
//
// DashboardPage에서 _VideoTraffic 시트 로드 후 VideoTrafficProvider로 래핑.
// VideoDetailModal에서 useVideoTraffic(videoId)로 해당 영상 DimensionRow[] 조회.

import { createContext, useContext } from "react";
import type { DimensionRow } from "@/adapters/AnalyticsAdapter";

const VideoTrafficContext = createContext<Map<string, DimensionRow[]>>(new Map());

export function VideoTrafficProvider({
  data,
  children,
}: {
  data:     Map<string, DimensionRow[]>;
  children: React.ReactNode;
}) {
  return (
    <VideoTrafficContext.Provider value={data}>
      {children}
    </VideoTrafficContext.Provider>
  );
}

/** video_id에 해당하는 DimensionRow[] 반환. 없으면 빈 배열. */
export function useVideoTraffic(videoId: string): DimensionRow[] {
  const map = useContext(VideoTrafficContext);
  return map.get(videoId) ?? [];
}
