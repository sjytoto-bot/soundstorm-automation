// ─── DashboardGrid v3 ─────────────────────────────────────────────────────────
// @dnd-kit/sortable + CSS 6-column grid
//
// v3 변경 (STAGE 5):
//   - externalTraffic 카드 추가 (span 6, LAYER 3 하단)
//   - STORAGE_KEY v3로 업그레이드 (순서 초기화)
//
// 그리드 (6-col):
//   growth(3) + audience(3)
//   topVideos(2) + trending(2) + traffic(2)
//   externalTraffic(6)

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import TrendingVideos               from "./TrendingVideos";
import TrafficCluster               from "./TrafficCluster";
import type { SelectedVideo }       from "./VideoDetailModal";

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "soundstorm_dashboard_layout_v7"; // v7: externalTraffic 제거 (RightSidePanel으로 이동)

type CardId = "trending" | "traffic";

const DEFAULT_ORDER: CardId[] = [
  "trending", "traffic",
];

/** 각 카드의 6-column 그리드 span */
const CARD_SPANS: Record<CardId, number> = {
  trending: 3,
  traffic:  3,
};

function loadOrder(): CardId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const saved = JSON.parse(raw) as CardId[];
    // 저장된 순서에 현재 DEFAULT_ORDER의 모든 카드가 포함돼야 유효
    if (
      Array.isArray(saved) &&
      saved.length === DEFAULT_ORDER.length &&
      DEFAULT_ORDER.every(id => saved.includes(id))
    ) return saved;
  } catch { /* ignore */ }
  return DEFAULT_ORDER;
}

// ─── SortableCard ─────────────────────────────────────────────────────────────

interface SortableCardProps {
  id:       CardId;
  children: React.ReactNode;
}

function SortableCard({ id, children }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn:  `span ${CARD_SPANS[id]}`,
        transform:   CSS.Transform.toString(transform),
        transition,
        opacity:     isDragging ? 0.45 : 1,
        zIndex:      isDragging ? 20 : "auto",
        position:    "relative" as const,
      }}
    >
      {/* 카드 외부 — overflow:visible 유지 (QuickInsightBar Deep Insight 잘림 방지) */}
      <div style={{
        background:   T.bgCard,
        border:       `1px solid ${isDragging ? T.primary : T.border}`,
        borderRadius: T.radius.card,
        boxShadow:    isDragging
          ? `0 8px 32px rgba(0,0,0,0.22), 0 0 0 2px ${T.primary}33`
          : T.shadow.card,
        transition:   "border-color 0.15s, box-shadow 0.15s",
      }}>
        {/* ── 드래그 핸들 (GripVertical 아이콘만, 텍스트 없음) ── */}
        <div
          {...attributes}
          {...listeners}
          style={{
            height:        22,
            display:       "flex",
            alignItems:    "center",
            justifyContent: "center",
            background:    T.bgSection,
            borderBottom:  `1px solid ${T.borderSoft}`,
            borderRadius:  `${T.radius.card}px ${T.radius.card}px 0 0`,
            cursor:        "grab",
            userSelect:    "none",
          }}
        >
          <GripVertical
            size={12}
            color={T.muted}
            style={{ opacity: 0.6 }}
          />
        </div>

        {/* ── 카드 콘텐츠 — overflow:visible, height:auto ── */}
        <div>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── DashboardGrid ────────────────────────────────────────────────────────────

interface DashboardGridProps {
  onVideoClick?: (v: SelectedVideo) => void;
}

export default function DashboardGrid({ onVideoClick }: DashboardGridProps) {
  const [order, setOrder] = useState<CardId[]>(loadOrder);
  const { analytics, loadingAnalytics } = useAnalyticsContext();

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 6 },
  }));

  // ── 카드별 표시 여부 ──────────────────────────────────────────────────────
  const cardVisible = useMemo<Record<CardId, boolean>>(() => {
    // 로딩 중에는 모든 카드 표시 (로딩 상태 UI 유지)
    if (loadingAnalytics) {
      return { trending: true, traffic: true };
    }

    const current   = analytics?.current;
    const hitVideos = analytics?.hitVideos ?? [];

    // trending: trend_score > 1.5 영상이 1개 이상 있을 때만 표시
    const hasTrending = (() => {
      const videos = current?.videos ?? [];
      if (!videos.length || !hitVideos.length) return false;
      const prevMap = new Map(hitVideos.map(v => [v.key, v.views]));
      return videos.some(v => {
        const prev = prevMap.get(v.key);
        return prev != null && prev > 0 && v.views / prev > 1.5;
      });
    })();

    // traffic: 트래픽 소스 데이터가 있을 때만 표시
    const hasTraffic = !!(current?.trafficSources?.length);

    return {
      trending: hasTrending,
      traffic:  hasTraffic,
    };
  }, [analytics, loadingAnalytics]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder(prev => {
        const next = arrayMove(
          prev,
          prev.indexOf(active.id as CardId),
          prev.indexOf(over.id  as CardId),
        );
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }
  }, []);

  const CARD_CONTENT: Record<CardId, React.ReactNode> = {
    trending: <TrendingVideos onVideoClick={onVideoClick} />,
    traffic:  <TrafficCluster />,
  };

  // 데이터가 있는 카드만 렌더링
  const visibleOrder = order.filter(id => cardVisible[id]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={visibleOrder} strategy={rectSortingStrategy}>
        {/* 6-column grid, align-items:start → 카드 높이 콘텐츠 기반 */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap:                 16,
          alignItems:          "start",
        }}>
          {visibleOrder.map(id => (
            <SortableCard key={id} id={id}>
              {CARD_CONTENT[id]}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
