// ─── GrowthPanel v2 ───────────────────────────────────────────────────────────
// 성장 지표 비교 카드: 현재 기간 vs 이전 30일 + KPI 추세 LineChart
//
// v2: InsightEngine 분리 — GrowthPanel은 성장 지표 카드만 담당
//     DashboardPage에서 InsightEngine을 독립 전체폭 섹션으로 배치

import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import type { GrowthResult } from "@/controllers/useAnalyticsController";
import type { AnalyticsSummary, TrendPoint } from "@/adapters/AnalyticsAdapter";
import QuickInsightBar from "./QuickInsightBar";
import {
  generateGrowthInsights,
  generateGrowthActions,
  generateGrowthCTAs,
  zipPairs,
} from "@/engines/PanelInsightEngine";
import { useContentPackCtx } from "@/controllers/ContentPackContext";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtCount(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtWatchTime(min: number | undefined | null): string {
  if (min == null || isNaN(min)) return "—";
  return `${(min / 10_000).toFixed(1)}만분`;
}

function fmtAvgDuration(sec: number | undefined | null): string {
  if (sec == null || isNaN(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize:      T.font.size.xs,
      fontWeight:    T.font.weight.semibold,
      color:         T.sub,
      letterSpacing: "0.06em",
      marginBottom:  T.spacing.md,
      fontFamily:    T.font.familyMono,
    }}>
      {children}
    </div>
  );
}

// ─── GrowthMetricRow ──────────────────────────────────────────────────────────

interface GrowthMetricRowProps {
  label:     string;
  current:   string;
  prev:      string;
  growthVal: number | null;
}

function GrowthMetricRow({ label, current, prev, growthVal }: GrowthMetricRowProps) {
  const pos = growthVal != null && growthVal >= 0;
  const neg = growthVal != null && growthVal < 0;

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "1fr auto auto auto",
      gap:                 T.spacing.md,
      alignItems:          "center",
      padding:             `${T.spacing.sm}px 0`,
      borderBottom:        `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: T.font.size.sm, color: T.sub, fontWeight: T.font.weight.medium }}>{label}</span>
      <span style={{ fontSize: T.font.size.md, fontFamily: T.font.familyMono, fontWeight: T.font.weight.semibold, color: T.text, textAlign: "right" }}>
        {current}
      </span>
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: T.font.familyMono,
        color:      pos ? T.success : neg ? T.danger : T.muted,
        minWidth:   60,
        textAlign:  "center",
      }}>
        {growthVal == null ? "—" : pos ? `▲ +${growthVal}%` : `▼ ${growthVal}%`}
      </span>
      <span style={{ fontSize: T.font.size.sm, fontFamily: T.font.familyMono, color: T.muted, textAlign: "right" }}>
        {prev}
      </span>
    </div>
  );
}

// ─── TrendLineChart ───────────────────────────────────────────────────────────

function TrendLineChart({ data }: { data: TrendPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height:         120,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       T.font.size.xs,
        color:          T.muted,
        background:     T.bgSection,
        borderRadius:   T.radius.btn,
      }}>
        추세 데이터 없음
      </div>
    );
  }

  const chartData = data.map(p => ({
    date:  fmtDate(p.date),
    views: p.views,
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: T.muted, fontFamily: T.font.familyMono }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background:   T.bgCard,
            border:       `1px solid ${T.border}`,
            borderRadius: T.radius.btn,
            fontSize:     T.font.size.xs,
            fontFamily:   T.font.familyMono,
          }}
          formatter={(val: unknown) => [(Number(val ?? 0)).toLocaleString("ko-KR"), "조회수"]}
        />
        <Line
          type="monotone"
          dataKey="views"
          stroke={T.primary}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: T.primary }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── GrowthPanel ──────────────────────────────────────────────────────────────

export default function GrowthPanel() {
  const { analytics, growth, loadingAnalytics } = useAnalyticsContext();
  const { createPack } = useContentPackCtx();

  const summary = analytics?.current?.summary ?? null;
  const prev30  = analytics?.prev30 ?? null;
  const trend   = analytics?.current?.trendHistory ?? [];

  const pairs = React.useMemo(() => zipPairs(
    generateGrowthInsights(growth),
    generateGrowthActions(growth),
    undefined,
    generateGrowthCTAs(growth),
  ), [growth]);

  function handleInsightAction(actionType: string) {
    if (actionType === "create_pack") {
      createPack("성장 모멘텀");
    }
    // create_hypothesis / create_thumbnail_variant → Phase 2에서 확장
    console.log("[GrowthPanel] insight action:", actionType);
  }

  const metrics: GrowthMetricRowProps[] = [
    {
      label:     "조회수",
      current:   fmtCount(summary?.views),
      prev:      fmtCount(prev30?.views),
      growthVal: growth?.views ?? null,
    },
    {
      label:     "좋아요",
      current:   fmtCount(summary?.likes),
      prev:      fmtCount(prev30?.likes),
      growthVal: growth?.likes ?? null,
    },
    {
      label:     "시청시간",
      current:   fmtWatchTime(summary?.watchTimeMin),
      prev:      fmtWatchTime(prev30?.watchTimeMin),
      growthVal: growth?.watchTime ?? null,
    },
    {
      label:     "평균시청시간",
      current:   fmtAvgDuration(summary?.avgDurationSec),
      prev:      fmtAvgDuration(prev30?.avgDurationSec),
      growthVal: growth?.avgDuration ?? null,
    },
  ];

  return (
    <div style={{
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.lg,
      height:        "100%",
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          letterSpacing: "0.06em",
        }}>
          성장 분석
        </span>
        <span style={{
          fontSize:     T.font.size.xs,
          color:        T.sub,
          background:   T.bgSection,
          border:       `1px solid ${T.border}`,
          borderRadius: T.radius.badge,
          padding:      `1px ${T.spacing.xs}px`,
          fontFamily:   T.font.familyMono,
        }}>
          현재 vs 이전 30일
        </span>
      </div>

      {/* 컬럼 헤더 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap:                 T.spacing.md,
      }}>
        <span />
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "right",   minWidth: 80 }}>현재</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "center",  minWidth: 60 }}>변화</span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "right",   minWidth: 80 }}>이전 30일</span>
      </div>

      {/* 지표 행 */}
      {loadingAnalytics ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>로딩 중···</div>
      ) : (
        metrics.map(m => <GrowthMetricRow key={m.label} {...m} />)
      )}

      {/* 추세 차트 — 데이터 있을 때만 렌더링 */}
      {(loadingAnalytics || trend.length > 0) && (
        <div style={{ marginTop: T.spacing.sm }}>
          <div style={{
            fontSize:     T.font.size.xs,
            color:        T.muted,
            fontFamily:   T.font.familyMono,
            marginBottom: T.spacing.sm,
          }}>
            KPI 조회수 추세
          </div>
          {loadingAnalytics ? (
            <div style={{ height: 120, background: T.bgSection, borderRadius: T.radius.btn }} />
          ) : (
            <TrendLineChart data={trend} />
          )}
        </div>
      )}

      {/* Quick Insight Bar */}
      {!loadingAnalytics && (
        <QuickInsightBar pairs={pairs} onAction={handleInsightAction} />
      )}
    </div>
  );
}
