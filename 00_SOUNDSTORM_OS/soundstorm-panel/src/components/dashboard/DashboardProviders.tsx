import type { ReactNode } from "react";
import { SuggestedThemesProvider } from "../../contexts/SuggestedThemesContext";
import { PackDraftProvider } from "../../contexts/PackDraftContext";
import { ReachDataProvider } from "../../controllers/ReachDataContext";
import { VideoTrendProvider } from "../../controllers/VideoTrendContext";
import { VideoTrafficProvider } from "../../controllers/VideoTrafficContext";
import { RedirectStatsProvider } from "../../controllers/RedirectStatsContext";

export default function DashboardProviders({
  suggestedThemes,
  reachRows,
  videoTrendMap,
  videoTrafficMap,
  redirectMap,
  children,
}: {
  suggestedThemes: string[];
  reachRows: any[];
  videoTrendMap: Map<any, any>;
  videoTrafficMap: Map<any, any>;
  redirectMap: Map<any, any>;
  children: ReactNode;
}) {
  return (
    <SuggestedThemesProvider themes={suggestedThemes}>
      <PackDraftProvider>
        <ReachDataProvider rows={reachRows}>
          <VideoTrendProvider data={videoTrendMap}>
            <VideoTrafficProvider data={videoTrafficMap}>
              <RedirectStatsProvider data={redirectMap}>
                {children}
              </RedirectStatsProvider>
            </VideoTrafficProvider>
          </VideoTrendProvider>
        </ReachDataProvider>
      </PackDraftProvider>
    </SuggestedThemesProvider>
  );
}
