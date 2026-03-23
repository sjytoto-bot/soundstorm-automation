// ─── ContentPackContext ───────────────────────────────────────────────────────
// useContentPackController를 React Context로 lift up
//
// 사용처:
//   - ContentPackManager: state + CRUD + generation
//   - GrowthLoopMonitor:  packs (read) + createPack
//
// DashboardPage에서 <ContentPackProvider>로 감싼다.

import { createContext, useContext, type ReactNode } from "react";
import {
  useContentPackController,
  type UseContentPackController,
} from "./useContentPackController";
import { useOnVideoPublished } from "@/hooks/useOnVideoPublished";

const ContentPackContext = createContext<UseContentPackController | null>(null);

export function ContentPackProvider({ children }: { children: ReactNode }) {
  const ctrl = useContentPackController();

  // video_id 세팅 시 redirectLinks.json 자동 연결
  useOnVideoPublished(ctrl.state.packs);

  return (
    <ContentPackContext.Provider value={ctrl}>
      {children}
    </ContentPackContext.Provider>
  );
}

export function useContentPackCtx(): UseContentPackController {
  const ctx = useContext(ContentPackContext);
  if (!ctx) throw new Error("useContentPackCtx: ContentPackProvider가 필요합니다.");
  return ctx;
}
