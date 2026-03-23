// ─── BlockManagerPanel ────────────────────────────────────────────────────────
// 우측 고정 패널 (340px) — Block Widget Gallery
//
// v4 설계:
//   - 위젯 카드 갤러리 — 드래그해서 대시보드에 배치
//   - 정렬: 🔥 추천 → ● ON → ○ OFF
//   - 배치 버튼 (추천 ≥2개): "[블록A + 블록B 켜기]"
//   - 즉시 피드백 toast (300ms)
//   - 추천 처리 후 🔥 사라짐 (handledIds)

import { useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { T } from "../styles/tokens";
import { useBlocks } from "../contexts/BlocksContext";
import WidgetCard from "./dashboard/WidgetCard";

export default function BlockManagerPanel({ collapsed, onToggle, width = 340 }) {
  const {
    visibility, layout, updateLayout,
    toggleOffWithSave, toggleOnWithRestore,
    defs, blockMeta, isRecommended, markHandled, markAllHandled,
  } = useBlocks();

  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // ── 정렬: 🔥 추천 → ● ON → ○ OFF ─────────────────────────────────────────
  const sortedDefs = [...defs].sort((a, b) => {
    const score = (d) => isRecommended(d.id) ? 2 : (visibility[d.id] ? 1 : 0);
    return score(b) - score(a);
  });

  const recommendedIds = defs.filter(d => isRecommended(d.id)).map(d => d.id);

  // ── 토글 핸들러 (savedPosition 기반) ───────────────────────────────────────
  function handleToggle(id) {
    if (visibility[id]) {
      toggleOffWithSave(id);
    } else {
      toggleOnWithRestore(id);
      if (isRecommended(id)) {
        markHandled(id);
        showFeedback(`✔ ${defs.find(d => d.id === id)?.label} 활성화됨`);
      }
    }
  }

  // ── 배치 적용 (추천 전체) ─────────────────────────────────────────────────
  function handleBatchApply() {
    recommendedIds.forEach(id => {
      if (!visibility[id]) toggleOnWithRestore(id);
      updateLayout(id, { pinned: true });
    });
    markAllHandled(recommendedIds);
    showFeedback(`✔ 추천 블록 ${recommendedIds.length}개 활성화됨`);
  }

  function showFeedback(msg) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 2000);
  }

  // ── 배치 버튼 라벨 ────────────────────────────────────────────────────────
  function batchLabel() {
    if (recommendedIds.length < 2) return null;
    const names = recommendedIds.map(id => defs.find(d => d.id === id)?.label ?? id);
    if (names.length === 2) return `${names[0]} + ${names[1]} 켜기`;
    return `추천 블록 ${names.length}개 활성화`;
  }
  const batch = batchLabel();

  // ── Collapsed 상태 ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div style={{
        width:         40,
        borderLeft:    `1px solid ${T.border}`,
        background:    T.bgCard,
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        paddingTop:    T.spacing.lg,
        gap:           T.spacing.md,
        flexShrink:    0,
      }}>
        <button
          onClick={onToggle}
          title="블록 관리 열기"
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            width: 32, height: 32,
            borderRadius:   T.radius.btn,
            border:         `1px solid ${T.border}`,
            background:     "transparent",
            cursor:         "pointer",
          }}
        >
          <ChevronLeft size={14} color={T.sub} />
        </button>
        {recommendedIds.length > 0 && (
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: T.warn,
          }} />
        )}
      </div>
    );
  }

  return (
    <div style={{
      width:         width,
      flexShrink:    0,
      borderLeft:    `1px solid ${T.border}`,
      background:    T.bgCard,
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
    }}>

      {/* ── 헤더 ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        `0 ${T.spacing.md}px`,
        height:         56,
        borderBottom:   `1px solid ${T.border}`,
        flexShrink:     0,
        gap:            T.spacing.sm,
      }}>
        <span style={{
          fontSize:      10,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          fontFamily:    T.font.familyMono,
          letterSpacing: "0.1em",
          whiteSpace:    "nowrap",
        }}>
          BLOCK MANAGER
        </span>

        {batch && (
          <button
            onClick={handleBatchApply}
            style={{
              flex:         1,
              height:       28,
              padding:      `0 ${T.spacing.sm}px`,
              background:   T.warnBg,
              border:       `1px solid ${T.warn}60`,
              borderRadius: T.radius.btn,
              cursor:       "pointer",
              fontSize:     9,
              fontWeight:   T.font.weight.bold,
              color:        T.warn,
              fontFamily:   T.font.familyMono,
              whiteSpace:   "nowrap",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              transition:   "opacity 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            title={batch}
          >
            {batch}
          </button>
        )}

        <button
          onClick={onToggle}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            width: 28, height: 28,
            borderRadius:   T.radius.btn,
            border:         `1px solid ${T.border}`,
            background:     "transparent",
            cursor:         "pointer",
            flexShrink:     0,
          }}
        >
          <ChevronRight size={13} color={T.sub} />
        </button>
      </div>

      {/* ── 피드백 Toast ── */}
      {feedbackMsg && (
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        T.spacing.xs,
          padding:    `${T.spacing.xs}px ${T.spacing.md}px`,
          background: T.successBg,
          borderBottom: `1px solid ${T.success}30`,
          flexShrink: 0,
        }}>
          <CheckCircle size={12} color={T.success} />
          <span style={{
            fontSize: 11, color: T.success,
            fontFamily: T.font.familyMono, fontWeight: T.font.weight.semibold,
          }}>
            {feedbackMsg}
          </span>
        </div>
      )}

      {/* ── 안내 문구 ── */}
      <div style={{
        padding:    `${T.spacing.xs}px ${T.spacing.md}px`,
        fontSize:   9,
        color:      T.muted,
        fontFamily: T.font.familyMono,
        borderBottom: `1px solid ${T.borderSoft}`,
        flexShrink: 0,
      }}>
        드래그해서 대시보드에 배치
      </div>

      {/* ── 위젯 카드 목록 ── */}
      <div style={{
        flex:          1,
        overflowY:     "auto",
        padding:       T.spacing.xs,
        display:       "flex",
        flexDirection: "column",
        gap:           T.spacing.xs,
      }}>
        {sortedDefs.map(def => (
          <WidgetCard
            key={def.id}
            id={def.id}
            def={def}
            meta={blockMeta[def.id] ?? {}}
            isOn={visibility[def.id] ?? false}
            isRecommended={isRecommended(def.id)}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
}
