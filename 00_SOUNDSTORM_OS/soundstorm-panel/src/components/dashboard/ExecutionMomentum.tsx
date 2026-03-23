// ─── ExecutionMomentum ────────────────────────────────────────────────────────
// Upload Momentum 섹션 — 업로드 주기 상태 표시

import { T } from "../../styles/tokens";
import type { UploadMomentum } from "@/controllers/useExecutionController";

interface Props {
  momentum:  UploadMomentum;
  daysSince: number | null;
}

const CFG: Record<UploadMomentum, { label: string; color: string; bg: string }> = {
  healthy: { label: "Healthy", color: T.success,  bg: T.successBg },
  slowing: { label: "Slowing", color: T.warn,     bg: T.warnBg    },
  stalled: { label: "Stalled", color: T.danger,   bg: T.dangerBg  },
  unknown: { label: "—",       color: T.muted,    bg: T.bgSection },
};

// 헤더 우측 — 인라인 컴팩트 뱃지 (Header 안에서 사용)
export function MomentumBadge({ momentum, daysSince }: Props) {
  const { label, color, bg } = CFG[momentum];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
      {daysSince !== null && (
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          color:      T.muted,
        }}>
          {Math.floor(daysSince)}일 전 업로드
        </span>
      )}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          5,
        padding:      "3px 9px",
        borderRadius: T.radius.pill,
        background:   bg,
        border:       `1px solid ${color}40`,
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   color,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold,
          color,
        }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// 섹션형 — Upload Momentum 제목 + 상태 표시
export default function ExecutionMomentum({ momentum, daysSince }: Props) {
  const { label, color, bg } = CFG[momentum];

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        `${T.spacing.sm}px ${T.spacing.md}px`,
      background:     bg,
      borderRadius:   T.radius.btn,
      border:         `1px solid ${color}30`,
    }}>
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.sub,
        letterSpacing: "0.06em",
      }}>
        UPLOAD MOMENTUM
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        {daysSince !== null && (
          <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
            {Math.floor(daysSince)}일 전 업로드
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: color, display: "inline-block", flexShrink: 0,
          }} />
          <span style={{
            fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold, color,
          }}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
