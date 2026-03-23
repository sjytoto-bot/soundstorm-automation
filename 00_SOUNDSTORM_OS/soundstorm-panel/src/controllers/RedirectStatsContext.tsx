// ─── RedirectStatsContext ─────────────────────────────────────────────────────
// redirect_logs.csv → Map<videoId, {platform, clicks}[]> 전역 제공
//
// DashboardPage에서 window.api.readRedirectLogs() 로드 후 빌드.
// VideoDetailModal에서 useRedirectStats(videoId)로 외부 캠페인 유입 조회.
//
// 데이터 조건:
//   - redirectLinks.json의 target_video 필드에 video_id가 입력된 링크만 집계됨
//   - target_video 비어 있는 slug는 무시

import { createContext, useContext } from "react";

export interface RedirectStat {
  platform: string;
  clicks:   number;
}

type RedirectMap = Map<string, RedirectStat[]>;

const RedirectStatsContext = createContext<RedirectMap>(new Map());

export function buildRedirectMap(
  logs: Record<string, string>[],
): RedirectMap {
  const raw = new Map<string, Map<string, number>>();

  for (const row of logs) {
    const videoId  = (row["target_video"] ?? "").trim();
    const platform = (row["platform"]     ?? "DIRECT").trim();
    if (!videoId) continue;

    if (!raw.has(videoId)) raw.set(videoId, new Map());
    const pm = raw.get(videoId)!;
    pm.set(platform, (pm.get(platform) ?? 0) + 1);
  }

  const result: RedirectMap = new Map();
  for (const [videoId, pm] of raw) {
    const stats: RedirectStat[] = Array.from(pm.entries())
      .map(([platform, clicks]) => ({ platform, clicks }))
      .sort((a, b) => b.clicks - a.clicks);
    result.set(videoId, stats);
  }
  return result;
}

export function RedirectStatsProvider({
  data,
  children,
}: {
  data:     RedirectMap;
  children: React.ReactNode;
}) {
  return (
    <RedirectStatsContext.Provider value={data}>
      {children}
    </RedirectStatsContext.Provider>
  );
}

/** video_id의 외부 캠페인 유입 통계 반환. 없으면 빈 배열. */
export function useRedirectStats(videoId: string): RedirectStat[] {
  const map = useContext(RedirectStatsContext);
  return map.get(videoId) ?? [];
}
