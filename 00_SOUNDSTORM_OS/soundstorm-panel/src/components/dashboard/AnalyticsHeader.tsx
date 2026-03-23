// ─── AnalyticsHeader ──────────────────────────────────────────────────────────
// 분석 기간 선택 + 마지막 업데이트 시각 표시
//
// 구조:
//   AnalyticsHeader
//     ├ LastUpdated  (좌측)
//     └ PeriodSelector (우측)
//
// zero-props: useAnalyticsContext() 직접 구독

import { RefreshCw } from "lucide-react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import PeriodSelector from "@/components/youtube/PeriodSelector";
import UpdateStatusBar from "@/components/dashboard/UpdateStatusBar";

interface AnalyticsHeaderProps {
  syncError?:  string | null;
  lastSyncAt?: string | null;
}

export default function AnalyticsHeader({ syncError = null, lastSyncAt = null }: AnalyticsHeaderProps) {
  const { period, setPeriod, loadingAnalytics, fetchedAt, refresh } = useAnalyticsContext();

  const updatedLabel = loadingAnalytics
    ? "로딩 중···"
    : fetchedAt
    ? `Last updated ${fetchedAt.getHours().toString().padStart(2, "0")}:${fetchedAt.getMinutes().toString().padStart(2, "0")}`
    : undefined;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.spacing.md, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
            <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>
              {updatedLabel}
            </span>
            <button
              onClick={refresh}
              disabled={loadingAnalytics}
              title="데이터 새로고침"
              aria-label="데이터 새로고침"
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                width:          28,
                height:         28,
                background:     T.bgCard,
                border:         `1px solid ${T.borderSoft}`,
                borderRadius:   T.component.radius.control,
                cursor:         loadingAnalytics ? "not-allowed" : "pointer",
                color:          loadingAnalytics ? T.muted : T.sub,
                opacity:        loadingAnalytics ? 0.4 : 1,
                transition:     `opacity ${T.motion.fast}, color ${T.motion.fast}, border-color ${T.motion.fast}`,
                padding:        0,
                flexShrink:     0,
              }}
            >
              <RefreshCw size={12} />
            </button>
        </div>
        <UpdateStatusBar syncError={syncError} lastSyncAt={lastSyncAt} />
      </div>

      <PeriodSelector period={period} onChange={setPeriod} />
    </div>
  );
}
