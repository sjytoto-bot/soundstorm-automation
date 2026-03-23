// ─── InsightDrawer ────────────────────────────────────────────────────────────
// 패널별 인사이트 & 액션 슬라이드 패널 (오른쪽 고정, 0.3s transition)
//
// Props:
//   open        — 열림 여부
//   onClose     — 닫기 콜백
//   title       — 패널 제목
//   insights    — string[] 인사이트 목록
//   actions     — string[] 추천 액션 목록

import { useEffect } from "react";
import { X, Lightbulb, Target } from "lucide-react";
import { T } from "../../styles/tokens";

export interface InsightDrawerData {
  title:    string;
  insights: string[];
  actions:  string[];
}

interface InsightDrawerProps extends InsightDrawerData {
  open:    boolean;
  onClose: () => void;
}

export default function InsightDrawer({
  open,
  onClose,
  title,
  insights,
  actions,
}: InsightDrawerProps) {

  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          background: "rgba(0,0,0,0.35)",
          zIndex:     40,
          opacity:    open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />

      {/* ── Drawer Panel ── */}
      <div style={{
        position:     "fixed",
        top:          0,
        right:        0,
        bottom:       0,
        width:        360,
        background:   T.bgCard,
        borderLeft:   `1px solid ${T.border}`,
        boxShadow:    "-4px 0 24px rgba(0,0,0,0.18)",
        zIndex:       50,
        display:      "flex",
        flexDirection: "column",
        transform:    open ? "translateX(0)" : "translateX(100%)",
        transition:   "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        overflowY:    "auto",
      }}>

        {/* ── Header ── */}
        <div style={{
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "space-between",
          padding:         `${T.spacing.lg}px ${T.spacing.xl}px`,
          borderBottom:    `1px solid ${T.border}`,
          background:      T.bgSection,
          flexShrink:      0,
        }}>
          <div>
            <div style={{
              fontSize:      T.font.size.xs,
              fontFamily:    T.font.familyMono,
              color:         T.muted,
              letterSpacing: "0.08em",
              marginBottom:  4,
            }}>
              PANEL INSIGHT
            </div>
            <div style={{
              fontSize:   T.font.size.sm,
              fontWeight: T.font.weight.semibold,
              color:      T.text,
            }}>
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width:        32,
              height:       32,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              background:   "transparent",
              border:       `1px solid ${T.border}`,
              borderRadius: T.radius.btn,
              cursor:       "pointer",
              color:        T.sub,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{
          padding:       `${T.spacing.xl}px`,
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.xl,
          flex:          1,
        }}>

          {/* 인사이트 섹션 */}
          <section>
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          T.spacing.sm,
              marginBottom: T.spacing.md,
            }}>
              <Lightbulb size={14} color="#f59e0b" />
              <span style={{
                fontSize:      T.font.size.xs,
                fontWeight:    T.font.weight.semibold,
                color:         "#f59e0b",
                letterSpacing: "0.06em",
                fontFamily:    T.font.familyMono,
              }}>
                인사이트
              </span>
            </div>

            {insights.length === 0 ? (
              <div style={{ fontSize: T.font.size.xs, color: T.muted }}>
                데이터 없음
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
                {insights.map((text, i) => (
                  <div key={i} style={{
                    display:      "flex",
                    gap:          T.spacing.sm,
                    alignItems:   "flex-start",
                    padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
                    background:   "#fef3c710",
                    border:       "1px solid #f59e0b22",
                    borderLeft:   "3px solid #f59e0b",
                    borderRadius: T.radius.btn,
                  }}>
                    <span style={{
                      fontSize:   T.font.size.xs,
                      fontFamily: T.font.familyMono,
                      color:      "#f59e0b",
                      flexShrink: 0,
                      marginTop:  1,
                    }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{
                      fontSize:   T.font.size.sm,
                      color:      T.text,
                      lineHeight: 1.5,
                    }}>
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 구분선 */}
          <div style={{ height: 1, background: T.borderSoft }} />

          {/* 추천 액션 섹션 */}
          <section>
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          T.spacing.sm,
              marginBottom: T.spacing.md,
            }}>
              <Target size={14} color={T.primary} />
              <span style={{
                fontSize:      T.font.size.xs,
                fontWeight:    T.font.weight.semibold,
                color:         T.primary,
                letterSpacing: "0.06em",
                fontFamily:    T.font.familyMono,
              }}>
                추천 액션
              </span>
            </div>

            {actions.length === 0 ? (
              <div style={{ fontSize: T.font.size.xs, color: T.muted }}>
                데이터 없음
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
                {actions.map((text, i) => (
                  <div key={i} style={{
                    display:      "flex",
                    gap:          T.spacing.sm,
                    alignItems:   "flex-start",
                    padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
                    background:   `${T.primary}08`,
                    border:       `1px solid ${T.primary}22`,
                    borderLeft:   `3px solid ${T.primary}`,
                    borderRadius: T.radius.btn,
                  }}>
                    <span style={{
                      fontSize:   T.font.size.xs,
                      fontFamily: T.font.familyMono,
                      color:      T.primary,
                      flexShrink: 0,
                      marginTop:  1,
                    }}>
                      →
                    </span>
                    <span style={{
                      fontSize:   T.font.size.sm,
                      color:      T.text,
                      lineHeight: 1.5,
                    }}>
                      {text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
