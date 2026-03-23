// ─── useContentPackController ─────────────────────────────────────────────────
// ContentPackManager 상태 + API 관리
//
// 스토리지: localStorage("soundstorm_content_packs")
// API:      POST /api/content-pack/generate-field  (백엔드 없으면 mock fallback)
//           POST /api/content-pack/generate-all
//
// 수정 이력:
//   v2 — status 전이를 reducer UPDATE_PACK 내부로 이동 (race condition 방지)
//      — generating을 Pack 단위 Record로 분리 (동시 생성 충돌 방지)
//      — mock 함수를 contentPackMock.ts로 분리
//   v3 (STAGE 7) — syncPerformance: video_id 기준 Analytics 자동 매핑
//      — uploaded → analyzing 자동 전이 (video_id 저장 시)
//      — syncing 상태 추가 (Pack 단위)

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  type ContentPack,
  type ContentPackManagerState,
  type ContentPackStatus,
  type ContentPerformance,
  type AutoField,
  createEmptyPack,
  isPackReady,
} from "@/core/types/contentPack";
import { mockGenerate } from "@/core/mock/contentPackMock";
import { fetchAllPerformance } from "@/services/youtubeAnalyticsService";

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "soundstorm_content_packs";
const API_BASE    = "http://localhost:5100";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface GenerateContext {
  keywords?:    string[];
  topVideos?:   Array<{ title: string; views?: number }>;
  opportunity?: string[];
}

export interface UseContentPackController {
  state:              ContentPackManagerState;
  createPack:         (theme: string) => void;
  updatePack:         (id: string, updates: Partial<ContentPack>) => void;
  deletePack:         (id: string) => void;
  setStatus:          (id: string, status: ContentPackStatus) => void;
  generateField:      (id: string, field: AutoField, context?: GenerateContext) => Promise<void>;
  generateAll:        (id: string, context?: GenerateContext) => Promise<void>;
  setActivePack:      (id: string | null) => void;
  // STAGE 7: Analytics 동기화
  syncPerformance:    (id: string) => Promise<void>;
  syncAllPerformance: () => Promise<void>;
  // 저장 상태 — UI 피드백용
  lastSavedAt:  string | null;
  saveError:    string | null;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: "SET_PACKS";      packs: ContentPack[] }
  | { type: "ADD_PACK";       pack: ContentPack }
  | { type: "UPDATE_PACK";    id: string; updates: Partial<ContentPack> }
  | { type: "DELETE_PACK";    id: string }
  | { type: "SET_ACTIVE";     id: string | null }
  | { type: "SET_GENERATING"; packId: string; field: AutoField; value: boolean }
  | { type: "SET_SYNCING";    packId: string; value: boolean }
  | { type: "SET_ERROR";      error: string | null };

const initial: ContentPackManagerState = {
  packs:      [],
  activePack: null,
  generating: {},
  syncing:    {},
  error:      null,
};

function reducer(
  state: ContentPackManagerState,
  action: Action,
): ContentPackManagerState {
  switch (action.type) {

    case "SET_PACKS":
      return { ...state, packs: action.packs };

    case "ADD_PACK":
      return { ...state, packs: [action.pack, ...state.packs] };

    // ── UPDATE_PACK: status 전이 여기서만 처리 ─────────────────────────────────
    // 모든 경로(generateField / generateAll / UI 수정)에서 일관된 전이 보장.
    // race condition 방지: 비동기 완료 순서와 무관하게 최신 pack 기준으로 체크.
    case "UPDATE_PACK": {
      const updated = state.packs.map(p => {
        if (p.id !== action.id) return p;
        const next: ContentPack = {
          ...p,
          ...action.updates,
          updatedAt: new Date().toISOString(),
        };
        // draft → ready 자동 전이
        if (next.status === "draft" && isPackReady(next)) {
          next.status = "ready";
        }
        // uploaded → analyzing 자동 전이 (video_id 저장 시)
        if (next.status === "uploaded" && next.video_id) {
          next.status = "analyzing";
        }
        return next;
      });
      const activePack =
        state.activePack?.id === action.id
          ? (updated.find(p => p.id === action.id) ?? null)
          : state.activePack;
      return { ...state, packs: updated, activePack };
    }

    case "DELETE_PACK": {
      const packs = state.packs.filter(p => p.id !== action.id);
      const activePack =
        state.activePack?.id === action.id ? null : state.activePack;
      // generating에서도 제거
      const generating = { ...state.generating };
      delete generating[action.id];
      return { ...state, packs, activePack, generating };
    }

    case "SET_ACTIVE":
      return {
        ...state,
        activePack: action.id
          ? (state.packs.find(p => p.id === action.id) ?? null)
          : null,
      };

    // ── SET_GENERATING: Pack 단위 분리 ────────────────────────────────────────
    // generating[packId][field] — 여러 Pack 동시 생성 시 충돌 없음
    case "SET_GENERATING":
      return {
        ...state,
        generating: {
          ...state.generating,
          [action.packId]: {
            ...(state.generating[action.packId] ?? {}),
            [action.field]: action.value,
          },
        },
      };

    case "SET_SYNCING":
      return {
        ...state,
        syncing: { ...state.syncing, [action.packId]: action.value },
      };

    case "SET_ERROR":
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// ─── API 호출 ─────────────────────────────────────────────────────────────────

async function fetchGenerateField(
  field: AutoField,
  theme: string,
  context: GenerateContext,
): Promise<string | string[]> {
  const res = await fetch(`${API_BASE}/api/content-pack/generate-field`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ field, theme, context }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  return data.value;
}

async function fetchGenerateAll(
  theme: string,
  context: GenerateContext,
): Promise<Partial<Record<AutoField, string | string[]>>> {
  const res = await fetch(`${API_BASE}/api/content-pack/generate-all`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ theme, context }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── 영속성 (window.api → localStorage fallback) ──────────────────────────────
// Electron 환경: preload.js window.api (IPC → logs/content_packs.json)
// 브라우저 환경: localStorage fallback

const getApi = () => (window as unknown as { api?: Record<string, (...args: unknown[]) => Promise<unknown>> }).api;

async function loadFromStorage(): Promise<ContentPack[]> {
  const api = getApi();
  if (api?.loadContentPacks) {
    try {
      const packs = await api.loadContentPacks();
      return Array.isArray(packs) ? (packs as ContentPack[]) : [];
    } catch {
      // IPC 실패 시 localStorage fallback
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ContentPack[]) : [];
  } catch {
    return [];
  }
}

async function saveToStorage(
  packs: ContentPack[],
): Promise<{ ok: boolean; error?: string }> {
  const api = getApi();
  if (api?.saveContentPacks) {
    try {
      await api.saveContentPacks(packs as unknown as never);
      return { ok: true };
    } catch (e) {
      // IPC 실패 시 localStorage fallback (Electron 외부 환경)
      console.warn("[ContentPack] IPC 저장 실패 → localStorage fallback:", e);
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "저장 실패";
    console.error("[ContentPack] localStorage 저장 실패:", e);
    return { ok: false, error: msg };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useContentPackController(): UseContentPackController {
  const [state, dispatch] = useReducer(reducer, initial);

  // 저장 상태 피드백 (UI에 "마지막 저장" 표시)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // 초기 로드 (IPC async)
  // hasLoaded: 로드 완료 후에만 save effect 허용 (빈 배열로 덮어쓰기 방지)
  const hasLoaded = useRef(false);
  useEffect(() => {
    loadFromStorage()
      .then(packs => {
        hasLoaded.current = true;
        if (packs.length > 0) dispatch({ type: "SET_PACKS", packs });
      })
      .catch(() => { hasLoaded.current = true; });
  }, []);

  // packs 변경 시 영속화 — hasLoaded 이후에만 실행
  useEffect(() => {
    if (!hasLoaded.current) return;
    saveToStorage(state.packs).then(result => {
      if (result.ok) {
        setLastSavedAt(new Date().toISOString());
        setSaveError(null);
      } else {
        setSaveError(result.error ?? "저장 실패");
      }
    });
  }, [state.packs]);

  // ── Pack CRUD ────────────────────────────────────────────────────────────────

  const createPack = useCallback((theme: string) => {
    const pack = createEmptyPack(theme.trim() || "새 콘텐츠");
    dispatch({ type: "ADD_PACK", pack });
    dispatch({ type: "SET_ACTIVE", id: pack.id });
  }, []);

  const updatePack = useCallback(
    (id: string, updates: Partial<ContentPack>) => {
      dispatch({ type: "UPDATE_PACK", id, updates });
    },
    [],
  );

  const deletePack = useCallback((id: string) => {
    dispatch({ type: "DELETE_PACK", id });
  }, []);

  const setStatus = useCallback(
    (id: string, status: ContentPackStatus) => {
      dispatch({ type: "UPDATE_PACK", id, updates: { status } });
    },
    [],
  );

  const setActivePack = useCallback((id: string | null) => {
    dispatch({ type: "SET_ACTIVE", id });
  }, []);

  // ── 단일 필드 AUTO 생성 ──────────────────────────────────────────────────────

  const generateField = useCallback(
    async (id: string, field: AutoField, context: GenerateContext = {}) => {
      const pack = state.packs.find(p => p.id === id);
      if (!pack) return;

      dispatch({ type: "SET_GENERATING", packId: id, field, value: true });
      dispatch({ type: "SET_ERROR", error: null });

      try {
        let value: string | string[];
        try {
          value = await fetchGenerateField(field, pack.theme, context);
        } catch {
          // 백엔드 미연결 → mock fallback
          value = mockGenerate(pack.theme, field);
        }
        // status 전이는 reducer UPDATE_PACK 내부에서 처리
        dispatch({ type: "UPDATE_PACK", id, updates: { [field]: value } });
      } catch (err) {
        dispatch({
          type:  "SET_ERROR",
          error: err instanceof Error ? err.message : "생성 실패",
        });
      } finally {
        dispatch({ type: "SET_GENERATING", packId: id, field, value: false });
      }
    },
    [state.packs],
  );

  // ── 전체 필드 AUTO 생성 ──────────────────────────────────────────────────────

  const generateAll = useCallback(
    async (id: string, context: GenerateContext = {}) => {
      const pack = state.packs.find(p => p.id === id);
      if (!pack) return;

      const fields: AutoField[] = [
        "title", "suno_prompt", "thumbnail_text",
        "description", "hashtags", "keywords",
      ];

      // 모든 필드 로딩 시작
      fields.forEach(f =>
        dispatch({ type: "SET_GENERATING", packId: id, field: f, value: true }),
      );
      dispatch({ type: "SET_ERROR", error: null });

      try {
        let result: Partial<Record<AutoField, string | string[]>>;
        try {
          result = await fetchGenerateAll(pack.theme, context);
        } catch {
          // 백엔드 미연결 → mock fallback
          result = Object.fromEntries(
            fields.map(f => [f, mockGenerate(pack.theme, f)]),
          ) as Partial<Record<AutoField, string | string[]>>;
        }
        // 전체 업데이트 — status 전이는 reducer 내부에서 처리
        dispatch({ type: "UPDATE_PACK", id, updates: result as Partial<ContentPack> });
      } catch (err) {
        dispatch({
          type:  "SET_ERROR",
          error: err instanceof Error ? err.message : "전체 생성 실패",
        });
      } finally {
        fields.forEach(f =>
          dispatch({ type: "SET_GENERATING", packId: id, field: f, value: false }),
        );
      }
    },
    [state.packs],
  );

  // ── STAGE 7: Analytics 동기화 ────────────────────────────────────────────────
  // youtubeAnalyticsService를 통해 video_id 기준 Analytics 자동 매핑
  // (YT Analytics IPC → Google Sheets fallback 순서)

  const syncPerformance = useCallback(async (id: string) => {
    const pack = state.packs.find(p => p.id === id);
    if (!pack?.video_id) return;

    dispatch({ type: "SET_SYNCING", packId: id, value: true });
    dispatch({ type: "SET_ERROR",   error: null });

    try {
      const map = await fetchAllPerformance([pack.video_id]);
      const performance: ContentPerformance = map[pack.video_id] ?? {};
      // performance 업데이트 + uploaded → analyzing 전이 (reducer 내부에서 처리)
      dispatch({ type: "UPDATE_PACK", id, updates: { performance } });
    } catch (err) {
      dispatch({
        type:  "SET_ERROR",
        error: err instanceof Error ? err.message : "성과 수집 실패",
      });
    } finally {
      dispatch({ type: "SET_SYNCING", packId: id, value: false });
    }
  }, [state.packs]);

  const syncAllPerformance = useCallback(async () => {
    const targets = state.packs.filter(p => p.video_id);
    if (targets.length === 0) return;

    dispatch({ type: "SET_ERROR", error: null });

    try {
      const videoIds = targets.map(p => p.video_id as string);
      const map = await fetchAllPerformance(videoIds);
      targets.forEach(pack => {
        const performance = map[pack.video_id as string];
        if (!performance) return;
        dispatch({ type: "UPDATE_PACK", id: pack.id, updates: { performance } });
      });
    } catch (err) {
      dispatch({
        type:  "SET_ERROR",
        error: err instanceof Error ? err.message : "전체 성과 수집 실패",
      });
    }
  }, [state.packs]);

  return {
    state,
    createPack,
    updatePack,
    deletePack,
    setStatus,
    generateField,
    generateAll,
    setActivePack,
    syncPerformance,
    syncAllPerformance,
    lastSavedAt,
    saveError,
  };
}
