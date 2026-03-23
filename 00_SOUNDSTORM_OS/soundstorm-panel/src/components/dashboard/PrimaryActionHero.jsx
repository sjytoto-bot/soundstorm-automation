import { AlertTriangle, ArrowRight, Clock, Sparkles } from "lucide-react";
import { T } from "../../styles/tokens";

const TYPE_META = {
  danger:   { color: T.danger,  bg: T.dangerBg,  border: T.borderColor.danger,  Icon: AlertTriangle, kicker: "URGENT ACTION" },
  warning:  { color: T.warn,    bg: T.warnBg,    border: T.borderColor.warning, Icon: AlertTriangle, kicker: "ACTION NEEDED" },
  strategy: { color: T.primary, bg: T.primarySoft, border: T.primaryBorder,     Icon: Sparkles,      kicker: "TODAY FOCUS" },
  upload:   { color: T.success, bg: T.successBg, border: T.successBorder,       Icon: Clock,         kicker: "UPLOAD WINDOW" },
};

function buildPrimaryDescription(item) {
  if (!item) return "오늘 바로 처리해야 할 액션이 없습니다.";
  if (item.type === "danger" || item.type === "warning") {
    return `${item.tag} 이슈가 감지되었습니다. 진단 화면으로 이동해 해당 영상부터 확인하세요.`;
  }
  if (item.type === "upload") {
    return `추천 업로드 타이밍이 도착했습니다. 오늘 업로드 여부를 먼저 판단하세요.`;
  }
  return "오늘 우선순위 전략을 먼저 확인하고 실행 흐름을 정리하세요.";
}

function SecondaryActionCard({ item, onAction }) {
  const meta = TYPE_META[item.type] ?? TYPE_META.strategy;
  return (
    <button
      onClick={() => onAction?.(item)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.spacing.sm,
        padding: `${T.spacing.md}px ${T.spacing.lg}px`,
        background: T.component.card.compact.bg,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius.card,
        cursor: "pointer",
        textAlign: "left",
        transition: `background ${T.motion.base}, border-color ${T.motion.base}`,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = meta.bg;
        e.currentTarget.style.borderColor = meta.border;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = T.component.card.compact.bg;
        e.currentTarget.style.borderColor = T.border;
      }}
    >
      <meta.Icon size={14} color={meta.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: T.font.size.xs, color: T.semantic.text.primary, fontWeight: T.font.weight.semibold }}>
          {item.label}
        </div>
        <div style={{ fontSize: T.font.size.xxs, color: meta.color, fontFamily: T.font.familyMono }}>
          {item.tag}
        </div>
      </div>
      <ArrowRight size={12} color={T.semantic.text.muted} />
    </button>
  );
}

export default function PrimaryActionHero({
  primaryAction,
  secondaryActions = [],
  onAction,
  startedId = null,
}) {
  const item = primaryAction;
  const meta = TYPE_META[item?.type] ?? TYPE_META.strategy;
  const Icon = meta.Icon;

  return (
    <section style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
      gap: T.spacing.lg,
      alignItems: "stretch",
    }}>
      <div style={{
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        borderRadius: T.radius.card,
        boxShadow: T.elevation[2],
        padding: `${T.spacing.xl}px ${T.spacing.xl}px`,
        display: "flex",
        flexDirection: "column",
        gap: T.spacing.md,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: meta.color, fontWeight: T.font.weight.bold, letterSpacing: "0.08em" }}>
            {meta.kicker}
          </span>
          {startedId === item?.id && (
            <span style={{ fontSize: T.font.size.xxs, color: T.success, fontFamily: T.font.familyMono, marginLeft: "auto" }}>
              TRACKING STARTED
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: T.spacing.md, alignItems: "flex-start" }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: T.radius.pill,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: T.semantic.text.inverse,
            flexShrink: 0,
          }}>
            <Icon size={18} color={meta.color} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: T.font.size.xl, lineHeight: T.font.lineHeight.tight, color: T.semantic.text.primary }}>
              {item?.label ?? "오늘 우선순위 액션 없음"}
            </h2>
            <p style={{ margin: `${T.spacing.xs}px 0 0`, fontSize: T.font.size.sm, color: T.semantic.text.secondary, lineHeight: T.font.lineHeight.normal }}>
              {buildPrimaryDescription(item)}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
          {item?.tag && (
            <span style={{
              padding: `${T.component.badge.paddingY}px ${T.component.badge.paddingX + 2}px`,
              borderRadius: T.component.badge.radius,
              background: T.semantic.text.inverse,
              color: meta.color,
              fontSize: T.component.badge.fontSize,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
            }}>
              {item.tag}
            </span>
          )}

          <button
            onClick={() => item && onAction?.(item)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: T.spacing.xs,
              height: T.component.button.size.lg,
              padding: `0 ${T.spacing.xl}px`,
              background: meta.color,
              color: T.semantic.text.inverse,
              border: "none",
              borderRadius: T.radius.btn,
              cursor: "pointer",
              fontSize: T.font.size.sm,
              fontWeight: T.font.weight.bold,
            }}
          >
            지금 실행
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
        {(secondaryActions.length > 0 ? secondaryActions : []).map(item => (
          <SecondaryActionCard key={item.id} item={item} onAction={onAction} />
        ))}
        {secondaryActions.length === 0 && (
          <div style={{
            ...T.component.card.compact,
            background: T.component.card.compact.bg,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.card,
            padding: `${T.spacing.lg}px`,
            color: T.semantic.text.secondary,
            fontSize: T.font.size.sm,
          }}>
            보조 액션이 없으면 오늘은 핵심 액션 하나에 집중하면 됩니다.
          </div>
        )}
      </div>
    </section>
  );
}
