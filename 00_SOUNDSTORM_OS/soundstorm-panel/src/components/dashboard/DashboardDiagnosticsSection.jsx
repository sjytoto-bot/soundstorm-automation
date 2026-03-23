// ─── DashboardDiagnosticsSection.jsx ─────────────────────────────────────────
// 진단 허브 — CTRAlert + ImpressionDrop + Retention + Campaign
//
// Props:
//   diagnostics    — VideoDiagnostic[]
//   campaignStats  — CampaignStat[]
//   onVideoClick   — (VideoDiagnostic) => void

import DiagnosticsPanel       from "../youtube/DiagnosticsPanel";
import CampaignPerformancePanel from "../youtube/CampaignPerformancePanel";

export default function DashboardDiagnosticsSection({
  diagnostics,
  campaignStats,
  externalDrop,
  onVideoClick,
  onCreatePack,
  autoExpandVideoId,
}) {
  if (!diagnostics) return null;

  return (
    <>
      <DiagnosticsPanel
        diagnostics={diagnostics}
        campaignStats={campaignStats}
        externalDrop={externalDrop}
        onVideoClick={onVideoClick}
        autoExpandVideoId={autoExpandVideoId}
      />

      {campaignStats?.length > 0 && (
        <CampaignPerformancePanel
          stats={campaignStats}
          onCreatePack={onCreatePack ?? (() => {})}
        />
      )}
    </>
  );
}
