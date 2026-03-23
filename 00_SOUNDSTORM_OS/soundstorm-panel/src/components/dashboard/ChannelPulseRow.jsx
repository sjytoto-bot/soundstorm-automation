// ─── ChannelPulseRow.jsx ─────────────────────────────────────────────────────
// 채널 상태 compact 요약 + 분석 상세 토글
// 사용자 불안 해소 장치 — 항상 표시, KPI 상세는 접기/펼치기
//
// Props:
//   healthData       — computeChannelHealth() 반환값 (grade, score)
//   kpiHistory       — KPI 히스토리 배열 (최신값에서 views30d, subscriberChange 등)
//   channelAvgCTR    — number | null
//   expanded         — boolean
//   onToggle         — () => void
//   hasDiagIssues    — boolean  진단 이슈 존재 여부
//   onNavigateToDiag — () => void  진단 섹션으로 스크롤 (P0-2)

import { ChevronDown, ChevronUp, Activity, AlertTriangle } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 등급 스타일 ─────────────────────────────────────────────────────────────

const GRADE_STYLE = {
  A: { color: T.success,  bg: T.successBg  ?? "#F0FDF4", border: T.successBorder },
  B: { color: T.primary,  bg: T.primarySoft,              border: T.primaryBorder },
  C: { color: T.warn,     bg: T.warnBg,                   border: "#FDE68A"       },
  D: { color: T.danger,   bg: T.dangerBg,                 border: "#FECACA"       },
};

// ─── PulsePill ───────────────────────────────────────────────────────────────

function PulsePill({ label, value, accent = T.sub }) {
  if (!value) return null;
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.xs,
      minWidth:   0,
    }}>
      <span style={{
        fontSize: 10,
        color: T.muted,
        fontFamily: T.font.familyMono,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        fontSize:   11,
        fontWeight: 700,
        color:      accent,
        fontFamily: T.font.familyMono,
        whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: T.borderSoft }} />;
}

function StatusDot({ color }) {
  return (
    <span style={{
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 0 3px ${color}14`,
      flexShrink: 0,
    }} />
  );
}

function UtilityButton({ children, onClick, active = false, tone = "neutral" }) {
  const toneMap = {
    neutral: {
      color: active ? T.text : T.sub,
      bg: active ? T.bgSection : "transparent",
      border: active ? T.border : "transparent",
    },
    danger: {
      color: T.danger,
      bg: T.dangerBg,
      border: `${T.danger}26`,
    },
  };
  const meta = toneMap[tone] ?? toneMap.neutral;

  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: T.spacing.xs,
        height: 30,
        padding: `0 ${T.spacing.sm}px`,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        borderRadius: T.radius.btn,
        cursor: "pointer",
        color: meta.color,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: T.font.familyMono,
        transition: `background ${T.motion.fast}, border-color ${T.motion.fast}, color ${T.motion.fast}, opacity ${T.motion.fast}`,
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.opacity = "0.8";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.opacity = "1";
      }}
    >
      {children}
    </button>
  );
}

// ─── ChannelPulseRow ─────────────────────────────────────────────────────────

export default function ChannelPulseRow({ healthData, kpiHistory, channelAvgCTR, expanded, onToggle, loading = false, hasDiagIssues = false, onNavigateToDiag }) {
  const grade      = healthData?.grade ?? null;
  const gradeStyle = grade ? (GRADE_STYLE[grade] ?? GRADE_STYLE.B) : null;
  const statusLabel = grade ? `채널 ${grade}` : "채널 상태";
  const lastKpi = [...(kpiHistory ?? [])].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).at(-1);
  const stripSignals = [
    {
      label: "진단",
      value: hasDiagIssues ? "이슈 있음" : "안정",
      accent: hasDiagIssues ? T.danger : T.success,
    },
    {
      label: "동기화",
      value: loading ? "갱신 중" : "읽기 가능",
      accent: loading ? T.warn : T.success,
    },
    lastKpi?.date
      ? {
          label: "기준일",
          value: String(lastKpi.date).slice(5),
          accent: T.sub,
        }
      : null,
  ].filter(Boolean);

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.lg,
      padding:      `${T.spacing.md}px ${T.spacing.xl}px`,
      minHeight:    58,
      background:   T.semantic.surface.card,
      border:       `1px solid ${expanded ? T.border : T.borderSoft}`,
      borderRadius: T.radius.card,
      boxShadow:    "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md, flexShrink: 0, minWidth: 0 }}>
        <StatusDot color={gradeStyle?.color ?? T.muted} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
            <Activity size={12} color={gradeStyle?.color ?? T.muted} />
            <span style={{ fontSize: 10, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Status Strip
            </span>
          </div>
          <span style={{ fontSize: 13, color: gradeStyle?.color ?? T.text, fontWeight: 700 }}>
            {statusLabel}
          </span>
        </div>
      </div>

      <Divider />

      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.lg, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
        {loading ? (
          ["진단", "동기화"].map(label => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
              <span style={{ fontSize: 10, color: T.muted, fontFamily: T.font.familyMono }}>{label}</span>
              <span className="skeleton" style={{ width: 48, height: 12 }} />
            </div>
          ))
        ) : (
          stripSignals.map(item => (
            <PulsePill key={item.label} label={item.label} value={item.value} accent={item.accent} />
          ))
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginLeft: "auto", flexShrink: 0 }}>
        {hasDiagIssues && onNavigateToDiag && (
          <UtilityButton onClick={onNavigateToDiag} tone="danger">
            <AlertTriangle size={11} />
            Issues
          </UtilityButton>
        )}

        <UtilityButton onClick={onToggle} active={expanded}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? "Hide Detail" : "Show Detail"}
        </UtilityButton>
      </div>
    </div>
  );
}
