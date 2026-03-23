// ─── VideoDetailModal v1 ──────────────────────────────────────────────────────
// 영상 클릭 시 열리는 드릴다운 모달
//
// 영상별 지표:  views · likes · watchTimeMin · avgDurationSec  (DimensionRow)
// 채널 컨텍스트: trendHistory (LineChart) · trafficSources (BarChart) · keywords
//
// 썸네일: YouTube 공개 URL  https://i.ytimg.com/vi/{videoId}/mqdefault.jpg
// 닫기: [X] 버튼 | Backdrop 클릭 | ESC 키

import { useEffect, useState } from "react";
import React from "react";
// @ts-ignore — JSX 모듈 (타입 선언 없음)
import ThumbnailWorkflowPanel from "../youtube/ThumbnailWorkflowPanel";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { T } from "../../styles/tokens";
import { useContext } from "react";
import { AnalyticsContext } from "@/controllers/useAnalyticsController";
import { useVideoTrend } from "@/controllers/VideoTrendContext";
import { useVideoTraffic } from "@/controllers/VideoTrafficContext";
import { useRedirectStats } from "@/controllers/RedirectStatsContext";
import type { TrendPoint, DimensionRow } from "@/adapters/AnalyticsAdapter";
import type { VideoDiagnostic } from "@/adapters/VideoDiagnosticsAdapter";
import type { AutoAlertTask }   from "@/types/alertTypes";

// ─── 공개 타입 (DashboardPage에서 import) ─────────────────────────────────────

import type { VideoClickContext } from "@/types/dashboardData";

export interface SelectedVideo {
  key:               string;   // videoId
  title:             string;
  views:             number;
  likes:             number | null;
  watchTimeMin:      number | null;   // total_watch_time_min (분)
  avgDurationSec:    number | null;   // avg_watch_time_sec (초)
  impressions:       number | null;
  ctr:               number | null;
  comments:          number | null;
  shares:            number | null;
  runtimeSec:        number | null;   // 영상 길이 (초)
  subscribersGained: number | null;
  /** 영상 데이터 마지막 갱신 시각 (ISO string) — ctr_updated_at 기준 */
  dataLastUpdated:   string | null;
  /** 드릴다운 진입 컨텍스트 — 모달 상단 배너 표시용 */
  clickContext?:     VideoClickContext;
}

// ─── CONTEXT_LABEL_MAP ────────────────────────────────────────────────────────
// source + triggerMetric 조합 → 모달 상단 컨텍스트 배너 텍스트
// UI 컴포넌트는 이 맵만 참조 (하드코딩 금지)

type MetricKey = string; // VideoClickMetric | "default"
const CONTEXT_LABEL_MAP: Record<string, Record<MetricKey, string>> = {
  CTR_INTELLIGENCE: {
    CTR:     "CTR 하락 감지 → 상세 분석",
    default: "CTR 인텔리전스 → 상세 분석",
  },
  DIAGNOSTICS: {
    IMPRESSIONS: "노출 감소 감지 → 상세 분석",
    RETENTION:   "리텐션 이탈 감지 → 상세 분석",
    CTR:         "CTR 이상 감지 → 상세 분석",
    default:     "진단 이슈 감지 → 상세 분석",
  },
  CHANNEL_STATUS: {
    default: "채널 상태 이슈 → 상세 분석",
  },
  INSIGHT: {
    default: "인사이트 감지 → 상세 분석",
  },
  EXECUTION: {
    default: "업로드 성과 → 상세 분석",
  },
  // TOP_VIDEOS / OPPORTUNITY: 배너 없음 (자발적 탐색)
};

/** source + triggerMetric → 배너 텍스트. 매핑 없으면 null (배너 미표시) */
function getContextLabel(ctx?: VideoClickContext): string | null {
  if (!ctx) return null;
  const group = CONTEXT_LABEL_MAP[ctx.source];
  if (!group) return null;
  return group[ctx.triggerMetric ?? "default"] ?? group["default"] ?? null;
}

// ─── getLastUpdatedDisplay ────────────────────────────────────────────────────
// Last Updated 표시 로직을 UI에서 완전 분리

type FreshnessState = "fresh" | "normal" | "stale" | "collecting" | "unknown";

interface LastUpdatedDisplay {
  label: string;
  state: FreshnessState;
  raw:   string | null;
}

function getLastUpdatedDisplay(dataLastUpdated: string | null): LastUpdatedDisplay {
  if (!dataLastUpdated) {
    return { label: "데이터 초기 수집 중", state: "collecting", raw: null };
  }

  const diffMs    = Date.now() - new Date(dataLastUpdated).getTime();
  const diffHours = diffMs / 3_600_000;

  let label: string;
  if (diffHours < 1) {
    label = `${Math.max(1, Math.round(diffHours * 60))}분 전`;
  } else if (diffHours < 24) {
    label = `${Math.floor(diffHours)}시간 전`;
  } else {
    label = `${Math.floor(diffHours / 24)}일 전`;
  }

  const state: FreshnessState =
    diffHours < 6  ? "fresh"  :
    diffHours < 24 ? "normal" : "stale";

  return { label, state, raw: dataLastUpdated };
}

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtViews(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtWatchTime(min: number | null | undefined): string {
  if (min == null || isNaN(min)) return "—";
  if (min >= 10_000) return `${(min / 10_000).toFixed(1)}만분`;
  return `${min.toLocaleString("ko-KR")}분`;
}

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtCTR(ctr: number | null | undefined): string {
  if (ctr == null || isNaN(ctr)) return "—";
  return `${(ctr * 100).toFixed(1)}%`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── MetricChip ───────────────────────────────────────────────────────────────

function MetricChip({
  label,
  value,
  subValue,
  subColor,
}: {
  label:     string;
  value:     string;
  subValue?: string;
  subColor?: string;
}) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           2,
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      background:    T.bgSection,
      borderRadius:  T.radius.btn,
      minWidth:      80,
    }}>
      <span style={{
        fontSize:      "10px",
        fontFamily:    T.font.familyMono,
        color:         T.muted,
        letterSpacing: "0.06em",
      }}>
        {label}
      </span>
      <span style={{
        fontSize:   T.font.size.md,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color:      T.text,
        lineHeight: 1,
      }}>
        {value}
      </span>
      {subValue && (
        <span style={{
          fontSize:   T.font.size.xxs,
          fontFamily: T.font.familyMono,
          color:      subColor ?? T.muted,
          lineHeight: 1.3,
          marginTop:  1,
        }}>
          {subValue}
        </span>
      )}
    </div>
  );
}

// ─── TrendSection ─────────────────────────────────────────────────────────────

function TrendSection({ data }: { data: TrendPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height:         72,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            4,
        background:     T.bgSection,
        borderRadius:   T.radius.btn,
      }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
          studio_csv_ingestor.py 실행 후 데이터가 표시됩니다
        </span>
      </div>
    );
  }

  const chartData = data.map(p => ({ date: fmtDate(p.date), views: p.views }));

  return (
    <ResponsiveContainer width="100%" height={110}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: T.font.size.xs, fill: T.muted, fontFamily: T.font.familyMono }}
          tickLine={false} axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: T.radius.btn, fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
          }}
          formatter={(val: unknown) => [(Number(val ?? 0)).toLocaleString("ko-KR"), "조회수"]}
        />
        <Line
          type="monotone" dataKey="views"
          stroke={T.primary} strokeWidth={2} dot={false}
          activeDot={{ r: 4, fill: T.primary }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── TrafficInsight — 패턴 분류 + CTR × Source 조합 분석 ─────────────────────

type TrafficPattern = "VIRAL_HOME" | "RECOMMEND_CHAIN" | "SEO" | "MIXED";

interface TrafficInsight {
  mainSource: string;
  mainRatio:  number;
  pattern:    TrafficPattern;
  summary:    string;
  strategy:   string | null;
}

function computeTrafficInsight(
  sources:       DimensionRow[],
  ctr:           number | null,
  channelAvgCTR: number | null,
): TrafficInsight | null {
  if (!sources || sources.length === 0) return null;

  const main      = sources[0]; // ratio 내림차순 정렬됨
  const mainRatio = main.ratio;

  let pattern: TrafficPattern = "MIXED";
  if (main.key === "BROWSE_FEATURES" && mainRatio >= 0.6)  pattern = "VIRAL_HOME";
  else if (main.key === "SUGGESTED_VIDEO" && mainRatio >= 0.4) pattern = "RECOMMEND_CHAIN";
  else if (main.key === "YT_SEARCH"       && mainRatio >= 0.4) pattern = "SEO";

  const sourceLabel = TRAFFIC_LABEL[main.key] ?? main.key;
  const summary     = `${sourceLabel} ${Math.round(mainRatio * 100)}% 중심`;

  let strategy: string | null = null;
  if (ctr != null && channelAvgCTR != null && channelAvgCTR > 0) {
    const ctrHigh = ctr >= channelAvgCTR * 1.1;
    const ctrLow  = ctr <  channelAvgCTR * 0.8;
    const ctrPct  = (ctr * 100).toFixed(1);

    if (pattern === "VIRAL_HOME") {
      if (ctrHigh)      strategy = `썸네일 강함 — 홈화면 ${Math.round(mainRatio * 100)}% + CTR ${ctrPct}% → 썸네일·제목 패턴 유지 권장`;
      else if (ctrLow)  strategy = `홈화면 노출은 있으나 CTR 약함 (${ctrPct}%) → 썸네일 교체로 클릭률 개선 필요`;
      else              strategy = `홈화면 중심 안정 확산 중 — 현재 전략 유지`;
    } else if (pattern === "RECOMMEND_CHAIN") {
      if (ctrHigh)      strategy = `기존 영상 추천 연결 효과 — CTR ${ctrPct}% 양호, 시리즈 연결 강화 권장`;
      else if (ctrLow)  strategy = `추천 유입은 있으나 CTR 약함 (${ctrPct}%) → 썸네일 개선으로 추천 CTR 회복 필요`;
      else              strategy = `추천 알고리즘 연결 정상 작동 중`;
    } else if (pattern === "SEO") {
      if (ctrHigh)      strategy = `검색 의도 일치 — CTR ${ctrPct}% 양호, 제목·설명 키워드 패턴 유지 권장`;
      else if (ctrLow)  strategy = `검색 유입은 있으나 CTR 약함 (${ctrPct}%) → 제목 앞 3단어 키워드 강화 필요`;
      else              strategy = `검색 기반 안정 유입 중`;
    } else {
      if (ctrHigh)      strategy = `복합 유입 + CTR ${ctrPct}% 양호 → 현재 배포 전략 유지 권장`;
      else if (ctrLow)  strategy = `복합 유입 + CTR 약함 (${ctrPct}%) → 썸네일·제목 재점검 필요`;
    }
  }

  return { mainSource: main.key, mainRatio, pattern, summary, strategy };
}

const PATTERN_META: Record<TrafficPattern, { color: string; bg: string; border: string }> = {
  VIRAL_HOME:      { color: T.color.success,         bg: T.successBg,    border: T.color.success },
  RECOMMEND_CHAIN: { color: T.color.primary,         bg: T.primarySoft,  border: T.color.primary },
  SEO:             { color: T.component.palette.ai,  bg: `${T.component.palette.ai}10`,    border: T.component.palette.ai },
  MIXED:           { color: T.muted,                 bg: T.bgSection,    border: T.borderSoft },
};

function TrafficInsightPanel({
  insight,
}: {
  insight: TrafficInsight;
}) {
  const meta = PATTERN_META[insight.pattern];
  return (
    <div style={{
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      background:    meta.bg,
      border:        `1px solid ${meta.border}30`,
      borderRadius:  T.radius.btn,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xs,
      marginBottom:  T.spacing.sm,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
        <span style={{
          fontSize:      T.font.size.xxs,
          fontWeight:    T.font.weight.bold,
          fontFamily:    T.font.familyMono,
          color:         meta.color,
          border:        `1px solid ${meta.border}`,
          borderRadius:  T.radius.badge,
          padding:       "1px 5px",
          letterSpacing: "0.05em",
          flexShrink:    0,
        }}>
          {insight.pattern}
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.sub,
          fontFamily: T.font.familyMono,
        }}>
          {insight.summary}
        </span>
      </div>
      {insight.strategy && (
        <span style={{
          fontSize:   T.font.size.xxs,
          color:      T.sub,
          fontFamily: T.font.familyMono,
          lineHeight: 1.5,
        }}>
          {insight.strategy}
        </span>
      )}
    </div>
  );
}

// ─── TrafficSection ───────────────────────────────────────────────────────────

const TRAFFIC_LABEL: Record<string, string> = {
  // 현재 API 키 (v2)
  BROWSE_FEATURES:   "홈화면",
  SUGGESTED_VIDEO:   "추천 영상",
  YT_SEARCH:         "유튜브 검색",
  EXTERNAL:          "외부 유입",
  SUBSCRIBER:        "구독자 피드",
  YT_CHANNEL:        "채널 페이지",
  YT_PLAYLIST_PAGE:  "재생목록",
  DIRECT_OR_UNKNOWN: "직접/기타",
  END_SCREEN:        "끝 화면",
  NOTIFICATION:      "알림",
  HASHTAG_PAGES:     "해시태그",
  PRODUCT_PAGE:      "상품 페이지",
  // 구버전 API 키 (fallback)
  RELATED_VIDEO:     "추천 영상",
  BROWSE:            "홈화면",
};

const TRAFFIC_COLORS = [T.primary, T.success, T.warn, T.component.palette.ai, T.component.palette.messenger, T.component.palette.social, T.muted, T.muted, T.muted];

function TrafficSection({ data }: { data: DimensionRow[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height: 80, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: T.font.size.xs, color: T.muted,
        background: T.bgSection, borderRadius: T.radius.btn,
      }}>
        유입 데이터 없음
      </div>
    );
  }

  const chartData = data.slice(0, 6).map(d => ({
    name:  TRAFFIC_LABEL[d.key] ?? d.key,
    ratio: Math.round(d.ratio * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide domain={[0, 100]} />
        <YAxis
          type="category" dataKey="name" width={88}
          tick={{ fontSize: T.font.size.sm, fill: T.sub }} axisLine={false} tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: T.radius.btn, fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
          }}
          formatter={(val: unknown) => [`${Number(val ?? 0)}%`, "비율"]}
        />
        <Bar dataKey="ratio" radius={[0, 3, 3, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={TRAFFIC_COLORS[i] ?? T.muted} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}


// ─── VideoVerdict ─────────────────────────────────────────────────────────────
// CTR 기반 판단 문장 — impressions < 500 또는 ctr == null이면 렌더링 skip

function VideoVerdict({
  video,
  channelAvgCTR,
}: {
  video:         SelectedVideo;
  channelAvgCTR: number | null;
}) {
  // 방어 조건: 데이터 불충분
  if (video.impressions == null || video.impressions < 500) return null;
  if (video.ctr == null)  return null;
  if (channelAvgCTR == null) return null;

  const diff    = (video.ctr - channelAvgCTR) / channelAvgCTR;
  const diffPct = Math.abs(diff * 100).toFixed(0);

  if (diff <= -0.20) {
    return (
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.sm,
        padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
        background:   T.warnBg,
        border:       `1px solid ${T.color.warning}40`,
        borderRadius: T.radius.btn,
        fontSize:     T.font.size.xs,
        fontFamily:   T.font.familyMono,
        color:        T.color.warning,
      }}>
        ⚠ CTR이 채널 평균보다 {diffPct}% 낮습니다 → 썸네일 교체 권장
      </div>
    );
  }

  if (diff >= 0.10) {
    return (
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.sm,
        padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
        background:   T.successBg,
        border:       `1px solid ${T.color.success}40`,
        borderRadius: T.radius.btn,
        fontSize:     T.font.size.xs,
        fontFamily:   T.font.familyMono,
        color:        T.color.success,
      }}>
        ✓ CTR이 채널 평균보다 {diffPct}% 높습니다 → 썸네일·제목 패턴 유지 권장
      </div>
    );
  }

  return null;
}

// ─── DiagnosticsBadge ─────────────────────────────────────────────────────────
// NORMAL / severity=NONE → null (렌더링 금지)
// severity: CRITICAL → 빨강 / HIGH → 주황 / MEDIUM → 회색 약한 표시

const PROBLEM_LABEL: Record<string, string> = {
  IMPRESSION_DROP: "노출 감소",
  CTR_WEAK:        "CTR 저하",
  RETENTION_WEAK:  "시청유지율 저하",
  INSUFFICIENT_DATA: "진단 데이터 수집 중",
};

const SOURCE_LABEL: Record<string, string> = {
  BROWSE_DROP:    "홈피드",
  SUGGESTED_DROP: "추천 영상",
  EXTERNAL_DROP:  "외부 유입",
  MIXED_DROP:     "복합 유입",
  THUMBNAIL_WEAK: "썸네일",
  NONE:           "",
};

type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "NONE";

function severityStyle(severity: SeverityLevel): { color: string; bg: string; border: string } {
  switch (severity) {
    case "CRITICAL": return { color: T.danger,              bg: T.dangerBg,  border: T.danger };
    case "HIGH":     return { color: T.warn, bg: T.warnBg, border: T.warn };
    case "MEDIUM":   return { color: T.muted,               bg: T.bgSection, border: T.borderSoft };
    default:         return { color: T.muted,               bg: T.bgSection, border: T.borderSoft };
  }
}

function DiagnosticsBadge({ diag }: { diag: VideoDiagnostic | undefined }) {
  if (!diag) return null;
  if (diag.problemType === "NORMAL" || diag.severity === "NONE" || !diag.severity) return null;

  // INSUFFICIENT_DATA → 회색 배지만
  if (diag.problemType === "INSUFFICIENT_DATA") {
    return (
      <div style={{
        padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
        background:   T.bgSection,
        border:       `1px solid ${T.borderSoft}`,
        borderRadius: T.radius.btn,
        fontSize:     T.font.size.xs,
        fontFamily:   T.font.familyMono,
        color:        T.muted,
      }}>
        진단 데이터 수집 중
      </div>
    );
  }

  const sev    = diag.severity as SeverityLevel;
  const styles = severityStyle(sev);
  const srcTag = SOURCE_LABEL[diag.diagnosis] ?? SOURCE_LABEL[diag.trafficSourceType] ?? "";

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          T.spacing.sm,
        padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
        background:   styles.bg,
        border:       `1px solid ${styles.border}40`,
        borderRadius: T.radius.btn,
    }}>
      {/* severity 라벨 */}
      <span style={{
        fontSize:     T.font.size.xxs,
        fontWeight:   T.font.weight.bold,
        fontFamily:   T.font.familyMono,
        color:        styles.color,
        border:       `1px solid ${styles.border}`,
        borderRadius: T.radius.badge,
        padding:      "1px 5px",
        flexShrink:   0,
        alignSelf:    "center",
        letterSpacing: "0.05em",
      }}>
        {sev}
      </span>
      {/* problem label · source tag (의미 분리) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: T.font.size.xs, color: styles.color, fontWeight: T.font.weight.semibold }}>
          {PROBLEM_LABEL[diag.problemType] ?? diag.problemType}
        </span>
        {srcTag && (
          <span style={{ fontSize: T.font.size.xxs, color: styles.color, opacity: 0.75, fontFamily: T.font.familyMono }}>
            원인: {srcTag}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── LinkedTaskSection ────────────────────────────────────────────────────────
// status !== "done" 인 태스크만 / video_id 매칭

// ─── ActionItems ──────────────────────────────────────────────────────────────
// problemType + diagnosis 기반 정적 액션 맵 → 권장 액션 3개
// successRate: 향후 학습 시스템 연결 준비 (현재는 기본값, ActionResultPanel 데이터로 갱신 예정)

interface ActionDef {
  label:        string;
  key?:         string;   // P2-B 보강 3: 집계 키 (e.g., "THUMBNAIL", "TITLE", "COMMUNITY")
  successRate?: number;   // 0~1 — 설정 시 높은 순 정렬 + 성공률 표시
}

const ACTION_MAP: Record<string, ActionDef[]> = {
  // 노출 감소 계열
  IMPRESSION_DROP_BROWSE_DROP: [
    { key: "THUMBNAIL",       label: "썸네일 교체 → 홈피드 CTR 개선 (목표: 5.0%↑)", successRate: 0.72 },
    { key: "TITLE",           label: "제목 앞 3단어에 핵심 키워드 배치",              successRate: 0.58 },
    { key: "COMMUNITY",       label: "업로드 후 24시간 내 커뮤니티 포스팅",           successRate: 0.41 },
  ],
  IMPRESSION_DROP_SUGGESTED_DROP: [
    { key: "SERIES",          label: "관련 영상 시리즈 연결 (끝 화면 / 카드)",          successRate: 0.63 },
    { key: "RETENTION_CHECK", label: "추천 알고리즘 유입을 위한 시청유지율 점검",       successRate: 0.55 },
    { key: "TITLE",           label: "태그 및 설명란 키워드 보강",                     successRate: 0.38 },
  ],
  IMPRESSION_DROP_EXTERNAL_DROP: [
    { key: "EXTERNAL_LINK",   label: "외부 유입 링크 상태 점검 (리다이렉트 확인)",      successRate: 0.68 },
    { key: "COMMUNITY",       label: "커뮤니티·SNS 재공유로 외부 유입 복구",           successRate: 0.49 },
    { key: "EXTERNAL_LINK",   label: "영상 설명란 외부 링크 업데이트",                 successRate: 0.42 },
  ],
  IMPRESSION_DROP_MIXED_DROP: [
    { key: "THUMBNAIL",       label: "썸네일 교체 + 외부 링크 동시 점검",              successRate: 0.61 },
    { key: "UPLOAD_TIMING",   label: "업로드 간격 조정 (알고리즘 피로도 감소)",         successRate: 0.44 },
    { key: "COMMUNITY",       label: "커뮤니티 포스팅으로 구독자 재유입 유도",         successRate: 0.37 },
  ],
  // CTR 저하 계열
  CTR_WEAK_THUMBNAIL_WEAK: [
    { key: "THUMBNAIL",       label: "썸네일 A/B 테스트 → BROWSE CTR 개선",           successRate: 0.75 },
    { key: "TITLE",           label: "제목 앞 3단어 키워드 강화",                      successRate: 0.54 },
    { key: "THUMBNAIL",       label: "채널 평균 CTR 대비 -20% 이상이면 즉시 교체",     successRate: 0.66 },
  ],
  CTR_WEAK: [
    { key: "THUMBNAIL",       label: "썸네일 교체 → 클릭률 개선 실험",                successRate: 0.70 },
    { key: "TITLE",           label: "제목 키워드 재배치 (검색 노출 최적화)",           successRate: 0.52 },
    { key: "THUMBNAIL",       label: "CTR 높은 기존 영상 썸네일 패턴 분석 및 적용",    successRate: 0.48 },
  ],
  // 시청유지율 저하 — 서브타입별
  RETENTION_WEAK_INTRO_DROP: [
    { key: "INTRO_EDIT",      label: "인트로 5초 핵심 장면 즉시 시작 (후크 강화)",     successRate: 0.68 },
    { key: "INTRO_EDIT",      label: "오프닝 자막·효과음으로 첫 장면 집중도 상승",     successRate: 0.54 },
    { key: "TITLE",           label: "전달 포인트 1문장으로 인트로에 직접 배치",       successRate: 0.46 },
  ],
  RETENTION_WEAK_MID_DROP: [
    { key: "EDIT_MID",        label: "중반부 늘어지는 구간 편집 (2~3분 구간 점검)",    successRate: 0.58 },
    { key: "CHAPTER",         label: "중간 챕터 마커로 시청 흐름 안내",               successRate: 0.53 },
    { key: "EDIT_MID",        label: "중반 이후 요약 화면·자막 추가",                 successRate: 0.44 },
  ],
  RETENTION_WEAK_FLAT_DROP: [
    { key: "LENGTH_CUT",      label: "영상 길이 축소 → 시청유지율 전반 개선",          successRate: 0.56 },
    { key: "EDIT_MID",        label: "전체 구성 재검토 — 핵심 내용 분산 해소",         successRate: 0.51 },
    { key: "INTRO_EDIT",      label: "오프닝 후크 + 클로징 CTA 강화로 앞뒤 고정",     successRate: 0.47 },
  ],
  // 시청유지율 저하 — 구버전 fallback
  RETENTION_WEAK_CONTENT_RETENTION_WEAK: [
    { key: "INTRO_EDIT",      label: "인트로 15초 재편집 (핵심 내용 앞배치)",          successRate: 0.60 },
    { key: "EDIT_MID",        label: "영상 중반 구간별 이탈 지점 확인",                successRate: 0.55 },
    { key: "CHAPTER",         label: "자막 / 챕터 마커 추가로 시청 흐름 개선",         successRate: 0.43 },
  ],
  RETENTION_WEAK: [
    { key: "INTRO_EDIT",      label: "인트로 15초 재편집 (핵심 내용 앞배치)",          successRate: 0.60 },
    { key: "EDIT_MID",        label: "영상 중반 구간별 이탈 지점 확인",                successRate: 0.55 },
    { key: "CHAPTER",         label: "자막 / 챕터 마커 추가로 시청 흐름 개선",         successRate: 0.43 },
  ],
};

function getRecommendedActions(problemType: string, diagnosis: string): ActionDef[] {
  const specificKey = `${problemType}_${diagnosis}`;
  const raw = ACTION_MAP[specificKey] ?? ACTION_MAP[problemType]
    ?? [{ label: "진단 결과를 바탕으로 썸네일·제목·외부 링크 순서로 점검하세요." }];
  // successRate 높은 순 정렬
  return [...raw].sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0));
}

// ── Bayesian cold-start blend: (rate*n + default*k) / (n+k)
function bayesBlend(rate: number, n: number, defaultRate = 0.5, k = 3): number {
  return (rate * n + defaultRate * k) / (n + k);
}

// ── 추천 이유 + 기여도 맵 (problemType 기반)
interface ProblemMeta { reason: string; weight: number; }
const PROBLEM_META: Record<string, ProblemMeta> = {
  CTR_WEAK:                   { reason: "CTR 낮음",          weight: 0.60 },
  IMPRESSION_DROP:            { reason: "노출 감소",          weight: 0.40 },
  RETENTION_WEAK:             { reason: "시청유지율 낮음",    weight: 0.45 },
  ALGORITHM_DISTRIBUTION_LOW: { reason: "알고리즘 노출 부족", weight: 0.50 },
  TITLE_DISCOVERY_WEAK:       { reason: "검색 유입 약함",     weight: 0.55 },
};

/** 추천 액션에 이유 + 기여도 한 줄 표시 */
function ExplainLine({
  problemType,
  successRate,
  blended,
  sampleCount,
}: {
  problemType:  string;
  successRate?: number;
  blended:      number | null;
  sampleCount:  number;
}) {
  const meta = PROBLEM_META[problemType];
  if (!meta) return null;

  const rate      = blended ?? successRate;
  const ratePct   = rate != null ? Math.round(rate * 100) : null;
  const weightPct = Math.round(meta.weight * 100);
  const rateLabel = ratePct != null
    ? `성공률 ${ratePct}%${sampleCount < 2 ? " (추정)" : ""}`
    : null;

  return (
    <div style={{
      fontSize:   T.font.size.xxs,
      fontFamily: T.font.familyMono,
      color:      T.muted,
      marginTop:  2,
      display:    "flex",
      gap:        4,
    }}>
      <span>이유:</span>
      <span>{meta.reason} <span style={{ opacity: 0.75 }}>(영향 {weightPct}%)</span></span>
      {rateLabel && <span>· {rateLabel}</span>}
    </div>
  );
}

// ── 실패 학습 노트 — growth_delta 기반 "무엇이 안 변했는지" 표시
function FailureLearningNote({
  delta,
  repeatCount,
}: {
  delta:       TrackingEntry["growth_delta"];
  repeatCount: number;
}) {
  const lines: string[] = [];

  if (delta) {
    // CTR 변화 해석
    if (delta.ctr_pct != null) {
      const abs = Math.abs(delta.ctr_pct);
      if (abs < 3) {
        lines.push(`CTR 변화 없음 (${delta.ctr_pct >= 0 ? "+" : ""}${delta.ctr_pct}%)`);
      } else if (delta.ctr_pct < 0) {
        lines.push(`CTR 오히려 감소 (${delta.ctr_pct}%)`);
      }
    }
    // 조회수 변화 해석
    if (delta.views_pct != null && delta.views_pct < 0) {
      lines.push(`조회수 감소 (${delta.views_pct}%)`);
    }
    // 지표 전혀 없을 때
    if (!delta.ctr_pct && !delta.views_pct && !delta.impressions_pct) {
      lines.push("지표 변화 없음");
    }
  }

  if (repeatCount >= 3) {
    lines.push(`이 패턴은 최근 ${repeatCount}회 연속 실패`);
  }

  lines.push("다른 접근 필요");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
      {lines.map((line, i) => (
        <span key={i} style={{
          fontSize:   T.font.size.xxs,
          fontFamily: T.font.familyMono,
          color:      i === lines.length - 1 ? T.danger : T.muted,
          fontWeight: i === lines.length - 1 ? 700 : 400,
        }}>
          → {line}
        </span>
      ))}
    </div>
  );
}

function ActionItems({
  diag,
  videoId,
  executionCount = 0,
  typeRates = {},
  onThumbnailStart,
}: {
  diag:               VideoDiagnostic;
  videoId:            string;
  executionCount?:    number;
  typeRates?:         Record<string, ActionTypeRate>;
  onThumbnailStart?:  () => void;
}) {
  const [doneSet, setDoneSet] = useState<Set<number>>(new Set());

  // 보강 1 — Exploration bias: 마운트 시 1회만 결정 (stable across re-renders)
  // 20% 확률로 하위 액션 1개를 무작위 위치에 삽입 → 새 전략 노출
  const [actions] = useState<ActionDef[]>(() => {
    const sorted = getRecommendedActions(diag.problemType, diag.diagnosis);
    if (sorted.length > 1 && Math.random() < 0.2) {
      const fromIdx  = Math.floor(Math.random() * (sorted.length - 1)) + 1;  // 하위 중 1개
      const toIdx    = Math.floor(Math.random() * fromIdx);                   // 상위 위치
      const [item]   = sorted.splice(fromIdx, 1);
      sorted.splice(toIdx, 0, item);
    }
    return sorted;
  });

  function toggleDone(i: number, action: ActionDef) {
    const alreadyDone = doneSet.has(i);
    setDoneSet(prev => {
      const next = new Set(prev);
      alreadyDone ? next.delete(i) : next.add(i);
      return next;
    });
    if (!alreadyDone) {
      const api = (window as any).api;
      api?.registerActionComplete?.({
        video_id:     videoId,
        action_type:  diag.problemType,
        action_label: action.key ?? null,
        source:       "manual",
      }).catch(console.error);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
      <span style={{
        fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
        color: T.sub, letterSpacing: "0.04em", fontWeight: T.font.weight.semibold,
      }}>
        권장 액션
      </span>
      {actions.map((action, i) => {
        const done = doneSet.has(i);
        const hasRate = action.successRate != null;

        // 보강 3: 복합키 룩업
        const specificKey = action.key ? `${diag.problemType}_${action.key}` : null;
        const rawRate     = specificKey
          ? (typeRates[specificKey] ?? typeRates[diag.problemType] ?? null)
          : (typeRates[diag.problemType] ?? null);

        // 보강 2 — Cold start blend: n=0이어도 0.5 기준 추정치로 시작
        // n >= 2면 실측으로 인정, n < 2면 "(추정)" 표시
        const blended = rawRate != null
          ? bayesBlend(rawRate.rate, rawRate.total)
          : null;
        const isEstimate  = rawRate == null || rawRate.total < 2;
        const sampleCount = rawRate?.total ?? 0;

        const rateColor = !hasRate ? T.muted
          : action.successRate! >= 0.65 ? T.success
          : action.successRate! >= 0.45 ? T.warn
          : T.danger;

        return (
          <div key={i} style={{
            display:      "flex",
            alignItems:   "center",
            gap:          T.spacing.sm,
            padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
            background:   done ? T.bgSection : T.bgCard,
            border:       `1px solid ${done ? T.borderSoft : T.border}`,
            borderRadius: T.radius.btn,
            opacity:      done ? 0.5 : 1,
            transition:   "opacity 0.2s",
          }}>
            <span style={{
              fontSize: T.font.size.sm, fontFamily: T.font.familyMono, fontWeight: 700,
              color: done ? T.muted : T.sub, flexShrink: 0, minWidth: 16,
            }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
              <span style={{
                fontSize: T.font.size.sm, color: done ? T.muted : T.text,
                lineHeight: 1.4,
                textDecoration: done ? "line-through" : "none",
              }}>
                {action.label}
              </span>
              {!done && (
                <ExplainLine
                  problemType={diag.problemType}
                  successRate={action.successRate}
                  blended={blended}
                  sampleCount={sampleCount}
                />
              )}
            </div>
            {/* 성공률 배지 — P2-B: Bayesian blend 실측 우선, 정적 fallback */}
            {!done && (() => {
              if (blended != null) {
                // cold-start blend 항상 표시 (n=0 → ~50%, n↑ → 실측 수렴)
                const dynColor =
                  blended >= 0.65 ? T.success :
                  blended >= 0.45 ? T.warn : T.danger;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                    <span style={{
                      fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: 700,
                      color: dynColor, border: `1px solid ${dynColor}`,
                      borderRadius: T.radius.badge, padding: "1px 4px", whiteSpace: "nowrap",
                    }}>
                      실측 {Math.round(blended * 100)}%
                    </span>
                    <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.muted }}>
                      {isEstimate ? "(추정)" : `(${sampleCount}건)`}
                    </span>
                  </div>
                );
              }
              // typeRates 없을 때 정적 기본값
              if (hasRate) {
                return (
                  <span style={{
                    fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: 700,
                    color: rateColor, border: `1px solid ${rateColor}`,
                    borderRadius: T.radius.badge, padding: "1px 4px", flexShrink: 0, whiteSpace: "nowrap",
                  }}>
                    {Math.round(action.successRate! * 100)}%
                    {executionCount > 0 && ` · ${executionCount}회 실행`}
                  </span>
                );
              }
              return null;
            })()}
            {/* THUMBNAIL 액션 전용: 워크플로우 시작 버튼 */}
            {action.key === "THUMBNAIL" && !done && onThumbnailStart && (
              <button
                onClick={onThumbnailStart}
                style={{
                  fontSize: T.font.size.xs, fontWeight: 700,
                  color: T.primary,
                  background: T.primarySoft ?? `${T.primary}15`,
                  border: `1px solid ${T.primaryBorder ?? T.primary}`,
                  borderRadius: T.radius.pill,
                  padding: "2px 8px", cursor: "pointer", flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                워크플로우
              </button>
            )}
            <button
              onClick={() => toggleDone(i, action)}
              style={{
                fontSize: T.font.size.xs, color: done ? T.success : T.sub,
                background: "transparent",
                border: `1px solid ${done ? T.success : T.borderSoft}`,
                borderRadius: T.radius.pill,
                padding: "2px 8px", cursor: "pointer", flexShrink: 0,
              }}
            >
              {done ? "✓" : "완료"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── ActionTrackingStatus ──────────────────────────────────────────────────────
// action_tracking.json에서 이 영상의 추적 상태를 로드해 표시
// ActionDiagnosticsSection이 데이터를 한 번만 fetch → 여기엔 groups만 받음

interface TrackingEntry {
  video_id:     string;
  action_type:  string;
  status:       "ONGOING" | "SUCCESS" | "FAILED";
  action_date:  string;
  check_after:  string;
  confidence?:  string;
  result?:      string | null;
  baseline?:    { impressions?: number; ctr?: number; views?: number };
  current_metrics?: { impressions?: number; ctr?: number; views?: number };
  growth_delta?: { views_pct?: number | null; ctr_pct?: number | null; impressions_pct?: number | null } | null;
}

// action_type별 실행 횟수 + 최근 결과 집계
interface ActionTypeGroup {
  action_type:  string;
  count:        number;
  latestStatus: "ONGOING" | "SUCCESS" | "FAILED";
  latest:       TrackingEntry;
  all:          TrackingEntry[];
}

function buildGroups(entries: TrackingEntry[]): ActionTypeGroup[] {
  const groupMap = new Map<string, TrackingEntry[]>();
  for (const e of entries) {
    const list = groupMap.get(e.action_type) ?? [];
    list.push(e);
    groupMap.set(e.action_type, list);
  }
  const groups: ActionTypeGroup[] = [];
  for (const [action_type, list] of groupMap) {
    const sorted = [...list].sort((a, b) =>
      (b.result ?? b.action_date ?? "").localeCompare(a.result ?? a.action_date ?? "")
    );
    groups.push({
      action_type,
      count:        list.length,
      latestStatus: sorted[0].status,
      latest:       sorted[0],
      all:          sorted,
    });
  }
  groups.sort((a, b) =>
    (b.latest.action_date ?? "").localeCompare(a.latest.action_date ?? "")
  );
  return groups;
}

function useActionTrackingGroups(videoId: string): ActionTypeGroup[] {
  const [entries, setEntries] = useState<TrackingEntry[]>([]);
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.loadActionTracking) return;
    api.loadActionTracking(videoId)
      .then((data: TrackingEntry[]) => setEntries(data ?? []))
      .catch(console.error);
  }, [videoId]);
  return buildGroups(entries);
}

// ── P2-B: action_type별 전체 기간 실측 성공률 훅
// 반환: { [action_type]: { success, total, rate } }
interface ActionTypeRate { success: number; total: number; rate: number; }

function useActionTypeRates(): Record<string, ActionTypeRate> {
  const [rates, setRates] = useState<Record<string, ActionTypeRate>>({});
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.loadActionTypeRates) return;
    api.loadActionTypeRates()
      .then((data: Record<string, ActionTypeRate>) => setRates(data ?? {}))
      .catch(console.error);
  }, []);
  return rates;
}

// ── ActionTrackingRows: 순수 렌더 (groups prop 받음)
function ActionTrackingRows({ groups }: { groups: ActionTypeGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
      <span style={{
        fontSize: T.font.size.xs, fontFamily: T.font.familyMono,
        color: T.sub, letterSpacing: "0.04em", fontWeight: T.font.weight.semibold,
      }}>
        실행 이력
      </span>
      {groups.slice(0, 3).map((group) => (
        <TrackingRow key={group.action_type} entry={group.latest} repeatCount={group.count} />
      ))}
    </div>
  );
}

// ── VideoStatusSummary: groups 기반 이 영상의 전체 상태 판정
function VideoStatusSummary({ groups }: { groups: ActionTypeGroup[] }) {
  if (groups.length === 0) return null;

  const hasSuccess = groups.some(g => g.latestStatus === "SUCCESS");
  const hasOngoing = groups.some(g => g.latestStatus === "ONGOING");
  const repeatFail = groups.some(g => g.count >= 2 && g.latestStatus === "FAILED");
  const onlyFailed = !hasSuccess && !hasOngoing && groups.every(g => g.latestStatus === "FAILED");

  let icon:       string;
  let text:       string;
  let nextAction: string;
  let color:      string;
  let bg:         string;

  if (hasSuccess && !repeatFail) {
    icon       = "✔";
    text       = "개선 성공 패턴";
    nextAction = "→ 비슷한 영상에도 적용 추천";
    color      = T.success;
    bg         = T.successBg ?? `${T.success}15`;
  } else if (repeatFail || onlyFailed) {
    icon       = "⚠";
    text       = "개선 필요";
    nextAction = "→ 썸네일 교체 우선 추천";
    color      = T.warn;
    bg         = T.warnBg ?? T.dangerBg;
  } else {
    icon       = "⏳";
    text       = "추적 중";
    nextAction = "";
    color      = T.muted;
    bg         = T.bgSection;
  }

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
      padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
      background:   bg,
      border:       `1px solid ${color}40`,
      borderRadius: T.radius.btn,
      fontSize:     T.font.size.xs,
      fontFamily:   T.font.familyMono,
    }}>
      <span style={{ color: color, fontWeight: T.font.weight.semibold }}>이 영상 상태:</span>
      <span style={{ color: color, fontWeight: T.font.weight.bold }}>{icon} {text}</span>
      {nextAction && (
        <span style={{ color: color, opacity: 0.75, marginLeft: T.spacing.xs }}>
          {nextAction}
        </span>
      )}
    </div>
  );
}

// ── 하위호환용 (단독 사용 시)
function ActionTrackingStatus({ videoId }: { videoId: string }) {
  const groups = useActionTrackingGroups(videoId);
  return <ActionTrackingRows groups={groups} />;
}

// ── action_type → 한국어 레이블
const ACTION_TYPE_LABEL: Record<string, string> = {
  IMPRESSION_DROP:            "노출 개선",
  CTR_WEAK:                   "썸네일 변경",
  RETENTION_WEAK:             "시청유지율 개선",
  ALGORITHM_DISTRIBUTION_LOW: "알고리즘 개선",
  TITLE_DISCOVERY_WEAK:       "제목 최적화",
  MANUAL:                     "수동 액션",
};

function fmtDaysAgo(dateStr: string): string {
  if (!dateStr) return "";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "오늘";
  return `${days}일 전`;
}

// ── 성공 이유 한 줄 추론
function inferSuccessReason(delta: TrackingEntry["growth_delta"]): string | null {
  if (!delta) return null;
  const { views_pct, ctr_pct, impressions_pct } = delta;
  const v = views_pct ?? 0;
  // CTR이 조회수 성장보다 높으면 CTR이 주 원인
  if (ctr_pct != null && ctr_pct > 0 && ctr_pct >= v) return "CTR 개선 영향";
  // 노출이 조회수 성장보다 높으면 노출이 주 원인
  if (impressions_pct != null && impressions_pct > 0 && impressions_pct >= v) return "노출 증가 영향";
  return null;
}

// ── 지표 변화 배지 (growth_delta 기반)
function GrowthBadge({
  delta,
  showReason = false,
}: {
  delta:        TrackingEntry["growth_delta"];
  showReason?:  boolean;
}) {
  if (!delta) return null;
  const items: { label: string; val: number | null | undefined }[] = [
    { label: "조회수", val: delta.views_pct },
    { label: "CTR",   val: delta.ctr_pct },
    { label: "노출",  val: delta.impressions_pct },
  ];
  const visible = items.filter(i => i.val != null);
  if (!visible.length) return null;
  const reason = showReason ? inferSuccessReason(delta) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" as const }}>
      {visible.map(({ label, val }) => {
        const n     = val!;
        const color = n >= 0 ? T.success : T.danger;
        return (
          <span key={label} style={{
            fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: 700,
            color, border: `1px solid ${color}`,
            borderRadius: T.radius.badge, padding: "1px 5px", whiteSpace: "nowrap" as const,
          }}>
            {label} {n >= 0 ? "+" : ""}{n}%
          </span>
        );
      })}
      {reason && (
        <span style={{
          fontSize: T.font.size.xxs, fontFamily: T.font.familyMono,
          color: T.muted, whiteSpace: "nowrap" as const,
        }}>
          → {reason}
        </span>
      )}
    </div>
  );
}

function TrackingRow({ entry, repeatCount = 1 }: { entry: TrackingEntry; repeatCount?: number }) {
  const { status, action_type, action_date, growth_delta } = entry;

  const daysAgo     = action_date ? fmtDaysAgo(action_date) : "";
  const actionLabel = ACTION_TYPE_LABEL[action_type] ?? action_type;

  const isRepeatFail    = repeatCount >= 2 && status === "FAILED";
  const isRepeatSuccess = repeatCount >= 2 && status === "SUCCESS";

  let statusColor = T.muted;
  let statusIcon  = "⏳";
  let statusShort = "추적 중";

  if (status === "SUCCESS") {
    statusColor = T.success;
    statusIcon  = "✓";
    statusShort = isRepeatSuccess ? `${repeatCount}회 성공` : "성공";
  } else if (status === "FAILED") {
    statusColor = T.danger;
    statusIcon  = "✗";
    statusShort = isRepeatFail ? `${repeatCount}회 실패` : "미확인";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* ── 연속 실패 경고 배너 */}
      {isRepeatFail && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          padding:      "6px 10px",
          background:   `${T.danger}18`,
          border:       `1px solid ${T.danger}`,
          borderRadius: T.radius.btn,
          fontSize:     T.font.size.sm,
          fontWeight:   700,
          color:        T.danger,
        }}>
          ⚠ 동일 액션 {repeatCount}회 실패 — 다른 전략 필요
        </div>
      )}

      {/* ── 반복 성공 강조 배너 */}
      {isRepeatSuccess && (
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          T.spacing.xs,
          padding:      "6px 10px",
          background:   T.successBg ?? `${T.success}18`,
          border:       `1px solid ${T.success}`,
          borderRadius: T.radius.btn,
          fontSize:     T.font.size.sm,
          fontWeight:   700,
          color:        T.success,
        }}>
          ✓ {repeatCount}회 성공 — 효과 검증됨 · 계속 적용 권장
        </div>
      )}

      {/* ── 기본 트래킹 행: [액션명 (N일 전)] → [STATUS] → [지표] */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.sm,
        padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        background:   status === "SUCCESS" ? T.successBg ?? T.bgSection
                    : status === "FAILED"  ? T.dangerBg
                    : T.bgSection,
        border:       `1px solid ${statusColor}30`,
        borderRadius: T.radius.btn,
      }}>
        <span style={{ fontSize: T.font.size.md, flexShrink: 0, color: statusColor }}>{statusIcon}</span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          {/* 상단: 액션명 · 날짜 · 상태 */}
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: T.font.size.sm, color: T.text, fontWeight: 600 }}>
              {actionLabel}
            </span>
            {daysAgo && (
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                ({daysAgo})
              </span>
            )}
            <span style={{
              fontSize:   T.font.size.xs,
              color:      statusColor,
              fontWeight: status !== "ONGOING" ? 700 : 400,
              fontFamily: T.font.familyMono,
            }}>
              → {statusShort}
            </span>
          </div>
          {/* 하단: 성장 지표 배지 + 원인/학습 */}
          <GrowthBadge delta={growth_delta} showReason={status === "SUCCESS"} />
          {status === "FAILED" && (
            <FailureLearningNote delta={growth_delta} repeatCount={repeatCount} />
          )}
        </div>
        {repeatCount > 1 && (
          <span style={{
            fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.muted,
            border: `1px solid ${T.borderSoft}`, borderRadius: T.radius.badge,
            padding: "1px 4px", flexShrink: 0,
          }}>
            {repeatCount}회
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ActionDiagnosticsSection ─────────────────────────────────────────────────
// ActionItems + ActionTrackingRows를 단일 fetch로 통합
// executionCount + dynamicRate (P2-B)를 ActionItems에 전달

function ActionDiagnosticsSection({
  diag,
  videoId,
  title = "",
}: {
  diag:    VideoDiagnostic | null;
  videoId: string;
  title?:  string;
}) {
  const groups    = useActionTrackingGroups(videoId);
  const typeRates = useActionTypeRates();
  const [thumbnailActive, setThumbnailActive] = useState(false);

  const executionCount = diag
    ? (groups.find(g => g.action_type === diag.problemType)?.count ?? 0)
    : 0;

  const showActionItems = diag &&
    diag.problemType !== "NORMAL" &&
    diag.severity    !== "NONE";

  // THUMBNAIL 액션이 있는 진단인지 확인 (CTR_WEAK 계열)
  const hasThumbnailAction = diag?.problemType === "CTR_WEAK" ||
    diag?.problemType === "IMPRESSION_DROP";

  return (
    <>
      {/* 1. 실행 이력 */}
      <ActionTrackingRows groups={groups} />

      {/* 2. 상태 요약 */}
      <VideoStatusSummary groups={groups} />

      {/* 3. 썸네일 워크플로우 패널 (인라인 확장) */}
      {thumbnailActive && (
        <ThumbnailWorkflowPanel
          videoId={videoId}
          title={title || diag?.trackName || diag?.title || videoId}
          onClose={() => setThumbnailActive(false)}
          onComplete={() => setThumbnailActive(false)}
          inline
        />
      )}

      {/* 4. 추천 액션 */}
      {showActionItems && (
        <ActionItems
          diag={diag!}
          videoId={videoId}
          executionCount={executionCount}
          typeRates={typeRates}
          onThumbnailStart={hasThumbnailAction ? () => setThumbnailActive(true) : undefined}
        />
      )}
    </>
  );
}

// ─── TASK_PRIORITY_ORDER ──────────────────────────────────────────────────────

const TASK_PRIORITY_ORDER: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };

function LinkedTaskSection({
  tasks,
  videoKey,
  hasDiag,
}: {
  tasks:    AutoAlertTask[];
  videoKey: string;
  hasDiag:  boolean;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const linked = [...tasks]
    .filter(t => t.video_id === videoKey && t.status !== "done")
    .sort((a, b) =>
      (TASK_PRIORITY_ORDER[b.priority] ?? 0) - (TASK_PRIORITY_ORDER[a.priority] ?? 0)
    );

  // CRITICAL 진단이 있는데 태스크 없음 → 대기 힌트 표시 (MEDIUM은 Task 생성 대상 아님)
  if (linked.length === 0) {
    if (hasDiag) {
      return (
        <div style={{
          padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
          background:   T.bgSection,
          border:       `1px solid ${T.borderSoft}`,
          borderRadius: T.radius.btn,
          fontSize:     T.font.size.xs,
          fontFamily:   T.font.familyMono,
          color:        T.muted,
        }}>
          자동 태스크 생성 대기 중 — 썸네일·업로드 간격 점검 권장
        </div>
      );
    }
    return null;
  }

  function handleConfirmYes(task: AutoAlertTask) {
    const api = (window as any).api;
    if (api?.updateTask) {
      api.updateTask(task.id, { status: "done" }).catch(console.error);
    }
    if (api?.registerActionComplete) {
      api.registerActionComplete({
        video_id:         task.video_id,
        action_type:      task.problem_type ?? "MANUAL",
        source:           "auto_alert",
        linked_alert_key: task.linked_alert_key ?? null,
        timestamp:        new Date().toISOString(),
      }).catch(console.error);
    }
    setConfirmingId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        color:         T.sub,
        letterSpacing: "0.04em",
        fontWeight:    T.font.weight.semibold,
        marginBottom:  2,
      }}>
        연결된 태스크
      </span>
      {linked.map(task => {
        const srcLabel = SOURCE_LABEL[task.traffic_source_type] || SOURCE_LABEL[task.problem_type] || task.problem_type;
        const probLabel = PROBLEM_LABEL[task.problem_type] ?? task.problem_type;
        const isConfirming = confirmingId === task.id;

        return (
          <div key={task.id} style={{
            background:   T.dangerBg,
            border:       `1px solid ${T.danger}40`,
            borderRadius: T.radius.btn,
            overflow:     "hidden",
          }}>
            {/* 메인 행 */}
            <div style={{
              display:    "flex",
              alignItems: "center",
              gap:        T.spacing.sm,
              padding:    `${T.spacing.xs}px ${T.spacing.sm}px`,
            }}>
              <span style={{
                fontSize: T.font.size.xxs, fontWeight: 700, fontFamily: T.font.familyMono,
                color: T.danger, flexShrink: 0, letterSpacing: "0.05em",
              }}>
                {task.priority}
              </span>
              <span style={{ fontSize: T.font.size.sm, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {task.title}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0, textAlign: "right" }}>
                <span style={{ fontSize: T.font.size.xs, color: T.muted }}>{probLabel}</span>
                {srcLabel && (
                  <span style={{ fontSize: T.font.size.xxs, color: T.muted, opacity: 0.7, fontFamily: T.font.familyMono }}>
                    {srcLabel}
                  </span>
                )}
              </div>
              {!isConfirming && (
                <button
                  onClick={() => setConfirmingId(task.id)}
                  style={{
                    fontSize: T.font.size.xs, color: T.sub, background: "transparent",
                    border: `1px solid ${T.borderSoft}`, borderRadius: T.radius.pill,
                    padding: "2px 8px", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  완료
                </button>
              )}
            </div>

            {/* 확인 행 */}
            {isConfirming && (
              <div style={{
                display: "flex", alignItems: "center", gap: T.spacing.sm,
                padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
                borderTop: `1px solid ${T.danger}20`,
                background: T.warnBg ?? T.dangerBg,
              }}>
                <span style={{ fontSize: T.font.size.sm, color: T.text, flex: 1 }}>
                  실제로 행동했나요?
                </span>
                <button
                  onClick={() => handleConfirmYes(task)}
                  style={{
                    fontSize: T.font.size.sm, fontWeight: 700, color: T.success,
                    background: "transparent", border: `1px solid ${T.success}`,
                    borderRadius: T.radius.pill, padding: "2px 10px", cursor: "pointer",
                  }}
                >
                  예
                </button>
                <button
                  onClick={() => setConfirmingId(null)}
                  style={{
                    fontSize: T.font.size.sm, color: T.muted, background: "transparent",
                    border: `1px solid ${T.borderSoft}`,
                    borderRadius: T.radius.pill, padding: "2px 10px", cursor: "pointer",
                  }}
                >
                  아니오
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── SubTitle ─────────────────────────────────────────────────────────────────

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize:      T.font.size.xs,
      fontWeight:    T.font.weight.semibold,
      color:         T.sub,
      letterSpacing: "0.04em",
      fontFamily:    T.font.familyMono,
      marginBottom:  T.spacing.sm,
    }}>
      {children}
    </div>
  );
}

// ─── VideoDetailModal ─────────────────────────────────────────────────────────

interface Props {
  video:            SelectedVideo | null;
  channelAvgCTR?:   number | null;
  onClose:          () => void;
  diagnostics?:     VideoDiagnostic[];
  autoAlertTasks?:  AutoAlertTask[];
}

export default function VideoDetailModal({
  video,
  channelAvgCTR    = null,
  onClose,
  diagnostics      = [],
  autoAlertTasks   = [],
}: Props) {
  // AnalyticsProvider 밖(YouTubeView 등)에서 렌더될 수 있으므로 null-safe 처리
  const analyticsCtx = useContext(AnalyticsContext);
  const analytics = analyticsCtx?.analytics ?? null;

  // 영상별 일별 조회수 추세 (차트 데이터.csv → _VideoTrend 시트)
  const perVideoTrend    = useVideoTrend(video?.key ?? "");
  // 외부 캠페인 유입 (redirect_logs.csv)
  const redirectStats    = useRedirectStats(video?.key ?? "");

  // 추세: 영상별 데이터 우선, 없으면 채널 전체 fallback
  const trendHistory    = perVideoTrend.length > 0
    ? perVideoTrend
    : (analytics?.current?.trendHistory ?? []);
  const trendIsPerVideo = perVideoTrend.length > 0;

  // 트래픽 소스: 영상별 데이터 우선(_VideoTraffic), 없으면 채널 전체 fallback
  const perVideoTraffic   = useVideoTraffic(video?.key ?? "");
  const trafficSources    = perVideoTraffic.length > 0
    ? perVideoTraffic
    : (analytics?.current?.trafficSources ?? []);
  const trafficIsPerVideo = perVideoTraffic.length > 0;

  // 트래픽 인사이트 (영상별 데이터 있을 때만 계산)
  const trafficInsight = trafficIsPerVideo
    ? computeTrafficInsight(trafficSources, video?.ctr ?? null, channelAvgCTR)
    : null;

  // ESC 키로 닫기
  useEffect(() => {
    if (!video) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [video, onClose]);

  if (!video) return null;

  const thumbnailUrl = `https://i.ytimg.com/vi/${video.key}/mqdefault.jpg`;

  // 이 영상의 진단 데이터 — 2단계 정렬: 최신(rowIndex 내림차순) → severity 내림차순
  const SEV_ORDER: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, NONE: 0 };
  const diag = [...diagnostics]
    .filter(d => d.videoId === video.key)
    .sort((a, b) => {
      if (b.rowIndex !== a.rowIndex) return b.rowIndex - a.rowIndex;
      return (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0);
    })[0];

  return (
    // ── Backdrop
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        background:     T.component.surface.modalScrim,
        zIndex:         50,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        T.spacing.xl,
      }}
    >
      {/* ── Modal Card (클릭 전파 차단) */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:        "min(760px, 92vw)",
          maxHeight:    "85vh",
          overflowY:    "auto",
          background:   T.bgCard,
          border:       `1px solid ${T.border}`,
          borderRadius: T.radius.card,
          boxShadow:    T.component.shadow.modal,
          display:      "flex",
          flexDirection: "column",
          gap:           T.spacing.xl,
          padding:       T.spacing.xl,
        }}
      >
        {/* ── 헤더: 컨텍스트 배너 + 닫기 버튼 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          {/* 컨텍스트 배너 — 진입 소스가 있고 매핑 텍스트가 있을 때만 표시 */}
          {(() => {
            const label = getContextLabel(video.clickContext);
            return label ? (
              <span style={{
                fontSize:      T.font.size.xs,
                fontFamily:    T.font.familyMono,
                fontWeight:    T.font.weight.semibold,
                color:         T.primary,
                letterSpacing: "0.04em",
                background:    T.primarySoft,
                borderRadius:  T.radius.badge,
                padding:       `2px ${T.spacing.sm}px`,
              }}>
                {label}
              </span>
            ) : (
              <span style={{
                fontSize:   T.font.size.xs,
                fontFamily: T.font.familyMono,
                color:      T.muted,
                letterSpacing: "0.06em",
              }}>
                영상 상세
              </span>
            );
          })()}
          <button
            onClick={onClose}
            style={{
              background:   "transparent",
              border:       `1px solid ${T.border}`,
              borderRadius: T.radius.btn,
              color:        T.muted,
              cursor:       "pointer",
              fontSize:     T.font.size.sm,
              fontFamily:   T.font.familyMono,
              padding:      `2px ${T.spacing.sm}px`,
              lineHeight:   1.4,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── 썸네일 + 제목 + 지표 */}
        <div style={{ display: "flex", gap: T.spacing.xl, alignItems: "flex-start" }}>
          {/* 썸네일 */}
          <img
            src={thumbnailUrl}
            alt={video.title}
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            style={{
              width:        160,
              aspectRatio:  "16/9",
              objectFit:    "cover",
              borderRadius: T.radius.btn,
              border:       `1px solid ${T.border}`,
              flexShrink:   0,
            }}
          />

          {/* 제목 + 지표 */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: T.spacing.md }}>
            <div style={{
              fontSize:   T.font.size.lg ?? T.font.size.md,
              fontWeight: T.font.weight.bold,
              color:      T.text,
              lineHeight: T.font.lineHeight.normal,
              wordBreak:  "break-word",
            }}>
              {video.title}
            </div>

            {/* ── Last Updated 신선도 표시 ── */}
            {(() => {
              const FRESHNESS_COLOR: Record<string, string> = {
                fresh:      T.success,
                normal:     T.sub,
                stale:      T.warn,
                collecting: T.muted,
                unknown:    T.muted,
              };
              const FRESHNESS_DOT: Record<string, string> = {
                fresh:      "●",
                normal:     "○",
                stale:      "⚠",
                collecting: "·",
                unknown:    "·",
              };
              const FRESHNESS_LABEL: Record<string, string> = {
                fresh:      "최신",
                normal:     "보통",
                stale:      "지연",
                collecting: "",
                unknown:    "",
              };
              const { label, state } = getLastUpdatedDisplay(video.dataLastUpdated ?? null);
              const color = FRESHNESS_COLOR[state] ?? T.muted;
              const dot   = FRESHNESS_DOT[state]   ?? "·";
              const tag   = FRESHNESS_LABEL[state] ?? "";
              return (
                <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
                  <span style={{
                    fontSize:      T.font.size.xs,
                    fontFamily:    T.font.familyMono,
                    color:         T.muted,
                    letterSpacing: "0.06em",
                  }}>
                    데이터 기준
                  </span>
                  <span style={{
                    fontSize:   T.font.size.xs,
                    fontFamily: T.font.familyMono,
                    color:      T.sub,
                  }}>
                    · {label}
                  </span>
                  {tag && (
                    <span style={{
                      fontSize:   T.font.size.xs,
                      fontFamily: T.font.familyMono,
                      color,
                      display:    "flex",
                      alignItems: "center",
                      gap:        3,
                    }}>
                      {dot} {tag}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* ── MetricChips 1행: 조회수·시청시간·좋아요·평균시청 ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
              <MetricChip label="조회수"   value={fmtViews(video.views)} />
              <MetricChip label="시청시간" value={fmtWatchTime(video.watchTimeMin)} />
              <MetricChip label="좋아요"   value={fmtViews(video.likes)} />
              <MetricChip label="평균시청" value={fmtDuration(video.avgDurationSec)} />
            </div>

            {/* ── MetricChips 2행: 노출·CTR·댓글·공유 ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
              {/* impressions=0 → 미동기화 데이터. "—"로 표시 (0 그대로 노출 방지) */}
              <MetricChip label="노출" value={video.impressions ? fmtViews(video.impressions) : "—"} />
              <MetricChip
                label="CTR"
                value={video.impressions ? fmtCTR(video.ctr) : "—"}
                subValue={(() => {
                  if (!video.impressions || video.ctr == null || channelAvgCTR == null) return undefined;
                  const diff = ((video.ctr - channelAvgCTR) / channelAvgCTR) * 100;
                  return `채널 평균 대비 ${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%`;
                })()}
                subColor={(() => {
                  if (!video.impressions || video.ctr == null || channelAvgCTR == null) return undefined;
                  return video.ctr >= channelAvgCTR ? T.color.success : T.color.warning;
                })()}
              />
              <MetricChip label="댓글"   value={fmtViews(video.comments)} />
              <MetricChip label="공유"   value={fmtViews(video.shares)} />
            </div>

            {/* ── MetricChips 3행: 영상길이·구독자증가 ── */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
              <MetricChip label="영상길이"   value={fmtDuration(video.runtimeSec)} />
              <MetricChip label="구독자증가" value={fmtViews(video.subscribersGained)} />
            </div>

            {/* ── 판단 문장 ── */}
            <VideoVerdict video={video} channelAvgCTR={channelAvgCTR} />

            {/* ── 진단 결과 배지 ── */}
            <DiagnosticsBadge diag={diag} />
          </div>
        </div>

        {/* ── 연결된 태스크 / 대기 힌트 (CRITICAL 진단 있거나 active 태스크 있을 때만) */}
        {(autoAlertTasks.some(t => t.video_id === video.key && t.status !== "done") ||
          (diag?.severity === "CRITICAL")) && (
          <LinkedTaskSection
            tasks={autoAlertTasks}
            videoKey={video.key}
            hasDiag={diag?.severity === "CRITICAL"}
          />
        )}

        {/* ── 권장 액션 + 액션 추적 현황 (단일 fetch, 실행 횟수 공유) */}
        <ActionDiagnosticsSection diag={diag} videoId={video.key} title={video.title} />

        {/* ── 구분선 */}
        <div style={{ height: 1, background: T.borderSoft }} />

        {/* ── 조회수 추세 */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.sm }}>
            <SubTitle>조회수 추세</SubTitle>
            <span style={{
              fontSize:     T.font.size.xxs,
              fontFamily:   T.font.familyMono,
              color:        trendIsPerVideo ? T.color.success : T.muted,
              background:   T.bgSection,
              border:       `1px solid ${trendIsPerVideo ? T.color.success + "60" : T.borderSoft}`,
              borderRadius: T.radius.badge,
              padding:      `1px ${T.spacing.xs}px`,
              whiteSpace:   "nowrap" as const,
            }}>
              {trendIsPerVideo ? "이 영상 기준" : "채널 전체 기준"}
            </span>
          </div>
          <TrendSection data={trendHistory} />
        </div>

        {/* ── 유입 경로 (전폭) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.sm }}>
            <SubTitle>유입 경로</SubTitle>
            <span style={{
              fontSize:     T.font.size.xxs,
              fontFamily:   T.font.familyMono,
              color:        T.muted,
              background:   T.bgSection,
              border:       `1px solid ${trafficIsPerVideo ? T.color.success + "60" : T.borderSoft}`,
              borderRadius: T.radius.badge,
              padding:      `1px ${T.spacing.xs}px`,
              whiteSpace:   "nowrap" as const,
            }}>
              {trafficIsPerVideo ? "이 영상 기준" : "채널 전체 기준"}
            </span>
          </div>
          {trafficInsight && <TrafficInsightPanel insight={trafficInsight} />}
          <TrafficSection data={trafficSources} />
        </div>

        {/* ── 외부 캠페인 유입 (Redirect Tracker) — 데이터 있는 영상만 표시 */}
        {redirectStats.length > 0 && (
          <>
            <div style={{ height: 1, background: T.borderSoft }} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.sm }}>
                <SubTitle>외부 캠페인 유입</SubTitle>
                <span style={{
                  fontSize:     T.font.size.xxs,
                  fontFamily:   T.font.familyMono,
                  color:        T.color.success,
                  background:   T.bgSection,
                  border:       `1px solid ${T.color.success}60`,
                  borderRadius: T.radius.badge,
                  padding:      `1px ${T.spacing.xs}px`,
                  whiteSpace:   "nowrap" as const,
                }}>
                  이 영상 기준
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
                {redirectStats.map(({ platform, clicks }) => (
                  <div key={platform} style={{
                    display:       "flex",
                    flexDirection: "column",
                    gap:           2,
                    padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
                    background:    T.bgSection,
                    borderRadius:  T.radius.btn,
                    minWidth:      72,
                  }}>
                    <span style={{
                      fontSize:      "10px",
                      fontFamily:    T.font.familyMono,
                      color:         T.muted,
                      letterSpacing: "0.06em",
                    }}>
                      {platform}
                    </span>
                    <span style={{
                      fontSize:   T.font.size.md,
                      fontFamily: T.font.familyMono,
                      fontWeight: T.font.weight.bold,
                      color:      T.text,
                      lineHeight: 1,
                    }}>
                      {clicks}클릭
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
