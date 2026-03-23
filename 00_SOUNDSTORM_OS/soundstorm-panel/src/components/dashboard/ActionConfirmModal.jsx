// ─── ActionConfirmModal.jsx ───────────────────────────────────────────────────
// "실제로 행동했나요?" — strategy/upload 아이템 완료 확인 모달
//
// Props:
//   item       — DecisionItem | null  (null이면 닫힌 상태)
//   onDone     — () => void           (완료했어요 클릭)
//   onCancel   — () => void           (나중에 클릭 or 오버레이 클릭)
//   onNavigate — (item) => void       (관련 패널로 이동, 없으면 버튼 숨김)

import { useEffect, useState, useMemo } from "react";
import { nanoid } from "nanoid";
import { CheckCircle, X, ArrowRight } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 타입별 메타 ──────────────────────────────────────────────────────────────

const TYPE_META = {
  strategy: { color: T.primary,  label: "전략 실행 확인",   navLabel: "전략 패널 보기" },
  upload:   { color: T.success,  label: "업로드 일정 확인", navLabel: "골든아워 보기"  },
  warning:  { color: T.warn,     label: "경고 조치 확인",   navLabel: null             },
  danger:   { color: T.danger,   label: "긴급 조치 확인",   navLabel: null             },
};

// ─── ActionConfirmModal ───────────────────────────────────────────────────────

export default function ActionConfirmModal({ item, onDone, onCancel, onNavigate }) {
  const [submitting, setSubmitting] = useState(false);

  // 추천 인스턴스 단위 ID — item이 바뀔 때만 새로 생성
  // nanoid(6): 충돌 없음 + 로그 추적 쉬움 + 테스트 재현 가능
  const recommendationId = useMemo(
    () => item ? `${item.id}_${nanoid(6)}` : null,
    [item], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 개선 3: 모달 오픈 = 노출 이벤트 기록 (퍼널: 노출 → 클릭 → 완료/취소)
  useEffect(() => {
    if (!item || !recommendationId) return;
    (window.api?.registerActionViewed?.({
      recommendationId,
      actionId: item.id,
      shownAt:  Date.now(),
    }) ?? Promise.resolve()).catch(() => {});
  }, [recommendationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC 키로 닫기
  useEffect(() => {
    if (!item) return;
    function handleKey(e) {
      if (e.key === "Escape") handleSkip();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [item]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;

  const meta = TYPE_META[item.type] ?? TYPE_META.strategy;

  // 개선 1: context 포함 완료 기록 / 개선 4: 중복 클릭 방지
  async function handleDone() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await (window.api?.registerActionComplete?.({
        recommendationId,
        video_id:    item.videoId     ?? null,
        action_type: (item.problemType ?? item.type ?? "STRATEGY").toUpperCase(),
        action_label: item.label,
        source:       "confirm_modal",
        pattern_tags: item.pattern_tags ?? [],
        context: {
          level:           item.level,
          recommendedHour: item.recommendedHour,
          actualHour:      new Date().getHours(),
          patternTags:     item.pattern_tags,
          source:          item.type,
        },
      }) ?? Promise.resolve());
    } catch {}
    setSubmitting(false);
    onDone();
  }

  // 개선 2: "나중에"도 기록 (실패 패턴 학습용)
  async function handleSkip() {
    try {
      await (window.api?.registerActionSkip?.({
        recommendationId,
        actionId:  item.id,
        reason:    "later",
        skippedAt: Date.now(),
      }) ?? Promise.resolve());
    } catch {}
    onCancel();
  }

  return (
    // ── 오버레이 ──────────────────────────────────────────────────────────
    <div
      onClick={handleSkip}
      style={{
        position:        "fixed",
        inset:           0,
        zIndex:          50,
        background:      "rgba(0,0,0,0.55)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        backdropFilter:  "blur(2px)",
        animation:       "fadeIn 0.15s ease",
      }}
    >
      {/* ── 카드 — 오버레이 클릭 막기 ──────────────────────────────────── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   T.bgCard,
          border:       `1.5px solid ${meta.color}40`,
          borderRadius: T.radius.card,
          boxShadow:    T.shadow.card,
          width:        420,
          maxWidth:     "90vw",
          padding:      `${T.spacing.xl}px`,
          display:      "flex",
          flexDirection:"column",
          gap:          T.spacing.lg,
          animation:    "slideUp 0.18s ease",
        }}
      >
        {/* ── 헤더 ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
            <CheckCircle size={18} color={meta.color} />
            <span style={{
              fontSize:   11,
              fontWeight: 800,
              color:      meta.color,
              fontFamily: "monospace",
              letterSpacing: "0.08em",
            }}>
              {meta.label}
            </span>
          </div>
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              padding:    4,
              color:      T.muted,
              lineHeight: 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── 메인 질문 ─────────────────────────────────────────────────── */}
        <div>
          <div style={{
            fontSize:   20,
            fontWeight: 800,
            color:      T.text,
            marginBottom: T.spacing.sm,
          }}>
            실제로 행동했나요?
          </div>
          <div style={{
            fontSize:   13,
            color:      T.sub,
            lineHeight: 1.5,
          }}>
            {item.label}
          </div>
          {item.tag && (
            <div style={{
              marginTop:  T.spacing.sm,
              display:    "inline-block",
              fontSize:   10,
              fontWeight: 700,
              fontFamily: "monospace",
              color:      meta.color,
              background: `${meta.color}18`,
              padding:    `2px ${T.spacing.sm}px`,
              borderRadius: T.radius.badge,
            }}>
              {item.tag}
            </div>
          )}
        </div>

        {/* ── 안내 텍스트 ───────────────────────────────────────────────── */}
        <div style={{
          fontSize:     12,
          color:        T.muted,
          background:   T.bgSection,
          borderRadius: T.radius.card,
          padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
          lineHeight:   1.55,
        }}>
          완료로 기록하면 3일 후 성과를 자동 분석합니다.
          나중에를 선택하면 오늘의 실행 목록에 유지됩니다.
        </div>

        {/* ── 관련 패널 이동 링크 (strategy / upload만) ─────────────────── */}
        {onNavigate && meta.navLabel && (
          <button
            onClick={() => onNavigate(item)}
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            T.spacing.xs,
              background:     "none",
              border:         "none",
              cursor:         "pointer",
              fontSize:       11,
              fontWeight:     600,
              color:          meta.color,
              padding:        `${T.spacing.xs}px 0`,
              opacity:        0.85,
              transition:     "opacity 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "0.85"; }}
          >
            <ArrowRight size={12} />
            {meta.navLabel}
          </button>
        )}

        {/* ── 버튼 ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: T.spacing.sm }}>
          {/* 나중에 */}
          <button
            onClick={handleSkip}
            style={{
              flex:         1,
              height:       44,
              background:   "none",
              border:       `1px solid ${T.border}`,
              borderRadius: T.radius.btn,
              cursor:       "pointer",
              fontSize:     13,
              fontWeight:   600,
              color:        T.sub,
              transition:   "border-color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderSoft ?? T.primary; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}
          >
            나중에
          </button>

          {/* 완료했어요 */}
          <button
            onClick={handleDone}
            disabled={submitting}
            style={{
              flex:         2,
              height:       44,
              background:   submitting ? T.muted : meta.color,
              border:       "none",
              borderRadius: T.radius.btn,
              cursor:       submitting ? "not-allowed" : "pointer",
              fontSize:     13,
              fontWeight:   800,
              color:        T.bgCard,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              gap:          T.spacing.xs,
              transition:   "opacity 0.15s, background 0.15s",
              opacity:      submitting ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.opacity = "0.85"; }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.opacity = "1"; }}
          >
            <CheckCircle size={14} />
            {submitting ? "기록 중…" : "완료했어요"}
          </button>
        </div>
      </div>
    </div>
  );
}
