// ─── ThumbnailWorkflowPanel ────────────────────────────────────────────────────
// 썸네일 교체 상태 머신 UI
//
// 상태 흐름:
//   IDLE → ANALYZING → PROMPT_READY → WAITING_UPLOAD → PROCESSING → PREVIEW_READY → DONE
//
// Props:
//   videoId   string    대상 video_id
//   title     string    영상 제목 (텍스트 오버레이용)
//   onClose   () => void  패널 닫기

import { useState, useEffect, useCallback } from "react";
import {
  X, Copy, ExternalLink, CheckCircle, AlertTriangle,
  Loader, Eye, Upload, RotateCcw, ChevronRight,
} from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 상태 정의 ────────────────────────────────────────────────────────────────

const STATES = {
  IDLE:           "IDLE",
  ANALYZING:      "ANALYZING",
  PROMPT_READY:   "PROMPT_READY",
  WAITING_UPLOAD: "WAITING_UPLOAD",
  PROCESSING:     "PROCESSING",
  PREVIEW_READY:  "PREVIEW_READY",
  DONE:           "DONE",
};

// 각 상태의 "다음 행동" 안내
const NEXT_ACTION = {
  ANALYZING:      null,
  PROMPT_READY:   "Midjourney 프롬프트를 복사 후 Discord MJ에 붙여넣으세요",
  WAITING_UPLOAD: `이미지 생성 후 uploads/ 폴더에 {videoId}.png 로 저장하세요`,
  PROCESSING:     null,
  PREVIEW_READY:  "A 또는 B 중 하나를 선택해 YouTube Studio에 업로드하세요",
  DONE:           "1주 후 CTR을 확인하고 아래에 기록해주세요",
};

// 문제 코드 → 한국어 레이블
const PROBLEM_LABEL = {
  text_overload:          "텍스트 과다",
  background_bright:      "배경 밝음",
  unclear_silhouette:     "피사체 불명확",
  low_contrast_subject:   "대비 부족",
  generic_thumbnail_weak: "전반적 약화",
};

// 전략 필드 → 레이블
const STRATEGY_LABEL = {
  style:        "스타일",
  composition:  "구도",
  subject_type: "피사체",
  text_mode:    "텍스트",
};

// 업로드 이유 선택지
const UPLOAD_REASONS = [
  { value: "more_eye_catching", label: "더 눈에 띔" },
  { value: "clearer_text",      label: "텍스트 명확" },
  { value: "better_mood",       label: "분위기 좋음" },
  { value: "stronger_subject",  label: "피사체 강함" },
];

// ─── 공통 스타일 ──────────────────────────────────────────────────────────────

const CARD = {
  background:   T.bgCard,
  borderRadius: T.radius.card,
  border:       `1px solid ${T.border}`,
  padding:      "24px",
  boxShadow:    T.shadow.card,
  gridColumn:   "span 12",
};

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function StatusBadge({ state }) {
  const map = {
    IDLE:           { label: "대기",       color: T.muted,   bg: T.bgSection },
    ANALYZING:      { label: "분석 중",    color: T.warn,    bg: T.warnBg },
    PROMPT_READY:   { label: "프롬프트 준비", color: T.primary, bg: T.primarySoft },
    WAITING_UPLOAD: { label: "이미지 대기", color: T.warn,    bg: T.warnBg },
    PROCESSING:     { label: "합성 중",    color: T.warn,    bg: T.warnBg },
    PREVIEW_READY:  { label: "미리보기",   color: T.success, bg: T.successBg },
    DONE:           { label: "완료",       color: T.success, bg: T.successBg },
  };
  const s = map[state] ?? map.IDLE;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: s.color,
      background: s.bg, borderRadius: T.radius.badge,
      padding: "2px 8px", border: `1px solid ${s.color}`,
      fontFamily: "monospace", letterSpacing: "0.05em",
    }}>
      {s.label}
    </span>
  );
}

function NextActionBanner({ text }) {
  if (!text) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: T.spacing.sm,
      padding: "10px 14px",
      background: T.primarySoft, border: `1px solid ${T.primaryBorder}`,
      borderRadius: T.radius.btn, marginBottom: T.spacing.lg,
    }}>
      <ChevronRight size={14} color={T.primary} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: T.primary }}>
        다음 행동:
      </span>
      <span style={{ fontSize: 13, color: T.text }}>{text}</span>
    </div>
  );
}

function ProblemsPanel({ problems }) {
  if (!problems?.length) return null;
  return (
    <div style={{
      flex: 1, padding: "14px 16px",
      background: T.bgSection, borderRadius: T.radius.btn,
      border: `1px solid ${T.border}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: T.spacing.sm,
        letterSpacing: "0.06em", textTransform: "uppercase" }}>
        감지된 문제
      </div>
      {problems.map(p => (
        <div key={p} style={{
          display: "flex", alignItems: "center", gap: T.spacing.xs,
          marginBottom: T.spacing.xs,
        }}>
          <AlertTriangle size={11} color={T.danger} />
          <span style={{ fontSize: 12, color: T.text }}>
            {PROBLEM_LABEL[p] ?? p}
          </span>
        </div>
      ))}
    </div>
  );
}

function StrategyPanel({ strategy }) {
  if (!strategy) return null;
  const fields = ["style", "composition", "subject_type", "text_mode"];
  return (
    <div style={{
      flex: 1, padding: "14px 16px",
      background: T.bgSection, borderRadius: T.radius.btn,
      border: `1px solid ${T.border}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: T.spacing.sm,
        letterSpacing: "0.06em", textTransform: "uppercase" }}>
        교정 전략
      </div>
      {fields.map(f => {
        const val = strategy[f];
        if (!val) return null;
        const display = Array.isArray(val) ? val.join(", ") : val;
        return (
          <div key={f} style={{
            display: "flex", gap: T.spacing.sm,
            marginBottom: T.spacing.xs, alignItems: "baseline",
          }}>
            <span style={{ fontSize: 11, color: T.muted, minWidth: 64 }}>
              {STRATEGY_LABEL[f] ?? f}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.primary, fontFamily: "monospace" }}>
              {display}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PromptBox({ prompt, onConfirmCopied }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenDiscord() {
    window.open("discord://", "_blank");
  }

  return (
    <div style={{
      padding: "14px 16px",
      background: T.terminal ?? T.bgSection,
      borderRadius: T.radius.btn,
      border: `1px solid ${T.border}`,
      marginBottom: T.spacing.md,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted,
        marginBottom: T.spacing.sm, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Midjourney 프롬프트
      </div>
      <div style={{
        fontSize: 12, color: T.text, lineHeight: 1.6,
        fontFamily: "monospace", marginBottom: T.spacing.md,
        wordBreak: "break-all",
      }}>
        {prompt}
      </div>
      <div style={{ display: "flex", gap: T.spacing.sm }}>
        <button
          onClick={handleCopy}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: copied ? T.successBg : T.primarySoft,
            border: `1px solid ${copied ? T.success : T.primaryBorder}`,
            borderRadius: T.radius.btn, padding: "7px 14px",
            cursor: "pointer",
          }}
        >
          <Copy size={12} color={copied ? T.success : T.primary} />
          <span style={{ fontSize: 12, fontWeight: 600, color: copied ? T.success : T.primary }}>
            {copied ? "복사됨 ✓" : "복사"}
          </span>
        </button>
        <button
          onClick={handleOpenDiscord}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: T.bgSection, border: `1px solid ${T.border}`,
            borderRadius: T.radius.btn, padding: "7px 14px",
            cursor: "pointer",
          }}
        >
          <ExternalLink size={12} color={T.muted} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.sub }}>Discord 이동</span>
        </button>
        <button
          onClick={onConfirmCopied}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: T.primarySoft, border: `1px solid ${T.primaryBorder}`,
            borderRadius: T.radius.btn, padding: "7px 14px",
            cursor: "pointer", marginLeft: "auto",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: T.primary }}>복사 완료 → 이미지 대기</span>
          <ChevronRight size={12} color={T.primary} />
        </button>
      </div>
    </div>
  );
}

function WaitingState({ videoId }) {
  return (
    <div style={{
      padding: "20px", textAlign: "center",
      background: T.bgSection, borderRadius: T.radius.btn,
      border: `1px dashed ${T.border}`,
    }}>
      <div style={{
        fontSize: 28, marginBottom: T.spacing.sm,
        animation: "pulse 2s infinite",
      }}>⏳</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: T.spacing.xs }}>
        Midjourney 이미지 대기 중...
      </div>
      <div style={{ fontSize: 12, color: T.muted, fontFamily: "monospace" }}>
        uploads/{videoId}.png
      </div>
      <div style={{ fontSize: 11, color: T.sub, marginTop: T.spacing.sm }}>
        파일 저장 시 자동으로 다음 단계 진행
      </div>
    </div>
  );
}

function ABPreview({ previewA, previewB, selectedVariant, onSelect, uploadReason, onReasonChange }) {
  const variants = [
    { key: "A", label: "Variant A", desc: "미니멀 텍스트 — 척살II 기준", preview: previewA },
    { key: "B", label: "Variant B", desc: "굵은 텍스트 — 군주 기준",   preview: previewB },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.spacing.md, marginBottom: T.spacing.md }}>
        {variants.map(({ key, label, desc, preview }) => {
          const isSelected = selectedVariant === key;
          return (
            <div
              key={key}
              onClick={() => onSelect(key)}
              style={{
                borderRadius: T.radius.card,
                border: `2px solid ${isSelected ? T.primary : T.border}`,
                background: isSelected ? T.primarySoft : T.bgSection,
                padding: T.spacing.md,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {/* 썸네일 미리보기 */}
              {preview ? (
                <img
                  src={preview}
                  alt={label}
                  style={{
                    width: "100%", borderRadius: T.radius.btn,
                    marginBottom: T.spacing.sm, display: "block",
                    aspectRatio: "16/9", objectFit: "cover",
                  }}
                />
              ) : (
                <div style={{
                  width: "100%", aspectRatio: "16/9",
                  background: T.bgApp, borderRadius: T.radius.btn,
                  marginBottom: T.spacing.sm,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Eye size={20} color={T.muted} />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? T.primary : T.text }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted }}>{desc}</div>
                </div>
                {isSelected && <CheckCircle size={16} color={T.primary} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택 이유 */}
      {selectedVariant && (
        <div style={{
          padding: "12px 14px",
          background: T.bgSection, borderRadius: T.radius.btn,
          border: `1px solid ${T.border}`, marginBottom: T.spacing.md,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted,
            marginBottom: T.spacing.sm, letterSpacing: "0.06em" }}>
            선택 이유 (나중에 데이터가 됩니다)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
            {UPLOAD_REASONS.map(r => (
              <label key={r.value} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="upload_reason"
                  value={r.value}
                  checked={uploadReason === r.value}
                  onChange={() => onReasonChange(r.value)}
                  style={{ accentColor: T.primary }}
                />
                <span style={{ fontSize: 12, color: T.text }}>{r.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function ThumbnailWorkflowPanel({ videoId, title, onClose, onComplete, inline = false }) {
  const [state,           setState]           = useState(STATES.IDLE);
  const [analysis,        setAnalysis]        = useState(null);
  const [error,           setError]           = useState(null);
  const [previewA,        setPreviewA]        = useState(null);
  const [previewB,        setPreviewB]        = useState(null);
  const [renderResult,    setRenderResult]    = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [uploadReason,    setUploadReason]    = useState(null);

  const api = window.api;

  // ── 마운트 시 자동 분석 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!api?.thumbnailAnalyze) return;
    setState(STATES.ANALYZING);
    api.thumbnailAnalyze(videoId, title)
      .then(result => {
        if (result?.error) {
          setError(result.error);
          setState(STATES.IDLE);
        } else {
          setAnalysis(result);
          setState(STATES.PROMPT_READY);
        }
      })
      .catch(e => {
        setError(String(e));
        setState(STATES.IDLE);
      });
  }, [videoId, title]);

  // ── IPC 이벤트 리스너 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!api?.on) return;

    api.on("thumbnail:file-detected", ({ videoId: vid }) => {
      if (vid !== videoId) return;
      setState(STATES.PROCESSING);
      api.thumbnailWatchStop?.(videoId);
      api.thumbnailRender?.(videoId, title);
    });

    api.on("thumbnail:done", async (result) => {
      if (result.videoId !== videoId) return;
      setRenderResult(result);
      // AI 생성 완료 = 실제 행동 확인 → COMPLETE 자동 기록
      onComplete?.();

      // 미리보기 이미지 로드
      if (result.outputA) {
        const imgA = await api.thumbnailReadImage?.(result.outputA);
        if (imgA) setPreviewA(imgA);
      }
      if (result.outputB) {
        const imgB = await api.thumbnailReadImage?.(result.outputB);
        if (imgB) setPreviewB(imgB);
      }
      setState(STATES.PREVIEW_READY);
    });

    api.on("thumbnail:error", ({ videoId: vid, error: err }) => {
      if (vid !== videoId) return;
      setError(err);
      setState(STATES.PROMPT_READY);
    });

    return () => {
      api.off?.("thumbnail:file-detected");
      api.off?.("thumbnail:done");
      api.off?.("thumbnail:error");
      api.thumbnailWatchStop?.(videoId);
    };
  }, [videoId, title]);

  // ── 핸들러 ────────────────────────────────────────────────────────────────

  function handleConfirmCopied() {
    setState(STATES.WAITING_UPLOAD);
    api?.thumbnailWatchStart?.(videoId);
  }

  function handleSelectVariant(variant) {
    setSelectedVariant(variant);
  }

  async function handleUpload() {
    if (!selectedVariant || !renderResult) return;

    const uploadAt = new Date().toISOString().slice(0, 16);
    const ytUrl    = `https://studio.youtube.com/video/${videoId}/edit`;

    // 보강 2: prompt 메타 포함 A/B 로그 업데이트 (성공 패턴 추출 기반)
    await api?.thumbnailUpdateLog?.({
      video_id:              videoId,
      selected_variant:      selectedVariant,
      upload_reason:         uploadReason,
      upload_at:             uploadAt,
      // 프롬프트 학습 데이터 — 나중에 "성공 프롬프트 패턴" 분석에 사용
      prompt_text:           analysis?.prompt ?? null,
      strategy_style:        analysis?.strategy?.style ?? null,
      strategy_composition:  analysis?.strategy?.composition ?? null,
      strategy_subject:      analysis?.strategy?.subject_type ?? null,
    });

    // 보강 1: action_tracker 연결 → check_results()가 3일 후 CTR 변화로 SUCCESS/FAILED 자동 판정
    await api?.registerActionComplete?.({
      video_id:     videoId,
      action_type:  "CTR_WEAK",
      action_label: "THUMBNAIL",
      source:       "thumbnail_workflow",
      timestamp:    uploadAt,
    }).catch(() => {});

    window.open(ytUrl, "_blank");
    setState(STATES.DONE);
  }

  async function handleUploadBoth() {
    const uploadAt = new Date().toISOString().slice(0, 16);
    const ytUrl    = `https://studio.youtube.com/video/${videoId}/edit`;

    // 둘 다 업로드 시에도 action_tracker + prompt 로그 기록
    await api?.thumbnailUpdateLog?.({
      video_id:             videoId,
      selected_variant:     "BOTH",
      upload_reason:        "ab_test",
      upload_at:            uploadAt,
      prompt_text:          analysis?.prompt ?? null,
      strategy_style:       analysis?.strategy?.style ?? null,
      strategy_composition: analysis?.strategy?.composition ?? null,
      strategy_subject:     analysis?.strategy?.subject_type ?? null,
    });

    await api?.registerActionComplete?.({
      video_id:     videoId,
      action_type:  "CTR_WEAK",
      action_label: "THUMBNAIL",
      source:       "thumbnail_workflow",
      timestamp:    uploadAt,
    }).catch(() => {});

    window.open(ytUrl, "_blank");
    setState(STATES.DONE);
  }

  function _resetToAnalyze(cb) {
    setError(null);
    setAnalysis(null);
    setPreviewA(null);
    setPreviewB(null);
    setRenderResult(null);
    setSelectedVariant(null);
    setUploadReason(null);
    setState(STATES.ANALYZING);
    cb();
  }

  function handleRetry() {
    _resetToAnalyze(() => {
      api?.thumbnailAnalyze?.(videoId, title)
        .then(result => {
          if (result?.error) { setError(result.error); setState(STATES.IDLE); }
          else { setAnalysis(result); setState(STATES.PROMPT_READY); }
        })
        .catch(e => { setError(String(e)); setState(STATES.IDLE); });
    });
  }

  // 보강 3: 실패 후 다른 스타일로 재시도 — 이전 style을 피해 새 프롬프트 생성
  // prev_style을 query param으로 전달 → 백엔드에서 다른 스타일 선택
  function handleRetryDifferent() {
    const prevStyle = analysis?.strategy?.style ?? null;
    _resetToAnalyze(() => {
      // thumbnailAnalyze IPC 시그니처: (videoId, title)
      // prev_style은 title 뒤에 힌트로 포함해 백엔드에 전달
      const titleWithHint = prevStyle
        ? `${title} [avoid:${prevStyle}]`
        : title;
      api?.thumbnailAnalyze?.(videoId, titleWithHint)
        .then(result => {
          if (result?.error) { setError(result.error); setState(STATES.IDLE); }
          else { setAnalysis(result); setState(STATES.PROMPT_READY); }
        })
        .catch(e => { setError(String(e)); setState(STATES.IDLE); });
    });
  }

  // ── 다음 행동 텍스트 ───────────────────────────────────────────────────────
  const nextAction = NEXT_ACTION[state]?.replace("{videoId}", videoId);

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  const containerStyle = inline
    ? {
        background:   T.bgSection,
        borderRadius: T.radius.btn,
        border:       `1px solid ${T.borderSoft}`,
        padding:      "16px 20px",
      }
    : CARD;

  return (
    <div style={containerStyle}>

      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
            썸네일 교체
          </span>
          <span style={{
            fontSize: 12, fontFamily: "monospace",
            color: T.primary, fontWeight: 600,
          }}>
            [{title}]
          </span>
          <StatusBadge state={state} />
        </div>
        <button
          onClick={onClose}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: T.muted, padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* ── 에러 ─────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", background: T.dangerBg,
          border: `1px solid ${T.danger}`, borderRadius: T.radius.btn,
          marginBottom: T.spacing.md,
        }}>
          <span style={{ fontSize: 12, color: T.danger }}>{error}</span>
          <button onClick={handleRetry} style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer",
          }}>
            <RotateCcw size={13} color={T.danger} />
            <span style={{ fontSize: 11, color: T.danger }}>재시도</span>
          </button>
        </div>
      )}

      {/* ── 다음 행동 배너 ───────────────────────────────────────────────── */}
      <NextActionBanner text={nextAction} />

      {/* ── ANALYZING ────────────────────────────────────────────────────── */}
      {state === STATES.ANALYZING && (
        <div style={{
          display: "flex", alignItems: "center", gap: T.spacing.md,
          padding: "20px", justifyContent: "center",
        }}>
          <Loader size={20} color={T.primary} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.sub }}>문제 진단 중...</span>
        </div>
      )}

      {/* ── PROMPT_READY / WAITING_UPLOAD: 문제 + 전략 + 프롬프트 ─────────── */}
      {(state === STATES.PROMPT_READY || state === STATES.WAITING_UPLOAD) && analysis && (
        <>
          {/* 문제 + 전략 나란히 */}
          <div style={{ display: "flex", gap: T.spacing.md, marginBottom: T.spacing.md }}>
            <ProblemsPanel problems={analysis.problems} />
            <StrategyPanel strategy={analysis.strategy} />
          </div>

          {state === STATES.PROMPT_READY && (
            <PromptBox
              prompt={analysis.prompt}
              onConfirmCopied={handleConfirmCopied}
            />
          )}

          {state === STATES.WAITING_UPLOAD && (
            <WaitingState videoId={videoId} />
          )}
        </>
      )}

      {/* ── PROCESSING ───────────────────────────────────────────────────── */}
      {state === STATES.PROCESSING && (
        <div style={{
          display: "flex", alignItems: "center", gap: T.spacing.md,
          padding: "20px", justifyContent: "center",
        }}>
          <Loader size={20} color={T.primary} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 13, color: T.sub }}>A/B 변형 합성 중...</span>
        </div>
      )}

      {/* ── PREVIEW_READY ────────────────────────────────────────────────── */}
      {state === STATES.PREVIEW_READY && (
        <>
          <ABPreview
            previewA={previewA}
            previewB={previewB}
            selectedVariant={selectedVariant}
            onSelect={handleSelectVariant}
            uploadReason={uploadReason}
            onReasonChange={setUploadReason}
          />

          {/* 업로드 버튼 */}
          <div style={{ display: "flex", gap: T.spacing.sm, justifyContent: "flex-end" }}>
            <button
              onClick={handleUploadBoth}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: T.bgSection, border: `1px solid ${T.border}`,
                borderRadius: T.radius.btn, padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              <Upload size={12} color={T.sub} />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.sub }}>둘 다 업로드</span>
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedVariant}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: selectedVariant ? T.primary : T.bgSection,
                border: `1px solid ${selectedVariant ? T.primary : T.border}`,
                borderRadius: T.radius.btn, padding: "8px 16px",
                cursor: selectedVariant ? "pointer" : "default",
                opacity: selectedVariant ? 1 : 0.5,
              }}
            >
              <Upload size={12} color={selectedVariant ? "#fff" : T.muted} />
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: selectedVariant ? "#fff" : T.muted,
              }}>
                {selectedVariant ? `Variant ${selectedVariant} 업로드 →` : "변형 선택 필요"}
              </span>
            </button>
          </div>
        </>
      )}

      {/* ── DONE ─────────────────────────────────────────────────────────── */}
      {state === STATES.DONE && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "20px", gap: T.spacing.md,
        }}>
          <CheckCircle size={32} color={T.success} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              업로드 완료
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
              action_tracker에 등록됨 — 3일 후 CTR 변화로 자동 SUCCESS / FAILED 판정.
            </div>
          </div>

          {/* 버튼 그룹 */}
          <div style={{ display: "flex", gap: T.spacing.sm, flexWrap: "wrap", justifyContent: "center" }}>
            <a
              href={`https://studio.youtube.com/video/${videoId}/edit`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: T.bgSection, border: `1px solid ${T.border}`,
                borderRadius: T.radius.btn, padding: "7px 12px",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={12} color={T.muted} />
              <span style={{ fontSize: 11, color: T.sub }}>Studio 확인</span>
            </a>

            {/* 보강 3: 실패 대비 재시도 루프 */}
            <button
              onClick={handleRetryDifferent}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: T.bgSection,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius.btn, padding: "7px 12px",
                cursor: "pointer",
              }}
            >
              <RotateCcw size={11} color={T.sub} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.sub }}>
                다른 스타일 재시도
              </span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: T.primarySoft, border: `1px solid ${T.primaryBorder}`,
                borderRadius: T.radius.btn, padding: "7px 16px",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: T.primary }}>닫기</span>
            </button>
          </div>
        </div>
      )}

      {/* ── spin/pulse keyframes ─────────────────────────────────────────── */}
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

    </div>
  );
}
