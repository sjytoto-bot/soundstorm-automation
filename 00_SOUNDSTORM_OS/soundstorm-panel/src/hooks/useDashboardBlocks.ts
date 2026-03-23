// ─── useDashboardBlocks ───────────────────────────────────────────────────────
// Dashboard 블록 가시성 + 순서 + 레이아웃 상태 관리
//
// 저장:
//   localStorage("soundstorm_dashboard_blocks") — visibility
//   localStorage("soundstorm_dashboard_order")  — order
//   localStorage("soundstorm_dashboard_layout") — layout (cols, pinned, savedPosition)
//
// 인터페이스:
//   visibility          — Record<BlockId, boolean>
//   order               — BlockId[]
//   layout              — Record<BlockId, BlockLayout>
//   activeOrder         — pinned 우선 정렬된 visible 목록
//   pinnedOrder         — pinned=true visible 블록
//   draggableOrder      — pinned=false visible 블록
//   toggle(id)          — 가시성 토글
//   insertAt(id, index) — 특정 index에 삽입 + shift 처리 + visibility ON
//   toggleOffWithSave   — 현재 위치 savedPosition 저장 후 OFF
//   toggleOnWithRestore — savedPosition 복원 후 ON (없으면 끝에 추가)
//   reorder(f, t)       — 순서 변경
//   updateLayout        — cols / pinned 업데이트

import { useState, useCallback, useEffect } from "react";
import { BLOCK_DEFS, type BlockId } from "@/types/dashboardBlock";

const VIS_KEY      = "soundstorm_dashboard_blocks";
const ORDER_KEY    = "soundstorm_dashboard_order";
const ORDER_VER_KEY = "soundstorm_dashboard_order_ver";
const ORDER_VERSION = 4; // v4: action block 제거 반영
const LAYOUT_KEY   = "soundstorm_dashboard_layout_v3"; // v3: insight panel 상단 고정

type Visibility = Record<BlockId, boolean>;

// ─── BlockLayout 타입 ─────────────────────────────────────────────────────────

export type BlockLayout = {
  cols:          1 | 2 | 3;
  pinned:        boolean;
  savedPosition: number | null; // OFF 시 마지막 위치 기억 → ON 시 복원
};

// ─── 기본값 ───────────────────────────────────────────────────────────────────

function defaultVisibility(): Visibility {
  return Object.fromEntries(
    BLOCK_DEFS.map(b => [b.id, b.defaultVisible])
  ) as Visibility;
}

function defaultOrder(): BlockId[] {
  return BLOCK_DEFS.map(b => b.id);
}

function defaultLayout(): Record<BlockId, BlockLayout> {
  return Object.fromEntries(
    BLOCK_DEFS.map(b => [b.id, {
      cols: 1 as const,
      pinned: b.id === "insight",
      savedPosition: null,
    }])
  ) as Record<BlockId, BlockLayout>;
}

// ─── 로드 ─────────────────────────────────────────────────────────────────────

function loadVisibility(): Visibility {
  try {
    const raw = localStorage.getItem(VIS_KEY);
    if (!raw) return defaultVisibility();
    return { ...defaultVisibility(), ...JSON.parse(raw) };
  } catch {
    return defaultVisibility();
  }
}

function loadOrder(): BlockId[] {
  const raw     = localStorage.getItem(ORDER_KEY);
  const version = localStorage.getItem(ORDER_VER_KEY);

  if (!raw || version !== String(ORDER_VERSION)) {
    const fresh = defaultOrder();
    localStorage.setItem(ORDER_KEY,     JSON.stringify(fresh));
    localStorage.setItem(ORDER_VER_KEY, String(ORDER_VERSION));
    return fresh;
  }

  try {
    const saved  = JSON.parse(raw) as BlockId[];
    const allIds = defaultOrder();
    const known  = saved.filter(id => allIds.includes(id));
    const newIds = allIds.filter(id => !known.includes(id));
    return [...known, ...newIds];
  } catch {
    return defaultOrder();
  }
}

function loadLayout(): Record<BlockId, BlockLayout> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return defaultLayout();
    const saved    = JSON.parse(raw) as Partial<Record<BlockId, Partial<BlockLayout>>>;
    const defaults = defaultLayout();
    return Object.fromEntries(
      BLOCK_DEFS.map(b => [b.id, { ...defaults[b.id], ...(saved[b.id] ?? {}) }])
    ) as Record<BlockId, BlockLayout>;
  } catch {
    return defaultLayout();
  }
}

// ─── 저장 헬퍼 ────────────────────────────────────────────────────────────────

function persist(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardBlocks() {
  const [visibility, setVisibility] = useState<Visibility>(loadVisibility);
  const [order,      setOrder]      = useState<BlockId[]>(loadOrder);
  const [layout,     setLayout]     = useState<Record<BlockId, BlockLayout>>(loadLayout);

  // BLOCK_DEFS 순서 변경 시 강제 리셋 (HMR + 앱 재시작 모두 대응)
  // dep: BLOCK_DEFS[0].id — 첫 블록이 바뀌면 effect 재실행
  useEffect(() => {
    if (order[0] !== BLOCK_DEFS[0].id) {
      const fresh = defaultOrder();
      setOrder(fresh);
      persist(ORDER_KEY, fresh); persist(ORDER_VER_KEY, ORDER_VERSION);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BLOCK_DEFS[0].id]);

  // ── 기본 토글 (BlockManagerPanel v4 호환) ─────────────────────────────────
  const toggle = useCallback((id: BlockId) => {
    setVisibility(prev => {
      const next = { ...prev, [id]: !prev[id] };
      persist(VIS_KEY, next);
      return next;
    });
  }, []);

  const isVisible = useCallback(
    (id: BlockId) => visibility[id] ?? true,
    [visibility],
  );

  // ── insertAt — 특정 index에 블록 삽입 + savedPosition shift ───────────────
  // 삽입 위치 이후의 모든 savedPosition을 +1 shift하여 충돌 방지
  const insertAt = useCallback((id: BlockId, targetIndex: number) => {
    setOrder(prev => {
      const without = prev.filter(i => i !== id);
      const clampedIdx = Math.min(targetIndex, without.length);
      const next = [...without];
      next.splice(clampedIdx, 0, id);
      persist(ORDER_KEY, next);
      return next;
    });
    setLayout(prev => {
      const next = { ...prev };
      // 삽입 위치 이후 savedPosition 전부 +1 shift
      for (const bid of Object.keys(next) as BlockId[]) {
        if (bid === id) continue;
        const pos = next[bid]?.savedPosition;
        if (pos != null && pos >= targetIndex) {
          next[bid] = { ...next[bid], savedPosition: pos + 1 };
        }
      }
      next[id] = { ...next[id], savedPosition: targetIndex };
      persist(LAYOUT_KEY, next);
      return next;
    });
    setVisibility(prev => {
      const next = { ...prev, [id]: true };
      persist(VIS_KEY, next);
      return next;
    });
  }, []);

  // ── toggleOffWithSave — 현재 위치를 savedPosition에 저장 후 visibility OFF ─
  const toggleOffWithSave = useCallback((id: BlockId) => {
    // 현재 draggable order에서 index 계산 (pinned 제외)
    setOrder(prev => {
      const draggable = prev.filter(bid =>
        visibility[bid] && !layout[bid]?.pinned
      );
      const idx = draggable.indexOf(id);
      setLayout(lay => {
        const next = { ...lay, [id]: { ...lay[id], savedPosition: idx >= 0 ? idx : null } };
        persist(LAYOUT_KEY, next);
        return next;
      });
      return prev; // order 배열 자체는 변경 없음
    });
    setVisibility(prev => {
      const next = { ...prev, [id]: false };
      persist(VIS_KEY, next);
      return next;
    });
  }, [visibility, layout]);

  // ── toggleOnWithRestore — savedPosition 복원 후 ON (없으면 끝에 추가) ──────
  const toggleOnWithRestore = useCallback((id: BlockId) => {
    const saved = layout[id]?.savedPosition;
    if (saved != null) {
      insertAt(id, saved);
    } else {
      // 끝에 추가
      setOrder(prev => {
        const without = prev.filter(i => i !== id);
        const next = [...without, id];
        persist(ORDER_KEY, next);
        return next;
      });
      setVisibility(prev => {
        const next = { ...prev, [id]: true };
        persist(VIS_KEY, next);
        return next;
      });
    }
  }, [layout, insertAt]);

  // ── reorder — DnD 재정렬 (from/to index 기준) ────────────────────────────
  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      persist(ORDER_KEY, next);
      // savedPosition 업데이트 — 이동한 블록의 새 위치 기억
      setLayout(lay => {
        const movedLayout = { ...lay[moved], savedPosition: toIndex };
        const next2 = { ...lay, [moved]: movedLayout };
        persist(LAYOUT_KEY, next2);
        return next2;
      });
      return next;
    });
  }, []);

  // ── updateLayout — cols / pinned 업데이트 ────────────────────────────────
  const updateLayout = useCallback((id: BlockId, updates: Partial<BlockLayout>) => {
    setLayout(prev => {
      const next = { ...prev, [id]: { ...prev[id], ...updates } };
      persist(LAYOUT_KEY, next);
      return next;
    });
  }, []);

  // ── 정렬된 뷰 ────────────────────────────────────────────────────────────
  const pinnedOrder: BlockId[] = order.filter(
    id => visibility[id] && layout[id]?.pinned
  );
  const draggableOrder: BlockId[] = order.filter(
    id => visibility[id] && !layout[id]?.pinned
  );
  const activeOrder: BlockId[] = [...pinnedOrder, ...draggableOrder];
  const visibleCount = activeOrder.length;

  return {
    visibility,
    order,
    layout,
    activeOrder,
    pinnedOrder,
    draggableOrder,
    toggle,
    insertAt,
    toggleOffWithSave,
    toggleOnWithRestore,
    reorder,
    updateLayout,
    isVisible,
    visibleCount,
    defs: BLOCK_DEFS,
  };
}
