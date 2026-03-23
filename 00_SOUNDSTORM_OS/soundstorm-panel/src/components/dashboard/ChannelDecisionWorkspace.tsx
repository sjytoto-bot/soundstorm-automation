import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Sparkles, Target } from "lucide-react";
import { T } from "../../styles/tokens";
import type { VideoClickContext } from "@/types/dashboardData";
import type { UnderperformingVideo } from "@/lib/getUnderperformingVideos";

type SeverityTone = "danger" | "warn" | "info" | "ok";

type Props = {
  primaryAction?: any;
  secondaryActions?: any[];
  healthData?: any;
  underperformingVideos?: UnderperformingVideo[];
  hasDiagIssues?: boolean;
  onAction?: (item: any) => void;
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
};

function getToneMeta(tone: SeverityTone) {
  if (tone === "danger") return { color: T.danger, bg: T.dangerBg, border: T.borderColor.danger, Icon: AlertTriangle };
  if (tone === "warn") return { color: T.warn, bg: T.warnBg, border: T.borderColor.warning, Icon: AlertTriangle };
  if (tone === "ok") return { color: T.success, bg: T.successBg, border: T.successBorder, Icon: CheckCircle2 };
  return { color: T.primary, bg: T.primarySoft, border: T.primaryBorder, Icon: Sparkles };
}

function getSeverityTone(primaryAction: any, healthData: any, hasDiagIssues: boolean): SeverityTone {
  if (primaryAction?.type === "danger") return "danger";
  if (primaryAction?.type === "warning") return "warn";
  if (healthData?.grade === "D") return "danger";
  if (healthData?.grade === "C" || hasDiagIssues) return "warn";
  if (healthData?.grade === "A") return "ok";
  return "info";
}

function buildDecisionFrame(primaryAction: any, healthData: any, underperformingVideos: UnderperformingVideo[], hasDiagIssues: boolean) {
  const topIssue = healthData?.topIssue ?? null;
  const topVideo = underperformingVideos[0] ?? null;
  const affectedCount = underperformingVideos.length;
  const tone = getSeverityTone(primaryAction, healthData, hasDiagIssues);

  const signal = topIssue
    ? `${topIssue.reason}${affectedCount > 0 ? ` · 저성과 영상 ${affectedCount}개` : ""}`
    : primaryAction?.label ?? "오늘 우선순위 이슈를 정리할 필요가 있습니다.";

  const cause = topIssue?.interpretation
    ?? (topVideo ? `${topVideo.reason}가 반복되고 있어 최근 영상 성과가 채널 평균 아래로 밀리고 있습니다.` : "진단 이슈와 최근 성과 저하가 동시에 관측되고 있습니다.");

  const interpretation = topIssue
    ? `${healthData?.label ?? "채널 상태"} 상태이며 ${topIssue.delta ? `점수 영향 ${topIssue.delta}점` : "핵심 원인"}이 현재 판단을 지배하고 있습니다.`
    : hasDiagIssues
    ? "지표 자체보다 왜 떨어졌는지 먼저 봐야 하는 구간입니다."
    : "긴급 이슈는 없지만 다음 업로드와 성장 루프를 위한 선제 판단이 필요한 상태입니다.";

  const action = primaryAction?.label
    ?? (topVideo ? `${topVideo.title}부터 상세 진단을 열어 수정 포인트를 확정하세요.` : "핵심 KPI를 열어 원인과 다음 조치를 확인하세요.");

  return { tone, signal, cause, interpretation, action };
}

function FocusPill({ label, value, tone = "info" }: { label: string; value: string; tone?: SeverityTone }) {
  const meta = getToneMeta(tone);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: `${T.spacing.sm}px ${T.spacing.md}px`,
        borderRadius: T.radius.btn,
        border: `1px solid ${meta.border}`,
        background: meta.bg,
      }}
    >
      <span style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: T.font.size.sm, color: T.text, fontWeight: T.font.weight.semibold }}>{value}</span>
    </div>
  );
}

function ActionQueue({ items, onAction }: { items: any[]; onAction?: (item: any) => void }) {
  if (!items.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
      {items.map((item, index) => {
        const tone = item?.type === "danger" ? "danger" : item?.type === "warning" ? "warn" : "info";
        const meta = getToneMeta(tone);
        return (
          <button
            key={item.id ?? item.label ?? index}
            onClick={() => onAction?.(item)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.spacing.sm,
              width: "100%",
              textAlign: "left",
              padding: `${T.spacing.md}px`,
              borderRadius: T.radius.card,
              border: `1px solid ${meta.border}`,
              background: index === 0 ? meta.bg : T.bgCard,
              cursor: "pointer",
            }}
          >
            <meta.Icon size={14} color={meta.color} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: T.font.size.sm, color: T.text, fontWeight: T.font.weight.semibold }}>
                {item.label}
              </div>
              <div style={{ fontSize: T.font.size.xs, color: meta.color, fontFamily: T.font.familyMono }}>
                {index === 0 ? "FIRST ACTION" : "NEXT ACTION"}{item.tag ? ` · ${item.tag}` : ""}
              </div>
            </div>
            <ChevronRight size={14} color={T.muted} />
          </button>
        );
      })}
    </div>
  );
}

function VideoQueue({
  videos,
  onVideoClick,
}: {
  videos: UnderperformingVideo[];
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}) {
  if (!videos.length || !onVideoClick) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
      {videos.slice(0, 3).map(video => (
        <button
          key={video.videoId}
          onClick={() => onVideoClick({
            videoId: video.videoId,
            context: { source: "INSIGHT", triggerMetric: video.reason === "클릭률 저조" ? "CTR" : "VIEWS" },
          })}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: T.spacing.sm,
            alignItems: "center",
            width: "100%",
            textAlign: "left",
            padding: `${T.spacing.md}px`,
            borderRadius: T.radius.card,
            border: `1px solid ${T.border}`,
            background: T.bgCard,
            cursor: "pointer",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: T.font.size.sm, color: T.text, fontWeight: T.font.weight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {video.title}
            </div>
            <div style={{ marginTop: 2, fontSize: T.font.size.xs, color: T.sub }}>
              {video.reason} · 조회수 {video.views.toLocaleString("ko-KR")} · CTR {(video.ctr * 100).toFixed(1)}%
            </div>
          </div>
          <div style={{ fontSize: T.font.size.xs, color: video.viewsDeltaPercent <= -40 ? T.danger : T.warn, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold }}>
            {video.viewsDeltaPercent > 0 ? "+" : ""}{video.viewsDeltaPercent}%
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ChannelDecisionWorkspace({
  primaryAction = null,
  secondaryActions = [],
  healthData = null,
  underperformingVideos = [],
  hasDiagIssues = false,
  onAction,
  onVideoClick,
}: Props) {
  const frame = buildDecisionFrame(primaryAction, healthData, underperformingVideos, hasDiagIssues);
  const meta = getToneMeta(frame.tone);
  const Icon = meta.Icon;
  const queueItems = [primaryAction, ...secondaryActions].filter(Boolean);
  const breakdown = Array.isArray(healthData?.breakdown) ? healthData.breakdown.slice(0, 3) : [];

  return (
    <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, 1fr)", gap: T.spacing.lg }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: T.spacing.lg,
          padding: T.spacing.xl,
          borderRadius: T.radius.card,
          border: `1px solid ${meta.border}`,
          background: meta.bg,
          boxShadow: T.shadow.card,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <Icon size={15} color={meta.color} />
          <span style={{ fontSize: T.font.size.xs, color: meta.color, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, letterSpacing: "0.08em" }}>
            DECISION FRAME
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          <h3 style={{ margin: 0, fontSize: T.font.size.xl, color: T.text }}>
            지금 가장 먼저 풀어야 할 문제를 한 장으로 요약했습니다.
          </h3>
          <p style={{ margin: 0, fontSize: T.font.size.sm, lineHeight: T.font.lineHeight.normal, color: T.sub }}>
            메인 KPI를 보기 전에 어떤 리스크가 우선인지, 왜 그런지, 무엇부터 실행해야 하는지 바로 판단할 수 있어야 합니다.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: T.spacing.sm }}>
          <FocusPill label="SIGNAL" value={frame.signal} tone={frame.tone} />
          <FocusPill label="CAUSE" value={frame.cause} />
          <FocusPill label="INTERPRETATION" value={frame.interpretation} />
          <FocusPill label="ACTION" value={frame.action} />
        </div>

        <div style={{ display: "flex", gap: T.spacing.sm, flexWrap: "wrap" }}>
          <button
            onClick={() => primaryAction && onAction?.(primaryAction)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: T.spacing.xs,
              height: T.component.button.size.lg,
              padding: `0 ${T.spacing.xl}px`,
              borderRadius: T.radius.btn,
              border: "none",
              background: meta.color,
              color: T.semantic.text.inverse,
              cursor: primaryAction ? "pointer" : "default",
              fontSize: T.font.size.sm,
              fontWeight: T.font.weight.bold,
              opacity: primaryAction ? 1 : 0.5,
            }}
            disabled={!primaryAction}
          >
            첫 액션 실행
            <ArrowRight size={14} />
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: T.spacing.xs, padding: `0 ${T.spacing.md}px`, height: T.component.button.size.lg, borderRadius: T.radius.btn, border: `1px solid ${T.border}`, background: T.bgCard }}>
            <Target size={12} color={T.primary} />
            <span style={{ fontSize: T.font.size.xs, color: T.sub }}>
              5-10초 안에 다음 행동을 보이도록 상단 판단 프레임을 재구성했습니다.
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.lg }}>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius.card, boxShadow: T.shadow.card, padding: T.spacing.xl, display: "flex", flexDirection: "column", gap: T.spacing.md }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.spacing.sm }}>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, letterSpacing: "0.08em" }}>
              NEXT STEP QUEUE
            </span>
            <span style={{ fontSize: T.font.size.xs, color: T.sub }}>
              우선순위가 높은 액션부터 정렬
            </span>
          </div>
          <ActionQueue items={queueItems} onAction={onAction} />
        </div>

        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: T.radius.card, boxShadow: T.shadow.card, padding: T.spacing.xl, display: "flex", flexDirection: "column", gap: T.spacing.md }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.spacing.sm }}>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, letterSpacing: "0.08em" }}>
              AFFECTED ITEMS
            </span>
            <span style={{ fontSize: T.font.size.xs, color: T.sub }}>
              클릭하면 바로 상세 진단
            </span>
          </div>
          {underperformingVideos.length > 0 ? (
            <VideoQueue videos={underperformingVideos} onVideoClick={onVideoClick} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
              {breakdown.map((item: any, index: number) => (
                <div key={`${item.pillar}-${index}`} style={{ padding: `${T.spacing.sm}px ${T.spacing.md}px`, borderRadius: T.radius.btn, background: T.bgSection, border: `1px solid ${T.borderSoft}` }}>
                  <div style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>{item.pillar}</div>
                  <div style={{ fontSize: T.font.size.sm, color: T.text, fontWeight: T.font.weight.semibold, marginTop: 2 }}>{item.reason}</div>
                  {item.action?.label && (
                    <div style={{ fontSize: T.font.size.xs, color: T.sub, marginTop: 2 }}>
                      권장 액션: {item.action.label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
