// ─── UploadAssistant (STAGE 4 v2) ────────────────────────────────────────────
// ContentPack 전체 상태 → 업로드 가이드 허브
//
// 표시 범위:
//   ready  — 업로드 준비 완료 → "업로드 완료" 1-click + video_id 자동 연결
//   draft  — 작업 중 → 미완료 필드 표시 (왜 ready 아닌지)
//   idea   — 아이디어 단계 → 진행 안내
//   (uploaded / analyzing 은 제외 — 이미 처리된 팩)
//
// video_id 자동 연결:
//   "업로드 완료" → status: uploaded (video_id: null)
//   "video_id 자동 연결" → youtubeListRecentUploads() → 제목 유사도 매핑
//   → 일치 시 video_id 자동 설정 → status: analyzing 전이 가능
//
// ready 팩도 없고 draft/idea 팩도 없으면 null (레이아웃 공간 낭비 없음)

import { useState, useCallback } from "react";
import {
  Upload, Clock, CheckCircle2, AlertCircle, Lightbulb,
  Link2, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";
import { T } from "../../styles/tokens";
import { useContentPackCtx } from "@/controllers/ContentPackContext";
import type { ContentPack } from "@/core/types/contentPack";
import { AUTO_FIELDS_REQUIRED } from "@/core/types/contentPack";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Props {
  goldenHour?: {
    bestDay?:  string;
    bestHour?: string;
  } | null;
}

interface RecentUpload {
  videoId:     string;
  title:       string;
  publishedAt: string;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  title:          "영상 제목",
  suno_prompt:    "음악 프롬프트",
  thumbnail_text: "썸네일 텍스트",
  description:    "설명",
  hashtags:       "해시태그",
  keywords:       "키워드",
};

function getMissingFields(pack: ContentPack): string[] {
  return AUTO_FIELDS_REQUIRED.filter(f => {
    const v = (pack as any)[f];
    if (Array.isArray(v)) return v.length === 0;
    return !v || String(v).trim() === "";
  });
}

/** 제목 유사도 매핑 — 소문자 포함 여부 + 공통 단어 수 기반 */
function matchByTitle(packTitle: string, uploads: RecentUpload[]): RecentUpload | null {
  if (!packTitle.trim() || uploads.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, " ").trim();
  const packWords = new Set(normalize(packTitle).split(/\s+/).filter(w => w.length >= 2));

  let best: RecentUpload | null = null;
  let bestScore = 0;

  for (const u of uploads) {
    const uWords = normalize(u.title).split(/\s+/).filter(w => w.length >= 2);
    const overlap = uWords.filter(w => packWords.has(w)).length;
    const score = overlap / Math.max(packWords.size, uWords.length, 1);
    if (score > bestScore && score >= 0.3) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

// ─── GoldenHourBadge ──────────────────────────────────────────────────────────

function GoldenHourBadge({ bestDay, bestHour }: { bestDay?: string; bestHour?: string }) {
  if (!bestDay && !bestHour) return null;
  return (
    <div style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          T.spacing.xs,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      borderRadius: T.radius.pill,
      background:   `${T.color.warning}15`,
      border:       `1px solid ${T.color.warning}40`,
    }}>
      <Clock size={11} color={T.color.warning} />
      <span style={{
        fontSize:   10,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.semibold,
        color:      T.warn,
      }}>
        최적 업로드{bestDay ? ` ${bestDay}요일` : ""}{bestHour ? ` ${bestHour}시` : ""}
      </span>
    </div>
  );
}

// ─── ReadyPackRow ──────────────────────────────────────────────────────────────
// ready 상태 팩 — 1-click 업로드 완료 + video_id 자동 연결

function ReadyPackRow({
  pack,
  onMarkUploaded,
  onAutoLink,
}: {
  pack:           ContentPack;
  onMarkUploaded: (id: string) => void;
  onAutoLink:     (pack: ContentPack) => void;
}) {
  const isUploaded = pack.status === "uploaded";

  return (
    <div style={{
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius: T.radius.btn,
      background:   T.color.bgSection,
      border:       `1px solid ${isUploaded ? `${T.color.warning}40` : T.color.border}`,
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
    }}>
      {/* 팩 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display:      "block",
          fontSize:     T.font.size.xs,
          fontFamily:   T.font.familyMono,
          fontWeight:   T.font.weight.bold,
          color:        T.color.textPrimary,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {pack.theme}
        </span>
        {pack.title && (
          <span style={{
            display:      "block",
            fontSize:     10,
            fontFamily:   T.font.familyMono,
            color:        T.color.textMuted,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
            marginTop:    2,
          }}>
            {pack.title}
          </span>
        )}
      </div>

      {/* 상태 + 액션 버튼 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, flexShrink: 0 }}>
        {isUploaded ? (
          /* 업로드 완료 상태: video_id 연결 CTA */
          <>
            <span style={{
              fontSize: 9, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold,
              color: T.warn, background: `${T.color.warning}15`,
              borderRadius: T.radius.badge, padding: `2px ${T.spacing.xs}px`,
            }}>
              {pack.video_id ? "연결됨" : "ID 대기"}
            </span>
            {!pack.video_id && (
              <button
                onClick={() => onAutoLink(pack)}
                title="YouTube 최근 업로드에서 video_id 자동 연결"
                style={{
                  display: "inline-flex", alignItems: "center", gap: T.spacing.xs,
                  padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
                  borderRadius: T.radius.btn,
                  border: `1px solid ${T.color.primary}50`,
                  background: T.color.primarySoft,
                  color: T.color.primary,
                  fontSize: 10, fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.semibold,
                  cursor: "pointer", whiteSpace: "nowrap" as const,
                }}
              >
                <Link2 size={10} />
                자동 연결
              </button>
            )}
          </>
        ) : (
          /* ready 상태: 업로드 완료 1-click */
          <>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: T.spacing.xs,
              padding: `2px ${T.spacing.xs}px`, borderRadius: T.radius.badge,
              background: `${T.color.success}15`, color: T.color.success,
              fontSize: 9, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold,
            }}>
              <CheckCircle2 size={9} />
              READY
            </span>
            <button
              onClick={() => onMarkUploaded(pack.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: T.spacing.xs,
                padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
                borderRadius: T.radius.btn,
                border: `1px solid ${T.color.primary}50`,
                background: T.color.primarySoft,
                color: T.color.primary,
                fontSize: 10, fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.semibold,
                cursor: "pointer", whiteSpace: "nowrap" as const,
                transition: `all ${T.motion.duration}`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = T.color.primary;
                (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = T.color.primarySoft;
                (e.currentTarget as HTMLElement).style.color = T.color.primary;
              }}
            >
              <Upload size={10} />
              업로드 완료
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── InProgressPackRow ────────────────────────────────────────────────────────
// draft/idea 팩 — 미완료 필드 표시 (왜 ready 아닌지)

function InProgressPackRow({ pack }: { pack: ContentPack }) {
  const missing = getMissingFields(pack);
  const isDraft = pack.status === "draft";
  const total   = AUTO_FIELDS_REQUIRED.length;
  const done    = total - missing.length;
  const pct     = Math.round((done / total) * 100);

  return (
    <div style={{
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderRadius: T.radius.btn,
      background:   T.color.bgSection,
      border:       `1px dashed ${T.color.border}`,
      display:      "flex",
      flexDirection: "column",
      gap:          T.spacing.xs,
    }}>
      {/* 상단 행 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        {isDraft
          ? <AlertCircle size={11} color={T.color.warning} />
          : <Lightbulb   size={11} color={T.color.textMuted} />
        }
        <span style={{
          flex: 1, fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.semibold,
          color: isDraft ? T.color.textPrimary : T.color.textMuted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {pack.theme || "테마 미설정"}
        </span>
        <span style={{
          fontSize: 9, fontFamily: T.font.familyMono,
          color: isDraft ? T.color.warning : T.color.textMuted,
          background: isDraft ? `${T.color.warning}15` : T.color.bgSection,
          borderRadius: T.radius.badge, padding: `2px ${T.spacing.xs}px`,
          fontWeight: T.font.weight.bold,
        }}>
          {isDraft ? `${pct}%` : "IDEA"}
        </span>
      </div>

      {/* 미완료 필드 목록 — draft 전용 */}
      {isDraft && missing.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.xs }}>
          {missing.map(f => (
            <span key={f} style={{
              fontSize: 9, fontFamily: T.font.familyMono,
              color: T.color.textMuted,
              background: T.color.bgSubtle,
              borderRadius: T.radius.badge,
              padding: `1px ${T.spacing.xs}px`,
            }}>
              {FIELD_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      )}

      {/* 진행 바 — draft 전용 */}
      {isDraft && (
        <div style={{
          height: 3, borderRadius: T.radius.pill,
          background: T.color.border, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: pct === 100 ? T.color.success : T.color.warning,
            borderRadius: T.radius.pill,
            transition: "width 0.3s ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ─── UploadAssistant (메인) ───────────────────────────────────────────────────

export default function UploadAssistant({ goldenHour }: Props) {
  const { state, updatePack } = useContentPackCtx();

  const [linking,       setLinking]       = useState(false);
  const [linkResult,    setLinkResult]    = useState<string | null>(null);
  const [showInProgress, setShowInProgress] = useState(false);

  const readyPacks     = state.packs.filter(p => p.status === "ready");
  const uploadedNeedId = state.packs.filter(p => p.status === "uploaded" && !p.video_id);
  const inProgressPacks = state.packs.filter(p => p.status === "draft" || p.status === "idea");

  const hasAny = readyPacks.length > 0 || uploadedNeedId.length > 0 || inProgressPacks.length > 0;
  if (!hasAny) return null;

  // ── 업로드 완료 1-click ─────────────────────────────────────────────────────
  function handleMarkUploaded(packId: string) {
    updatePack(packId, { status: "uploaded", video_id: null } as any);
  }

  // ── video_id 자동 연결 ──────────────────────────────────────────────────────
  const handleAutoLink = useCallback(async (pack: ContentPack) => {
    const api = (window as any).api;
    if (!api?.youtubeListRecentUploads) {
      setLinkResult("IPC 미연결 (Electron 외부 환경)");
      return;
    }

    setLinking(true);
    setLinkResult(null);

    try {
      const uploads: RecentUpload[] = await api.youtubeListRecentUploads(15);
      const matched = matchByTitle(pack.title || pack.theme, uploads);

      if (matched) {
        updatePack(pack.id, { video_id: matched.videoId, status: "analyzing" } as any);
        setLinkResult(`"${pack.theme}" → ${matched.videoId} 자동 연결 완료`);
      } else {
        setLinkResult(`일치하는 영상 없음 — YouTube Studio에서 직접 video_id를 확인하세요`);
      }
    } catch (e: any) {
      // 스코프 미포함 토큰이면 재인증 안내
      if (e?.message?.includes("403") || e?.message?.includes("scope")) {
        setLinkResult("YouTube 권한 필요 — 설정 > YT 인증 초기화 후 재인증하세요");
      } else {
        setLinkResult(`연결 실패: ${e?.message ?? "알 수 없는 오류"}`);
      }
    } finally {
      setLinking(false);
    }
  }, [updatePack]);

  const actionPacks = [...readyPacks, ...uploadedNeedId];

  return (
    <div style={{
      background:   T.color.bgPrimary,
      border:       `1px solid ${T.color.border}`,
      borderRadius: T.radius.card,
      overflow:     "hidden",
    }}>

      {/* ── 헤더 ── */}
      <div style={{
        padding:        `${T.spacing.md}px ${T.spacing.lg}px`,
        borderBottom:   `1px solid ${T.color.border}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            T.spacing.sm,
        flexWrap:       "wrap" as const,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <Upload size={14} color={T.color.primary} />
          <span style={{
            fontSize:      T.font.size.sm,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         T.color.textPrimary,
            letterSpacing: "0.04em",
          }}>
            업로드 파이프라인
          </span>
          {actionPacks.length > 0 && (
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: `0 ${T.spacing.sm}px`, height: 18,
              borderRadius: T.radius.badge,
              background: `${T.color.success}15`, color: T.color.success,
              fontSize: 10, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold,
            }}>
              {actionPacks.length}개 대기
            </span>
          )}
        </div>
        <GoldenHourBadge bestDay={goldenHour?.bestDay} bestHour={goldenHour?.bestHour} />
      </div>

      {/* ── 액션 팩 목록 (ready + uploaded-no-id) ── */}
      {actionPacks.length > 0 && (
        <div style={{
          padding:       `${T.spacing.md}px ${T.spacing.lg}px`,
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.sm,
        }}>
          {actionPacks.map(pack => (
            <ReadyPackRow
              key={pack.id}
              pack={pack}
              onMarkUploaded={handleMarkUploaded}
              onAutoLink={handleAutoLink}
            />
          ))}
        </div>
      )}

      {/* ── 자동 연결 진행 중 / 결과 ── */}
      {(linking || linkResult) && (
        <div style={{
          margin:       `0 ${T.spacing.lg}px ${T.spacing.md}px`,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          borderRadius: T.radius.btn,
          background:   linking ? T.color.bgSection : (linkResult?.includes("완료") ? `${T.color.success}10` : `${T.color.warning}10`),
          border:       `1px solid ${linking ? T.color.border : (linkResult?.includes("완료") ? `${T.color.success}30` : `${T.color.warning}30`)}`,
          display:      "flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
        }}>
          {linking
            ? <Loader2 size={11} color={T.color.primary} style={{ animation: "spin 1s linear infinite" }} />
            : <Link2   size={11} color={linkResult?.includes("완료") ? T.color.success : T.warn} />
          }
          <span style={{
            fontSize:   10,
            fontFamily: T.font.familyMono,
            color:      linking ? T.color.textMuted : (linkResult?.includes("완료") ? T.color.success : T.warn),
          }}>
            {linking ? "YouTube 최근 업로드 조회 중..." : linkResult}
          </span>
        </div>
      )}

      {/* ── 진행 중 팩 섹션 (접기 가능) ── */}
      {inProgressPacks.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.color.border}` }}>
          <button
            onClick={() => setShowInProgress(v => !v)}
            style={{
              width:          "100%",
              padding:        `${T.spacing.sm}px ${T.spacing.lg}px`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              background:     "none",
              border:         "none",
              cursor:         "pointer",
            }}
          >
            <span style={{
              fontSize:   10,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.semibold,
              color:      T.color.textMuted,
              letterSpacing: "0.06em",
            }}>
              작업 중 ({inProgressPacks.length}개)
            </span>
            {showInProgress
              ? <ChevronUp   size={12} color={T.color.textMuted} />
              : <ChevronDown size={12} color={T.color.textMuted} />
            }
          </button>

          {showInProgress && (
            <div style={{
              padding:       `0 ${T.spacing.lg}px ${T.spacing.md}px`,
              display:       "flex",
              flexDirection: "column",
              gap:           T.spacing.xs,
            }}>
              {inProgressPacks.map(pack => (
                <InProgressPackRow key={pack.id} pack={pack} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
