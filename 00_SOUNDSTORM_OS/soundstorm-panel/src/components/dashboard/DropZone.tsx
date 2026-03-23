// ─── DropZone ─────────────────────────────────────────────────────────────────
// 블록 사이 드롭 존 — 드래그 중에만 표시
//
// Props:
//   index      — 이 드롭 존의 삽입 위치 (draggableOrder 기준)
//   isDragging — 전역 드래그 상태 (DndContext onDragStart/Cancel)

import { useDroppable } from "@dnd-kit/core";
import { T } from "@/styles/tokens";

interface Props {
  index:      number;
  isDragging: boolean;
}

export default function DropZone({ index, isDragging }: Props) {
  const droppableId = `drop-zone-${index}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      style={{
        height:        isOver ? 52 : isDragging ? 32 : 0,
        overflow:      "hidden",
        borderRadius:  T.radius.btn,
        // Fix 1: 항상 border 유지 (transparent) — height 변화 시 layout 흔들림 방지
        border:        isDragging
          ? isOver
            ? `2px dashed ${T.primary}`
            : `1px dashed ${T.borderSoft}`
          : `1px dashed transparent`,
        background:    isOver ? T.primarySoft : "transparent",
        display:       "flex",
        alignItems:    "center",
        justifyContent:"center",
        // UX 2: magnet 효과 — hover 시 살짝 확장
        transition:    "height 0.15s ease, background 0.15s, border-color 0.15s, transform 0.1s ease",
        opacity:       isDragging ? (isOver ? 1 : 0.6) : 0,
        transform:     isOver ? "scaleX(1.01)" : "none",
      }}
    >
      {isDragging && isOver && (
        <span style={{
          fontSize:      10,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.primary,
          letterSpacing: "0.06em",
          pointerEvents: "none",
        }}>
          여기에 추가
        </span>
      )}
    </div>
  );
}
