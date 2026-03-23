// ─── ContentPackManager ───────────────────────────────────────────────────────
// LAYER 1 핵심 컴포넌트 (헌법 §9)
// Creator OS 자동화 결과물 그릇 — Content Pack 생성 + AUTO 도구 실행
//
// 구조:
//   ┌─ Header ──────────────────────────────────────────────────┐
//   │  CONTENT PACK MANAGER          [+ 새 Pack]               │
//   ├─ StatusFilterBar ─────────────────────────────────────────┤
//   │  전체(n) · IDEA · DRAFT · READY · UPLOADED · ANALYZING   │
//   ├─ PackList ─────────────────────────────────────────────────┤
//   │  ContentPackCard × n                                      │
//   └────────────────────────────────────────────────────────────┘

import { useRef, useState, useEffect } from "react";
import { Plus, PackageOpen, X, CornerDownLeft, Sparkles, Music2, ImagePlus } from "lucide-react";
import { T } from "../../styles/tokens";
import { useContentPackCtx } from "@/controllers/ContentPackContext";
import type { GenerateContext } from "@/controllers/useContentPackController";
import type { ContentPackStatus } from "@/core/types/contentPack";
import { useSuggestedThemes } from "@/contexts/SuggestedThemesContext";
import { usePackDraft } from "@/contexts/PackDraftContext";
import ContentPackCard from "./ContentPackCard";
import ThumbnailStudioDrawer from "./ThumbnailStudioDrawer";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Props {
  context?:          GenerateContext; // useYouTubeController 출력 (키워드, 기회 영상 등)
  onOpenSunoPrompt?: () => void;
}

// ─── 필터 탭 설정 ─────────────────────────────────────────────────────────────

type FilterTab = "all" | ContentPackStatus;

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: "all",       label: "전체"      },
  { key: "idea",      label: "아이디어"  },
  { key: "draft",     label: "작업중"    },
  { key: "ready",     label: "자동화 완료" },
  { key: "uploaded",  label: "업로드 완료" },
  { key: "analyzing", label: "성과 수집중" },
];

// ─── FilterTab 컴포넌트 ───────────────────────────────────────────────────────

function FilterTabItem({
  label,
  count,
  active,
  onClick,
}: {
  label:   string;
  count:   number;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          T.spacing.xs,
        padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        borderRadius: T.radius.pill,
        border:       active
          ? `1px solid ${T.color.primary}50`
          : `1px solid transparent`,
        background:   active ? T.color.primarySoft : "transparent",
        color:        active ? T.color.primary : T.color.textMuted,
        fontSize:     11,
        fontFamily:   T.font.familyMono,
        fontWeight:   active ? T.font.weight.bold : T.font.weight.regular,
        cursor:       "pointer",
        whiteSpace:   "nowrap" as const,
        transition:   `all ${T.motion.duration} ${T.motion.easing}`,
      }}
    >
      {label}
      {count > 0 && (
        <span style={{
          display:      "inline-flex",
          alignItems:   "center",
          justifyContent: "center",
          minWidth:     16,
          height:       16,
          borderRadius: T.radius.pill,
          background:   active ? T.color.primary : T.color.bgSubtle,
          color:        active ? "#fff" : T.color.textMuted,
          fontSize:     9,
          fontWeight:   T.font.weight.bold,
          fontFamily:   T.font.familyMono,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── NewPackInput ─────────────────────────────────────────────────────────────

function NewPackInput({
  onConfirm,
  onCancel,
  initialTheme = "",
}: {
  onConfirm:     (theme: string) => void;
  onCancel:      () => void;
  initialTheme?: string;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = () => {
    const t = theme.trim();
    if (t) onConfirm(t);
  };

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius: T.radius.btn,
      border:       `1px solid ${T.color.primary}50`,
      background:   T.color.primarySoft,
    }}>
      <input
        ref={inputRef}
        autoFocus
        value={theme}
        onChange={e => setTheme(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") handleConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="콘텐츠 테마 입력 (예: Samurai Battle)"
        style={{
          flex:       1,
          border:     "none",
          outline:    "none",
          background: "transparent",
          fontSize:   T.font.size.md,
          fontFamily: T.font.familyBase,
          fontWeight: T.font.weight.medium,
          color:      T.color.textPrimary,
          minWidth:   0,
        }}
      />
      <button
        onClick={handleConfirm}
        disabled={!theme.trim()}
        title="추가 (Enter)"
        style={{
          display:      "inline-flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          borderRadius: T.radius.btn,
          border:       "none",
          background:   theme.trim() ? T.color.primary : T.color.bgSubtle,
          color:        theme.trim() ? "#fff" : T.color.textMuted,
          fontSize:     11,
          fontFamily:   T.font.familyMono,
          fontWeight:   T.font.weight.bold,
          cursor:       theme.trim() ? "pointer" : "not-allowed",
          flexShrink:   0,
        }}
      >
        <CornerDownLeft size={11} />
        추가
      </button>
      <button
        onClick={onCancel}
        style={{
          display:      "inline-flex",
          alignItems:   "center",
          padding:      T.spacing.xs,
          borderRadius: T.radius.btn,
          border:       "none",
          background:   "transparent",
          color:        T.color.textMuted,
          cursor:       "pointer",
          flexShrink:   0,
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─── ThemeIntelligenceChips ───────────────────────────────────────────────────
// OpportunityEngine / TopicMomentum 추천 테마 → 클릭 시 즉시 Pack 생성

function ThemeIntelligenceChips({
  themes,
  onSelect,
}: {
  themes:   string[];
  onSelect: (theme: string) => void;
}) {
  if (themes.length === 0) return null;

  return (
    <div style={{
      display:    "flex",
      flexWrap:   "wrap",
      alignItems: "center",
      gap:        T.spacing.xs,
      padding:    `${T.spacing.sm}px ${T.spacing.lg}px`,
      borderBottom: `1px solid ${T.color.border}`,
    }}>
      <span style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          T.spacing.xs,
        fontSize:     10,
        fontFamily:   T.font.familyMono,
        fontWeight:   T.font.weight.bold,
        color:        T.color.textMuted,
        letterSpacing: "0.06em",
        flexShrink:   0,
      }}>
        <Sparkles size={10} />
        추천
      </span>
      {themes.map(theme => (
        <button
          key={theme}
          onClick={() => onSelect(theme)}
          title={`"${theme}" 테마로 Pack 생성`}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            padding:      `${T.spacing.xxs}px ${T.spacing.sm}px`,
            borderRadius: T.radius.pill,
            border:       `1px solid ${T.color.border}`,
            background:   T.color.bgSection,
            color:        T.color.textSecondary,
            fontSize:     11,
            fontFamily:   T.font.familyMono,
            fontWeight:   T.font.weight.medium,
            cursor:       "pointer",
            whiteSpace:   "nowrap" as const,
            transition:   `all ${T.motion.duration}`,
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = T.color.primarySoft;
            el.style.borderColor = `${T.color.primary}50`;
            el.style.color = T.color.primary;
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = T.color.bgSection;
            el.style.borderColor = T.color.border;
            el.style.color = T.color.textSecondary;
          }}
        >
          {theme}
        </button>
      ))}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  filtered,
  onNew,
}: {
  filtered: boolean;
  onNew:    () => void;
}) {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            T.spacing.md,
      padding:        `${T.spacing.xxl}px ${T.spacing.xl}px`,
      color:          T.color.textMuted,
    }}>
      <PackageOpen size={28} strokeWidth={1.5} />
      <div style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           T.spacing.xs,
      }}>
        <span style={{ fontSize: T.font.size.sm, fontWeight: T.font.weight.medium }}>
          {filtered ? "해당 상태의 팩 없음" : "콘텐츠 팩이 없습니다"}
        </span>
        {!filtered && (
          <span style={{ fontSize: T.font.size.xs }}>
            테마를 입력하고 자동화 도구로 콘텐츠를 생성하세요
          </span>
        )}
      </div>
      {!filtered && (
        <button
          onClick={onNew}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          T.spacing.xs,
            padding:      `${T.spacing.sm}px ${T.spacing.lg}px`,
            borderRadius: T.radius.btn,
            border:       `1px solid ${T.color.primary}50`,
            background:   T.color.primarySoft,
            color:        T.color.primary,
            fontSize:     T.font.size.xs,
            fontFamily:   T.font.familyBase,
            fontWeight:   T.font.weight.semibold,
            cursor:       "pointer",
          }}
        >
          <Plus size={13} />
          첫 번째 팩 만들기
        </button>
      )}
    </div>
  );
}

// ─── ContentPackManager (메인) ────────────────────────────────────────────────

export default function ContentPackManager({ context = {}, onOpenSunoPrompt }: Props) {
  const {
    state,
    createPack,
    updatePack,
    deletePack,
    generateField,
    generateAll,
    syncPerformance,
  } = useContentPackCtx();

  const suggestedThemes        = useSuggestedThemes();
  const { draft, clearDraft }  = usePackDraft();

  const [activeFilter, setActiveFilter]       = useState<FilterTab>("all");
  const [showNewInput, setShowNewInput]       = useState(false);
  const [draftTheme,   setDraftTheme]         = useState<string>("");
  const [thumbnailPackId, setThumbnailPackId] = useState<string | null>(null);

  // draft가 들어오면 입력창 열고 테마 pre-fill
  useEffect(() => {
    if (draft) {
      setDraftTheme(draft.theme);
      setShowNewInput(true);
    }
  }, [draft]);

  // ── 필터링 ────────────────────────────────────────────────────────────────

  const filtered = activeFilter === "all"
    ? state.packs
    : state.packs.filter(p => p.status === activeFilter);

  // 탭별 카운트
  const countByStatus = state.packs.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  // ── 핸들러 ───────────────────────────────────────────────────────────────

  const handleNewConfirm = (theme: string) => {
    createPack(theme);
    setShowNewInput(false);
    setDraftTheme("");
    clearDraft();
  };

  const handleNewCancel = () => {
    setShowNewInput(false);
    setDraftTheme("");
    clearDraft();
  };

  const handleOpenThumbnailStudio = (packId: string) => {
    setThumbnailPackId(packId);
  };

  const handleThumbnailStudioClose = () => {
    setThumbnailPackId(null);
  };

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <>
    <div style={{
      background:    T.color.bgPrimary,
      border:        `1px solid ${T.color.border}`,
      borderRadius:  T.radius.card,
      overflow:      "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        `${T.spacing.md}px ${T.spacing.lg}px`,
        borderBottom:   `1px solid ${T.color.border}`,
      }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.color.textMuted,
          letterSpacing: "0.08em",
        }}>
          콘텐츠 팩 관리
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          {/* Suno Prompt 생성 */}
          <button
            onClick={() => onOpenSunoPrompt?.()}
            title="Suno Prompt 생성"
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              borderRadius: T.radius.btn,
              border:       `1px solid ${T.color.border}`,
              background:   T.color.bgPrimary,
              color:        T.color.textSecondary,
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyBase,
              fontWeight:   T.font.weight.semibold,
              cursor:       "pointer",
              whiteSpace:   "nowrap" as const,
              transition:   `all ${T.motion.duration}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            <Music2 size={11} />
            Suno Prompt
          </button>

          {/* 썸네일 생성 */}
          <button
            onClick={() => setThumbnailPackId("")}
            title="썸네일 생성"
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              borderRadius: T.radius.btn,
              border:       `1px solid ${T.color.primary}40`,
              background:   T.color.primarySoft,
              color:        T.color.primary,
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyBase,
              fontWeight:   T.font.weight.semibold,
              cursor:       "pointer",
              whiteSpace:   "nowrap" as const,
              transition:   `all ${T.motion.duration}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            <ImagePlus size={11} />
            썸네일 생성
          </button>

          {/* 새 팩 */}
          <button
            onClick={() => setShowNewInput(v => !v)}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              borderRadius: T.radius.btn,
              border:       `1px solid ${T.color.border}`,
              background:   showNewInput ? T.color.bgSubtle : T.color.bgPrimary,
              color:        T.color.textSecondary,
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyBase,
              fontWeight:   T.font.weight.semibold,
              cursor:       "pointer",
              transition:   `all ${T.motion.duration}`,
            }}
          >
            <Plus size={13} />
            새 팩
          </button>
        </div>
      </div>

      {/* ── Theme Intelligence 추천 칩 ── */}
      <ThemeIntelligenceChips
        themes={suggestedThemes}
        onSelect={theme => {
          createPack(theme);
          setShowNewInput(false);
        }}
      />

      {/* ── 새 Pack 입력 ── */}
      {showNewInput && (
        <div style={{ padding: `${T.spacing.sm}px ${T.spacing.lg}px` }}>
          <NewPackInput
            onConfirm={handleNewConfirm}
            onCancel={handleNewCancel}
            initialTheme={draftTheme}
          />
        </div>
      )}

      {/* ── Status 필터 탭 ── */}
      <div style={{
        display:    "flex",
        flexWrap:   "wrap",
        gap:        T.spacing.xs,
        padding:    `${T.spacing.sm}px ${T.spacing.lg}px`,
        borderBottom: filtered.length > 0 ? `1px solid ${T.color.border}` : "none",
      }}>
        {FILTER_TABS.map(({ key, label }) => {
          const count = key === "all"
            ? state.packs.length
            : (countByStatus[key] ?? 0);
          return (
            <FilterTabItem
              key={key}
              label={label}
              count={count}
              active={activeFilter === key}
              onClick={() => setActiveFilter(key)}
            />
          );
        })}
      </div>

      {/* ── Pack 목록 ── */}
      {filtered.length === 0 ? (
        <EmptyState
          filtered={activeFilter !== "all"}
          onNew={() => setShowNewInput(true)}
        />
      ) : (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.sm,
          padding:       `${T.spacing.md}px ${T.spacing.lg}px`,
        }}>
          {filtered.map(pack => (
            <ContentPackCard
              key={pack.id}
              pack={pack}
              generating={state.generating[pack.id] ?? {}}
              syncing={state.syncing[pack.id] ?? false}
              onUpdate={updates => updatePack(pack.id, updates)}
              onDelete={() => deletePack(pack.id)}
              onGenerateField={field => generateField(pack.id, field, context)}
              onGenerateAll={() => generateAll(pack.id, context)}
              onOpenThumbnailStudio={() => handleOpenThumbnailStudio(pack.id)}
              onSyncPerformance={() => syncPerformance(pack.id)}
            />
          ))}
        </div>
      )}
    </div>

    {/* ── ThumbnailStudio Drawer (Pack 연동) ── */}
    <ThumbnailStudioDrawer
      open={thumbnailPackId !== null}
      onClose={handleThumbnailStudioClose}
    />
    </>
  );
}
