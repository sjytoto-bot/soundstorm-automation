// ─── BlocksContext ────────────────────────────────────────────────────────────
// Block 시스템 전역 상태 Context + DnD Context
//
// 구조:
//   BlocksProvider
//     └── BlocksCore  ← AnalyticsContext + ContentPackContext 직접 읽기
//           └── DndContext (onDragStart/End/Cancel)
//                 └── BlocksContext.Provider
//
// 설계 원칙:
//   1. diagnostics = AnalyticsContext 직접 읽기 (useEffect sync 없음)
//   2. computeBlockMeta = Context Engine 레이어, useMemo 계산 (Panel = UI only)
//   3. handledIds — 추천 처리 목록, localStorage 영구 저장
//      diagnostics 변경 시 자동 초기화
//   4. DndContext = 패널 → 대시보드 cross-container 드래그 지원

import { createContext, useContext, useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { useDashboardBlocks, type BlockLayout } from "../hooks/useDashboardBlocks";
import { computeBlockMeta } from "../lib/blockRecommendations";
import { useAnalyticsContext } from "../controllers/useAnalyticsController";
import { useContentPackCtx } from "../controllers/ContentPackContext";
import DragOverlayCard from "../components/dashboard/DragOverlayCard";
import type { BlockId, BlockDef } from "@/types/dashboardBlock";
import type { ContentPack } from "@/core/types/contentPack";

// ─── BlockMeta 타입 ───────────────────────────────────────────────────────────

export interface BlockMeta {
  recommended:  boolean;
  urgencyLine:  string;
  impactLabel:  string;
  actionLabel:  string;
  resultLabel:  string;
  description:  string;
  expectedGain: string;
}

// ─── Context 값 타입 ──────────────────────────────────────────────────────────
// useDashboardBlocks 반환 + BlocksCore 추가 값 완전 일치

export interface BlocksContextValue {
  // ── useDashboardBlocks ────────────────────────────────────────────────────
  visibility:          Record<BlockId, boolean>;
  order:               BlockId[];
  layout:              Record<BlockId, BlockLayout>;
  activeOrder:         BlockId[];
  pinnedOrder:         BlockId[];
  draggableOrder:      BlockId[];
  toggle:              (id: BlockId) => void;
  insertAt:            (id: BlockId, targetIndex: number) => void;
  toggleOffWithSave:   (id: BlockId) => void;
  toggleOnWithRestore: (id: BlockId) => void;
  reorder:             (fromIndex: number, toIndex: number) => void;
  updateLayout:        (id: BlockId, updates: Partial<BlockLayout>) => void;
  isVisible:           (id: BlockId) => boolean;
  visibleCount:        number;
  defs:                readonly BlockDef[];

  // ── BlocksCore 추가 ───────────────────────────────────────────────────────
  videoDiagnostics:  unknown[];
  contentPacks:      ContentPack[];
  blockMeta:         Record<string, BlockMeta>;
  handledIds:        Set<string>;
  markHandled:       (id: string) => void;
  markAllHandled:    (ids: string[]) => void;
  isRecommended:     (id: string) => boolean;
  activeDragId:      string | null;
  isDragging:        boolean;
  lastInsertedId:    string | null;
}

// ─── localStorage 키 ─────────────────────────────────────────────────────────

const HANDLED_KEY = "soundstorm_block_handled_ids";

function loadHandledIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HANDLED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHandledIds(set: Set<string>) {
  try { localStorage.setItem(HANDLED_KEY, JSON.stringify([...set])); } catch {}
}

// ─── Context ─────────────────────────────────────────────────────────────────

const BlocksContext = createContext<BlocksContextValue | null>(null);

// ─── BlocksCore ───────────────────────────────────────────────────────────────

function BlocksCore({ children }: { children: ReactNode }) {
  const blocks    = useDashboardBlocks();
  const analytics = useAnalyticsContext();
  const packCtrl  = useContentPackCtx();

  // ── diagnostics: AnalyticsContext 직접 읽기 (useEffect sync 없음) ──────────
  const videoDiagnostics: unknown[] = analytics.videoDiagnostics ?? [];
  const contentPacks: ContentPack[] = packCtrl.state?.packs ?? [];

  // ── blockMeta: Engine 레이어 useMemo 계산 (Panel = 읽기 전용) ──────────────
  const blockMeta = useMemo(
    () => computeBlockMeta(videoDiagnostics, contentPacks) as Record<string, BlockMeta>,
    [videoDiagnostics, contentPacks],
  );

  // ── handledIds: 추천 처리 Set (localStorage 영구 저장) ────────────────────
  const [handledIds, setHandledIds] = useState<Set<string>>(loadHandledIds);
  const prevDiagKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // 진단 상태 변경 시 handledIds 초기화 (새 상황 = 새 추천)
    const key = (videoDiagnostics as any[])
      .filter(d => d.problemType && d.problemType !== "OK" && d.problemType !== "INSUFFICIENT_DATA")
      .map(d => `${d.videoId}:${d.problemType}`)
      .sort().join("|");

    if (key && key !== prevDiagKeyRef.current) {
      prevDiagKeyRef.current = key;
      setHandledIds(new Set());
      saveHandledIds(new Set());
    }
  }, [videoDiagnostics]);

  const markHandled = useCallback((id: string) => {
    setHandledIds(prev => {
      const next = new Set([...prev, id]);
      saveHandledIds(next);
      return next;
    });
  }, []);

  const markAllHandled = useCallback((ids: string[]) => {
    setHandledIds(prev => {
      const next = new Set([...prev, ...ids]);
      saveHandledIds(next);
      return next;
    });
  }, []);

  const isRecommended = useCallback((id: string) => {
    return (blockMeta[id]?.recommended ?? false) && !handledIds.has(id);
  }, [blockMeta, handledIds]);

  // ── DnD 상태 ──────────────────────────────────────────────────────────────
  const [activeDragId,   setActiveDragId]   = useState<string | null>(null);
  const [lastInsertedId, setLastInsertedId] = useState<string | null>(null);
  const isDragging = activeDragId !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // 6px 이상 움직여야 드래그 시작
    })
  );

  // Fix 2: 드래그 시작 시 draggableOrder 스냅샷 (빠른 드롭 index mismatch 방지)
  const draggableOrderSnapshotRef = useRef<BlockId[]>([]);

  // ── DnD 핸들러 ────────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(String(active.id));
    draggableOrderSnapshotRef.current = [...(blocks.draggableOrder ?? [])];
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null);
    if (!over) return;

    const dragId = String(active.id) as BlockId;
    const overId = String(over.id);

    // ── 드롭 존에 드롭 (패널 → 대시보드 또는 대시보드 내 재정렬) ──────────
    if (typeof overId === "string" && overId.startsWith("drop-zone-")) {
      const rawIndex = parseInt(overId.replace("drop-zone-", ""), 10);
      if (!isNaN(rawIndex)) {
        // Fix 3: pinned 블록은 DropZone 이동 불가 (pinned 영역 유지)
        if (blocks.layout?.[dragId]?.pinned) return;

        // Fix 2: 드래그 시작 시점 스냅샷 길이로 clamp (빠른 드래그 시 실시간 order 변경으로 인한 index 초과 방지)
        const maxIndex    = draggableOrderSnapshotRef.current.length ?? 0;
        const targetIndex = Math.min(rawIndex, maxIndex);

        blocks.insertAt(dragId, targetIndex);

        // 추천 블록 적용 시 handled 처리
        if (isRecommended(dragId)) markHandled(dragId);

        // UX 3: 새로 배치된 블록 2초 하이라이트
        setLastInsertedId(dragId);
        setTimeout(() => setLastInsertedId(null), 2000);
      }
    }
  }

  function handleDragCancel() {
    setActiveDragId(null);
    // order 변경 없음 — 원위치 유지
  }

  // ── Context value ─────────────────────────────────────────────────────────
  const value: BlocksContextValue = {
    ...blocks,
    videoDiagnostics,
    contentPacks,
    blockMeta,
    handledIds,
    markHandled,
    markAllHandled,
    isRecommended,
    activeDragId,
    isDragging,
    lastInsertedId,
  };

  return (
    <BlocksContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
          {activeDragId && <DragOverlayCard id={activeDragId as BlockId} />}
        </DragOverlay>
      </DndContext>
    </BlocksContext.Provider>
  );
}

// ─── BlocksProvider ───────────────────────────────────────────────────────────

export function BlocksProvider({ children }: { children: ReactNode }) {
  return <BlocksCore>{children}</BlocksCore>;
}

// ─── useBlocks ────────────────────────────────────────────────────────────────

export function useBlocks(): BlocksContextValue {
  const ctx = useContext(BlocksContext);
  if (!ctx) throw new Error("useBlocks must be used within BlocksProvider");
  return ctx;
}
