// ─── ActionCommandBar.jsx ────────────────────────────────────────────────────
// "오늘 뭐 해야 함?" — 클릭 가능한 실행 바
// Hick's Law: 1 PRIMARY (주인공) + 최대 2 SECONDARY (보조)
//
// Props:
//   decisionBar — computeDecisionBar() 반환값
//                 { items: DecisionItem[], urgent: boolean }
//   onAction    — (item: DecisionItem) => void
//   loading     — boolean

import { AlertTriangle, Zap, Clock, ArrowRight } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 타입별 스타일 ────────────────────────────────────────────────────────────

const TYPE_META = {
  danger: {
    color:  T.danger,
    bg:     T.dangerBg,
    border: T.borderColor.danger,
    btnBg:  T.danger,
    btnClr: T.bgCard,
    Icon:   AlertTriangle,
    cta:    "지금 실행 →",
  },
  warning: {
    color:  T.warn,
    bg:     T.warnBg,
    border: T.borderColor.warning,
    btnBg:  T.warn,
    btnClr: T.bgCard,
    Icon:   AlertTriangle,
    cta:    "지금 실행 →",
  },
  strategy: {
    color:  T.primary,
    bg:     T.primarySoft,
    border: T.primaryBorder,
    btnBg:  T.primary,
    btnClr: T.bgCard,
    Icon:   Zap,
    cta:    "전략 확인 →",
  },
  upload: {
    color:  T.success,
    bg:     T.successBg,
    border: T.successBorder,
    btnBg:  T.success,
    btnClr: T.bgCard,
    Icon:   Clock,
    cta:    "알림 설정 →",
  },
};

// ─── PrimaryCard ─────────────────────────────────────────────────────────────
// 주인공 — 크고 명확, 버튼 높이 44px

function _registerStart(item) {
  if (!item?.videoId && !item?.video_id) return;
  window.api?.registerActionStart?.({
    video_id:     item.videoId ?? item.video_id,
    action_type:  item.problemType ?? item.type ?? "UNKNOWN",
    action_label: item.label,
    source:       "action_command_bar",
  }).catch(() => {});
}

function PrimaryCard({ item, onAction, started }) {
  const m = TYPE_META[item.type] ?? TYPE_META.strategy;
  const Icon = m.Icon;
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.lg,
      padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
      background:   m.bg,
      border:       `1.5px solid ${m.border}`,
      borderRadius: T.radius.card,
      flex:         "1 1 0",
      minWidth:     0,
    }}>
      {/* 순번 */}
      <span style={{
        fontSize:   11,
        fontFamily: "monospace",
        fontWeight: 800,
        color:      m.color,
        background: `${m.color}20`,
        width:      22,
        height:     22,
        borderRadius: "50%",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        1
      </span>

      {/* 아이콘 */}
      <Icon size={16} color={m.color} style={{ flexShrink: 0 }} />

      {/* 레이블 + 태그 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:     14,
          fontWeight:   800,
          color:        T.text,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          lineHeight:   1.3,
        }}>
          {item.label}
        </div>
        <div style={{ fontSize: 10, color: m.color, fontFamily: "monospace", fontWeight: 700, marginTop: 2 }}>
          {item.tag}
        </div>
      </div>

      {/* P1-3: 클릭 피드백 */}
      {started && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          alignItems:    "flex-end",
          flexShrink:    0,
          gap:           2,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.success, fontFamily: "monospace" }}>
            ✓ 추적 시작됨
          </span>
          <span style={{ fontSize: 10, color: T.sub, fontFamily: "monospace" }}>
            3일 후 결과를 분석합니다
          </span>
        </div>
      )}

      {/* CTA 버튼 — 44px */}
      <button
        onClick={() => { _registerStart(item); onAction?.(item); }}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          height:       44,
          padding:      `0 ${T.spacing.xl}px`,
          background:   m.btnBg,
          border:       "none",
          borderRadius: T.radius.btn,
          cursor:       "pointer",
          fontSize:     13,
          fontWeight:   800,
          color:        m.btnClr,
          whiteSpace:   "nowrap",
          flexShrink:   0,
          transition:   "opacity 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
      >
        {m.cta}
      </button>
    </div>
  );
}

// ─── SecondaryChip ────────────────────────────────────────────────────────────
// 보조 항목 — 작지만 클릭 가능

function SecondaryChip({ item, index, onAction }) {
  const m = TYPE_META[item.type] ?? TYPE_META.strategy;
  const Icon = m.Icon;
  return (
    <button
      onClick={() => onAction?.(item)}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.sm,
        height:       44,
        padding:      `0 ${T.spacing.md}px`,
        background:   T.bgCard,
        border:       `1px solid ${T.border}`,
        borderRadius: T.radius.card,
        cursor:       "pointer",
        flex:         "1 1 0",
        minWidth:     0,
        textAlign:    "left",
        transition:   "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = m.border;
        e.currentTarget.style.background  = m.bg;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = T.border;
        e.currentTarget.style.background  = T.bgCard;
      }}
    >
      <span style={{
        fontSize:   10,
        fontFamily: "monospace",
        fontWeight: 700,
        color:      T.muted,
        flexShrink: 0,
      }}>
        {index + 2}
      </span>
      <Icon size={12} color={m.color} style={{ flexShrink: 0 }} />
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
        fontSize:   9,
        fontFamily: "monospace",
        fontWeight: 700,
        color:      m.color,
        flexShrink: 0,
      }}>
        {item.tag}
      </span>
      <ArrowRight size={11} color={T.muted} style={{ flexShrink: 0 }} />
    </button>
  );
}

// ─── ActionCommandBar ─────────────────────────────────────────────────────────

/** @param {{ decisionBar: any, onAction: any, loading?: boolean, startedId?: string | null }} props */
export default function ActionCommandBar({ decisionBar, onAction, loading = false, startedId = null }) {
  // strategy 타입은 TodayBriefCard("오늘의 전략")에서 전담 — 중복 제거
  const items = (decisionBar?.items ?? []).filter(item => item.type !== "strategy");
  const primary    = items[0] ?? null;
  const secondaries = items.slice(1, 3);

  return (
    <div style={{
      display:      "flex",
      flexDirection: "column",
      gap:          T.spacing.sm,
      background:   T.bgCard,
      border:       `1px solid ${decisionBar?.urgent ? T.borderColor.danger : T.border}`,
      borderRadius: T.radius.card,
      padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
      boxShadow:    T.shadow.card,
    }}>
      {/* 헤더 레이블 */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        T.spacing.xs,
        marginBottom: T.spacing.xs,
      }}>
        <span style={{
          fontSize:      10,
          fontWeight:    800,
          color:         decisionBar?.urgent ? T.danger : T.muted,
          fontFamily:    "monospace",
          letterSpacing: "0.08em",
        }}>
          {decisionBar?.urgent ? "⚠ URGENT" : "TODAY"}
        </span>
        <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
          — 오늘 할 일
        </span>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: T.muted, fontFamily: "monospace", padding: `${T.spacing.sm}px 0` }}>
          진단 데이터 로딩 중…
        </div>
      ) : items.length === 0 ? (
        <div style={{
          fontSize:   13,
          color:      T.success,
          fontWeight: 600,
          padding:    `${T.spacing.sm}px 0`,
        }}>
          오늘은 특이 사항 없음 — 정기 업로드 유지
        </div>
      ) : (
        <div style={{ display: "flex", gap: T.spacing.sm }}>
          {/* Primary */}
          {primary && <PrimaryCard item={primary} onAction={onAction} started={startedId === primary.id} />}

          {/* Secondaries */}
          {secondaries.length > 0 && (
            <div style={{
              display:       "flex",
              flexDirection: "column",
              gap:           T.spacing.xs,
              flex:          "0 0 360px",
              minWidth:      0,
            }}>
              {secondaries.map((item, i) => (
                <SecondaryChip key={item.id} item={item} index={i} onAction={onAction} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
