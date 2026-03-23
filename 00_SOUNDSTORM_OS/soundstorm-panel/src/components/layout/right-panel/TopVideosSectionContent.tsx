import { T } from "@/styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { useDashboardDiagFilter } from "@/contexts/DashboardDiagFilterContext";
import type { VideoClickContext } from "@/types/dashboardData";

const MICRO = T.font.size.xxs;
const CAPTION = T.font.size.xs;

function fmtViews(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: "22px 18px",
      textAlign: "left",
      fontSize: CAPTION,
      color: T.muted,
      fontFamily: T.font.familyMono,
      letterSpacing: "0.04em",
    }}>
      {text}
    </div>
  );
}

function openVideoFromPanel(
  openVideoDrilldown: ((params: { videoId: string; context: VideoClickContext }) => void) | null,
  videoId: string,
  context: VideoClickContext,
) {
  openVideoDrilldown?.({ videoId, context });
}

export default function TopVideosSectionContent() {
  const { analytics } = useAnalyticsContext();
  const { openVideoDrilldown } = useDashboardDiagFilter();
  const hits = (analytics?.hitVideos ?? []).slice(0, 20);
  if (!hits.length) return <EmptyState text="인기 영상 없음" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", padding: `0 ${T.spacing.md}px ${T.spacing.sm}px` }}>
      {hits.map((v: any, i: number) => (
        <button
          key={v.key ?? i}
          onClick={() => v.key && openVideoFromPanel(openVideoDrilldown, v.key, { source: "TOP_VIDEOS", triggerMetric: "VIEWS" })}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: T.spacing.sm,
            alignItems: "center",
            padding: "10px 0",
            borderBottom: `1px solid ${T.borderSoft}`,
            width: "100%",
            background: "transparent",
            borderLeft: "none",
            borderRight: "none",
            borderTop: "none",
            cursor: v.key ? "pointer" : "default",
            textAlign: "left",
            boxSizing: "border-box",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, minWidth: 0 }}>
              <span style={{
                fontSize: MICRO,
                fontWeight: T.font.weight.bold,
                fontFamily: T.font.familyMono,
                color: i < 3 ? T.primary : T.muted,
                width: 24,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}>
                #{i + 1}
              </span>
              <span style={{
                fontSize: CAPTION,
                color: T.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}>
                {v.title ?? v.key}
              </span>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <span style={{
              fontSize: CAPTION,
              fontWeight: T.font.weight.bold,
              fontFamily: T.font.familyMono,
              color: T.sub,
              whiteSpace: "nowrap",
            }}>
              {fmtViews(v.value ?? 0)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
