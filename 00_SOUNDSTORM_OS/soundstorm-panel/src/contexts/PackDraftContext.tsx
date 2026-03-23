// ─── PackDraftContext ──────────────────────────────────────────────────────────
// GrowthLoopMonitor (테마 선택) → ContentPackManager (팩 생성) 브릿지
//
// 규칙:
//   - createPack() 호출은 ContentPackManager 단독. GrowthLoopMonitor는 setDraft만 호출.
//   - draft가 set되면 ContentPackManager가 입력 필드를 열고 테마를 pre-fill한다.
//   - 생성 완료 또는 취소 시 clearDraft()로 상태 초기화.

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface PackDraft {
  theme:       string;
  sourceHint?: string; // "growth_loop" | "opportunity" 등 — 배너 표시용
}

interface PackDraftContextValue {
  draft:      PackDraft | null;
  setDraft:   (d: PackDraft) => void;
  clearDraft: () => void;
}

const PackDraftContext = createContext<PackDraftContextValue>({
  draft:      null,
  setDraft:   () => {},
  clearDraft: () => {},
});

export function PackDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<PackDraft | null>(null);

  return (
    <PackDraftContext.Provider value={{
      draft,
      setDraft:   (d) => setDraftState(d),
      clearDraft: () => setDraftState(null),
    }}>
      {children}
    </PackDraftContext.Provider>
  );
}

export function usePackDraft(): PackDraftContextValue {
  return useContext(PackDraftContext);
}
