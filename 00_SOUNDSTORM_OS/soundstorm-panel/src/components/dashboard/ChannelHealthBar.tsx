// ─── ChannelHealthBar v5 ──────────────────────────────────────────────────────
// 채널 건강도 — Top Issue · Grade 위기감 · Pillar 구조 · 클릭 데이터 패널

import { useState } from "react";
import {
  Activity, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle,
  Info, XCircle, Play, Zap,
} from "lucide-react";
import { T } from "../../styles/tokens";
import { getSafeTitle } from "@/utils/videoTitle";
import type { VideoClickContext } from "@/types/dashboardData";

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type Severity = "ok" | "info" | "warn" | "danger";

interface UnderperformingVideo {
  videoId:           string;
  title:             string;
  views?:            number;
  viewsDeltaPercent?: number | null;
  ctr?:              number | null;
  ctrDelta?:         number | null;
  channelAvgCTR?:    number | null;
  reasons?:          string[];
}

interface ActionDataItem extends UnderperformingVideo {
  problemType?:    string;
  severity?:       string;
  date?:           string;
  retentionRate?:  number | null;
}

interface ActionObj {
  label: string;
  type:  string;
  data?: ActionDataItem[];
}

interface BreakdownItem {
  pillar:          string;
  reason:          string;
  delta:           number;
  interpretation?: string;
  action?:         ActionObj | null;
  severity?:       Severity;
}

interface HealthData {
  score:         number | null;
  grade:         string | null;
  label:         string;
  trend?:        string;
  breakdown?:    BreakdownItem[];
  pillarScores?: Record<string, number>;
  base?:         number;
  insufficient?: boolean;
  topIssue?:     BreakdownItem | null;
}

interface Props {
  healthData?: HealthData | null;
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const PILLAR_LABELS: Record<string, string> = {
  P1: "채널 기준 성과",
  P2: "트렌드",
  P3: "외부 트래픽",
  P4: "영상 진단",
};

const PILLAR_ORDER = ["P1", "P2", "P3", "P4"];

// ─── 위기감 메시지 생성 ───────────────────────────────────────────────────────

function buildContextMessage(
  pillarScores: Record<string, number>,
  grade: string,
): string | null {
  const p1 = pillarScores.P1 ?? 0;
  const p2 = pillarScores.P2 ?? 0;
  const p3 = pillarScores.P3 ?? 0;
  const p4 = pillarScores.P4 ?? 0;

  if (grade === "A") return null;
  if (grade === "B") return "대체로 양호 — 일부 지표 점검 권장";

  if (grade === "D") {
    if (p1 < -5 && p2 < -5) return "조회수·트렌드 동시 하락 → 성장 정체 구간 진입 가능";
    if (p3 <= -10)           return "클릭률 급락 → 알고리즘 노출 감소 위험";
    if (p4 <= -10)           return "다수 영상 심각 이슈 → 즉각 대응 필요";
    return null;
  }

  if (p2 < -5) return "트렌드 하락 추세 → 모니터링 강화 필요";
  if (p3 < -5) return "클릭률 개선 여지 → 썸네일 점검 권장";
  return null;
}

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtViews(v: number | undefined | null): string {
  if (v == null) return "—";
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
  return v.toLocaleString("ko-KR");
}

function fmtCTR(v: number | undefined | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtRet(v: number | undefined | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtDate(d: string | undefined | null): string {
  if (!d) return "—";
  return d.length >= 10 ? d.slice(5, 10) : d;
}

// ─── 색상 헬퍼 ────────────────────────────────────────────────────────────────

function severityColor(s: Severity | undefined): string {
  if (s === "ok")     return T.success;
  if (s === "info")   return T.primary;
  if (s === "warn")   return T.warn;
  if (s === "danger") return T.danger;
  return T.muted;
}

function severityBg(s: Severity | undefined): string {
  if (s === "ok")     return T.successBg;
  if (s === "info")   return T.primarySoft;
  if (s === "warn")   return T.warnBg;
  if (s === "danger") return T.dangerBg;
  return T.bgSection;
}

function gradeColor(g: string): string {
  if (g === "A") return T.success;
  if (g === "B") return T.primary;
  if (g === "C") return T.warn;
  return T.danger;
}

function gradeBg(g: string): string {
  if (g === "A") return T.successBg;
  if (g === "B") return T.primarySoft;
  if (g === "C") return T.warnBg;
  return T.dangerBg;
}

function gradeBorderColor(g: string): string {
  if (g === "A") return T.successBorder;
  if (g === "B") return T.primaryBorder;
  if (g === "C") return T.borderColor.warning;
  return T.borderColor.danger;
}

function pillarDeltaColor(d: number): string {
  if (d > 5)   return T.success;
  if (d > 0)   return T.primary;
  if (d === 0) return T.muted;
  if (d > -8)  return T.warn;
  return T.danger;
}

function issueSeverityLabel(s: string | undefined): string {
  if (s === "CRITICAL") return "즉시 대응";
  if (s === "HIGH")     return "이번 주 내";
  if (s === "MEDIUM")   return "모니터링";
  return s ?? "—";
}

function issueSeverityColor(s: string | undefined): string {
  if (s === "CRITICAL") return T.danger;
  if (s === "HIGH")     return T.warn;
  return T.primary;
}

// ─── 아이콘 ───────────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "up")   return <TrendingUp  size={12} color={T.success} />;
  if (trend === "down") return <TrendingDown size={12} color={T.danger}  />;
  return <Minus size={12} color={T.muted} />;
}

function SeverityIcon({ severity }: { severity?: Severity }) {
  const size = 10;
  if (severity === "ok")     return <CheckCircle   size={size} color={T.success} />;
  if (severity === "info")   return <Info          size={size} color={T.primary} />;
  if (severity === "warn")   return <AlertTriangle size={size} color={T.warn}    />;
  if (severity === "danger") return <XCircle       size={size} color={T.danger}  />;
  return <Minus size={size} color={T.muted} />;
}

// ─── Top Issue 배너 ───────────────────────────────────────────────────────────

function TopIssueBanner({ item }: { item: BreakdownItem }) {
  const sColor = severityColor(item.severity as Severity);
  return (
    <div style={{
      display:       "flex",
      alignItems:    "flex-start",
      gap:           T.spacing.sm,
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      background:    severityBg(item.severity as Severity),
      borderBottom:  `1px solid ${T.borderSoft}`,
    }}>
      <Zap size={12} color={sColor} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginBottom: 2 }}>
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         sColor,
            letterSpacing: "0.04em",
          }}>
            주요 문제
          </span>
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            color:      T.text,
            fontWeight: T.font.weight.medium,
          }}>
            {item.reason}
          </span>
        </div>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
          점수 영향 {item.delta}점 · 전체 하락의 핵심 원인
        </span>
      </div>
    </div>
  );
}

// ─── Grade 위기감 메시지 ──────────────────────────────────────────────────────

function GradeSummary({ grade, contextMessage }: { grade: string; contextMessage: string | null }) {
  if (!contextMessage || grade === "A") return null;
  const color  = gradeColor(grade);
  const lines  = contextMessage.split("→").map(s => s.trim());

  return (
    <div style={{
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      borderBottom: `1px solid ${T.borderSoft}`,
      display:      "flex",
      alignItems:   "flex-start",
      gap:          T.spacing.sm,
    }}>
      <div style={{
        width:        3,
        alignSelf:    "stretch",
        background:   color,
        borderRadius: T.radius.pill,
        flexShrink:   0,
      }} />
      <div>
        {lines[0] && (
          <span style={{ fontSize: T.font.size.xs, color: T.sub }}>
            {lines[0]}
          </span>
        )}
        {lines[1] && (
          <div style={{ fontSize: T.font.size.xs, color, fontWeight: T.font.weight.medium, marginTop: 2 }}>
            → {lines[1]}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 영상 카드 (성과 저조 영상 전용) ─────────────────────────────────────────

function buildHealthContext(type: string, item: ActionDataItem): VideoClickContext {
  if (type === "low_ctr_videos") return { source: "INSIGHT", triggerMetric: "CTR" };
  if (type === "low_retention_videos") return { source: "INSIGHT", triggerMetric: "RETENTION" };
  if (type === "low_performance_videos" || type === "declining_videos") return { source: "INSIGHT", triggerMetric: "VIEWS" };
  if (type === "issue_videos") {
    if (item.problemType === "CTR_WEAK") return { source: "DIAGNOSTICS", triggerMetric: "CTR" };
    if (item.problemType === "RETENTION_WEAK") return { source: "DIAGNOSTICS", triggerMetric: "RETENTION" };
    if (item.problemType === "IMPRESSION_DROP") return { source: "DIAGNOSTICS", triggerMetric: "IMPRESSIONS" };
  }
  return { source: "INSIGHT", triggerMetric: "VIEWS" };
}

function VideoCard({
  item,
  channelAvgCTR,
  type,
  onVideoClick,
}: {
  item: ActionDataItem;
  channelAvgCTR?: number | null;
  type: string;
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}) {
  const title  = getSafeTitle(item.title);
  const hasCtx = item.viewsDeltaPercent != null || item.ctr != null || item.reasons?.length;
  const canClick = !!(item.videoId && onVideoClick);

  return (
    <div
      onClick={() => {
        if (!canClick) return;
        onVideoClick?.({ videoId: item.videoId!, context: buildHealthContext(type, item) });
      }}
      style={{
      padding:      `${T.spacing.sm}px 0`,
      borderBottom: `1px solid ${T.borderSoft}`,
      cursor:       canClick ? "pointer" : "default",
    }}
    >
      {/* 제목 행 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginBottom: hasCtx ? T.spacing.xs : 0 }}>
        <Play size={8} color={T.muted} style={{ flexShrink: 0 }} />
        <span style={{
          fontSize:     T.font.size.xs,
          color:        T.text,
          fontWeight:   T.font.weight.medium,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          flex:         1,
        }}>
          {title}
        </span>
      </div>

      {/* 지표 행 */}
      {hasCtx && (
        <div style={{
          paddingLeft: T.spacing.md,
          display:     "flex",
          flexWrap:    "wrap",
          gap:         T.spacing.sm,
          alignItems:  "center",
        }}>
          {/* 조회수 + 변화율 */}
          {item.views != null && (
            <span style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                조회수
              </span>
              <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.text }}>
                {fmtViews(item.views)}
              </span>
              {item.viewsDeltaPercent != null && (
                <span style={{
                  fontSize:   T.font.size.xs,
                  fontFamily: T.font.familyMono,
                  color:      item.viewsDeltaPercent < 0 ? T.danger : T.success,
                }}>
                  ({item.viewsDeltaPercent > 0 ? "+" : ""}{item.viewsDeltaPercent}%)
                </span>
              )}
            </span>
          )}

          {/* CTR + 채널 평균 비교 */}
          {item.ctr != null && (
            <span style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                CTR
              </span>
              <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.warn }}>
                {fmtCTR(item.ctr)}
              </span>
              {(channelAvgCTR ?? item.channelAvgCTR) != null && (
                <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                  (평균 {fmtCTR(channelAvgCTR ?? item.channelAvgCTR)})
                </span>
              )}
            </span>
          )}

          {/* reasons 배지들 */}
          {item.reasons && item.reasons.map((r, i) => (
            <span key={i} style={{
              fontSize:     T.font.size.xs,
              color:        T.warn,
              background:   T.warnBg,
              border:       `1px solid ${T.borderColor.warning}`,
              borderRadius: T.radius.badge,
              padding:      `${T.spacing.xs}px ${T.spacing.xs}px`,
              fontFamily:   T.font.familyMono,
            }}>
              → {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 데이터 패널 ──────────────────────────────────────────────────────────────

function DataPanel({
  type,
  data,
  onVideoClick,
}: {
  type: string;
  data: ActionDataItem[];
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}) {
  if (!data.length) return null;

  // 성과 저조 / 하락 영상 → 풍부한 카드 렌더링
  if (type === "low_performance_videos" || type === "declining_videos") {
    const channelAvgCTR = data[0]?.channelAvgCTR;
    const isDecline = type === "declining_videos";
    return (
      <div style={{
        marginTop:    T.spacing.xs,
        marginLeft:   T.spacing.lg,
        background:   T.bgSection,
        border:       `1px solid ${T.borderSoft}`,
        borderRadius: T.radius.btn,
        overflow:     "hidden",
      }}>
        {/* 리스트 헤더 */}
        <div style={{
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          borderBottom: `1px solid ${T.borderSoft}`,
          background:   isDecline ? T.dangerBg : T.warnBg,
        }}>
          <div style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold,
            color:      isDecline ? T.danger : T.warn,
          }}>
            {isDecline ? "📉 최근 하락 영상" : "📊 지속 저조 영상"}
          </div>
          <div style={{ fontSize: T.font.size.xs, color: T.muted, marginTop: T.spacing.xs }}>
            {isDecline
              ? "노출 -30% 이상 감소 기준"
              : "CTR 평균 대비 70% 이하"}
          </div>
        </div>
        {/* 영상 목록 */}
        <div style={{ padding: `0 ${T.spacing.sm}px` }}>
          {data.map((item, i) => (
            <VideoCard
              key={i}
              item={item}
              channelAvgCTR={channelAvgCTR}
              type={type}
              onVideoClick={onVideoClick}
            />
          ))}
        </div>
      </div>
    );
  }

  // 일반 테이블 렌더링
  const colHeader =
    type === "low_ctr_videos"       ? "CTR"    :
    type === "low_retention_videos" ? "유지율"  :
    type === "upload_pattern"       ? "조회수"  :
    type === "issue_videos"         ? "상태"    : "조회수";

  return (
    <div style={{
      marginTop:    T.spacing.xs,
      marginLeft:   T.spacing.lg,
      background:   T.bgSection,
      border:       `1px solid ${T.borderSoft}`,
      borderRadius: T.radius.btn,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: T.spacing.xs }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
          {type === "upload_pattern" ? "날짜" : "영상"}
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
          {colHeader}
        </span>
      </div>
      {data.map((item, i) => {
        let metric: string;
        let mColor = T.text;
        if      (type === "low_ctr_videos")       { metric = fmtCTR(item.ctr);           mColor = T.warn; }
        else if (type === "low_retention_videos") { metric = fmtRet(item.retentionRate); mColor = T.warn; }
        else if (type === "upload_pattern")       { metric = fmtViews(item.views);        mColor = T.sub; }
        else if (type === "issue_videos")         { metric = issueSeverityLabel(item.severity); mColor = issueSeverityColor(item.severity); }
        else                                       { metric = fmtViews(item.views);        mColor = T.sub; }

        const label = type === "upload_pattern"
          ? fmtDate(item.date)
          : getSafeTitle(item.title);

        const canClick = !!(item.videoId && onVideoClick && type !== "upload_pattern");
        return (
          <div
            key={i}
            onClick={() => {
              if (!canClick) return;
              onVideoClick?.({ videoId: item.videoId!, context: buildHealthContext(type, item) });
            }}
            style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            padding:        `${T.spacing.xs}px 0`,
            borderBottom:   i < data.length - 1 ? `1px solid ${T.borderSoft}` : "none",
            cursor:         canClick ? "pointer" : "default",
          }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, minWidth: 0 }}>
              <Play size={8} color={T.muted} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: T.font.size.xs, color: T.sub,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160,
              }}>
                {label}
              </span>
            </div>
            <span style={{
              fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold, color: mColor,
              flexShrink: 0, marginLeft: T.spacing.sm,
            }}>
              {metric}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── 아이템 행 ────────────────────────────────────────────────────────────────

function BreakdownRow({
  item,
  onVideoClick,
}: {
  item: BreakdownItem;
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}) {
  const [dataExpanded, setDataExpanded] = useState(false);
  const sColor   = severityColor(item.severity as Severity);
  const deltaStr = item.delta > 0 ? `+${item.delta}` : `${item.delta}`;
  const action   = item.action as ActionObj | null | undefined;
  const hasData  = !!(action?.data && action.data.length > 0);

  return (
    <div style={{ padding: `${T.spacing.xs}px ${T.spacing.md}px` }}>
      {/* reasons */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
        <SeverityIcon severity={item.severity as Severity} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.text, flex: 1 }}>
          {item.reason}
        </span>
        <span style={{
          fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold, color: sColor, flexShrink: 0,
        }}>
          {deltaStr}
        </span>
      </div>

      {/* interpretation */}
      {item.interpretation && (
        <div style={{ paddingLeft: T.spacing.lg, marginTop: T.spacing.xs, display: "flex", gap: T.spacing.xs }}>
          <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>→</span>
          <span style={{ fontSize: T.font.size.xs, color: T.sub }}>{item.interpretation}</span>
        </div>
      )}

      {/* 액션 버튼 */}
      {action && item.severity !== "ok" && (
        <div style={{ paddingLeft: T.spacing.lg, marginTop: T.spacing.xs }}>
          <button
            onClick={() => hasData && setDataExpanded(v => !v)}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.medium,
              color:        sColor,
              background:   severityBg(item.severity as Severity),
              border:       `1px solid ${T.borderSoft}`,
              borderRadius: T.radius.badge,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              cursor:       hasData ? "pointer" : "default",
              transition:   T.motion.default,
            }}
          >
            {action.label}
            {hasData && (dataExpanded
              ? <ChevronUp   size={10} color={sColor} />
              : <ChevronDown size={10} color={sColor} />
            )}
          </button>
          {hasData && dataExpanded && (
            <DataPanel type={action.type} data={action.data!} onVideoClick={onVideoClick} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── 필라 툴팁 정의 ───────────────────────────────────────────────────────────

const PILLAR_TOOLTIP: Record<string, { title: string; lines: string[] }> = {
  P1: {
    title: "채널 기준 성과",
    lines: [
      "최근 영상 성과를 채널 평균과 비교합니다.",
      "· 조회수, CTR 기준",
      "· 최근 영상 기준",
    ],
  },
  P2: {
    title: "트렌드",
    lines: [
      "최근 4주 변화 흐름을 분석합니다.",
      "· 조회수 추세",
      "· 구독자 변화",
      "· 알고리즘 변화",
    ],
  },
  P3: {
    title: "절대 기준",
    lines: [
      "영상 성과가 최소 기준을 만족하는지 확인합니다.",
      "· CTR, 유지율 기준",
      "· 채널 평균과 무관",
    ],
  },
  P4: {
    title: "영상 진단",
    lines: [
      "문제 영상 여부를 자동으로 감지합니다.",
      "· 이상 패턴 탐지",
      "· 문제 없으면 보너스",
    ],
  },
};

// ─── 필라 툴팁 컴포넌트 ───────────────────────────────────────────────────────

function PillarTooltip({ pillar }: { pillar: string }) {
  const [visible, setVisible] = useState(false);
  const tip = PILLAR_TOOLTIP[pillar];
  if (!tip) return null;

  return (
    <span
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      {/* ⓘ 아이콘 */}
      <span style={{
        fontSize:     T.font.size.xs,
        color:        T.muted,
        cursor:       "default",
        lineHeight:   1,
        userSelect:   "none",
        paddingLeft:  T.spacing.xs,
      }}>
        ⓘ
      </span>

      {/* 툴팁 박스 */}
      {visible && (
        <div style={{
          position:     "absolute",
          top:          `calc(100% + ${T.spacing.xxs}px)`,
          left:         0,
          zIndex:       50,
          minWidth:     180,
          background:   T.bgCard,
          border:       `1px solid ${T.borderSoft}`,
          borderRadius: T.radius.btn,
          boxShadow:    T.shadow.hover,
          padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
          pointerEvents: "none",
        }}>
          <div style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold,
            color:      T.text,
            marginBottom: T.spacing.xs,
          }}>
            {tip.title}
          </div>
          {tip.lines.map((line, i) => (
            <div key={i} style={{
              fontSize:   T.font.size.xs,
              color:      i === 0 ? T.sub : T.muted,
              fontFamily: T.font.familyMono,
              lineHeight: T.font.lineHeight.normal,
            }}>
              {line}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// ─── 필라 섹션 ────────────────────────────────────────────────────────────────

function PillarSection({
  pillar,
  items,
  delta,
  onVideoClick,
}: {
  pillar: string;
  items: BreakdownItem[];
  delta: number;
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}) {
  const label    = PILLAR_LABELS[pillar] ?? pillar;
  const dColor   = pillarDeltaColor(delta);
  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: T.spacing.xs }}>
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        `${T.spacing.xs}px ${T.spacing.md}px`,
        marginBottom:   items.length ? T.spacing.xs : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         dColor,
            background:    severityBg(delta >= 0 ? "ok" : delta > -8 ? "warn" : "danger"),
            border:        `1px solid ${T.borderSoft}`,
            borderRadius:  T.radius.badge,
            padding:       `${T.spacing.xs}px ${T.spacing.xs}px`,
            letterSpacing: "0.06em",
          }}>
            {pillar}
          </span>
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.sub }}>
            {label}
          </span>
          <PillarTooltip pillar={pillar} />
        </div>
        <span style={{
          fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold, color: dColor,
        }}>
          {deltaStr}
        </span>
      </div>
      {items.map((item, i) => <BreakdownRow key={i} item={item} onVideoClick={onVideoClick} />)}
      <div style={{ height: T.spacing.xs }} />
    </div>
  );
}

// ─── 점수 흐름 ────────────────────────────────────────────────────────────────

function ScoreFlow({
  base,
  pillarScores,
  finalScore,
  grade,
}: {
  base: number;
  pillarScores: Record<string, number>;
  finalScore: number;
  grade: string;
}) {
  const rows = [
    { label: "BASE", value: base, color: T.muted },
    ...PILLAR_ORDER.map((pillar) => ({
      label: pillar,
      value: pillarScores[pillar] ?? 0,
      color: pillarDeltaColor(pillarScores[pillar] ?? 0),
    })),
  ];

  return (
    <div style={{
      borderTop: `1px solid ${T.borderSoft}`,
      padding: `${T.spacing.sm}px ${T.spacing.md}px`,
      display: "flex",
      flexDirection: "column",
      gap: T.spacing.xs,
    }}>
      <span style={{
        fontSize: T.font.size.xs,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color: T.sub,
      }}>
        점수 흐름
      </span>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{ width: 36, fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>
            {row.label}
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.muted }}>→</span>
          <span style={{
            fontSize: T.font.size.xs,
            fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold,
            color: row.value > 0 ? T.success : row.value < 0 ? row.color : T.text,
          }}>
            {row.value > 0 ? `+${row.value}` : row.value}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginTop: T.spacing.xs }}>
        <span style={{ width: 36, fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>
          결과
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>→</span>
        <span style={{
          fontSize: T.font.size.sm,
          fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold,
          color: gradeColor(grade),
        }}>
          {finalScore} ({grade})
        </span>
      </div>
    </div>
  );
}

// ─── 점수 요약 (단일 라인) ────────────────────────────────────────────────────

function ScoreCompact({ pillarScores, finalScore, grade }: {
  pillarScores: Record<string, number>; finalScore: number; grade: string;
}) {
  const relevant = PILLAR_ORDER.filter(p => p !== "P2");
  const negTotal = relevant.reduce((s, p) => { const d = pillarScores[p] ?? 0; return d < 0 ? s + d : s; }, 0);
  const posTotal = relevant.reduce((s, p) => { const d = pillarScores[p] ?? 0; return d > 0 ? s + d : s; }, 0);

  const segs: string[] = [];
  if (negTotal !== 0) segs.push(`↓${Math.abs(negTotal)}`);
  if (posTotal !== 0) segs.push(`+${posTotal}`);

  return (
    <div style={{
      borderTop:  `1px solid ${T.borderSoft}`,
      padding:    `${T.spacing.sm}px ${T.spacing.md}px`,
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.sm,
    }}>
      <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
        채널 점수
      </span>
      <span style={{
        fontSize:   T.font.size.sm,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color:      gradeColor(grade),
      }}>
        {finalScore}
      </span>
      {segs.length > 0 && (
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>
          ({segs.join(" / ")})
        </span>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function ChannelHealthBar({ healthData, onVideoClick }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!healthData) return null;

  // 데이터 부족
  if (healthData.insufficient) {
    return (
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.md,
        padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
        background:   T.bgSection,
        borderRadius: T.radius.btn,
        border:       `1px solid ${T.border}`,
      }}>
        <Activity size={12} color={T.muted} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>채널 건강도</span>
        <span style={{
          fontSize:     T.font.size.xs,
          fontFamily:   T.font.familyMono,
          color:        T.muted,
          background:   T.bgCard,
          border:       `1px solid ${T.borderSoft}`,
          borderRadius: T.radius.badge,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        }}>
          데이터 부족 (KPI 3개 이상 필요)
        </span>
      </div>
    );
  }

  const { score, grade, label, trend, breakdown, pillarScores, topIssue, base } = healthData;
  const safeGrade        = grade ?? "D";
  const safeScore        = score ?? 0;
  const color            = gradeColor(safeGrade);
  const safePillarScores = pillarScores ?? {};
  const contextMessage   = buildContextMessage(safePillarScores, safeGrade);

  // 필라별 그룹핑
  const pillarItems: Record<string, BreakdownItem[]> = { P1: [], P2: [], P3: [], P4: [] };
  for (const item of breakdown ?? []) {
    if (pillarItems[item.pillar]) pillarItems[item.pillar].push(item);
  }
  const activePillars = PILLAR_ORDER.filter(p => {
    const d = safePillarScores[p] ?? 0;
    return d !== 0 || (pillarItems[p]?.length ?? 0) > 0;
  });
  const hasPillarData = activePillars.length > 0;

  return (
    <div style={{
      background:   T.bgSection,
      borderRadius: T.radius.btn,
      border:       `1px solid ${expanded ? T.primary : T.border}`,
      overflow:     "hidden",
      transition:   T.motion.default,
    }}>
      {/* ── 헤더 한 줄 ── */}
      <div
        onClick={() => hasPillarData && setExpanded(v => !v)}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        T.spacing.md,
          padding:    `${T.spacing.sm}px ${T.spacing.md}px`,
          cursor:     hasPillarData ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, flexShrink: 0 }}>
          <Activity size={12} color={T.sub} />
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            color:         T.sub,
            letterSpacing: "0.04em",
            whiteSpace:    "nowrap",
          }}>
            채널 건강도
          </span>
        </div>

        <div style={{
          flex: 1, height: 5, background: T.border,
          borderRadius: T.radius.pill, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${safeScore}%`,
            background: color, borderRadius: T.radius.pill,
            transition: `width ${T.motion.duration} ${T.motion.easing}`,
          }} />
        </div>

        <span style={{
          fontSize: T.font.size.sm, fontWeight: T.font.weight.bold,
          fontFamily: T.font.familyMono, color, flexShrink: 0,
        }}>
          {safeScore}
        </span>

        <div style={{
          display:      "inline-flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          background:   gradeBg(safeGrade),
          border:       `1px solid ${gradeBorderColor(safeGrade)}`,
          borderRadius: T.radius.badge,
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          flexShrink:   0,
        }}>
          <span style={{ fontSize: T.font.size.xs, fontWeight: T.font.weight.bold, color }}>{safeGrade}</span>
          <span style={{ fontSize: T.font.size.xs, color }}>{label}</span>
        </div>

        <TrendIcon trend={trend} />

        {hasPillarData && (
          expanded
            ? <ChevronUp   size={12} color={T.muted} style={{ flexShrink: 0 }} />
            : <ChevronDown size={12} color={T.muted} style={{ flexShrink: 0 }} />
        )}
      </div>

      {/* ── 확장 패널 ── */}
      {hasPillarData && expanded && (
        <>
          {topIssue && <TopIssueBanner item={topIssue} />}
          <GradeSummary grade={safeGrade} contextMessage={contextMessage} />
          {/* Pillar 섹션들 (P1, P4만 표시 — P2 트렌드 제거됨) */}
          <div style={{ paddingTop: T.spacing.xs }}>
            {activePillars.map(p => (
              <PillarSection
                key={p}
                pillar={p}
                items={pillarItems[p] ?? []}
                delta={safePillarScores[p] ?? 0}
                onVideoClick={onVideoClick}
              />
            ))}
          </div>

          <ScoreFlow
            base={base ?? 50}
            pillarScores={safePillarScores}
            finalScore={safeScore}
            grade={safeGrade}
          />

          {/* 점수 요약 — 단일 라인 */}
          <ScoreCompact
            pillarScores={safePillarScores}
            finalScore={safeScore}
            grade={safeGrade}
          />
        </>
      )}
    </div>
  );
}
