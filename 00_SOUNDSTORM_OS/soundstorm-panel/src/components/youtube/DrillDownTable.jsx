// ─── DrillDownTable v1 ────────────────────────────────────────────────────────
// 재사용 가능한 드릴다운 테이블 컴포넌트.
//
// Props:
//   columns — { key: string, label: string, align?: "left"|"center"|"right" }[]
//   rows    — Record<string, any>[]
//   onClose — () => void

import { T } from "../../styles/tokens";

export default function DrillDownTable({ columns, rows, onClose }) {
  return (
    <div style={{
      marginTop:    T.spacing.md,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      overflow:     "hidden",
      position:     "relative",
    }}>
      {/* ── 헤더 영역 (닫기 버튼 포함) ──────────────────────────────────── */}
      <div style={{
        display:        "flex",
        justifyContent: "flex-end",
        padding:        `${T.spacing.xs}px ${T.spacing.sm}px`,
        background:     T.bgSection,
        borderBottom:   `1px solid ${T.border}`,
      }}>
        <button
          onClick={onClose}
          style={{
            fontSize:   T.font.size.xs,
            color:      T.sub,
            background: "none",
            border:     "none",
            cursor:     "pointer",
            padding:    `${T.spacing.xs / 2}px ${T.spacing.xs}px`,
            fontFamily: T.font.familyMono,
            lineHeight: 1,
          }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* ── 테이블 ────────────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{
          width:           "100%",
          borderCollapse:  "collapse",
          fontSize:        T.font.size.xs,
        }}>
          {/* 헤더 행 */}
          <thead>
            <tr style={{
              background: T.bgSection,
            }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{
                    padding:    `${T.spacing.sm}px ${T.spacing.md}px`,
                    textAlign:  col.align ?? "left",
                    color:      T.muted,
                    fontWeight: T.font.weight.medium,
                    fontSize:   T.font.size.xs,
                    border:     `1px solid ${T.border}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* 데이터 행 */}
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0 ? T.bgCard : T.bgApp,
                }}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    style={{
                      padding:    `${T.spacing.sm}px ${T.spacing.md}px`,
                      textAlign:  col.align ?? "left",
                      color:      T.text,
                      border:     `1px solid ${T.border}`,
                      whiteSpace: col.key === "title" ? "normal" : "nowrap",
                    }}
                  >
                    {row[col.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 데이터 없음 */}
        {rows.length === 0 && (
          <div style={{
            padding:   T.spacing.lg,
            textAlign: "center",
            color:     T.muted,
            fontSize:  T.font.size.xs,
          }}>
            데이터 없음
          </div>
        )}
      </div>
    </div>
  );
}
