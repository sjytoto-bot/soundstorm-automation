// ─── ReachDataContext ──────────────────────────────────────────────────────────
// _RawData_Master reachRows를 DashboardPage → 하위 컴포넌트(TopVideos, TrendingVideos)에
// 전달하기 위한 글로벌 컨텍스트.
//
// DashboardPage에서 fetchReachData()로 이미 로드된 reachRows를 공유한다.
// 별도 fetch 없이 단순 값 전달 용도.

import { createContext, useContext } from "react";
import type { ReachRow } from "@/adapters/reachAdapter";

const ReachDataContext = createContext<ReachRow[]>([]);

export function ReachDataProvider({
  rows,
  children,
}: {
  rows:     ReachRow[];
  children: React.ReactNode;
}) {
  return (
    <ReachDataContext.Provider value={rows}>
      {children}
    </ReachDataContext.Provider>
  );
}

export function useReachData(): ReachRow[] {
  return useContext(ReachDataContext);
}
