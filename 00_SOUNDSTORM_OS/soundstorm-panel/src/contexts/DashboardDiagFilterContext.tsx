// ─── DashboardDiagFilterContext ───────────────────────────────────────────────
// 진단 드릴다운 필터 전역 컨텍스트
//
// 역할: 채널 상태 카드 클릭 → RightSidePanel diagnosis mode 진입
//       판단은 한 곳 — setActiveDiagFilter 호출 시 RightSidePanel이 자동 전환
//
// Section 9 Step 2

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { RightPanelFocus } from "@/components/layout/rightPanelFocus";
import type { KpiInspectorData, VideoClickContext } from "@/types/dashboardData";

type DiagFilterCtx = {
  activeDiagFilter:    RightPanelFocus;
  setActiveDiagFilter: (key: RightPanelFocus) => void;
  selectedKpiInspector: KpiInspectorData | null;
  setSelectedKpiInspector: (data: KpiInspectorData | null) => void;
  openVideoDrilldown: ((params: { videoId: string; context: VideoClickContext }) => void) | null;
  setOpenVideoDrilldown: (fn: ((params: { videoId: string; context: VideoClickContext }) => void) | null) => void;
};

const DashboardDiagFilterContext = createContext<DiagFilterCtx>({
  activeDiagFilter:    null,
  setActiveDiagFilter: () => {},
  selectedKpiInspector: null,
  setSelectedKpiInspector: () => {},
  openVideoDrilldown: null,
  setOpenVideoDrilldown: () => {},
});

export function DashboardDiagFilterProvider({ children }: { children: ReactNode }) {
  const [activeDiagFilter, setActiveDiagFilter] = useState<string | null>(null);
  const [selectedKpiInspector, setSelectedKpiInspector] = useState<KpiInspectorData | null>(null);
  const openVideoDrilldownRef = useRef<((params: { videoId: string; context: VideoClickContext }) => void) | null>(null);

  const openVideoDrilldown = useCallback((params: { videoId: string; context: VideoClickContext }) => {
    openVideoDrilldownRef.current?.(params);
  }, []);

  const setOpenVideoDrilldown = useCallback((fn: ((params: { videoId: string; context: VideoClickContext }) => void) | null) => {
    openVideoDrilldownRef.current = fn;
  }, []);

  return (
    <DashboardDiagFilterContext.Provider value={{
      activeDiagFilter,
      setActiveDiagFilter,
      selectedKpiInspector,
      setSelectedKpiInspector,
      openVideoDrilldown,
      setOpenVideoDrilldown,
    }}>
      {children}
    </DashboardDiagFilterContext.Provider>
  );
}

export function useDashboardDiagFilter() {
  return useContext(DashboardDiagFilterContext);
}
