// ─── InsightActionBox v1 ──────────────────────────────────────────────────────
// 패널 하단 인사이트 + 추천 액션 공통 UI 컴포넌트
//
// 레이아웃:
//   ── 구분선 ──
//   [💡 인사이트]     [🎯 추천 액션]
//    • 분석 내용       • 실행 전략

import { T } from "../../styles/tokens";

interface InsightActionBoxProps {
  insights: string[];
  actions:  string[];
}

export default function InsightActionBox({ insights, actions }: InsightActionBoxProps) {
  if (insights.length === 0 && actions.length === 0) return null;

  return (
    <div style={{
      marginTop:  T.spacing.lg,
      paddingTop: T.spacing.lg,
      borderTop:  `1px solid ${T.borderSoft}`,
    }}>
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 T.spacing.xl,
      }}>
        {/* 💡 인사이트 */}
        <div>
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            marginBottom: T.spacing.sm,
          }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>💡</span>
            <span style={{
              fontSize:      T.font.size.xs,
              fontWeight:    T.font.weight.semibold,
              fontFamily:    T.font.familyMono,
              color:         "#f59e0b",
              letterSpacing: "0.05em",
            }}>
              인사이트
            </span>
          </div>

          <ul style={{
            margin:  0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}>
            {insights.map((text, i) => (
              <li key={i} style={{
                display:    "flex",
                alignItems: "flex-start",
                gap:        6,
              }}>
                <span style={{
                  flexShrink: 0,
                  fontSize:   T.font.size.xs,
                  color:      "#f59e0b",
                  marginTop:  1,
                  fontFamily: T.font.familyMono,
                }}>
                  •
                </span>
                <span style={{
                  fontSize:   T.font.size.xs,
                  color:      T.sub,
                  lineHeight: T.font.lineHeight.normal,
                }}>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 🎯 추천 액션 */}
        <div>
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            marginBottom: T.spacing.sm,
          }}>
            <span style={{ fontSize: 13, lineHeight: 1 }}>🎯</span>
            <span style={{
              fontSize:      T.font.size.xs,
              fontWeight:    T.font.weight.semibold,
              fontFamily:    T.font.familyMono,
              color:         T.primary,
              letterSpacing: "0.05em",
            }}>
              추천 액션
            </span>
          </div>

          <ul style={{
            margin:  0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}>
            {actions.map((text, i) => (
              <li key={i} style={{
                display:    "flex",
                alignItems: "flex-start",
                gap:        6,
              }}>
                <span style={{
                  flexShrink: 0,
                  fontSize:   T.font.size.xs,
                  color:      T.primary,
                  marginTop:  1,
                  fontFamily: T.font.familyMono,
                }}>
                  •
                </span>
                <span style={{
                  fontSize:   T.font.size.xs,
                  color:      T.sub,
                  lineHeight: T.font.lineHeight.normal,
                }}>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
