// ─── SuggestedThemesContext ────────────────────────────────────────────────────
// DashboardPage에서 한 번 계산된 suggestedThemes를 하위 컴포넌트에 공유
// ContentPackManager + GrowthLoopMonitor 모두 이 컨텍스트에서 읽는다.
// DashboardPage에서 이중 fetch/계산 방지를 위해 별도 훅 사용 금지.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

const SuggestedThemesContext = createContext<string[]>([]);

export function SuggestedThemesProvider({
  children,
  themes,
}: {
  children: ReactNode;
  themes:   string[];
}) {
  return (
    <SuggestedThemesContext.Provider value={themes}>
      {children}
    </SuggestedThemesContext.Provider>
  );
}

export function useSuggestedThemes(): string[] {
  return useContext(SuggestedThemesContext);
}
