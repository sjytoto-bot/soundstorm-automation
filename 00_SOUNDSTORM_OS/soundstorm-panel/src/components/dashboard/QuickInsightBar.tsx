// ─── QuickInsightBar v3 ───────────────────────────────────────────────────────
// Action-first 구조 — 🔥/⚠️/💡 severity 아이콘 + Action 문장 Bold
//
// Primary bar:
//   [severity icon] Action 문장 (bold)
//   [indent]        Reason 설명 (xs, muted)
//
// Deep Insight Panel (portal):
//   Action-first 카드, borderLeft severity 색상
//   max-width 420px / padding 16px / borderRadius 12px / gap 12px

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { T } from "../../styles/tokens";
import type { InsightPair } from "@/engines/PanelInsightEngine";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type SeverityType = "danger" | "warning" | "positive" | undefined;

interface QuickInsightBarProps {
  pairs:     InsightPair[];
  loading?:  boolean;
  onAction?: (actionType: string) => void;
}

// ─── Severity 매핑 ────────────────────────────────────────────────────────────

function severityIcon(s: SeverityType): string {
  if (s === "danger")  return "🔥";
  if (s === "warning") return "⚠️";
  return "💡";
}

function severityColor(s: SeverityType): string {
  if (s === "danger")  return T.danger  ?? "#EF4444";
  if (s === "warning") return T.warn;
  return T.success ?? "#16A34A";
}

// ─── DeepInsightPanel (Portal) ────────────────────────────────────────────────

interface DeepInsightPanelProps {
  pairs:        InsightPair[];
  anchor:       DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onAction?:    (actionType: string) => void;
}

function DeepInsightPanel({ pairs, anchor, onMouseEnter, onMouseLeave, onAction }: DeepInsightPanelProps) {
  const estimatedHeight = pairs.length * 100 + 56;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const showAbove  = spaceBelow < estimatedHeight + 12 && anchor.top > estimatedHeight;

  const panelStyle: React.CSSProperties = {
    position:     "fixed",
    left:         anchor.left,
    width:        Math.max(anchor.width, 320),
    maxWidth:     420,
    background:   T.bgCard,
    border:       `1px solid ${T.border}`,
    borderRadius: 12,
    boxShadow:    "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
    padding:      16,
    zIndex:       9999,
    maxHeight:    "60vh",
    overflowY:    "auto",
    pointerEvents: "auto",
  };

  if (showAbove) {
    panelStyle.bottom = window.innerHeight - anchor.top + 4;
  } else {
    panelStyle.top = anchor.bottom + 4;
  }

  return createPortal(
    <div
      style={panelStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 헤더 */}
      <div style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        color:         T.muted,
        letterSpacing: "0.06em",
        marginBottom:  12,
        paddingBottom: 8,
        borderBottom:  `1px solid ${T.borderSoft}`,
      }}>
        DEEP INSIGHT
      </div>

      {/* 카드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pairs.map((pair, i) => {
          const color = severityColor(pair.severity);
          return (
            <div key={i} style={{
              display:       "flex",
              flexDirection: "column",
              gap:           8,
              padding:       "12px 14px",
              background:    T.bgSection,
              borderRadius:  10,
              borderLeft:    `3px solid ${color}`,
            }}>
              {/* Action */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 13, lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>
                  {severityIcon(pair.severity)}
                </span>
                <span style={{
                  fontSize:   T.font.size.sm,
                  fontWeight: T.font.weight.semibold,
                  color:      "#111",
                  lineHeight: 1.4,
                  flex:       1,
                }}>
                  {pair.action}
                </span>
              </div>
              {/* Reason */}
              <p style={{
                margin:      0,
                paddingLeft: 21,
                fontSize:    T.font.size.xs,
                color:       T.sub,
                lineHeight:  1.5,
              }}>
                {pair.insight}
              </p>

              {/* CTA 버튼 */}
              {pair.ctas && pair.ctas.length > 0 && (
                <div style={{
                  display:    "flex",
                  gap:        6,
                  paddingLeft: 21,
                  flexWrap:   "wrap",
                  marginTop:  2,
                }}>
                  {pair.ctas.map(cta => (
                    <button
                      key={cta.actionType}
                      onClick={() => onAction?.(cta.actionType)}
                      style={{
                        padding:      "3px 10px",
                        fontSize:     T.font.size.xs,
                        fontFamily:   T.font.familyMono,
                        fontWeight:   T.font.weight.semibold,
                        color:        color,
                        background:   "transparent",
                        border:       `1px solid ${color}`,
                        borderRadius: T.radius.badge,
                        cursor:       "pointer",
                        lineHeight:   1.5,
                        transition:   "background 0.15s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}22`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      {cta.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ─── QuickInsightBar ──────────────────────────────────────────────────────────

export default function QuickInsightBar({ pairs, loading, onAction }: QuickInsightBarProps) {
  const barRef    = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const updateAnchor = useCallback(() => {
    if (barRef.current) setAnchor(barRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [anchor, updateAnchor]);

  function openDeep() {
    clearTimeout(hideTimer.current);
    updateAnchor();
  }

  function scheduleClose() {
    hideTimer.current = setTimeout(() => setAnchor(null), 120);
  }

  function cancelClose() {
    clearTimeout(hideTimer.current);
  }

  if (loading) {
    return (
      <div style={{
        marginTop:    T.spacing.lg,
        borderTop:    `1px solid ${T.borderSoft}`,
        paddingTop:   T.spacing.md,
        height:       40,
        background:   T.bgSection,
        borderRadius: T.radius.btn,
      }} />
    );
  }

  if (!pairs || pairs.length === 0) return null;

  const primary   = pairs[0];
  const deepPairs = pairs.slice(1);
  const hasDeep   = deepPairs.length > 0;
  const isOpen    = anchor !== null;
  const iconColor = severityColor(primary.severity);

  return (
    <div
      ref={barRef}
      onMouseEnter={openDeep}
      onMouseLeave={scheduleClose}
      style={{
        marginTop:  T.spacing.lg,
        borderTop:  `1px solid ${T.borderSoft}`,
        paddingTop: T.spacing.md,
      }}
    >
      {/* ── Primary — Action first ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {/* Action 행 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: T.spacing.sm }}>
          <span style={{ fontSize: 13, lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>
            {severityIcon(primary.severity)}
          </span>
          <span style={{
            flex:       1,
            fontSize:   T.font.size.xs,
            fontWeight: T.font.weight.semibold,
            color:      iconColor,
            lineHeight: 1.5,
          }}>
            {primary.action}
          </span>
          {hasDeep && (
            <ChevronDown
              size={12}
              color={T.muted}
              style={{
                flexShrink: 0,
                marginTop:  3,
                transform:  isOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
                opacity:    0.6,
              }}
            />
          )}
        </div>

        {/* Reason 행 */}
        <p style={{
          margin:      0,
          paddingLeft: 21,
          fontSize:    T.font.size.xs,
          color:       T.muted,
          lineHeight:  1.5,
        }}>
          {primary.insight}
        </p>
      </div>

      {/* ── Deep Insight Portal ── */}
      {isOpen && hasDeep && anchor && (
        <DeepInsightPanel
          pairs={deepPairs}
          anchor={anchor}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onAction={onAction}
        />
      )}
    </div>
  );
}
