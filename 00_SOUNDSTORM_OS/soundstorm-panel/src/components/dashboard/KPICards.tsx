// ─── KPICards v2 ──────────────────────────────────────────────────────────────
// Dashboard KPI 카드 7개: 조회수·구독자·시청시간·평균시청·좋아요·클릭률·예상수익
// 카드 클릭 시 근거 데이터 인라인 확장 표시
//
// 카드 구조:
//   레이블 (한국어)
//   값 (포맷된 숫자)
//   성장율 배지 (▲+X% / ▼−X%)
//   [클릭 시] 근거 데이터 패널

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { T } from "../../styles/tokens";
import type { AnalyticsSummary, TrendPoint } from "@/adapters/AnalyticsAdapter";
import type { GrowthResult, CtrBucket } from "@/controllers/useAnalyticsController";
import type { UnderperformingVideo } from "@/lib/getUnderperformingVideos";
import type { KpiInspectorData, VideoClickContext } from "@/types/dashboardData";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtCount(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtSubscriberChange(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("ko-KR");
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

function fmtWatchTime(min: number | undefined | null): string {
  if (min == null || isNaN(min)) return "—";
  if (min >= 10_000) return `${(min / 10_000).toFixed(1)}만분`;
  return `${min.toLocaleString("ko-KR")}분`;
}

function fmtAvgDuration(sec: number | undefined | null): string {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtRevenue(krw: number | undefined | null): string {
  if (krw == null || isNaN(krw)) return "—";
  return `₩${Math.round(krw).toLocaleString("ko-KR")}`;
}

function fmtCTR(ctr: number | undefined | null): string {
  if (ctr == null || isNaN(ctr)) return "—";
  return `${(ctr * 100).toFixed(1)}%`;
}

// ─── 상태 판단 ─────────────────────────────────────────────────────────────────

type StatusSeverity = "ok" | "info" | "warn" | "danger";

function buildStatus(growth: number | null): { label: string; severity: StatusSeverity } | null {
  if (growth == null) return null;
  if (growth <= -30) return { label: "감소 중 (심각)", severity: "danger" };
  if (growth <= -10) return { label: "하락 주의",      severity: "warn"   };
  if (growth <   10) return { label: "평균 수준",      severity: "info"   };
  return               { label: "성장 중",            severity: "ok"     };
}

function statusColor(s: StatusSeverity): string {
  if (s === "ok")     return T.success;
  if (s === "warn")   return T.warn;
  if (s === "danger") return T.danger;
  return T.sub;
}

function statusBg(s: StatusSeverity): string {
  if (s === "ok")     return T.successBg;
  if (s === "warn")   return T.warnBg;
  if (s === "danger") return T.dangerBg;
  return T.semantic.surface.insetTint;
}

// ─── 원인 분석 ─────────────────────────────────────────────────────────────────

interface CauseItem {
  metric:         string;
  delta:          number | null;
  interpretation: string;
  action:         string;
}

function buildCauses(
  label:     string,
  growth:    GrowthResult | null,
  ctrGrowth: number | null,
): CauseItem[] {
  if (!growth) return [];
  const causes: CauseItem[] = [];
  const gV = growth.views       ?? 0;
  const gW = growth.watchTime   ?? 0;
  const gA = growth.avgDuration ?? 0;
  const gC = ctrGrowth          ?? 0;

  if (label === "조회수") {
    if (gC < -10) causes.push({ metric: "클릭률",   delta: gC, interpretation: "썸네일/제목 클릭력 약화",     action: "썸네일 A/B 테스트" });
    if (gW < -10) causes.push({ metric: "시청시간",  delta: gW, interpretation: "알고리즘 추천 감소로 이어짐", action: "초반 10초 구조 개선" });
  } else if (label === "구독자") {
    if (gV < -10) causes.push({ metric: "조회수",   delta: gV, interpretation: "신규 유입 감소",    action: "노출 확대 전략 필요" });
    if (gA < -10) causes.push({ metric: "평균시청", delta: gA, interpretation: "채널 첫인상 약화", action: "영상 완결성 개선" });
  } else if (label === "시청시간") {
    if (gA < -10) causes.push({ metric: "평균시청", delta: gA, interpretation: "개별 영상 완료율 하락", action: "편집 리듬 개선" });
    if (gV < -10) causes.push({ metric: "조회수",   delta: gV, interpretation: "전체 세션 감소",        action: "노출 확대 우선" });
  } else if (label === "클릭률" && gC < -10) {
    causes.push({ metric: "썸네일/제목", delta: gC, interpretation: "클릭 효율 저하",     action: "A/B 테스트 시작" });
  } else if (label === "평균 시청시간" && gA < -10) {
    causes.push({ metric: "초반 이탈",   delta: gA, interpretation: "인트로 집중도 저하", action: "인트로 15초 개편" });
  } else if (label === "좋아요" && gV < -10) {
    causes.push({ metric: "조회수",      delta: gV, interpretation: "시청자 절대수 감소", action: "조회수 회복 우선" });
  } else if (label === "예상 수익") {
    if (gV < -10) causes.push({ metric: "조회수", delta: gV, interpretation: "광고 노출 감소",  action: "조회수 회복 우선" });
    if (gC < -10) causes.push({ metric: "클릭률", delta: gC, interpretation: "CPM 효율 저하",   action: "프리미엄 시청자 유입 개선" });
  }

  return causes;
}

function buildInterpretation(
  label: string, growth: GrowthResult | null, ctrGrowth: number | null,
): string | null {
  if (!growth) return null;
  const gV = growth.views       ?? 0;
  const gC = ctrGrowth          ?? 0;
  const gW = growth.watchTime   ?? 0;
  const gA = growth.avgDuration ?? 0;
  const gS = growth.subscribers ?? 0;

  if (label === "조회수") {
    if (gV <= -30 && gC <= -20 && gW <= -30) return "썸네일/제목 + 콘텐츠 유지력 모두 약화";
    if (gV <= -20)                            return "채널 노출 전반적 감소 — 알고리즘 신호 약화";
  }
  if (label === "구독자"        && gS <= -30) return "신규 유입 대비 이탈이 심각 수준";
  if (label === "시청시간"      && gW <= -30) return "시청 세션 급감 — 알고리즘 추천 감소 위험";
  if (label === "클릭률"        && gC <= -20) return "썸네일 또는 제목의 매력도 하락 중";
  if (label === "평균 시청시간" && gA <= -20) return "시청자 이탈 증가 — 초반 구조 점검 필요";
  return null;
}

// ─── 근거 행 타입 ─────────────────────────────────────────────────────────────

interface DetailRow {
  label: string;
  value: string;
  color?: string;
}

// ─── 카드 데이터 빌더 ──────────────────────────────────────────────────────────

interface CardDef {
  label:          string;
  value:          string;
  growthValue:    number | null;
  icon:           string;
  detail:         DetailRow[];
  status:         { label: string; severity: StatusSeverity } | null;
  causes:         CauseItem[];
  interpretation: string | null;
  actions:        string[];
}

function shouldShowIssueVideos(label: string): boolean {
  return label === "조회수" || label === "클릭률" || label === "시청시간";
}

function metricFromLabel(label: string): VideoClickContext["triggerMetric"] {
  if (label === "조회수") return "VIEWS";
  if (label === "클릭률") return "CTR";
  if (label === "시청시간") return "RETENTION";
  return "VIEWS";
}

function focusFromLabel(label: string): "CTR" | "VIEWS" | "RETENTION_WEAK" | "STRATEGY" {
  if (label === "클릭률") return "CTR";
  if (label === "시청시간" || label === "평균 시청시간") return "RETENTION_WEAK";
  if (label === "조회수") return "VIEWS";
  return "STRATEGY";
}

function buildDetail_prevCurrent(
  label:   string,
  current: number | undefined,
  prev:    number | undefined,
  fmt:     (n: number | undefined | null) => string,
): DetailRow[] {
  if (current == null && prev == null) return [];
  const rows: DetailRow[] = [];
  if (current != null) rows.push({ label: "현재 기간", value: fmt(current) });
  if (prev    != null) rows.push({ label: "이전 기간", value: fmt(prev),    color: T.muted });
  return rows;
}

function buildDetail_trend(trend: TrendPoint[] | undefined): DetailRow[] {
  if (!trend?.length) return [];
  return [...trend]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-5)
    .map(p => ({
      label: p.date.slice(5),  // MM-DD
      value: p.views >= 10_000
        ? `${(p.views / 10_000).toFixed(1)}만`
        : p.views.toLocaleString("ko-KR"),
    }));
}

function buildDetail_ctr(buckets: CtrBucket[], channelAvg: number | null): DetailRow[] {
  const rows: DetailRow[] = buckets
    .filter(b => b.value > 0)
    .map(b => ({ label: b.bucket, value: `${b.value}개` }));
  if (channelAvg != null) {
    rows.unshift({ label: "채널 평균", value: `${(channelAvg * 100).toFixed(1)}%`, color: T.text });
  }
  return rows;
}

function buildCards(
  summary:       AnalyticsSummary | null | undefined,
  prev30:        AnalyticsSummary | null | undefined,
  growth:        GrowthResult | null,
  channelAvgCTR: number | null,
  ctrGrowth:     number | null,
  trendHistory:  TrendPoint[] | undefined,
  ctrBuckets:    CtrBucket[],
): CardDef[] {
  const base = [
    {
      label:       "조회수",
      value:       fmtCount(summary?.views),
      growthValue: growth?.views ?? null,
      icon:        "조회수",
      detail:      buildDetail_trend(trendHistory),
    },
    {
      label:       "구독자",
      value:       fmtSubscriberChange(summary?.subscriberChange),
      growthValue: growth?.subscribers ?? null,
      icon:        "구독자",
      detail:      buildDetail_prevCurrent("구독자", summary?.subscriberChange, prev30?.subscriberChange, fmtSubscriberChange),
    },
    {
      label:       "시청시간",
      value:       fmtWatchTime(summary?.watchTimeMin),
      growthValue: growth?.watchTime ?? null,
      icon:        "시청시간",
      detail:      buildDetail_prevCurrent("시청시간", summary?.watchTimeMin, prev30?.watchTimeMin, fmtWatchTime),
    },
    {
      label:       "평균 시청시간",
      value:       fmtAvgDuration(summary?.avgDurationSec),
      growthValue: growth?.avgDuration ?? null,
      icon:        "평균시청",
      detail:      buildDetail_prevCurrent("평균시청", summary?.avgDurationSec, prev30?.avgDurationSec, fmtAvgDuration),
    },
    {
      label:       "좋아요",
      value:       fmtCount(summary?.likes),
      growthValue: growth?.likes ?? null,
      icon:        "좋아요",
      detail:      buildDetail_prevCurrent("좋아요", summary?.likes, prev30?.likes, fmtCount),
    },
    {
      label:       "클릭률",
      value:       fmtCTR(channelAvgCTR),
      growthValue: ctrGrowth,
      icon:        "클릭률",
      detail:      buildDetail_ctr(ctrBuckets, channelAvgCTR),
    },
    {
      label:       "예상 수익",
      value:       fmtRevenue(summary?.revenue),
      growthValue: growth?.revenue ?? null,
      icon:        "예상수익",
      detail:      buildDetail_prevCurrent("수익", summary?.revenue, (summary as any)?.revenuePrev, fmtRevenue),
    },
  ];

  return base.map(c => ({
    ...c,
    status:         buildStatus(c.growthValue),
    causes:         buildCauses(c.label, growth, ctrGrowth),
    interpretation: buildInterpretation(c.label, growth, ctrGrowth),
    actions:        buildCauses(c.label, growth, ctrGrowth).map(x => x.action),
  }));
}

// ─── GrowthBadge ──────────────────────────────────────────────────────────────

function GrowthBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const pos = value >= 0;
  return (
    <span style={{
      display:    "inline-flex",
      alignItems: "center",
      gap:        T.spacing.xs,
      fontSize:   T.font.size.sm,
      fontFamily: T.font.familyMono,
      fontWeight: T.font.weight.bold,
      color:      pos ? T.success : T.danger,
    }}>
      {pos ? "▲" : "▼"} {pos ? "+" : ""}{value}%
    </span>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: { label: string; severity: StatusSeverity } | null }) {
  if (!status) return null;
  const c = statusColor(status.severity);
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      fontSize:     T.font.size.xs,
      fontFamily:   T.font.familyMono,
      fontWeight:   T.font.weight.medium,
      color:        c,
      background:   statusBg(status.severity),
      borderRadius: T.radius.badge,
      padding:      `1px ${T.spacing.xs}px`,
      lineHeight:   1.5,
      whiteSpace:   "nowrap",
    }}>
      {status.label}
    </span>
  );
}

function accentFromStatus(status: { label: string; severity: StatusSeverity } | null): string {
  if (!status) return T.borderSoft;
  return statusColor(status.severity);
}

// ─── CauseLayer ───────────────────────────────────────────────────────────────

function CauseLayer({ causes, interpretation, actions }: {
  causes:         CauseItem[];
  interpretation: string | null;
  actions:        string[];
}) {
  if (!causes.length && !interpretation) return null;
  return (
    <div style={{
      borderTop:     `1px solid ${T.borderSoft}`,
      paddingTop:    T.spacing.xs,
      marginTop:     T.spacing.xs,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xs,
    }}>
      {/* 원인 */}
      {causes.length > 0 && (
        <div>
          {causes.map((c, i) => (
            <div key={i} style={{ marginTop: i > 0 ? T.spacing.xs : 0 }}>
              <div style={{ display: "flex", gap: T.spacing.sm, alignItems: "baseline" }}>
                <span style={{
                  fontSize:   T.font.size.xs, fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.bold, color: T.warn, flexShrink: 0,
                }}>
                  원인
                </span>
                <span style={{
                  fontSize:   T.font.size.xs, fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.bold, color: T.danger,
                }}>
                  {c.metric} {c.delta != null ? (c.delta > 0 ? `+${c.delta}%` : `${c.delta}%`) : ""}
                </span>
              </div>
              <div style={{ fontSize: T.font.size.xs, color: T.muted, marginTop: 1, paddingLeft: T.spacing.sm }}>
                → {c.interpretation}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 해석 */}
      {interpretation && (
        <div style={{
          borderTop:  causes.length ? `1px solid ${T.borderSoft}` : "none",
          paddingTop: causes.length ? T.spacing.xs : 0,
          display:    "flex",
          gap:        T.spacing.sm,
          alignItems: "flex-start",
        }}>
          <span style={{
            fontSize:   T.font.size.xs, fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold, color: T.primary, flexShrink: 0,
          }}>
            해석
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.sub }}>{interpretation}</span>
        </div>
      )}

      {/* 액션 */}
      {actions.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: T.spacing.xs }}>
          {actions.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: T.spacing.sm, marginTop: i > 0 ? T.spacing.xs : 0 }}>
              <span style={{
                fontSize:   T.font.size.xs, fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold, color: T.primary, flexShrink: 0,
              }}>
                액션
              </span>
              <span style={{ fontSize: T.font.size.xs, color: T.sub }}>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CausalChainCard ──────────────────────────────────────────────────────────

function CausalChainCard({ growth, ctrGrowth }: {
  growth:    GrowthResult | null;
  ctrGrowth: number | null;
}) {
  if (!growth) return null;
  const gV = growth.views       ?? 0;
  const gC = ctrGrowth          ?? 0;
  const gW = growth.watchTime   ?? 0;
  const gA = growth.avgDuration ?? 0;

  if (gV >= -10) return null;

  const causes: { metric: string; delta: number; reason: string }[] = [];
  if (gC < -10) causes.push({ metric: "클릭률",  delta: gC, reason: "썸네일 클릭력 약화" });
  if (gW < -10) causes.push({ metric: "시청시간", delta: gW, reason: "초반 이탈 증가" });
  if (gA < -10) causes.push({ metric: "평균시청", delta: gA, reason: "콘텐츠 유지력 약화" });

  if (!causes.length) return null;

  return (
    <div style={{
      background:   T.semantic.surface.insetTint,
      border:       `1px solid ${T.borderSoft}`,
      borderRadius: T.component.radius.cardLg,
      padding:      T.spacing.lg,
      display:      "flex",
      flexDirection: "column",
      gap:          T.spacing.md,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: T.spacing.md,
        flexWrap: "wrap",
      }}>
        <div style={{
          fontSize:     T.font.size.xs,
          fontFamily:   T.font.familyMono,
          fontWeight:   T.font.weight.bold,
          color:        T.danger,
          letterSpacing: "0.08em",
        }}>
          PERFORMANCE DRIVERS
        </div>
        <div style={{ fontSize: T.font.size.xs, color: T.sub }}>
          하락을 만든 핵심 요인만 압축해서 표시합니다.
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1.1fr) minmax(0, 2fr)",
        gap: T.spacing.md,
        alignItems: "stretch",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 6,
          padding: T.spacing.md,
          background: T.component.surface.softOverlay,
          border: `1px solid ${T.borderColor.danger}`,
          borderRadius: T.component.radius.inset,
        }}>
          <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>ROOT SIGNAL</span>
          <span style={{
            fontSize:   T.font.size.xl,
            fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold,
            color:      T.danger,
          }}>
            조회수 ↓ {gV}%
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.sub }}>
            하락의 중심 신호가 조회수 감소에 묶여 있습니다.
          </span>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(causes.length, 1)}, minmax(0, 1fr))`,
          gap: T.spacing.sm,
        }}>
          {causes.map((c, i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: T.spacing.md,
              background: T.component.surface.softOverlay,
              border: `1px solid ${T.borderSoft}`,
              borderRadius: T.component.radius.inset,
            }}>
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                DRIVER {i + 1}
              </span>
              <span style={{
                fontSize: T.font.size.sm,
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color: T.text,
              }}>
                {c.metric} ↓ {c.delta}%
              </span>
              <span style={{ fontSize: T.font.size.xs, color: T.sub }}>
                {c.reason}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── KPICard ──────────────────────────────────────────────────────────────────

function IssueVideoList({
  label,
  videos,
  onVideoClick,
}: {
  label: string;
  videos: UnderperformingVideo[];
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
}) {
  if (!videos.length || !shouldShowIssueVideos(label) || !onVideoClick) return null;

  const metric = metricFromLabel(label);

  return (
    <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: T.spacing.xs }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: T.spacing.xs,
      }}>
        <span style={{
          fontSize: T.font.size.xs,
          fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold,
          color: T.sub,
        }}>
          성과 저조 영상
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
          클릭 → 상세 보기
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {videos.slice(0, 3).map(video => (
          <button
            key={video.videoId}
            onClick={() => onVideoClick({
              videoId: video.videoId,
              context: { source: "INSIGHT", triggerMetric: metric },
            })}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: T.spacing.sm,
              alignItems: "center",
              width: "100%",
              textAlign: "left",
              padding: `${T.spacing.sm}px`,
              background: T.bgCard,
              border: `1px solid ${T.borderSoft}`,
              borderRadius: T.radius.btn,
              cursor: "pointer",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: T.font.size.xs,
                color: T.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {video.title}
              </div>
              <div style={{
                marginTop: 2,
                fontSize: T.font.size.xs,
                color: T.muted,
                fontFamily: T.font.familyMono,
              }}>
                조회수 {video.views.toLocaleString("ko-KR")} · CTR {(video.ctr * 100).toFixed(1)}% · {video.reason}
              </div>
            </div>
            <div style={{
              fontSize: T.font.size.xs,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
              color: video.viewsDeltaPercent <= -40 ? T.danger : T.warn,
              flexShrink: 0,
            }}>
              {video.viewsDeltaPercent > 0 ? "+" : ""}{video.viewsDeltaPercent}%
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function KPICard({
  card,
  loading,
  underperformingVideos,
  onFocusMetric,
  onOpenInspector,
}: {
  card: CardDef;
  loading: boolean;
  underperformingVideos: UnderperformingVideo[];
  onFocusMetric?: (focus: "CTR" | "VIEWS" | "RETENTION_WEAK" | "STRATEGY") => void;
  onOpenInspector?: (data: KpiInspectorData) => void;
}) {
  const [hovered,  setHovered]  = useState(false);
  const hasDiag = !loading && (card.detail.length > 0 || card.causes.length > 0 || !!card.interpretation);
  const accent = accentFromStatus(card.status);
  const inspectorData: KpiInspectorData = {
    label: card.label,
    icon: card.icon,
    value: card.value,
    growthValue: card.growthValue,
    status: card.status,
    interpretation: card.interpretation,
    detail: card.detail,
    causes: card.causes,
    actions: card.actions,
    underperformingVideos: shouldShowIssueVideos(card.label) ? underperformingVideos.slice(0, 3) : [],
    focus: focusFromLabel(card.label),
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    hovered ? T.semantic.surface.hoverTint : T.bgCard,
        border:        `1px solid ${hovered ? T.border : T.borderSoft}`,
        borderRadius:  T.component.radius.cardMd,
        boxShadow:     hovered ? T.component.shadow.panelHover : T.shadow.card,
        display:       "flex",
        flexDirection: "column",
        minWidth:      0,
        overflow:      "hidden",
        transition:    `background ${T.motion.default}, box-shadow ${T.motion.default}, border-color ${T.motion.fast}`,
      }}
    >
      <div style={{ height: 2, background: accent, opacity: 0.9 }} />

      {/* 카드 상단 — 클릭 영역 */}
      <div
        onClick={() => {
          if (!hasDiag) return;
          onFocusMetric?.(focusFromLabel(card.label));
          onOpenInspector?.(inspectorData);
        }}
        style={{
          padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.xs,
          cursor:        hasDiag ? "pointer" : "default",
        }}
      >
        {/* 레이블 + 토글 아이콘 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            color:         T.muted,
            letterSpacing: "0.08em",
            fontWeight:    T.font.weight.medium,
          }}>
            {card.icon}
          </span>
          {hasDiag ? <ChevronRight size={10} color={T.muted} /> : null}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "end",
          gap: T.spacing.sm,
        }}>
          <span style={{
            fontSize:           loading ? T.font.size.sm : T.font.size.lg,
            fontWeight:         T.font.weight.bold,
            color:              loading ? T.muted : T.text,
            letterSpacing:      "-0.02em",
            fontFamily:         T.font.familyMono,
            lineHeight:         T.font.lineHeight.tight,
            fontVariantNumeric: "tabular-nums",
          }}>
            {loading ? "···" : card.value}
          </span>

          {!loading && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
              minWidth: 0,
              paddingBottom: 1,
            }}>
              <GrowthBadge value={card.growthValue} />
              <StatusBadge status={card.status} />
            </div>
          )}
        </div>

        {!loading && (
          <div style={{
            marginTop: 2,
            paddingTop: T.spacing.xs,
            borderTop: `1px solid ${T.borderSoft}`,
            fontSize: T.font.size.xs,
            color: T.sub,
            lineHeight: 1.35,
          }}>
            {card.interpretation ?? "최근 추세 기준 운영 판단 지표"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPICards ─────────────────────────────────────────────────────────────────

interface KPICardsProps {
  channelAvgCTR?: number | null;
  ctrGrowth?:     number | null;
  underperformingVideos?: UnderperformingVideo[];
  onVideoClick?: (params: { videoId: string; context: VideoClickContext }) => void;
  onFocusMetric?: (focus: "CTR" | "VIEWS" | "RETENTION_WEAK" | "STRATEGY") => void;
  onOpenInspector?: (data: KpiInspectorData) => void;
}

export default function KPICards({
  channelAvgCTR = null,
  ctrGrowth = null,
  underperformingVideos = [],
  onFocusMetric,
  onOpenInspector,
}: KPICardsProps) {
  const { analytics, growth, loadingAnalytics, ctrBuckets } = useAnalyticsContext();
  const cards = buildCards(
    analytics?.current?.summary,
    analytics?.prev30 ?? undefined,
    growth,
    channelAvgCTR,
    ctrGrowth,
    analytics?.current?.trendHistory,
    ctrBuckets,
  );
  const primaryOrder = ["조회수", "클릭률", "시청시간", "구독자"];
  const orderedCards = [
    ...cards.filter(card => primaryOrder.includes(card.label)),
    ...cards.filter(card => !primaryOrder.includes(card.label)),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, letterSpacing: "0.08em" }}>
          KPI
        </span>
        <div style={{ flex: 1, height: 1, background: T.borderSoft }} />
      </div>

      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap:                 T.spacing.sm,
      }}>
        {orderedCards.map(card => (
          <KPICard
            key={card.label}
            card={card}
            loading={loadingAnalytics}
            underperformingVideos={underperformingVideos}
            onFocusMetric={onFocusMetric}
            onOpenInspector={onOpenInspector}
          />
        ))}
      </div>

      {!loadingAnalytics && (
        <CausalChainCard
          growth={growth}
          ctrGrowth={ctrGrowth}
        />
      )}

    </div>
  );
}
