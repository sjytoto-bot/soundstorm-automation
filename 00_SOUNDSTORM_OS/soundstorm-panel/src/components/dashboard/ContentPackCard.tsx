// ─── ContentPackCard (Pipeline UI) ────────────────────────────────────────────
// Content Pack 1개 = 콘텐츠 제작 파이프라인 UI
//
// 구조:
//   ┌─ PackHeader ──────────────────────────────────────────────┐
//   │  [STATUS] theme input                   [⚡전체생성][▾][🗑] │
//   ├─ STEP 1: 컨셉 설정 ──────────────────────────────────────┤
//   │  테마(header) / 감정 / 스타일                             │
//   ├─ STEP 2: 콘텐츠 생성 ────────────────────────────────────┤
//   │  [🎬 콘텐츠 생성]                                        │
//   │  제목 / 썸네일 문구 / 설명 / 해시태그 / 키워드            │
//   ├─ STEP 3: 음악 생성 ──────────────────────────────────────┤
//   │  [🎵 음악 생성]  Suno 프롬프트 + [복사]                  │
//   ├─ STEP 4: 썸네일 생성 ────────────────────────────────────┤
//   │  [🖼 썸네일 생성] → ThumbnailStudio                      │
//   └─ STEP 5: 업로드 & 분석 (ready 이상) ─────────────────────┘
//      YouTube ID 입력 / 성과 지표
//
// 스타일: T.color.* (v1 namespace 의무)

import { useState } from "react";
import {
  Clapperboard, Music2, Image, Wand2, Loader2,
  ChevronDown, ChevronUp, Trash2, Link, X, Plus,
  RefreshCw, BarChart2, Copy, Check,
} from "lucide-react";
import { T } from "../../styles/tokens";
import { calcPerformanceScore, scoreColor } from "@/engines/packPerformanceEngine";
import type {
  ContentPack,
  ContentPackStatus,
  AutoField,
  ContentPerformance,
  PackHypothesis,
  BpmTag,
} from "@/core/types/contentPack";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Props {
  pack:                  ContentPack;
  generating:            Partial<Record<AutoField, boolean>>;
  syncing:               boolean;
  onUpdate:              (updates: Partial<ContentPack>) => void;
  onDelete:              () => void;
  onGenerateField:       (field: AutoField) => void;
  onGenerateAll:         () => void;
  onOpenThumbnailStudio: () => void;
  onSyncPerformance:     () => void;
}

// ─── 상태 뱃지 설정 ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ContentPackStatus, { label: string; bg: string; text: string }> = {
  idea:      { label: "아이디어",    bg: T.status.planned.bg,  text: T.status.planned.text },
  draft:     { label: "작업중",      bg: T.status.active.bg,   text: T.status.active.text  },
  ready:     { label: "자동화 완료", bg: T.status.done.bg,     text: T.status.done.text    },
  uploaded:  { label: "업로드 완료", bg: T.color.bgSubtle,     text: T.color.success       },
  analyzing: { label: "성과 수집중", bg: T.status.blocked.bg,  text: T.status.blocked.text },
};

// ─── 콘텐츠 생성 대상 필드 ────────────────────────────────────────────────────
// 🎬 콘텐츠 생성 버튼이 트리거하는 필드 목록

const CONTENT_FIELDS: AutoField[] = ["title", "thumbnail_text", "description", "hashtags", "keywords"];

// ─── 결과 미리보기 필드 (STEP 2) ──────────────────────────────────────────────

const CONTENT_PREVIEW_FIELDS: Array<{ field: AutoField; label: string; isArray: boolean }> = [
  { field: "title",          label: "제목",      isArray: false },
  { field: "thumbnail_text", label: "썸네일 문구", isArray: false },
  { field: "description",    label: "설명",      isArray: false },
  { field: "hashtags",       label: "해시태그",  isArray: true  },
  { field: "keywords",       label: "키워드",    isArray: true  },
];

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ContentPackStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      padding:       `0 ${T.spacing.sm}px`,
      height:        20,
      borderRadius:  T.radius.badge,
      fontSize:      10,
      fontFamily:    T.font.familyMono,
      fontWeight:    T.font.weight.bold,
      letterSpacing: "0.07em",
      background:    cfg.bg,
      color:         cfg.text,
      flexShrink:    0,
      userSelect:    "none",
    }}>
      {cfg.label}
    </span>
  );
}

// ─── StepLabel ────────────────────────────────────────────────────────────────

function StepLabel({ num, title, done }: { num: number; title: string; done: boolean }) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.xs,
    }}>
      <span style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        width:          18,
        height:         18,
        borderRadius:   "50%",
        border:         `1px solid ${done ? T.color.success : T.color.border}`,
        background:     done ? `${T.color.success}15` : T.color.bgSection,
        fontSize:       9,
        fontFamily:     T.font.familyMono,
        fontWeight:     T.font.weight.bold,
        color:          done ? T.color.success : T.color.textMuted,
        flexShrink:     0,
      }}>
        {num}
      </span>
      <span style={{
        fontSize:      10,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        letterSpacing: "0.06em",
        color:         done ? T.color.textSecondary : T.color.textMuted,
      }}>
        {title}
      </span>
    </div>
  );
}

// ─── StepSection ─────────────────────────────────────────────────────────────

function StepSection({
  num,
  title,
  done,
  action,
  children,
}: {
  num:      number;
  title:    string;
  done:     boolean;
  action?:  React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      paddingTop:   T.spacing.md,
      borderTop:    `1px solid ${T.color.border}`,
    }}>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   children ? T.spacing.sm : 0,
      }}>
        <StepLabel num={num} title={title} done={done} />
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── ResultRow ────────────────────────────────────────────────────────────────

function ResultRow({ label, value, isArray }: { label: string; value: string | string[]; isArray: boolean }) {
  const [open, setOpen] = useState(false);
  const isEmpty = isArray
    ? (value as string[]).length === 0
    : (value as string).trim() === "";

  if (isEmpty) return null;

  const preview = isArray
    ? (value as string[]).slice(0, 3).join(" · ")
    : (value as string).split("\n")[0].slice(0, 80);

  const hasMore = isArray
    ? (value as string[]).length > 3
    : (value as string).length > 80;

  return (
    <div
      onClick={() => setOpen(v => !v)}
      style={{
        cursor:       "pointer",
        padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        borderRadius: T.radius.btn,
        background:   open ? T.color.bgSubtle : "transparent",
        transition:   `background ${T.motion.duration}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: T.spacing.sm }}>
        <span style={{
          fontSize:      10,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.color.textMuted,
          letterSpacing: "0.06em",
          minWidth:      64,
          flexShrink:    0,
          paddingTop:    2,
        }}>
          {label}
        </span>
        <span style={{
          fontSize:     T.font.size.xs,
          color:        T.color.textPrimary,
          lineHeight:   T.font.lineHeight.tight,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   open ? "pre-wrap" : "nowrap",
          flex:         1,
          wordBreak:    "break-word",
        }}>
          {open
            ? (isArray ? (value as string[]).join("\n") : (value as string))
            : `${preview}${hasMore ? " …" : ""}`
          }
        </span>
        <span style={{ color: T.color.textMuted, flexShrink: 0 }}>
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </div>
    </div>
  );
}

// ─── ConceptSection (STEP 1) ──────────────────────────────────────────────────
// 감정 + 스타일 + BPM + 썸네일 스타일 — hypothesis 필드 매핑

const BPM_OPTIONS: Array<{ value: BpmTag; label: string }> = [
  { value: "slow",        label: "SLOW"    },
  { value: "ritual-slow", label: "RITUAL"  },
  { value: "medium",      label: "MED"     },
  { value: "fast",        label: "FAST"    },
  { value: "epic",        label: "EPIC"    },
];

function ConceptTextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label:       string;
  value:       string;
  placeholder: string;
  onChange:    (v: string) => void;
}) {
  const active = value.trim() !== "";
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.xs,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      borderRadius: T.radius.btn,
      border:       `1px solid ${active ? `${T.color.primary}40` : T.color.border}`,
      background:   active ? `${T.color.primary}05` : T.color.bgSection,
    }}>
      <span style={{
        fontSize:      9,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         active ? T.color.primary : T.color.textMuted,
        letterSpacing: "0.06em",
        flexShrink:    0,
        minWidth:      36,
      }}>
        {label}
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex:       1,
          border:     "none",
          outline:    "none",
          background: "transparent",
          fontSize:   11,
          fontFamily: T.font.familyBase,
          color:      T.color.textPrimary,
          minWidth:   0,
        }}
      />
      {active && (
        <button
          onClick={() => onChange("")}
          style={{ display: "inline-flex", padding: 0, border: "none", background: "transparent", cursor: "pointer", color: T.color.textMuted, flexShrink: 0 }}
        >
          <X size={8} />
        </button>
      )}
    </div>
  );
}

function ConceptSection({
  hypothesis,
  onChange,
}: {
  hypothesis: PackHypothesis | null;
  onChange:   (h: PackHypothesis) => void;
}) {
  const h = hypothesis ?? {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>

      {/* Row 1: 감정 + 스타일 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.spacing.xs }}>
        <ConceptTextInput
          label="감정"
          value={h.targetEmotion ?? ""}
          placeholder="예: 강렬 / 어둠 / 긴장"
          onChange={v => onChange({ ...h, targetEmotion: v || undefined })}
        />
        <ConceptTextInput
          label="스타일"
          value={h.hookType ?? ""}
          placeholder="예: taiko / cinematic"
          onChange={v => onChange({ ...h, hookType: v || undefined })}
        />
      </div>

      {/* Row 2: 썸네일 스타일 + BPM chips */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: T.spacing.xs, alignItems: "center" }}>
        <ConceptTextInput
          label="썸네일"
          value={h.thumbnailStyle ?? ""}
          placeholder="예: Red Epic / Dark Warrior"
          onChange={v => onChange({ ...h, thumbnailStyle: v || undefined })}
        />

        {/* BPM chip selector */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, flexShrink: 0 }}>
          <span style={{
            fontSize:      9,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         T.color.textMuted,
            letterSpacing: "0.06em",
          }}>
            BPM
          </span>
          {BPM_OPTIONS.map(({ value, label }) => {
            const selected = h.bpm === value;
            return (
              <button
                key={value}
                onClick={() => onChange({ ...h, bpm: selected ? undefined : value })}
                style={{
                  display:      "inline-flex",
                  alignItems:   "center",
                  padding:      `2px ${T.spacing.xs}px`,
                  borderRadius: T.radius.badge,
                  border:       `1px solid ${selected ? `${T.color.primary}60` : T.color.border}`,
                  background:   selected ? T.color.primarySoft : T.color.bgSection,
                  color:        selected ? T.color.primary : T.color.textMuted,
                  fontSize:     9,
                  fontFamily:   T.font.familyMono,
                  fontWeight:   T.font.weight.bold,
                  cursor:       "pointer",
                  whiteSpace:   "nowrap" as const,
                  transition:   `all ${T.motion.duration}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ─── StepButton ───────────────────────────────────────────────────────────────

function StepButton({
  icon: Icon,
  label,
  loading,
  done,
  onClick,
  variant = "secondary",
}: {
  icon:     React.ElementType;
  label:    string;
  loading:  boolean;
  done:     boolean;
  onClick:  () => void;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          T.spacing.xs,
        padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        borderRadius: T.radius.btn,
        border:       done
          ? `1px solid ${T.color.success}40`
          : isPrimary
            ? `1px solid ${T.color.primary}50`
            : `1px solid ${T.color.border}`,
        background:   done
          ? `${T.color.success}10`
          : isPrimary
            ? T.color.primarySoft
            : T.color.bgSection,
        color:        done
          ? T.color.success
          : isPrimary
            ? T.color.primary
            : T.color.textSecondary,
        fontSize:     11,
        fontFamily:   T.font.familyMono,
        fontWeight:   T.font.weight.bold,
        cursor:       loading ? "not-allowed" : "pointer",
        opacity:      loading ? 0.6 : 1,
        whiteSpace:   "nowrap" as const,
        transition:   `all ${T.motion.duration} ${T.motion.easing}`,
        flexShrink:   0,
      }}
    >
      {loading
        ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
        : <Icon size={10} />
      }
      {label}
    </button>
  );
}

// ─── SunoResult ──────────────────────────────────────────────────────────────
// Suno 프롬프트 결과 + 복사 버튼

function SunoResult({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  if (!value.trim()) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{
      position:     "relative",
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius: T.radius.btn,
      background:   T.color.bgSection,
      border:       `1px solid ${T.color.border}`,
    }}>
      <p style={{
        margin:     0,
        fontSize:   11,
        fontFamily: T.font.familyMono,
        color:      T.color.textSecondary,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        paddingRight: 60,
      }}>
        {value}
      </p>
      <button
        onClick={handleCopy}
        style={{
          position:     "absolute",
          top:          T.spacing.sm,
          right:        T.spacing.sm,
          display:      "inline-flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          borderRadius: T.radius.btn,
          border:       `1px solid ${copied ? T.color.success + "50" : T.color.border}`,
          background:   copied ? `${T.color.success}10` : T.color.bgPrimary,
          color:        copied ? T.color.success : T.color.textMuted,
          fontSize:     10,
          fontFamily:   T.font.familyMono,
          fontWeight:   T.font.weight.bold,
          cursor:       "pointer",
          transition:   `all ${T.motion.duration}`,
        }}
      >
        {copied ? <Check size={9} /> : <Copy size={9} />}
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

// ─── PerformanceSection ───────────────────────────────────────────────────────

function PerformanceSection({ perf }: { perf: ContentPerformance }) {
  const s = calcPerformanceScore(perf);
  const color = scoreColor(s.total);

  const fmtNum = (n?: number) => n !== undefined ? n.toLocaleString() : "—";
  const fmtCtr = (n?: number) => n !== undefined ? `${(n * 100).toFixed(2)}%` : "—";

  const items = [
    { label: "조회수", value: fmtNum(perf.views)      },
    { label: "노출수", value: fmtNum(perf.impressions) },
    { label: "CTR",    value: fmtCtr(perf.ctr)         },
  ];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.lg,
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius: T.radius.btn,
      background:   T.color.bgSection,
      border:       `1px solid ${T.color.border}`,
      flexWrap:     "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, flexShrink: 0 }}>
        <BarChart2 size={10} color={T.color.primary} />
        <span style={{ fontSize: 10, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.color.textMuted, letterSpacing: "0.06em" }}>
          성과 지표
        </span>
      </div>
      {items.map(({ label, value }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{ fontSize: 9, fontFamily: T.font.familyMono, color: T.color.textMuted, letterSpacing: "0.06em" }}>{label}</span>
          <span style={{ fontSize: 11, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.color.textPrimary }}>{value}</span>
        </div>
      ))}
      {s.total > 0 && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{ fontSize: 9, fontFamily: T.font.familyMono, color: T.color.textMuted }}>점수</span>
          <span style={{
            fontSize:     10,
            fontFamily:   T.font.familyMono,
            fontWeight:   T.font.weight.bold,
            color:        color,
            background:   `${color}15`,
            borderRadius: T.radius.badge,
            padding:      `0 ${T.spacing.xs}px`,
          }}>
            {s.total}점 · {s.grade}등급
          </span>
        </div>
      )}
    </div>
  );
}

// ─── VideoIdInput ─────────────────────────────────────────────────────────────

function VideoIdInput({
  value,
  onChange,
  onSync,
  syncing,
}: {
  value:    string | null;
  onChange: (v: string) => void;
  onSync:   () => void;
  syncing:  boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [input,   setInput]   = useState(value ?? "");

  if (value && !editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          borderRadius: T.radius.btn,
          background:   T.color.bgSection,
          border:       `1px solid ${T.color.border}`,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          <span style={{ fontSize: 11, fontFamily: T.font.familyMono, color: T.color.textSecondary }}>{value}</span>
          <button
            onClick={() => { setInput(value); setEditing(true); }}
            style={{ display: "inline-flex", padding: 0, border: "none", background: "transparent", cursor: "pointer", color: T.color.textMuted }}
          >
            <X size={9} />
          </button>
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          T.spacing.xs,
            padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
            borderRadius: T.radius.btn,
            border:       `1px solid ${T.color.primary}50`,
            background:   T.color.primarySoft,
            color:        T.color.primary,
            fontSize:     10,
            fontFamily:   T.font.familyMono,
            fontWeight:   T.font.weight.bold,
            cursor:       syncing ? "not-allowed" : "pointer",
            opacity:      syncing ? 0.6 : 1,
            whiteSpace:   "nowrap" as const,
          }}
        >
          {syncing ? <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={9} />}
          성과 수집
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.xs,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      borderRadius: T.radius.btn,
      border:       `1px dashed ${T.color.border}`,
    }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      <input
        autoFocus={editing}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && input.trim()) { onChange(input.trim()); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="유튜브 업로드 후 영상 ID 입력 (예: dQw4w9WgXcQ)"
        style={{
          flex:       1,
          border:     "none",
          outline:    "none",
          background: "transparent",
          fontSize:   11,
          fontFamily: T.font.familyMono,
          color:      T.color.textPrimary,
          minWidth:   0,
        }}
      />
      {input.trim() && (
        <button
          onClick={() => { onChange(input.trim()); setEditing(false); }}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            padding:      T.spacing.xs,
            borderRadius: T.radius.btn,
            border:       "none",
            background:   T.color.primary,
            color:        "#fff",
            cursor:       "pointer",
            fontSize:     9,
            fontFamily:   T.font.familyMono,
            fontWeight:   T.font.weight.bold,
            flexShrink:   0,
          }}
        >
          저장
        </button>
      )}
    </div>
  );
}

// ─── CampaignLinksSection ─────────────────────────────────────────────────────

function CampaignLinksSection({
  links,
  onAdd,
  onRemove,
}: {
  links:    string[];
  onAdd:    (link: string) => void;
  onRemove: (i: number) => void;
}) {
  const [input, setInput] = useState("");
  const [open,  setOpen]  = useState(false);

  const handleAdd = () => {
    const v = input.trim();
    if (v && !links.includes(v)) { onAdd(v); }
    setInput("");
  };

  return (
    <div style={{
      paddingTop: T.spacing.md,
      borderTop:  `1px solid ${T.color.border}`,
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display:       "flex",
          alignItems:    "center",
          gap:           T.spacing.xs,
          background:    "transparent",
          border:        "none",
          cursor:        "pointer",
          padding:       0,
          color:         T.color.textMuted,
          fontSize:      10,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          letterSpacing: "0.06em",
        }}
      >
        <Link size={10} />
        캠페인 링크
        {links.length > 0 && (
          <span style={{ background: T.color.bgSubtle, borderRadius: T.radius.pill, padding: `0 ${T.spacing.xs}px`, fontSize: 9 }}>
            {links.length}
          </span>
        )}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div style={{ marginTop: T.spacing.sm, display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
          {links.map((link, i) => (
            <div key={i} style={{
              display:      "flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              borderRadius: T.radius.btn,
              background:   T.color.bgSection,
              border:       `1px solid ${T.color.border}`,
            }}>
              <Link size={9} color={T.color.textMuted} />
              <span style={{ flex: 1, fontSize: 11, fontFamily: T.font.familyMono, color: T.color.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {link}
              </span>
              <button onClick={() => onRemove(i)} style={{ display: "inline-flex", padding: 0, border: "none", background: "transparent", cursor: "pointer", color: T.color.textMuted, flexShrink: 0 }}>
                <X size={10} />
              </button>
            </div>
          ))}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          T.spacing.xs,
            padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
            borderRadius: T.radius.btn,
            border:       `1px dashed ${T.color.border}`,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              placeholder="https:// 또는 슬러그 입력"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 11, fontFamily: T.font.familyMono, color: T.color.textPrimary, minWidth: 0 }}
            />
            <button
              onClick={handleAdd}
              disabled={!input.trim()}
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                padding:      T.spacing.xs,
                borderRadius: T.radius.btn,
                border:       "none",
                background:   input.trim() ? T.color.primarySoft : "transparent",
                color:        input.trim() ? T.color.primary : T.color.textMuted,
                cursor:       input.trim() ? "pointer" : "not-allowed",
                flexShrink:   0,
              }}
            >
              <Plus size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ContentPackCard (메인) ───────────────────────────────────────────────────

export default function ContentPackCard({
  pack,
  generating,
  syncing,
  onUpdate,
  onDelete,
  onGenerateField,
  onGenerateAll,
  onOpenThumbnailStudio,
  onSyncPerformance,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // ── 생성 상태 ─────────────────────────────────────────────────────────────
  const isContentGenerating = CONTENT_FIELDS.some(f => generating[f]);
  const isMusicGenerating   = generating["suno_prompt"] === true;
  const isAnyLoading        = Object.values(generating).some(Boolean);

  // ── 완료 여부 ─────────────────────────────────────────────────────────────
  const contentDone = CONTENT_FIELDS.every(f =>
    Array.isArray(pack[f as keyof ContentPack])
      ? (pack[f as keyof ContentPack] as string[]).length > 0
      : (pack[f as keyof ContentPack] as string)?.trim() !== ""
  );
  const musicDone     = pack.suno_prompt.trim() !== "";
  const thumbnailDone = pack.thumbnail !== null;

  // ── 진행률 ────────────────────────────────────────────────────────────────
  const doneCount = [contentDone, musicDone, thumbnailDone].filter(Boolean).length;

  // ── 핸들러 ───────────────────────────────────────────────────────────────
  const handleGenerateContent = () => {
    CONTENT_FIELDS.forEach(field => onGenerateField(field));
  };

  const isUploadPhase = pack.status === "ready" || pack.status === "uploaded" || pack.status === "analyzing";

  return (
    <div style={{
      background:   T.color.bgPrimary,
      border:       `1px solid ${T.color.border}`,
      borderRadius: T.radius.card,
      overflow:     "hidden",
      transition:   `box-shadow ${T.motion.duration}`,
    }}>

      {/* ── 진행률 바 ── */}
      <div style={{ height: 2, background: T.color.border }}>
        <div style={{
          height:     "100%",
          width:      `${(doneCount / 3) * 100}%`,
          background: doneCount === 3 ? T.color.success : T.color.primary,
          transition: `width ${T.motion.duration} ${T.motion.easing}`,
        }} />
      </div>

      <div style={{ padding: `${T.spacing.md}px ${T.spacing.lg}px` }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: collapsed ? 0 : T.spacing.md }}>
          <StatusBadge status={pack.status} />

          {/* 테마 인풋 */}
          <input
            value={pack.theme}
            onChange={e => onUpdate({ theme: e.target.value })}
            placeholder="콘텐츠 테마 입력 (예: Samurai Battle)"
            style={{
              flex:       1,
              border:     "none",
              outline:    "none",
              background: "transparent",
              fontSize:   T.font.size.md,
              fontFamily: T.font.familyBase,
              fontWeight: T.font.weight.semibold,
              color:      T.color.textPrimary,
              minWidth:   0,
            }}
          />

          {/* [⚡ 전체 생성] */}
          <button
            onClick={onGenerateAll}
            disabled={isAnyLoading}
            title="모든 필드 AUTO 생성"
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              borderRadius: T.radius.btn,
              border:       `1px solid ${T.color.primary}50`,
              background:   T.color.primarySoft,
              color:        T.color.primary,
              fontSize:     11,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.bold,
              cursor:       isAnyLoading ? "not-allowed" : "pointer",
              opacity:      isAnyLoading ? 0.5 : 1,
              flexShrink:   0,
              whiteSpace:   "nowrap" as const,
            }}
          >
            {isAnyLoading
              ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
              : <Wand2 size={10} />
            }
            전체 생성
          </button>

          {/* 접기 토글 */}
          <button
            onClick={() => setCollapsed(v => !v)}
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
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {/* 삭제 */}
          <button
            onClick={onDelete}
            title="Pack 삭제"
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
              transition:   `color ${T.motion.duration}`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.color.danger; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.color.textMuted; }}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* ── Pipeline Steps (collapsed 시 숨김) ── */}
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>

            {/* ── STEP 1: 컨셉 설정 ── */}
            <StepSection
              num={1}
              title="컨셉 설정"
              done={!!(pack.hypothesis?.targetEmotion && pack.hypothesis?.hookType && pack.hypothesis?.bpm)}
            >
              <ConceptSection
                hypothesis={pack.hypothesis}
                onChange={hypothesis => onUpdate({ hypothesis })}
              />
            </StepSection>

            {/* ── STEP 2: 콘텐츠 생성 ── */}
            <StepSection
              num={2}
              title="콘텐츠 생성"
              done={contentDone}
              action={
                <StepButton
                  icon={Clapperboard}
                  label="콘텐츠 생성"
                  loading={isContentGenerating}
                  done={contentDone}
                  onClick={handleGenerateContent}
                />
              }
            >
              {contentDone && (
                <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xxs }}>
                  {CONTENT_PREVIEW_FIELDS.map(({ field, label, isArray }) => (
                    <ResultRow
                      key={field}
                      label={label}
                      value={pack[field as keyof ContentPack] as string | string[]}
                      isArray={isArray}
                    />
                  ))}
                </div>
              )}
            </StepSection>

            {/* ── STEP 3: 음악 생성 ── */}
            <StepSection
              num={3}
              title="음악 생성"
              done={musicDone}
              action={
                <StepButton
                  icon={Music2}
                  label="음악 생성"
                  loading={isMusicGenerating}
                  done={musicDone}
                  onClick={() => onGenerateField("suno_prompt")}
                />
              }
            >
              {musicDone && <SunoResult value={pack.suno_prompt} />}
            </StepSection>

            {/* ── STEP 4: 썸네일 생성 ── */}
            <StepSection
              num={4}
              title="썸네일 생성"
              done={thumbnailDone}
              action={
                <StepButton
                  icon={Image}
                  label="썸네일 생성"
                  loading={false}
                  done={thumbnailDone}
                  onClick={onOpenThumbnailStudio}
                />
              }
            />

            {/* ── STEP 5: 업로드 & 분석 ── */}
            {isUploadPhase && (
              <StepSection
                num={5}
                title="업로드 & 분석"
                done={pack.status === "analyzing" || pack.status === "uploaded"}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
                  <VideoIdInput
                    value={pack.video_id}
                    onChange={video_id => onUpdate({ video_id, status: "uploaded" })}
                    onSync={onSyncPerformance}
                    syncing={syncing}
                  />
                  {pack.performance && <PerformanceSection perf={pack.performance} />}
                </div>
              </StepSection>
            )}

          </div>
        )}
      </div>

      {/* ── 캠페인 링크 ── */}
      {(pack.campaign_links.length > 0 || isUploadPhase) && (
        <div style={{ padding: `0 ${T.spacing.lg}px ${T.spacing.md}px` }}>
          <CampaignLinksSection
            links={pack.campaign_links}
            onAdd={link => onUpdate({ campaign_links: [...pack.campaign_links, link] })}
            onRemove={i => onUpdate({ campaign_links: pack.campaign_links.filter((_, idx) => idx !== i) })}
          />
        </div>
      )}

      {/* ── spinner keyframes ── */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
