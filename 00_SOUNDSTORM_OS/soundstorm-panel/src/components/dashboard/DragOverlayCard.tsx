// ─── DragOverlayCard ─────────────────────────────────────────────────────────
// 드래그 중 커서에 따라다니는 Lightweight 카드
// 아이콘 + 이름만 — 성능 최우선
// pointer-events: none (드래그 중 클릭 차단)

import {
  Flame, TrendingUp, BarChart2, Zap, Target,
  Lightbulb, Upload, Image,
} from "lucide-react";
import { T } from "@/styles/tokens";
import { BLOCK_DEFS, type BlockId } from "@/types/dashboardBlock";

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

interface Props {
  id: BlockId;
}

export default function DragOverlayCard({ id }: Props) {
  const def  = BLOCK_DEFS.find(b => b.id === id);
  const Icon = ICONS[id] ?? Flame;

  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           T.spacing.sm,
      height:        40,
      padding:       `0 ${T.spacing.md}px`,
      background:    T.bgCard,
      border:        `1px solid ${T.primary}`,
      borderRadius:  T.radius.btn,
      boxShadow:     T.shadow.hover,
      opacity:       0.9,
      pointerEvents: "none",
      whiteSpace:    "nowrap",
      minWidth:      160,
    }}>
      <Icon size={13} color={T.primary} />
      <span style={{
        fontSize:   T.font.size.xs,
        fontWeight: T.font.weight.bold,
        color:      T.text,
        fontFamily: T.font.familyMono,
      }}>
        {def?.label ?? id}
      </span>
    </div>
  );
}
