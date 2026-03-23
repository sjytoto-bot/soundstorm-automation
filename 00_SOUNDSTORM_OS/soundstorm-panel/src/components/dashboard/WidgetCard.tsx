// ─── WidgetCard ───────────────────────────────────────────────────────────────
// BlockManagerPanel 위젯 카드 — Draggable + v4 추천 정보 통합
//
// 드래그 핸들(GripVertical)을 잡고 대시보드로 드래그하거나,
// 카드 내 ON/OFF 토글 버튼으로 visibility 변경 가능.
//
// Props:
//   id          — BlockId
//   def         — BlockDef
//   meta        — BlockMeta (blockRecommendations 결과)
//   isOn        — 현재 visibility 상태
//   isRecommended — 추천 여부 (handled 반영됨)
//   onToggle    — toggle ON/OFF 핸들러 (savedPosition 기반)

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Flame,
  TrendingUp, BarChart2, Zap, Target,
  Lightbulb, Upload, Image,
} from "lucide-react";
import { T } from "@/styles/tokens";
import type { BlockId, BlockDef } from "@/types/dashboardBlock";

// ─── 아이콘 매핑 ──────────────────────────────────────────────────────────────

const ICONS: Record<BlockId, React.ElementType> = {
  thumbnailAnalyzer: Image,
  action:            Zap,
  opportunity:       Lightbulb,
  execution:         Upload,
  upload:            Upload,
  growth:            TrendingUp,
  strategy:          Target,
  insight:           BarChart2,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlockMeta {
  recommended:  boolean;
  impactLabel:  string;
  urgencyLine:  string;
  resultLabel:  string;
  actionLabel:  string;
  description:  string;
  expectedGain: string;
}

interface Props {
  id:            BlockId;
  def:           BlockDef;
  meta:          BlockMeta;
  isOn:          boolean;
  isRecommended: boolean;
  onToggle:      (id: BlockId) => void;
}

// ─── WidgetCard ───────────────────────────────────────────────────────────────

export default function WidgetCard({ id, def, meta, isOn, isRecommended, onToggle }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type: "widget", blockId: id },
  });

  const Icon        = ICONS[id] ?? Zap;
  const statusColor = isRecommended ? T.warn : isOn ? T.success : T.muted;
  const statusBg    = isRecommended ? T.warnBg : isOn ? T.successBg : T.bgSection;

  const style: React.CSSProperties = {
    transform:  CSS.Translate.toString(transform),
    opacity:    isDragging ? 0.4 : 1,
    transition: isDragging ? undefined : "opacity 0.15s",
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display:       "flex",
        alignItems:    "flex-start",
        gap:           T.spacing.xs,
        padding:       `${T.spacing.sm}px ${T.spacing.sm}px`,
        borderRadius:  T.radius.btn,
        border:        `1px solid ${isRecommended ? T.warn + "40" : T.border}`,
        background:    isRecommended ? T.warnBg : T.bgCard,
        cursor:        "grab",
        userSelect:    "none",
      }}
    >
      {/* ── 드래그 핸들 ── */}
      <div
        {...listeners}
        {...attributes}
        style={{
          display:       "flex",
          alignItems:    "center",
          justifyContent:"center",
          width:         20,
          height:        28,
          flexShrink:    0,
          cursor:        "grab",
          color:         T.muted,
          marginTop:     1,
        }}
      >
        <GripVertical size={12} />
      </div>

      {/* ── 아이콘 ── */}
      <div style={{
        width:          24,
        height:         24,
        borderRadius:   T.radius.btn,
        background:     statusBg,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        marginTop:      2,
      }}>
        <Icon size={11} color={statusColor} />
      </div>

      {/* ── 텍스트 ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* 이름 행 */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginBottom: 2 }}>
          <span style={{
            fontSize:   T.font.size.xs,
            fontWeight: T.font.weight.bold,
            color:      T.text,
            fontFamily: T.font.familyMono,
            flex:       1,
            overflow:   "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {def.label}
          </span>

          {/* 🔥 추천 */}
          {isRecommended && <Flame size={10} color={T.warn} />}

          {/* ON/OFF 토글 */}
          <button
            onClick={e => { e.stopPropagation(); onToggle(id); }}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          3,
              padding:      "1px 6px",
              borderRadius: T.radius.badge,
              border:       `1px solid ${isOn ? T.success : T.border}`,
              background:   isOn ? T.successBg : "transparent",
              cursor:       "pointer",
              flexShrink:   0,
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: isOn ? T.success : T.muted,
            }} />
            <span style={{
              fontSize:   9,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
              color:      isOn ? T.success : T.muted,
            }}>
              {isOn ? "ON" : "OFF"}
            </span>
          </button>
        </div>

        {/* 추천 상태: impactLabel + urgencyLine */}
        {isRecommended && meta.impactLabel && (
          <div style={{ fontSize: 10, color: T.warn, fontFamily: T.font.familyMono, fontWeight: 600 }}>
            {meta.impactLabel}
          </div>
        )}
        {isRecommended && meta.urgencyLine && (
          <div style={{ fontSize: 10, color: T.sub, marginTop: 1 }}>
            {meta.urgencyLine}
          </div>
        )}

        {/* ON 상태: resultLabel */}
        {!isRecommended && isOn && meta.resultLabel && (
          <div style={{ fontSize: 10, color: T.success, fontFamily: T.font.familyMono }}>
            {meta.resultLabel}
          </div>
        )}

        {/* OFF + 추천 없음 */}
        {!isRecommended && !isOn && (
          <div style={{ fontSize: 10, color: T.muted }}>미사용</div>
        )}
      </div>
    </div>
  );
}
