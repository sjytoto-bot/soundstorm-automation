import { Clock3, UploadCloud } from "lucide-react";
import { T } from "../../styles/tokens";

type Props = {
  execution: any;
  goldenHour: any;
  onNavigate: (item: any) => void;
};

function buildDecision(execution: any, goldenHour: any) {
  if (execution?.isOverdue) {
    return {
      title: "오늘 업로드 우선",
      tone: "danger",
      summary: `평균 주기보다 ${execution.overdueDays}일 늦어졌습니다.`,
      primaryReason: "업로드 리듬 회복이 우선입니다.",
      secondaryReason: goldenHour?.bestDay ? `다음 추천 슬롯 ${goldenHour.bestDay} ${goldenHour.bestHour}` : "추천 슬롯 데이터 보조 참고",
    };
  }

  return {
    title: "오늘은 업로드 판단 먼저",
    tone: "primary",
    summary: goldenHour?.bestDay
      ? `${goldenHour.bestDay} ${goldenHour.bestHour} 슬롯을 기준으로 준비 상태를 점검하세요.`
      : "골든아워 데이터를 기준으로 오늘 업로드 여부를 판단하세요.",
    primaryReason: execution?.avgIntervalDays != null ? `평균 업로드 주기 ${execution.avgIntervalDays.toFixed(1)}일` : "업로드 주기 데이터 확인 중",
    secondaryReason: goldenHour?.confidence != null ? `추천 신뢰도 ${Math.round(goldenHour.confidence * 100)}%` : "추천 신뢰도 계산 중",
  };
}

export default function TodayDecisionCard({ execution, goldenHour, onNavigate }: Props) {
  const decision = buildDecision(execution, goldenHour);
  const toneColor = decision.tone === "danger" ? T.danger : T.primary;
  const toneBg = decision.tone === "danger" ? T.dangerBg : T.primarySoft;

  return (
    <div
      style={{
        background: T.component.card.default.bg,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius.card,
        boxShadow: T.shadow.card,
        padding: `${T.spacing.xl}px`,
        display: "flex",
        flexDirection: "column",
        gap: T.spacing.md,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <UploadCloud size={14} color={toneColor} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: toneColor, fontWeight: T.font.weight.bold, letterSpacing: "0.08em" }}>
          TODAY DECISION
        </span>
      </div>

      <div>
        <h3 style={{ margin: 0, fontSize: T.font.size.lg, color: T.semantic.text.primary }}>
          {decision.title}
        </h3>
        <p style={{ margin: `${T.spacing.xs}px 0 0`, fontSize: T.font.size.sm, color: T.semantic.text.secondary, lineHeight: T.font.lineHeight.normal }}>
          {decision.summary}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: T.spacing.sm,
      }}>
        {[decision.primaryReason, decision.secondaryReason].map((reason) => (
          <div
            key={reason}
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.spacing.sm,
              background: T.bgSection,
              border: `1px solid ${T.borderSoft}`,
              borderRadius: T.radius.btn,
              padding: `${T.spacing.sm}px ${T.spacing.md}px`,
            }}
          >
            <Clock3 size={12} color={toneColor} />
            <span style={{ fontSize: T.font.size.xs, color: T.semantic.text.secondary }}>{reason}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
        <span
          style={{
            padding: `${T.component.badge.paddingY}px ${T.component.badge.paddingX + 2}px`,
            borderRadius: T.radius.badge,
            background: toneBg,
            color: toneColor,
            fontSize: T.font.size.xs,
            fontFamily: T.font.familyMono,
          }}
        >
          {decision.tone === "danger" ? "RHYTHM RECOVERY" : "UPLOAD CHECK"}
        </span>
        <button
          onClick={() => onNavigate({ type: "upload" })}
          style={{
            height: T.component.button.size.md,
            padding: `0 ${T.spacing.lg}px`,
            borderRadius: T.radius.btn,
            border: `1px solid ${toneColor}`,
            background: "transparent",
            color: toneColor,
            cursor: "pointer",
            fontSize: T.font.size.xs,
            fontWeight: T.font.weight.semibold,
          }}
        >
          업로드 판단 보기
        </button>
      </div>
    </div>
  );
}
