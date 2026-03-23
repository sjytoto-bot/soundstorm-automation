// ─── ActionInsightCard v1 ─────────────────────────────────────────────────────
// Action 중심 카드 — 사용자가 먼저 무엇을 해야 하는지 보이는 구조
//
// Layout:
//   🎯 Action 문장     (18px bold, #111)
//   Reason 설명        (14px, #555, line-height 1.6)
//   영향도 높음 · 분석 신뢰도 높음  (12px, #888)
//
// Left border: danger → red / warning → orange / positive → green
// Impact/Confidence: bar 대신 텍스트 레이블 (높음 / 중간 / 낮음)

import { T } from "../../styles/tokens";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type Severity = "danger" | "warning" | "positive";

export interface ActionInsightCardProps {
  action:     string;   // 명령형 문장 (예: "인트로를 20초 이내로 단축하세요")
  reason:     string;   // 근거 설명 (예: "조회수와 평균시청시간이 동시에...")
  impact:     number;   // 0–100
  confidence: number;   // 0–100
  severity:   Severity;
  metric?:    string;   // 강조 수치 (예: "-33%")
}

// ─── 색상 맵 ──────────────────────────────────────────────────────────────────

const SEVERITY_BORDER: Record<Severity, string> = {
  danger:   T.danger,
  warning:  "#f59e0b",
  positive: T.success,
};

// ─── 레이블 변환 ──────────────────────────────────────────────────────────────

function scoreLabel(n: number): string {
  if (n > 80) return "높음";
  if (n > 60) return "중간";
  return "낮음";
}

// ─── ActionInsightCard ────────────────────────────────────────────────────────

export default function ActionInsightCard({
  action,
  reason,
  impact,
  confidence,
  severity,
  metric,
}: ActionInsightCardProps) {
  const borderColor = SEVERITY_BORDER[severity];

  return (
    <div style={{
      background:    T.bgCard,
      borderRadius:  10,
      borderLeft:    `4px solid ${borderColor}`,
      padding:       "16px 18px",
      display:       "flex",
      flexDirection: "column",
      gap:           10,
      boxShadow:     T.shadow.card,
    }}>
      {/* ── 🎯 Action 문장 ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 15, lineHeight: 1.2, flexShrink: 0, marginTop: 3 }}>
          🎯
        </span>
        <span style={{
          flex:       1,
          fontSize:   18,
          fontWeight: 700,
          color:      "#111",
          lineHeight: 1.35,
        }}>
          {action}
        </span>
        {metric && (
          <span style={{
            flexShrink:   0,
            alignSelf:    "flex-start",
            marginTop:    3,
            fontSize:     12,
            fontFamily:   T.font.familyMono,
            fontWeight:   600,
            color:        borderColor,
            background:   `${borderColor}14`,
            borderRadius: 6,
            padding:      "3px 9px",
            whiteSpace:   "nowrap",
          }}>
            {metric}
          </span>
        )}
      </div>

      {/* ── Reason 설명 ── */}
      <p style={{
        margin:      0,
        paddingLeft: 23,
        fontSize:    14,
        color:       "#555",
        lineHeight:  1.6,
      }}>
        {reason}
      </p>

      {/* ── 데이터 footer ── */}
      <div style={{
        paddingLeft: 23,
        fontSize:    12,
        color:       "#888",
        fontFamily:  T.font.familyMono,
        display:     "flex",
        alignItems:  "center",
        gap:         4,
      }}>
        <span>영향도 {scoreLabel(impact)}</span>
        <span style={{ color: "#d1d5db" }}>·</span>
        <span>분석 신뢰도 {scoreLabel(confidence)}</span>
      </div>
    </div>
  );
}
