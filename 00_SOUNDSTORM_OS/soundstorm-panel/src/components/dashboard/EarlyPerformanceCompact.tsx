// ─── EarlyPerformanceCompact ─────────────────────────────────────────────────
// 업로드 후 24시간 이내 영상이 있을 때만 렌더링.
// 24시간 경과 시 완전 제거 → Dashboard = "실시간 대응 전용"
//
// 구조 (collapsed):
//   초기 성과 · 업로드 후 Xh · [제목]
//   [조회수 N]  [노출 N]  [CTR X%]  [평균 M:SS]
//   판단 문장 (데이터 기반)
//   [썸네일 수정] [제목 수정]  [▾ 상세]
//
// 구조 (expanded):
//   위 + EarlyPerformancePanel (상세 뷰)

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { T } from "../../styles/tokens";
import EarlyPerformancePanel, { type EarlyPerfData } from "./EarlyPerformancePanel";

// EarlyPerfData는 EarlyPerformancePanel에서 단일 관리 — 여기서 re-export
export type { EarlyPerfData };

// ─── 24h 게이트 ───────────────────────────────────────────────────────────────
function isWithin24h(iso: string): boolean {
  if (!iso) return false;
  const diff = Date.now() - new Date(iso).getTime();
  return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
}

function hoursAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)));
}

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────
function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtCTR(ctr: number | null): string {
  if (ctr == null) return "—";
  return `${(ctr * 100).toFixed(1)}%`;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── 판단 신뢰도 ─────────────────────────────────────────────────────────────
// 노출수 기반 — 데이터 충분성 판단
// HIGH: 알고리즘 검증 완료, 신호 신뢰 가능
// MID:  신호 있지만 추가 관찰 필요
// LOW:  표본 부족, 성급한 판단 보류
type Confidence = "HIGH" | "MID" | "LOW";

function getConfidence(impressions: number | null): Confidence {
  if (impressions == null || impressions < 1000) return "LOW";
  if (impressions >= 5000) return "HIGH";
  return "MID";
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  HIGH: "HIGH",
  MID:  "MID",
  LOW:  "LOW",
};

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  HIGH: T.color.primary,
  MID:  T.warn,
  LOW:  T.muted,
};

// ─── 판단 문장 생성 ───────────────────────────────────────────────────────────
// 단순 데이터 → 의사결정 도구
// 액션 강도 = CTR 이탈도 × 신뢰도의 교차
interface Verdict {
  message:    string;
  action:     string;
  level:      "critical" | "warn";
  confidence: Confidence;
}

function resolveAction(level: "critical" | "warn", confidence: Confidence): string {
  if (confidence === "LOW")  return "데이터 부족 — 추이 관찰";
  if (confidence === "MID")  return level === "critical" ? "점검 권장"      : "추이 관찰 권장";
  /* HIGH */                  return level === "critical" ? "썸네일 교체 권장" : "점검 권장";
}

function getVerdict(data: EarlyPerfData): Verdict | null {
  const { ctr, impressions, channelAvgCTR } = data;
  if (ctr == null) return null;

  const ctrPct       = ctr * 100;
  const avgCtrPct    = channelAvgCTR != null ? channelAvgCTR * 100 : null;
  const confidence   = getConfidence(impressions);

  // Rule 1: 채널 평균 대비 판단 (channelAvgCTR 있을 때 — 가장 정확)
  if (avgCtrPct != null) {
    const diffPct = ((ctrPct - avgCtrPct) / avgCtrPct) * 100;

    if (diffPct <= -20) {
      const level = "critical";
      return {
        message:    `CTR이 채널 평균(${fmtCTR(channelAvgCTR)})보다 ${Math.abs(Math.round(diffPct))}% 낮습니다`,
        action:     resolveAction(level, confidence),
        level,
        confidence,
      };
    }
    if (diffPct <= -10) {
      const level = "warn";
      return {
        message:    `CTR이 채널 평균보다 ${Math.abs(Math.round(diffPct))}% 낮습니다`,
        action:     resolveAction(level, confidence),
        level,
        confidence,
      };
    }
    // 채널 평균 기준 이탈 없음 → 패스
    return null;
  }

  // Rule 2: 채널 평균 없을 때 — 절대값 fallback (channelAvgCTR null)
  // 노출 5000 이상이면 HIGH 신뢰도로 판단
  if ((impressions ?? 0) > 5000 && ctrPct < 4) {
    const level = "critical";
    return {
      message:    `노출 ${fmtNum(impressions)}회 달성 — CTR ${ctrPct.toFixed(1)}% 미달`,
      action:     resolveAction(level, confidence),
      level,
      confidence,
    };
  }

  // Rule 3: 최소 노출 1000 이상 + CTR < 3% — 채널 평균 기준 없는 환경의 보수적 경고
  if ((impressions ?? 0) >= 1000 && ctrPct < 3) {
    const level = "warn";
    return {
      message:    `CTR ${ctrPct.toFixed(1)}% — 채널 평균 집계 전`,
      action:     resolveAction(level, confidence),
      level,
      confidence,
    };
  }

  return null;
}

// ─── 색상 매핑 ────────────────────────────────────────────────────────────────
const LEVEL_COLOR = { critical: T.danger, warn: T.warn } as const;
const LEVEL_BG    = { critical: T.dangerBg, warn: T.warnBg } as const;

// ─── MetricChip ───────────────────────────────────────────────────────────────
function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color:      T.text,
      }}>
        {value}
      </span>
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
        fontFamily: T.font.familyMono,
        lineHeight: T.font.lineHeight.tight,
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── SmallBtn ─────────────────────────────────────────────────────────────────
function SmallBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize:     T.font.size.xs,
        fontFamily:   T.font.familyBase,
        fontWeight:   T.font.weight.semibold,
        color:        T.sub,
        background:   T.bgSection,
        border:       `1px solid ${T.borderSoft}`,
        borderRadius: T.radius.badge,
        padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        cursor:       "pointer",
        whiteSpace:   "nowrap" as const,
      }}
    >
      {label}
    </button>
  );
}

// ─── EarlyPerformanceCompact (메인) ───────────────────────────────────────────
interface Props {
  data: EarlyPerfData | null;
}

export default function EarlyPerformanceCompact({ data }: Props) {
  const [expanded, setExpanded] = useState(false);

  // 24h 이내 영상이 없으면 렌더링 안 함 → Dashboard 공간 미점유
  if (!data || !isWithin24h(data.publishedAt)) return null;

  const hours   = hoursAgo(data.publishedAt);
  const verdict = getVerdict(data);
  const color   = verdict ? LEVEL_COLOR[verdict.level] : T.border;
  const bg      = verdict ? LEVEL_BG[verdict.level]    : T.bgSection;

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${verdict ? color : T.border}`,
      borderRadius:  T.radius.card,
      padding:       `${T.spacing.md}px ${T.spacing.xl}px`,
      boxShadow:     T.shadow.card,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.sm,
    }}>

      {/* ── 헤더 행 ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, minWidth: 0 }}>
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         T.sub,
            letterSpacing: "0.06em",
            flexShrink:    0,
          }}>
            초기 성과
          </span>
          <span style={{
            fontSize:   T.font.size.xs,
            color:      T.muted,
            fontFamily: T.font.familyMono,
            flexShrink: 0,
          }}>
            · 업로드 후 {hours}h
          </span>
          <span style={{
            fontSize:     T.font.size.xs,
            color:        T.sub,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {data.videoTitle}
          </span>
        </div>
      </div>

      {/* ── 지표 행 ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", gap: T.spacing.xl, alignItems: "center" }}>
          <MetricChip label="조회수" value={fmtNum(data.views)} />
          <MetricChip label="노출"  value={fmtNum(data.impressions)} />
          <MetricChip label="CTR"   value={fmtCTR(data.ctr)} />
          <MetricChip label="평균"  value={fmtDuration(data.avgViewDuration)} />
        </div>

        {/* 우측: 액션 버튼 + 상세 토글 */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexShrink: 0 }}>
          {verdict && (
            <>
              <SmallBtn label="썸네일 수정" onClick={() => console.log("[EarlyPerf] thumbnail")} />
              <SmallBtn label="제목 수정"   onClick={() => console.log("[EarlyPerf] title")} />
            </>
          )}
          <button
            onClick={() => setExpanded(p => !p)}
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          4,
              background:   "transparent",
              border:       `1px solid ${T.borderSoft}`,
              borderRadius: T.radius.badge,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              cursor:       "pointer",
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              color:        T.muted,
            }}
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            상세
          </button>
        </div>
      </div>

      {/* ── 판단 문장 + 신뢰도 배지 ── */}
      {verdict && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          T.spacing.sm,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          borderRadius: T.radius.badge,
          background:   bg,
          border:       `1px solid ${color}40`,
          alignSelf:    "flex-start",
        }}>
          <AlertTriangle size={11} color={color} />

          {/* 판단 메시지 */}
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            color,
          }}>
            {verdict.message}
          </span>

          <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
            —
          </span>

          {/* 신뢰도 배지 [HIGH] / [MID] / [LOW] */}
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         CONFIDENCE_COLOR[verdict.confidence],
            border:        `1px solid ${CONFIDENCE_COLOR[verdict.confidence]}40`,
            borderRadius:  T.radius.badge,
            padding:       `0 ${T.spacing.xs}px`,
            letterSpacing: "0.04em",
          }}>
            {CONFIDENCE_LABEL[verdict.confidence]}
          </span>

          {/* 액션 권고 */}
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold,
            color,
          }}>
            {verdict.action}
          </span>
        </div>
      )}

      {/* ── 확장: EarlyPerformancePanel (상세 뷰) ── */}
      {expanded && <EarlyPerformancePanel data={data} />}
    </div>
  );
}
