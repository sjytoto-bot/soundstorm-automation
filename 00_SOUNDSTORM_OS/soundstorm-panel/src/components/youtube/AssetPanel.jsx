import { useState } from "react";
import { T } from "../../styles/tokens";
import { sortTracks } from "../../utils/strategyScore";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  white:  T.bgCard,
  bg:     T.bgApp,
  border: T.border,
  text:   T.text,
  sub:    T.sub,
  muted:  T.muted,
};

// 등급 → 컬러 매핑 (T.color 토큰 외 색상 사용 금지)
const GRADE_COLOR = {
  A: T.color.success,
  B: T.color.primary,
  C: T.color.warning,
  D: T.color.danger,
};

// 등급 → 배경 매핑 (기존 top-level T 토큰 활용)
const GRADE_BG = {
  A: T.successBg,
  B: T.primarySoft,
  C: T.warnBg,
  D: T.dangerBg,
};

// 4축 라벨 정의
const AXIS_LABELS = {
  growth:       "Growth",
  reach:        "Reach",
  engagement:   "Engage",
  monetization: "Monetize",
};

// sort 옵션
const SORT_OPTIONS = [
  { key: "strategy",     label: "TOTAL"    },
  { key: "reach",        label: "REACH"    },
  { key: "engagement",   label: "ENGAGE"   },
  { key: "growth",       label: "GROWTH"   },
  { key: "monetization", label: "MONETIZE" },
];

// ─── AssetPanel ────────────────────────────────────────────────────────────────
// Props
//   tracksWithScore  Array<{ id, name, strategy: { growth, reach, engagement,
//                    monetization, total, grade } }>

export default function AssetPanel({ tracksWithScore, onSelectTrack, selectedTrackId }) {
  const [sortKey, setSortKey] = useState("strategy");

  const sorted = sortTracks(tracksWithScore, sortKey);

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.border}`,
      borderRadius: T.radius.card,
      padding:      "20px 24px",
      boxShadow:    T.shadow.card,
    }}>

      {/* ── 헤더: 제목 + sort 선택 ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: T.spacing.lg,
      }}>
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
          Asset Strategy Scores
        </span>

        {/* Sort 선택 — select */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: "monospace", letterSpacing: "0.06em" }}>
            SORT
          </span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            style={{
              fontSize: 10, fontFamily: "monospace", letterSpacing: "0.06em",
              padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
              border: `1px solid ${C.border}`, borderRadius: T.radius.badge,
              background: C.bg, color: C.sub, cursor: "pointer", outline: "none",
            }}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Track 행 목록 ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
        {sorted.map((track, idx) => {
          const s          = track.strategy;
          const gradeColor = GRADE_COLOR[s.grade] ?? C.muted;
          const gradeBg    = GRADE_BG[s.grade]    ?? C.bg;
          const isTop3     = idx < 3;

          const isSelected = selectedTrackId === track.id;

          return (
            <div
              key={track.id}
              onClick={() => onSelectTrack?.(track.id)}
              style={{
                display:             "grid",
                gridTemplateColumns: "140px 1fr auto",
                alignItems:          "center",
                gap:                 T.spacing.md,
                padding:             `${T.spacing.sm}px ${T.spacing.md}px`,
                borderRadius:        T.radius.btn,
                // Top3: 왼쪽 4px 컬러 스트립 (T.spacing.xs = 4px)
                border:     `1px solid ${isSelected ? gradeColor : C.border}`,
                borderLeft: isTop3 || isSelected
                  ? `${T.spacing.xs}px solid ${gradeColor}`
                  : `1px solid ${C.border}`,
                background: isSelected ? gradeBg : C.bg,
                cursor:     "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {/* 트랙명 + Top3 순위 */}
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, minWidth: 0 }}>
                {isTop3 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                    color: gradeColor, flexShrink: 0,
                  }}>
                    #{idx + 1}
                  </span>
                )}
                <span style={{
                  fontSize: 13, fontWeight: isTop3 ? 600 : 500, color: C.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {track.name}
                </span>
              </div>

              {/* 4축 미니바 + total */}
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
                {/* 4축 스택 바 */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
                  {Object.entries(AXIS_LABELS).map(([axis, label]) => (
                    <div key={axis} style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
                      <span style={{
                        fontSize: 9, color: C.muted, fontFamily: "monospace",
                        width: 52, flexShrink: 0, letterSpacing: "0.04em",
                      }}>
                        {label}
                      </span>
                      <div style={{
                        flex: 1, height: 3,
                        background: C.border, borderRadius: T.radius.pill,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${s[axis]}%`,
                          background: gradeColor,
                          borderRadius: T.radius.pill,
                          transition: "width 0.3s",
                        }} />
                      </div>
                      <span style={{
                        fontSize: 9, color: C.muted, fontFamily: "monospace",
                        width: 22, textAlign: "right", flexShrink: 0,
                      }}>
                        {s[axis]}
                      </span>
                    </div>
                  ))}
                </div>

                {/* total 점수 + delta */}
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-end",
                  minWidth: 44, flexShrink: 0,
                }}>
                  <span style={{
                    fontSize: isTop3 ? 20 : 18, fontWeight: 800,
                    color: gradeColor, fontFamily: "monospace",
                    lineHeight: 1,
                    transition: "font-size 0.15s",
                  }}>
                    {s.total}
                  </span>
                  <span style={{
                    fontSize: 9, fontFamily: "monospace", fontWeight: 600,
                    lineHeight: 1.4, letterSpacing: "0.02em",
                    color: s.delta > 5
                      ? T.color.success
                      : s.delta < -5
                        ? T.color.danger
                        : C.muted,
                  }}>
                    {s.delta > 0 ? `+${s.delta} ↑` : s.delta < 0 ? `${s.delta} ↓` : `0 –`}
                  </span>
                </div>
              </div>

              {/* ── 등급 배지 (STEP 4 강화) ──────────────────────────────────────
                   padding: T.spacing.xs / T.spacing.sm (4px / 8px)
                   fontWeight: T.font.weight.semibold (600)
                   background: 기존 GRADE_BG 토큰 활용 (successBg 등)
                   border: gradeColor + "33" hex alpha (rgba 직접 작성 금지)    */}
              <span style={{
                fontSize: 12,
                fontWeight: T.font.weight.semibold,
                padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
                borderRadius: T.radius.badge,
                background: gradeBg,
                color: gradeColor,
                border: `1px solid ${gradeColor}33`,
                fontFamily: "monospace",
                letterSpacing: "0.06em",
                flexShrink: 0,
              }}>
                {s.grade}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
