// ─── useBlockState ────────────────────────────────────────────────────────────
// Block 단위 독립 UI 상태 — localStorage 영속화
//
// 용도: Block 내부의 UI 상태 (접힘/펼침, 선택 탭, 필터 등)
//       dashData처럼 전역 공유가 아닌 "이 블록 전용" 상태.
//
// 규칙:
//   - UI 상태만 저장 (표시 방식) — 비즈니스 데이터 저장 금지
//   - Block 내부에서만 호출 (DashboardPage에서 호출 금지)
//
// 사용 예:
//   const [state, setState] = useBlockState("insight", { expanded: false });
//   <button onClick={() => setState({ expanded: !state.expanded })}>

import { useState, useCallback } from "react";
import type { BlockId } from "@/types/dashboardBlock";

const STORAGE_KEY = "soundstorm_block_states";

type StateRecord = Record<string, unknown>;

function loadAll(): Record<string, StateRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StateRecord>) : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, StateRecord>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
}

export function useBlockState<T extends StateRecord>(
  blockId: BlockId,
  defaults: T = {} as T,
): [T, (updates: Partial<T>) => void] {
  const [state, setStateInternal] = useState<T>(() => {
    const all = loadAll();
    return { ...defaults, ...(all[blockId] as Partial<T>) };
  });

  const setState = useCallback(
    (updates: Partial<T>) => {
      setStateInternal(prev => {
        const next = { ...prev, ...updates };
        const all  = loadAll();
        saveAll({ ...all, [blockId]: next });
        return next;
      });
    },
    [blockId],
  );

  return [state, setState];
}
