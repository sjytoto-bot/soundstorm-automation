// ─── DataHealthIssues.jsx ─────────────────────────────────────────────────────
// computeDataHealth() 결과를 UI로 렌더링.
// ok === true 또는 issues 없으면 null 반환 (조건부 표시).
//
// Props:
//   dataHealth  DataHealth | null

import { AlertTriangle, Info } from "lucide-react";
import { T } from "../../styles/tokens";

const SEVERITY_STYLE = {
  error: {
    icon:   AlertTriangle,
    color:  T.danger,
    bg:     T.dangerBg,
    border: `${T.danger}44`,
  },
  warning: {
    icon:   AlertTriangle,
    color:  T.warn,
    bg:     T.warnBg,
    border: `${T.warn}44`,
  },
  info: {
    icon:   Info,
    color:  T.primary,
    bg:     T.bgSection,
    border: T.border,
  },
};

export default function DataHealthIssues({ dataHealth }) {
  if (!dataHealth || dataHealth.ok || !dataHealth.issues?.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      {dataHealth.issues.map(issue => {
        const s    = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.warning;
        const Icon = s.icon;
        return (
          <div
            key={issue.type}
            style={{
              display:      "flex",
              alignItems:   "flex-start",
              gap:          T.spacing.md,
              padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
              borderRadius: T.radius.btn,
              border:       `1px solid ${s.border}`,
              background:   s.bg,
            }}
          >
            <Icon size={13} color={s.color} style={{ flexShrink: 0, marginTop: 2 }} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              {/* 타입 + 원인 */}
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
                <span style={{
                  fontSize:      10,
                  fontWeight:    700,
                  fontFamily:    "monospace",
                  letterSpacing: "0.06em",
                  color:         s.color,
                }}>
                  {issue.type}
                </span>
                <span style={{ fontSize: 11, color: T.sub }}>
                  {issue.cause}
                </span>
              </div>

              {/* 액션 */}
              <span style={{ fontSize: 10, color: T.muted }}>
                → {issue.action}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
