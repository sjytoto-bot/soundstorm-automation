// ─── ABTrackerPanel.jsx ────────────────────────────────────────────────────────
// thumbnail_intelligence/output/thumbnail_tests.json 기반 A/B 테스트 결과 추적
//
// 두 레이어:
//   1) 결과 요약 (Winner + CTR diff)
//   2) WhyWon 분석 — 스타일·템플릿·포지션·카피 차이 기반 원인 추출
//
// Props: 없음 (자체 데이터 로드)

import { useState, useEffect } from "react";
import { Image, Trophy, HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── WhyWon 분석 엔진 ─────────────────────────────────────────────────────────

const STYLE_KO = {
  high_contrast: "고대비",
  text_overlay:  "텍스트 오버레이",
  dark:          "다크",
  oriental:      "오리엔탈",
  minimal:       "미니멀",
  bright:        "밝은 톤",
  red_dominant:  "레드 강조",
  neutral:       "뉴트럴",
};

const TEMPLATE_KO = {
  battle:   "배틀",
  assassin: "어쌔신",
  oriental: "오리엔탈",
  minimal:  "미니멀",
  default:  "기본",
};

const POSITION_KO = {
  bottom_center: "하단 중앙",
  bottom_right:  "하단 우측",
  top_right:     "상단 우측",
  top_left:      "상단 좌측",
  center:        "중앙",
};

function styleKo(s)    { return STYLE_KO[s]    ?? s; }
function templateKo(t) { return TEMPLATE_KO[t] ?? t; }
function positionKo(p) { return POSITION_KO[p] ?? p; }

/**
 * A/B 테스트에서 "왜 이겼는가" 인사이트를 추출한다.
 * winner가 없을 경우 구조적 차이만 반환.
 */
function analyzeWhyWon(test) {
  const { variant_a, variant_b, winner } = test;
  if (!variant_a || !variant_b) return [];

  const w = winner === "A" ? variant_a : winner === "B" ? variant_b : null;
  const l = winner === "A" ? variant_b : winner === "B" ? variant_a : null;

  const insights = [];

  // ── CTR 차이 (측정값이 있을 때만) ────────────────────────────────────────
  if (w && l && (w.estimated_ctr > 0 || l.estimated_ctr > 0)) {
    const diff = (w.estimated_ctr - l.estimated_ctr) * 100;
    if (Math.abs(diff) >= 0.01) {
      insights.push({
        type:   "ctr",
        label:  `CTR +${diff.toFixed(1)}%`,
        detail: `${styleKo(w.style)} 스타일이 ${styleKo(l.style)} 대비 CTR 우위`,
        strong: true,
      });
    }
  }

  // ── 스타일 차이 ───────────────────────────────────────────────────────────
  if (variant_a.style !== variant_b.style) {
    const winStyle  = w ? styleKo(w.style) : null;
    const loseStyle = l ? styleKo(l.style) : null;
    insights.push({
      type:   "style",
      label:  winStyle ? `${winStyle} 스타일 채택` : `스타일: ${styleKo(variant_a.style)} vs ${styleKo(variant_b.style)}`,
      detail: winStyle
        ? `${loseStyle} 대비 시각 임팩트 우위`
        : "시각 스타일 차이 — YouTube CTR 측정으로 승자 확인 필요",
      strong: !!winStyle,
    });
  }

  // ── 템플릿 차이 ───────────────────────────────────────────────────────────
  if (variant_a.template !== variant_b.template) {
    const winTmpl  = w ? templateKo(w.template) : null;
    const loseTmpl = l ? templateKo(l.template) : null;
    insights.push({
      type:   "template",
      label:  winTmpl ? `${winTmpl} 템플릿 우세` : `템플릿: ${templateKo(variant_a.template)} vs ${templateKo(variant_b.template)}`,
      detail: winTmpl
        ? `${loseTmpl} 템플릿 대비 시청자 반응 우위`
        : "레이아웃 구조 차이 — 클릭률 비교 필요",
      strong: !!winTmpl,
    });
  }

  // ── 텍스트 포지션 차이 ────────────────────────────────────────────────────
  if (variant_a.position !== variant_b.position) {
    const winPos  = w ? positionKo(w.position) : null;
    const losePos = l ? positionKo(l.position) : null;
    insights.push({
      type:   "position",
      label:  winPos ? `텍스트 ${winPos} 배치 효과적` : `배치: ${positionKo(variant_a.position)} vs ${positionKo(variant_b.position)}`,
      detail: winPos
        ? `${losePos} 배치 대비 시인성 우위`
        : "텍스트 위치 차이 — 모바일 노출 환경에서 특히 중요",
      strong: !!winPos,
    });
  }

  // ── 카피 차이 (텍스트) ───────────────────────────────────────────────────
  if (variant_a.text !== variant_b.text) {
    const winText  = w?.text;
    const loseText = l?.text;
    insights.push({
      type:   "copy",
      label:  winText ? `"${winText}" 카피 선택` : `카피: "${variant_a.text}" vs "${variant_b.text}"`,
      detail: winText
        ? `"${loseText}" 대비 클릭 유발 표현 우위`
        : "카피 메시지 차이 — 장르/테마 일치도 확인",
      strong: !!winText,
    });
  }

  return insights;
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function fmtDate(str) { return str?.slice(0, 10) ?? "—"; }

// ─── WhySection ───────────────────────────────────────────────────────────────

function WhySection({ test }) {
  const [open, setOpen] = useState(false);
  const insights = analyzeWhyWon(test);
  if (!insights.length) return null;

  const hasWinner = !!test.winner;
  const headerColor = hasWinner ? T.success : T.sub;
  const headerLabel = hasWinner ? "왜 이겼는가" : "구조 분석";

  return (
    <div style={{ marginTop: T.spacing.sm, paddingLeft: T.spacing.md, borderLeft: `2px solid ${T.borderSoft}` }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: T.spacing.xs,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        {open
          ? <ChevronDown size={10} color={headerColor} />
          : <ChevronRight size={10} color={headerColor} />}
        <span style={{ fontSize: 11, fontWeight: 700, color: headerColor }}>
          {headerLabel}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: T.spacing.xs, display: "flex", flexDirection: "column", gap: 6 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: T.spacing.sm }}>
              <span style={{
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                color:      ins.strong ? T.success : T.sub,
                background: ins.strong ? T.successBg : T.bgSection,
                border:    `1px solid ${ins.strong ? T.successBorder : T.border}`,
                borderRadius: T.radius.badge,
                padding:   "1px 6px",
                whiteSpace: "nowrap",
              }}>
                {ins.label}
              </span>
              <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, marginTop: 1 }}>
                {ins.detail}
              </span>
            </div>
          ))}

          {/* CTR 미측정 안내 */}
          {!test.winner && (
            <div style={{
              fontSize: 10, color: T.warn, marginTop: 2,
              background: T.warnBg, borderRadius: T.radius.btn,
              padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
            }}>
              YouTube Studio에서 실제 CTR 비교 후 승자 데이터를 업데이트하면
              Style Intelligence가 학습합니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── VariantChip ──────────────────────────────────────────────────────────────

function VariantChip({ label, variant, isWinner }) {
  if (!variant) return null;
  const ctr     = variant.estimated_ctr ?? 0;
  const hasData = ctr > 0;
  const color   = isWinner ? T.success : T.sub;
  const bg      = isWinner ? T.successBg : T.bgSection;
  const border  = isWinner ? T.successBorder : T.border;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           2,
      padding:       `${T.spacing.xs}px ${T.spacing.sm}px`,
      background:    bg,
      border:        `1px solid ${border}`,
      borderRadius:  T.radius.btn,
      minWidth:      80, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {isWinner && <Trophy size={9} color={T.success} />}
        <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "monospace" }}>{label}</span>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, fontFamily: "monospace",
        color: hasData ? T.primary : T.muted,
      }}>
        {hasData ? `CTR ${(ctr * 100).toFixed(1)}%` : "CTR 미측정"}
      </span>
      <span style={{ fontSize: 9, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {styleKo(variant.style ?? "")} / {templateKo(variant.template ?? "")}
      </span>
    </div>
  );
}

// ─── TestRow ──────────────────────────────────────────────────────────────────

function TestRow({ test, isLast }) {
  const { theme, created_at, variant_a, variant_b, winner } = test;
  const noData = !winner && variant_a?.estimated_ctr === 0 && variant_b?.estimated_ctr === 0;

  return (
    <div style={{
      padding:      `${T.spacing.sm}px 0`,
      borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
    }}>
      {/* 상단 행: 테마 + 날짜 + 배리언트 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
        {/* 테마 + 날짜 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {theme}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2, display: "flex", alignItems: "center", gap: T.spacing.sm }}>
            {fmtDate(created_at)}
            {winner ? (
              <span style={{
                fontSize: 10, fontWeight: 700, color: T.success,
                background: T.successBg, borderRadius: T.radius.badge,
                padding: "1px 5px", border: `1px solid ${T.successBorder}`,
              }}>
                Winner {winner}
              </span>
            ) : noData ? (
              <span style={{
                fontSize: 10, fontWeight: 600, color: T.warn,
                background: T.warnBg, borderRadius: T.radius.badge,
                padding: "1px 5px", border: `1px solid ${T.borderColor.warning}`,
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <HelpCircle size={9} /> CTR 측정 대기
              </span>
            ) : null}
          </div>
        </div>

        {/* A / B 배리언트 비교 */}
        <div style={{ display: "flex", gap: T.spacing.sm, flexShrink: 0 }}>
          <VariantChip label="A" variant={variant_a} isWinner={winner === "A"} />
          <VariantChip label="B" variant={variant_b} isWinner={winner === "B"} />
        </div>
      </div>

      {/* 하단: WhyWon 분석 */}
      <WhySection test={test} />
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function ABTrackerPanel() {
  const [tests,   setTests]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const api = window.api;
    if (!api?.readAbTests) { setLoading(false); return; }
    api.readAbTests()
      .then(data => setTests(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const withWinner    = tests.filter(t => t.winner);
  const withoutWinner = tests.filter(t => !t.winner);

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.xl,
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.lg }}>
        <Image size={14} color={T.primary} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>썸네일 A/B 추적</span>
        {!loading && tests.length > 0 && (
          <>
            {withWinner.length > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: T.success,
                background: T.successBg, borderRadius: T.radius.badge,
                padding: "1px 6px", border: `1px solid ${T.successBorder}`,
              }}>
                완료 {withWinner.length}건
              </span>
            )}
            {withoutWinner.length > 0 && (
              <span style={{
                fontSize: 10, color: T.warn,
                background: T.warnBg, borderRadius: T.radius.badge,
                padding: "1px 6px", border: `1px solid ${T.borderColor.warning}`,
              }}>
                측정 대기 {withoutWinner.length}건
              </span>
            )}
          </>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
          Style Intelligence 연동
        </span>
      </div>

      {/* 콘텐츠 */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: "flex", gap: T.spacing.md, alignItems: "center" }}>
              <span className="skeleton" style={{ flex: 1, height: 36 }} />
              <span className="skeleton" style={{ width: 80, height: 36 }} />
              <span className="skeleton" style={{ width: 80, height: 36 }} />
            </div>
          ))}
        </div>
      ) : tests.length === 0 ? (
        <div style={{ fontSize: 13, color: T.muted, padding: `${T.spacing.lg}px 0` }}>
          A/B 테스트 데이터 없음
          <div style={{ fontSize: 11, color: T.muted, marginTop: T.spacing.xs }}>
            thumbnail_intelligence/ab_test_api.py 실행 후 데이터가 표시됩니다
          </div>
        </div>
      ) : (
        <div>
          {tests.map((test, i) => (
            <TestRow
              key={test.test_id ?? i}
              test={test}
              isLast={i === tests.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
