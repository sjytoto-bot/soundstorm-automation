import { T } from "../../styles/tokens";
import { generateInsights } from "../../utils/strategyInsight";
import WeightPanel from "./WeightPanel";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  white:  T.bgCard,
  bg:     T.bgApp,
  border: T.border,
  text:   T.text,
  sub:    T.sub,
  muted:  T.muted,
};

// 등급 → 컬러 (T.color 토큰 외 사용 금지)
const GRADE_COLOR = {
  A: T.color.success,
  B: T.color.primary,
  C: T.color.warning,
  D: T.color.danger,
};

// 등급 → 배경 (기존 top-level T 토큰 활용)
const GRADE_BG = {
  A: T.successBg,
  B: T.primarySoft,
  C: T.warnBg,
  D: T.dangerBg,
};

// 4축 라벨
const AXIS_CONFIG = [
  { key: "growth",       label: "Growth"   },
  { key: "reach",        label: "Reach"    },
  { key: "engagement",   label: "Engage"   },
  { key: "monetization", label: "Monetize" },
];

// insight type → 색상 (T.color 토큰 외 사용 금지)
const TYPE_COLOR = {
  positive: T.color.success,
  warning:  T.color.warning,
  critical: T.color.danger,
};

// confidence → 색상
const CONFIDENCE_COLOR = {
  High:   T.color.success,
  Medium: T.color.warning,
  Low:    T.color.danger,
};

// insight type → 배지 아이콘
const TYPE_ICON = {
  positive: "+",
  warning:  "!",
  critical: "!!",
};

// ─── VideoDetailPanel ──────────────────────────────────────────────────────────
// Props
//   track    { id, name, strategy: { growth, reach, engagement, monetization, total, grade } }
//   onClose  () => void

export default function VideoDetailPanel({ track, onClose, weights, onWeightChange, onPresetApply }) {
  const s          = track.strategy;
  const gradeColor = GRADE_COLOR[s.grade] ?? C.muted;
  const gradeBg    = GRADE_BG[s.grade]    ?? C.bg;
  const insights   = generateInsights(s);

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.border}`,
      borderTop:    `${T.spacing.xs}px solid ${gradeColor}`,
      borderRadius: T.radius.card,
      padding:      `${T.spacing.xl}px`,
      boxShadow:    T.shadow.card,
      display:      "flex",
      flexDirection:"column",
      gap:          T.spacing.xl,
    }}>

      {/* ── 헤더: 트랙명 + 닫기 ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginBottom: T.spacing.xs }}>
            TRACK DETAIL
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
            {track.name}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="패널 닫기"
          style={{
            width: 26, height: 26, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${C.border}`, borderRadius: T.radius.btn,
            background: C.bg, cursor: "pointer", color: C.muted,
            fontSize: 12, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* ── 총점 + 등급 배지 ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: T.spacing.md }}>
        <span style={{
          fontSize: 56, fontWeight: 800, color: gradeColor,
          fontFamily: "monospace", lineHeight: 1,
        }}>
          {s.total}
        </span>
        <div style={{ paddingBottom: T.spacing.sm }}>
          <span style={{
            fontSize: 14, fontWeight: T.font.weight.semibold,
            padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
            borderRadius: T.radius.badge,
            background: gradeBg,
            color: gradeColor,
            border: `1px solid ${gradeColor}33`,
            fontFamily: "monospace",
            letterSpacing: "0.06em",
          }}>
            Grade {s.grade}
          </span>
        </div>
      </div>

      {/* ── 신뢰도 레벨 ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{
          fontSize: 10, color: C.muted, fontFamily: "monospace",
          letterSpacing: "0.08em",
        }}>
          CONFIDENCE
        </span>
        <span style={{
          fontSize: 10, fontFamily: "monospace", fontWeight: 600,
          color: CONFIDENCE_COLOR[s.confidence] ?? C.muted,
          letterSpacing: "0.04em",
        }}>
          {s.confidence ?? "—"}
        </span>
        {s.confidence === "Low" && (
          <span style={{ fontSize: 9, color: T.color.danger, fontFamily: "monospace" }}>
            (표본 부족)
          </span>
        )}
      </div>

      {/* ── 4축 Progress Bar ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
        {AXIS_CONFIG.map(({ key, label }) => (
          <div key={key}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              marginBottom: T.spacing.xs,
            }}>
              <span style={{ fontSize: 11, color: C.sub, fontFamily: "monospace", letterSpacing: "0.04em" }}>
                {label}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
                {s[key]}
              </span>
            </div>
            <div style={{
              height: T.spacing.sm,
              background: C.border, borderRadius: T.radius.pill, overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${s[key]}%`,
                background: gradeColor,
                borderRadius: T.radius.pill,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── 자동 진단 인사이트 ─────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <div style={{
          padding: `${T.spacing.sm}px ${T.spacing.md}px`,
          borderRadius: T.radius.btn,
          border: `1px solid ${C.border}`,
          background: C.bg,
          display: "flex", flexDirection: "column", gap: T.spacing.sm,
        }}>
          <span style={{
            fontSize: 10, color: C.muted, fontFamily: "monospace",
            letterSpacing: "0.08em",
          }}>
            INSIGHTS
          </span>
          {insights.map(({ type, message }, i) => {
            const color = TYPE_COLOR[type] ?? C.sub;
            return (
              <div key={i} style={{ display: "flex", gap: T.spacing.sm, alignItems: "flex-start" }}>
                <span style={{
                  fontSize: 9, fontFamily: "monospace",
                  color, border: `1px solid ${color}33`,
                  background: `${color}11`,
                  borderRadius: T.radius.badge,
                  padding: `1px ${T.spacing.xs}px`,
                  flexShrink: 0, marginTop: 2,
                  letterSpacing: "0.04em",
                }}>
                  {TYPE_ICON[type]}
                </span>
                <span style={{ fontSize: 12, color, lineHeight: 1.5 }}>
                  {message}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 인사이트 없음 → 전 축 양호 */}
      {insights.length === 0 && (
        <div style={{
          padding: `${T.spacing.sm}px ${T.spacing.md}px`,
          borderRadius: T.radius.btn,
          border: `1px solid ${T.color.success}33`,
          background: T.successBg,
        }}>
          <span style={{ fontSize: 12, color: T.color.success }}>
            전 축 양호 — 현재 전략 유지
          </span>
        </div>
      )}

      {/* ── 가중치 슬라이더 ─────────────────────────────────────────────────── */}
      {weights && (
        <WeightPanel
          weights={weights}
          onWeightChange={onWeightChange}
          onPresetApply={onPresetApply}
        />
      )}

    </div>
  );
}
