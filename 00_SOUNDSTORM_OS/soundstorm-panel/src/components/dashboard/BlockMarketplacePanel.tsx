// ─── BlockMarketplacePanel ────────────────────────────────────────────────────
// Dashboard 블록 관리 + 마켓플레이스 패널
//
// 탭 1 "활성":   현재 visible 블록 — 숨김 / 핀(고정) 설정
// 탭 2 "+ 추가": visible=false 블록 — 클릭하면 즉시 대시보드에 추가
//
// 규칙:
//   - 이 컴포넌트는 UI 상태만 관리 (tab)
//   - 데이터 변경은 props로 받은 toggle / updateLayout만 호출

import { useState } from "react";
import type { BlockId, BlockDef } from "@/types/dashboardBlock";
import type { BlockLayout } from "@/hooks/useDashboardBlocks";
import { T } from "@/styles/tokens";

interface Props {
  visibility:   Record<BlockId, boolean>;
  order:        BlockId[];
  defs:         readonly BlockDef[];
  layout:       Record<BlockId, BlockLayout>;
  toggle:       (id: BlockId) => void;
  updateLayout: (id: BlockId, updates: Partial<BlockLayout>) => void;
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function TabBtn({
  active, label, onClick,
}: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex:          1,
        padding:       `${T.spacing.xs}px`,
        borderRadius:  T.radius.btn,
        border:        "none",
        background:    active ? T.color.primarySoft : "transparent",
        color:         active ? T.color.primary : T.color.textMuted,
        fontSize:      10,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        cursor:        "pointer",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </button>
  );
}

function SmallBtn({
  label, active = false, variant = "default", onClick,
}: {
  label:    string;
  active?:  boolean;
  variant?: "default" | "primary" | "danger";
  onClick:  () => void;
}) {
  const colors = {
    default: { bg: "transparent", color: T.color.textMuted, border: T.color.border },
    primary: { bg: T.color.primarySoft, color: T.color.primary, border: T.color.primary },
    danger:  { bg: "transparent", color: T.color.danger,  border: T.color.danger  },
  };
  const c = colors[active ? "primary" : variant];
  return (
    <button
      onClick={onClick}
      style={{
        padding:      "2px 8px",
        borderRadius: T.radius.btn,
        border:       `1px solid ${c.border}`,
        background:   c.bg,
        color:        c.color,
        fontSize:     9,
        fontFamily:   T.font.familyMono,
        fontWeight:   T.font.weight.semibold,
        cursor:       "pointer",
        whiteSpace:   "nowrap",
      }}
    >
      {label}
    </button>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function BlockMarketplacePanel({
  visibility, order, defs, layout, toggle, updateLayout,
}: Props) {
  const [tab, setTab] = useState<"active" | "add">("active");

  const activeIds    = order.filter(id => visibility[id]);
  const availableIds = defs.filter(d => !visibility[d.id]).map(d => d.id);

  return (
    <div style={{
      background:    T.color.bgPrimary,
      border:        `1px solid ${T.color.border}`,
      borderRadius:  T.radius.card,
      boxShadow:     T.shadow.hover,
      minWidth:      252,
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
    }}>

      {/* ── 탭 헤더 ── */}
      <div style={{
        display:       "flex",
        gap:           T.spacing.xs,
        padding:       `${T.spacing.sm}px`,
        borderBottom:  `1px solid ${T.color.border}`,
      }}>
        <TabBtn
          active={tab === "active"}
          label={`활성 ${activeIds.length}`}
          onClick={() => setTab("active")}
        />
        <TabBtn
          active={tab === "add"}
          label={`+ 추가 ${availableIds.length}`}
          onClick={() => setTab("add")}
        />
      </div>

      {/* ── 탭 1: 활성 블록 ── */}
      {tab === "active" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: `${T.spacing.xs}px` }}>
          {activeIds.length === 0 && (
            <span style={{
              fontSize: 11, color: T.color.textMuted,
              padding: `${T.spacing.sm}px`,
            }}>
              활성 블록 없음
            </span>
          )}
          {activeIds.map(id => {
            const def    = defs.find(d => d.id === id);
            const pinned = layout[id]?.pinned ?? false;
            return (
              <div
                key={id}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          T.spacing.xs,
                  padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
                  borderRadius: T.radius.btn,
                  background:   pinned ? T.color.primarySoft : T.color.bgSection,
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: pinned ? T.color.primary : T.color.success,
                }} />
                <span style={{
                  flex: 1, fontSize: 11, fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.semibold, color: T.color.textPrimary,
                }}>
                  {def?.label ?? id}
                </span>
                <SmallBtn
                  label={pinned ? "고정 해제" : "고정"}
                  active={pinned}
                  onClick={() => updateLayout(id, { pinned: !pinned })}
                />
                <SmallBtn
                  label="숨김"
                  variant="danger"
                  onClick={() => toggle(id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── 탭 2: 블록 추가 (Marketplace) ── */}
      {tab === "add" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {availableIds.length === 0 && (
            <span style={{
              fontSize: 11, color: T.color.textMuted,
              padding: `${T.spacing.sm}px ${T.spacing.md}px`,
            }}>
              추가 가능한 블록 없음
            </span>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: `${T.spacing.xs}px` }}>
            {availableIds.map(id => {
              const def = defs.find(d => d.id === id);
              return (
                <div
                  key={id}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          T.spacing.xs,
                    padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
                    borderRadius: T.radius.btn,
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: T.color.border,
                  }} />
                  <span style={{
                    flex: 1, fontSize: 11, fontFamily: T.font.familyMono,
                    color: T.color.textMuted,
                  }}>
                    {def?.label ?? id}
                  </span>
                  <SmallBtn
                    label="+ 추가"
                    variant="primary"
                    onClick={() => { toggle(id); setTab("active"); }}
                  />
                </div>
              );
            })}
          </div>

          {/* 새 블록 생성 힌트 */}
          <div style={{
            margin:        `${T.spacing.xs}px`,
            padding:       `${T.spacing.xs}px ${T.spacing.sm}px`,
            borderTop:     `1px solid ${T.color.border}`,
            fontSize:      9,
            fontFamily:    T.font.familyMono,
            color:         T.color.textMuted,
            letterSpacing: "0.03em",
          }}>
            새 블록: npm run create:block -- BlockName
          </div>
        </div>
      )}
    </div>
  );
}
