import { T } from "../../styles/tokens";
import YouTubeTrendChart from "./YouTubeTrendChart";
import TopVideoList from "./TopVideoList";

// ─── AnalyticsPanel ───────────────────────────────────────────────────────────
// 조회수 추이 + Top Videos
// Props: dailyStats, topVideos
export default function AnalyticsPanel({ dailyStats, topVideos }) {
  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xl,
    }}>
      <YouTubeTrendChart dailyStats={dailyStats} chartHeight={220} />
      <TopVideoList topVideos={topVideos} />
    </div>
  );
}
