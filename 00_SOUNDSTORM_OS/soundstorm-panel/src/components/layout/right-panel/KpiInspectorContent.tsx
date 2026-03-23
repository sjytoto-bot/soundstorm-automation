import { T } from "@/styles/tokens";
import { useDashboardDiagFilter } from "@/contexts/DashboardDiagFilterContext";
import type { KpiInspectorData, VideoClickContext } from "@/types/dashboardData";

const MICRO = T.font.size.xxs;
const CAPTION = T.font.size.xs;

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

function PanelList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", padding: `0 ${T.spacing.md}px ${T.spacing.sm}px` }}>
      {children}
    </div>
  );
}

function InspectorRow({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: T.spacing.sm,
      alignItems: "center",
      padding: "10px 0",
      borderBottom: `1px solid ${T.borderSoft}`,
      color: T.text,
    }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : <div />}
    </div>
  );
}

export function getKpiInspectorTitle(label: string): string {
  if (label === "조회수") return "조회수 진단";
  if (label === "클릭률") return "CTR 진단";
  if (label === "시청시간") return "시청시간 진단";
  if (label === "구독자") return "구독자 진단";
  if (label === "평균 시청시간") return "평균시청 진단";
  if (label === "좋아요") return "좋아요 진단";
  if (label === "예상 수익") return "수익 진단";
  return `${label} 진단`;
}

function openVideoFromPanel(
  openVideoDrilldown: ((params: { videoId: string; context: VideoClickContext }) => void) | null,
  videoId: string,
  context: VideoClickContext,
) {
  openVideoDrilldown?.({ videoId, context });
}

export default function KpiInspectorContent({ data }: { data: KpiInspectorData | null }) {
  const { openVideoDrilldown } = useDashboardDiagFilter();
  if (!data) return <EmptyState text="KPI를 선택하면 세부 분석이 표시됩니다" />;
  const title = getKpiInspectorTitle(data.label);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md, padding: `${T.spacing.sm}px ${T.spacing.md} ${T.spacing.md}px` }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: T.spacing.xs,
        padding: `${T.spacing.sm}px ${T.spacing.md}px`,
        background: T.semantic.surface.insetTint,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: T.component.radius.control,
      }}>
        <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.08em" }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: T.spacing.sm }}>
          <span style={{ fontSize: T.font.size.sm, color: T.text, fontWeight: T.font.weight.bold }}>{data.label}</span>
          <span style={{ fontSize: T.font.size.sm, color: T.text, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold }}>
            {data.value}
          </span>
        </div>
        {data.interpretation && (
          <span style={{ fontSize: CAPTION, color: T.sub, lineHeight: T.font.lineHeight.normal }}>
            {data.interpretation}
          </span>
        )}
      </div>

      {data.detail.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em", padding: `0 ${T.spacing.xs}` }}>
            근거 지표
          </span>
          <PanelList>
            {data.detail.map((row, i) => (
              <InspectorRow
                key={`${row.label}-${i}`}
                left={<span style={{ fontSize: CAPTION, color: T.sub }}>{row.label}</span>}
                right={<span style={{ fontSize: CAPTION, color: row.color ?? T.text, fontFamily: T.font.familyMono, fontWeight: T.font.weight.medium }}>{row.value}</span>}
              />
            ))}
          </PanelList>
        </div>
      )}

      {data.causes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em", padding: `0 ${T.spacing.xs}` }}>
            원인
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.causes.map((cause, i) => (
              <div key={`${cause.metric}-${i}`} style={{
                padding: `${T.spacing.sm}px ${T.spacing.md}px`,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: T.component.radius.control,
                background: T.semantic.surface.insetTint,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}>
                <span style={{ fontSize: CAPTION, color: T.text, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold }}>
                  {cause.metric} {cause.delta != null ? (cause.delta > 0 ? `+${cause.delta}%` : `${cause.delta}%`) : ""}
                </span>
                <span style={{ fontSize: CAPTION, color: T.sub }}>{cause.interpretation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em", padding: `0 ${T.spacing.xs}` }}>
            다음 액션
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.actions.map((action, i) => (
              <div key={`${action}-${i}`} style={{
                padding: `${T.spacing.sm}px ${T.spacing.md}px`,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: T.component.radius.control,
                background: T.semantic.surface.insetTint,
                fontSize: CAPTION,
                color: T.text,
                fontWeight: T.font.weight.medium,
              }}>
                {action}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.underperformingVideos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em", padding: `0 ${T.spacing.xs}` }}>
            성과 저조 영상
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.underperformingVideos.map(video => (
              <button
                key={video.videoId}
                onClick={() => openVideoFromPanel(openVideoDrilldown, video.videoId, {
                  source: "INSIGHT",
                  triggerMetric: data.focus === "CTR" ? "CTR" : data.focus === "RETENTION_WEAK" ? "RETENTION" : "VIEWS",
                })}
                style={{
                  padding: `${T.spacing.sm}px ${T.spacing.md}px`,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: T.component.radius.control,
                  background: T.semantic.surface.insetTint,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  appearance: "none",
                  boxSizing: "border-box",
                }}
              >
                <span style={{ fontSize: CAPTION, color: T.text, fontWeight: T.font.weight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {video.title}
                </span>
                <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono }}>
                  조회수 {video.views.toLocaleString("ko-KR")} · CTR {(video.ctr * 100).toFixed(1)}% · {video.reason}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
