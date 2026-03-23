import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { T } from "@/styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { useDashboardDiagFilter } from "@/contexts/DashboardDiagFilterContext";
import type { VideoClickContext } from "@/types/dashboardData";

const MICRO = T.font.size.xxs;
const CAPTION = T.font.size.xs;

const RETENTION_SUBTYPE: Record<string, string> = {
  INTRO_DROP: "초반 이탈",
  MID_DROP: "중반 이탈",
  FLAT_DROP: "전반 저하",
  CONTENT_RETENTION_WEAK: "초반 이탈",
  RETENTION_WEAK: "시청유지율 저하",
};

const RETENTION_ACTION: Record<string, string> = {
  INTRO_DROP: "인트로 5초 즉시 수정",
  MID_DROP: "중반부 재편집",
  FLAT_DROP: "전체 재구성",
  CONTENT_RETENTION_WEAK: "인트로 점검",
  RETENTION_WEAK: "인트로 15초 재편집",
};

function fmtSec(sec: any): string {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = severity === "CRITICAL" ? T.danger : T.warn;
  const bg = severity === "CRITICAL" ? T.dangerBg : T.warnBg;
  return (
    <span style={{
      fontSize: MICRO,
      fontWeight: T.font.weight.bold,
      fontFamily: T.font.familyMono,
      color,
      background: bg,
      border: `1px solid ${color}30`,
      borderRadius: T.radius.badge,
      padding: "1px 6px",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}>
      {severity}
    </span>
  );
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

export default function RetentionSectionContent() {
  const { videoDiagnostics } = useAnalyticsContext();
  const { openVideoDrilldown } = useDashboardDiagFilter();
  const alerts = (videoDiagnostics ?? [])
    .filter((d: any) => d.problemType === "RETENTION_WEAK")
    .sort((a: any, b: any) => (a.avgWatchTime ?? 999) - (b.avgWatchTime ?? 999)) as any[];

  const [openId, setOpenId] = useState<string | null>(
    () => alerts.find(d => d.severity === "CRITICAL")?.videoId ?? null,
  );

  if (!alerts.length) return <EmptyState text="시청유지율 이슈 없음" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: `${T.spacing.sm}px ${T.spacing.md} ${T.spacing.md}px` }}>
      {alerts.map((d: any) => {
        const id = d.videoId;
        const isOpen = openId !== null && openId === id;
        const isCritical = d.severity === "CRITICAL";
        const subtype = d.diagnosis ?? d.problemType;
        const label = RETENTION_SUBTYPE[subtype] ?? "시청유지율 저하";
        const action = RETENTION_ACTION[subtype] ?? "인트로 점검";
        const title = d.title ?? id;
        const retPct = d.retentionRate != null ? `${(d.retentionRate * 100).toFixed(1)}%` : null;
        const borderColor = isCritical ? T.danger : T.warn;
        const ytUrl = `https://studio.youtube.com/video/${id}/edit`;

        return (
          <div key={id ?? label} style={{
            background: isOpen ? (isCritical ? `${T.danger}06` : T.bgSection) : "transparent",
            border: `1px solid ${isOpen ? `${borderColor}45` : T.borderSoft}`,
            borderRadius: T.component.radius.control,
            overflow: "hidden",
          }}>
            <button
              onClick={() => setOpenId(isOpen ? null : id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                minWidth: 0,
              }}
            >
              <SeverityBadge severity={d.severity} />
              <span style={{
                flex: 1,
                fontSize: CAPTION,
                fontWeight: T.font.weight.semibold,
                color: T.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}>
                {title}
              </span>
              <span style={{
                fontSize: CAPTION,
                fontWeight: T.font.weight.bold,
                fontFamily: T.font.familyMono,
                color: borderColor,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}>
                {fmtSec(d.avgWatchTime)}
              </span>
              {isOpen ? <ChevronUp size={13} color={T.muted} style={{ flexShrink: 0 }} /> : <ChevronDown size={13} color={T.muted} style={{ flexShrink: 0 }} />}
            </button>

            {isOpen && (
              <div style={{
                borderTop: `1px solid ${borderColor}40`,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
                  <span style={{ fontSize: MICRO, fontWeight: T.font.weight.bold, fontFamily: T.font.familyMono, color: borderColor, whiteSpace: "nowrap" }}>
                    avg {fmtSec(d.avgWatchTime)}
                  </span>
                  {retPct && (
                    <span style={{ fontSize: MICRO, fontWeight: T.font.weight.bold, fontFamily: T.font.familyMono, color: T.sub, whiteSpace: "nowrap" }}>
                      유지율 {retPct}
                    </span>
                  )}
                  <span style={{
                    fontSize: MICRO,
                    fontWeight: T.font.weight.bold,
                    color: borderColor,
                    background: `${borderColor}15`,
                    border: `1px solid ${borderColor}`,
                    borderRadius: T.radius.badge,
                    padding: "1px 6px",
                    whiteSpace: "nowrap",
                  }}>
                    {label}
                  </span>
                </div>

                <button
                  onClick={() => openVideoFromPanel(openVideoDrilldown, id, { source: "RETENTION", triggerMetric: "RETENTION" })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    height: T.component.size.rowCompact,
                    width: "100%",
                    background: T.semantic.surface.insetTint,
                    border: `1px solid ${T.borderSoft}`,
                    borderRadius: T.component.radius.control,
                    cursor: "pointer",
                    fontSize: CAPTION,
                    fontWeight: T.font.weight.bold,
                    color: T.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  영상 상세 보기
                </button>

                <button
                  onClick={() => window.open(ytUrl, "_blank", "noreferrer")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    height: T.component.size.rowCompact,
                    width: "100%",
                    background: T.semantic.surface.insetTint,
                    border: `1px solid ${T.borderSoft}`,
                    borderRadius: T.component.radius.control,
                    cursor: "pointer",
                    fontSize: CAPTION,
                    fontWeight: T.font.weight.bold,
                    color: T.text,
                    whiteSpace: "nowrap",
                    transition: `background ${T.motion.fast}`,
                  }}
                >
                  <ExternalLink size={13} />{action}
                </button>

                {d.views > 0 && (
                  <span style={{ fontSize: MICRO, color: T.muted, textAlign: "center", whiteSpace: "nowrap" }}>
                    조회수 {d.views.toLocaleString("ko-KR")}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
