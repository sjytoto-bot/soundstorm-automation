// ─── CriticalAlertBanner.jsx ─────────────────────────────────────────────────
// CRITICAL 진단 시 최상단에 sticky로 표시되는 긴급 실행 배너
// 조건부 렌더링 — CRITICAL severity 없으면 null 반환
//
// Props:
//   criticalAlerts — VideoDiagnostic[]  (useTodayActionController에서 사전 필터링된 배열)
//   onAction       — (diagnostic) => void  (즉시 실행 CTA)

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { T } from "../../styles/tokens";

const PROBLEM_META = {
  CTR_WEAK:        { label: "CTR 위기",        action: "썸네일 즉시 교체",  detail: (d) => `CTR ${d.ctr != null ? (d.ctr * 100).toFixed(1) + "%" : "—"} — 48h 내 기회 손실` },
  IMPRESSION_DROP: { label: "노출 급감",        action: "알고리즘 복구 시작", detail: (d) => `${d.subtype ?? "BROWSE_DROP"} — 조회수 이탈 진행 중` },
  RETENTION_WEAK:  { label: "시청유지율 위기",   action: "인트로 즉시 수정",   detail: (d) => `시청유지 ${d.retentionPct != null ? (d.retentionPct * 100).toFixed(0) + "%" : "—"}` },
};

export default function CriticalAlertBanner({ criticalAlerts, onAction }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const criticals = criticalAlerts ?? [];

  if (criticals.length === 0) return null;

  const top  = criticals[0];
  const meta = PROBLEM_META[top.problemType] ?? {
    label:  "긴급 점검 필요",
    action: "지금 확인",
    detail: () => "채널 지표 이상 감지",
  };
  const _vidRe     = /^[a-zA-Z0-9_-]{11}$/;
  const _rawTitle  = top.title ?? "";
  const title      = (!_rawTitle || _vidRe.test(_rawTitle)) ? "영상" : _rawTitle;
  const detailText = meta.detail(top);

  return (
    <div style={{
      position:     "sticky",
      top:          0,
      zIndex:       20,
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.md,
      padding:      `${T.spacing.sm}px ${T.spacing.xl}px`,
      background:   T.dangerBg,
      borderBottom: `2px solid ${T.danger}`,
    }}>
      {/* 아이콘 + 레이블 */}
      <AlertTriangle size={16} color={T.danger} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize:   12,
          fontWeight: 800,
          color:      T.danger,
          fontFamily: "monospace",
          marginRight: T.spacing.sm,
        }}>
          {meta.label}
        </span>
        <span style={{
          fontSize:   12,
          fontWeight: 600,
          color:      T.text,
          marginRight: T.spacing.xs,
        }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: T.sub }}>
          — {detailText}
        </span>
        {criticals.length > 1 && (
          <span style={{
            fontSize:     10,
            color:        T.danger,
            background:   `${T.danger}15`,
            borderRadius: T.radius.badge,
            padding:      "1px 6px",
            marginLeft:   T.spacing.sm,
            fontFamily:   "monospace",
            fontWeight:   700,
          }}>
            +{criticals.length - 1}건 더
          </span>
        )}
      </div>

      {/* 즉시 실행 CTA */}
      <button
        onClick={() => onAction?.(top)}
        style={{
          display:      "flex",
          alignItems:   "center",
          height:       44,
          padding:      `0 ${T.spacing.xl}px`,
          background:   T.danger,
          border:       "none",
          borderRadius: T.radius.btn,
          cursor:       "pointer",
          fontSize:     13,
          fontWeight:   800,
          color:        "#FFFFFF",
          whiteSpace:   "nowrap",
          flexShrink:   0,
          transition:   "opacity 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
      >
        {meta.action}
      </button>

      {/* 닫기 */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          width:        32,
          height:       32,
          background:   "transparent",
          border:       "none",
          cursor:       "pointer",
          borderRadius: T.radius.btn,
          flexShrink:   0,
        }}
      >
        <X size={14} color={T.sub} />
      </button>
    </div>
  );
}
