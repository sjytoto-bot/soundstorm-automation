// ─── DecisionBar.jsx ──────────────────────────────────────────────────────────
// "오늘 뭐 해야 함?" — Decision OS 최상단 실행 바
//
// Props:
//   decisionBar — computeDecisionBar() 반환값
//                 { items: DecisionItem[], urgent: boolean }
//   loading     — 데이터 로딩 중 여부

import { AlertTriangle, Zap, TrendingUp, Clock } from "lucide-react";
import { T } from "../../styles/tokens";

const TYPE_STYLE = {
  danger:   { color: T.danger,  bg: T.dangerBg  ?? `${T.danger}18`,  border: T.borderColor.danger   ?? `${T.danger}40`,  Icon: AlertTriangle },
  warning:  { color: T.warn,    bg: T.warnBg    ?? `${T.warn}18`,    border: T.borderColor.warning  ?? `${T.warn}40`,    Icon: AlertTriangle },
  strategy: { color: T.primary, bg: T.primarySoft,                    border: T.primaryBorder,                    Icon: Zap           },
  upload:   { color: T.success, bg: T.successBg ?? `${T.success}18`, border: T.successBorder ?? `${T.success}40`, Icon: Clock         },
};

function DecisionItem({ item, index }) {
  const { color, bg, border, Icon } = TYPE_STYLE[item.type] ?? TYPE_STYLE.strategy;
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
      padding:      `${T.spacing.xs}px ${T.spacing.md}px`,
      background:   bg,
      border:       `1px solid ${border}`,
      borderRadius: T.radius?.badge ?? 6,
      flex:         1,
      minWidth:     0,
    }}>
      <span style={{
        fontSize:     10,
        fontFamily:   "monospace",
        fontWeight:   700,
        color:        T.muted,
        flexShrink:   0,
      }}>
        {index + 1}
      </span>
      <Icon size={12} color={color} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize:     12,
        fontWeight:   600,
        color:        T.text,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
        flex:         1,
      }}>
        {item.label}
      </span>
      <span style={{
        fontSize:     9,
        fontFamily:   "monospace",
        fontWeight:   700,
        color,
        background:   "transparent",
        flexShrink:   0,
        whiteSpace:   "nowrap",
      }}>
        {item.tag}
      </span>
    </div>
  );
}

export default function DecisionBar({ decisionBar, loading = false }) {
  const items = decisionBar?.items ?? [];

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            T.spacing.md,
      padding:        `${T.spacing.sm}px ${T.spacing.lg}px`,
      background:     T.bgCard,
      border:         `1px solid ${decisionBar?.urgent ? (T.borderColor.danger ?? T.danger) : T.border}`,
      borderRadius:   T.radius?.card ?? 12,
      boxShadow:      T.shadow?.card,
    }}>
      {/* 레이블 */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        T.spacing.xs,
        flexShrink: 0,
      }}>
        <TrendingUp size={13} color={decisionBar?.urgent ? T.danger : T.primary} />
        <span style={{
          fontSize:   11,
          fontWeight: 800,
          color:      decisionBar?.urgent ? T.danger : T.primary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}>
          오늘 할 일
        </span>
      </div>

      <div style={{ width: 1, height: 24, background: T.border, flexShrink: 0 }} />

      {/* 아이템 목록 */}
      {loading ? (
        <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
          진단 데이터 로딩 중…
        </span>
      ) : items.length === 0 ? (
        <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
          오늘은 특이 사항 없음 — 정기 업로드 유지
        </span>
      ) : (
        <div style={{
          display: "flex",
          gap:     T.spacing.sm,
          flex:    1,
          minWidth: 0,
        }}>
          {items.map((item, i) => (
            <DecisionItem key={item.id} item={item} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
