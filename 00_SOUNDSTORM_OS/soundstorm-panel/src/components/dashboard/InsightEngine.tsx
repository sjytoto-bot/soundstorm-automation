// ─── InsightEngine v6 UI ───────────────────────────────────────────────────────
// 3-Zone 구조 — 채널 상태 즉시 파악 + 즉각 행동 + 전략
//
// ZONE 1  Channel Status Bar   — 채널 상태 한 줄 요약
// ZONE 2  Immediate Actions    — HIGH FIX 카드 최대 2개
// ZONE 3  Content Strategy     — HOT 기회 / GROWING 키워드 / 실행 전략 / 콘텐츠 최적화
//         Operation Strategy   — 포맷 / 업로드 / 시간
//
// v6 변경:
//   - 성장 기회(OPPORTUNITY 테이블) 제거
//   - 콘텐츠 전략 패널에 기회 + 전략 통합 (ContentStrategyEngine)
//   - 운영 전략 패널 추가 (업로드 전략)
//
// Backward-compat exports: InsightItem, ActionItem, generateInsights,
//   generateActions, generateSummary (used by InsightReportModal)

import React, { useMemo, useState, useEffect } from "react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import type { GrowthResult }  from "@/controllers/useAnalyticsController";
import type { AnalyticsData, DimensionRow } from "@/adapters/AnalyticsAdapter";

import {
  detectInsights,
  type InsightV3,
  type InsightLevel,
} from "@/engines/insightEngineV3";

import { analyzeRedirectMarketing }   from "@/engines/redirectIntelligence/RedirectMarketingEngine";
import { analyzeOpportunities }       from "@/engines/opportunity/OpportunityEngine";
import { analyzeStrategies }          from "@/engines/strategy/StrategyEngine";
import { generateActionCards, type ActionCard, type ActionCardType, type ActionCardImpact }
  from "@/engines/action/ActionGenerator";
import {
  generateContentStrategy,
  type StrategyCard,
  type StrategyCardType,
  type StrategyLabel,
  type StrategyAction,
} from "@/engines/strategy/ContentStrategyEngine";
import type { UploadStrategy } from "@/engines/strategy/UploadStrategyGenerator";
import type { RedirectLog } from "@/engines/externalTraffic/CampaignAnalyzer";

// ─── 하위 호환 타입·함수 (InsightReportModal 사용) ───────────────────────────

export interface InsightItem {
  id:      string;
  level:   InsightLevel;
  text:    string;
  metric?: string;
}

export interface ActionItem {
  priority: 1 | 2 | 3;
  text:     string;
  tag:      string;
}

const LEVEL_ORDER_COMPAT: Record<InsightLevel, number> = {
  danger: 0, warning: 1, success: 2, info: 3,
};

export function generateInsights(
  current: AnalyticsData | null,
  growth:  GrowthResult,
): InsightItem[] {
  return detectInsights(current, growth).map(v3 => ({
    id:     v3.id,
    level:  v3.level,
    text:   v3.insight,
    metric: v3.metric ?? undefined,
  })).sort((a, b) => LEVEL_ORDER_COMPAT[a.level] - LEVEL_ORDER_COMPAT[b.level]);
}

export function generateActions(
  insights:   InsightItem[],
  _keywords:  DimensionRow[],
  _hitVideos: DimensionRow[],
): ActionItem[] {
  const ids = new Set(insights.map(i => i.id));
  const actions: ActionItem[] = [];
  if (ids.has("ctr_issue") || ids.has("content_decline"))
    actions.push({ priority: 1, tag: "전략",    text: "썸네일 A/B 테스트 즉시 진행" });
  if (ids.has("content_decline"))
    actions.push({ priority: 1, tag: "콘텐츠",  text: "인트로 20초 이내 단축, 핵심 내용 선행 배치" });
  if (ids.has("cta_flat"))
    actions.push({ priority: 1, tag: "콘텐츠",  text: "영상 말미 구독 CTA 강화 (마지막 15초 집중 설계)" });
  if (ids.has("retention_issue"))
    actions.push({ priority: 2, tag: "콘텐츠",  text: "Retention 곡선 분석 후 이탈 구간 재편집" });
  if (ids.has("seo_success"))
    actions.push({ priority: 2, tag: "SEO",     text: "강세 키워드 기반 시리즈 영상 기획" });
  if (ids.has("algo_momentum"))
    actions.push({ priority: 2, tag: "알고리즘", text: "관련 영상 시리즈 확장 — 연속 시청 유도" });
  if (ids.has("growth_surge"))
    actions.push({ priority: 2, tag: "전략",    text: "업로드 빈도 증가 + 성장 패턴 포맷 복제" });
  if (ids.has("thumbnail_mobile") || ids.has("mobile_high"))
    actions.push({ priority: 2, tag: "기술",    text: "썸네일 세로형 레이아웃 + 대형 텍스트 적용" });
  if (ids.has("young_dominant"))
    actions.push({ priority: 3, tag: "전략",    text: "Shorts 콘텐츠 병행 제작 — 10~20대 확장" });
  if (ids.has("quality_improved") || ids.has("stable"))
    actions.push({ priority: 3, tag: "전략",    text: "현재 전략 유지 — 주간 지표 정기 점검" });
  if (actions.length === 0)
    actions.push({ priority: 3, tag: "전략",    text: "데이터 축적 후 인사이트 재분석 권장" });
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

export function generateSummary(insights: InsightItem[]): string {
  const top = insights[0];
  if (!top) return "데이터 분석 중";
  const lines = [top.text + (top.metric ? ` (${top.metric})` : "")];
  const second = insights.find(i => i.id !== top.id && (i.level === "danger" || i.level === "warning"));
  if (second) lines.push(second.text + (second.metric ? ` (${second.metric})` : ""));
  const success = insights.find(i => i.level === "success" && i.id !== top.id);
  if (success) lines.push(success.text);
  return lines.join("\n");
}

// ─── 토큰 ─────────────────────────────────────────────────────────────────────

const C = {
  danger:      "#E53935",
  dangerBg:    "#FFF0F0",
  dangerSoft:  "#FFE5E5",
  warning:     "#D97706",
  warningBg:   "#FFFBEB",
  warningSoft: "#FEF3C7",
  success:     "#16A34A",
  successBg:   "#F0FDF4",
  opp:         "#6A3BE2",
  oppBg:       "#EFE6FF",
  strat:       "#2F6BFF",
  stratBg:     "#E6F0FF",
  fix:         "#E53935",
  fixBg:       "#FFE5E5",
  hot:         "#E53935",
  hotBg:       "#FFE5E5",
  growing:     "#16A34A",
  growingBg:   "#DCFCE7",
  emerging:    "#6B7280",
  emergingBg:  "#F3F4F6",
} as const;

// ─── 채널 상태 판단 ───────────────────────────────────────────────────────────

type ChannelStatus = "danger" | "warning" | "healthy";

interface StatusInfo {
  status:  ChannelStatus;
  headline: string;
  sub:      string;
}

function deriveStatus(insights: InsightV3[]): StatusInfo {
  const hasDanger  = insights.some(i => i.level === "danger");
  const hasWarning = insights.some(i => i.level === "warning");

  if (hasDanger) {
    const top = insights.find(i => i.level === "danger")!;
    const metricText = top.metric ? ` ${top.metric}` : "";
    return {
      status:   "danger",
      headline: `[주의]${metricText} — ${top.problem}`,
      sub:      top.insight,
    };
  }
  if (hasWarning) {
    const top = insights.find(i => i.level === "warning")!;
    const metricText = top.metric ? ` ${top.metric}` : "";
    return {
      status:   "warning",
      headline: `[확인 필요]${metricText} — ${top.problem}`,
      sub:      top.insight,
    };
  }
  const top = insights[0];
  return {
    status:   "healthy",
    headline: top ? `[정상] ${top.problem}` : "[정상] 채널 지표 안정",
    sub:      top?.insight ?? "현재 주요 이상 없음",
  };
}

// ─── ZONE 1: Channel Status Bar ──────────────────────────────────────────────

function ChannelStatusBar({ insights }: { insights: InsightV3[] }) {
  if (insights.length === 0) return null;

  const { status, headline, sub } = deriveStatus(insights);

  const bg    = status === "danger"  ? C.dangerSoft
              : status === "warning" ? C.warningSoft
              : C.successBg;
  const color = status === "danger"  ? C.danger
              : status === "warning" ? C.warning
              : C.success;
  const borderColor = color + "60";

  return (
    <div style={{
      padding:      "10px 14px",
      borderRadius: 8,
      background:   bg,
      border:       `1px solid ${borderColor}`,
      display:      "flex",
      flexDirection: "column",
      gap:          3,
    }}>
      <span style={{
        fontSize:   14,
        fontWeight: 700,
        color,
        lineHeight: 1.3,
        fontFamily: T.font.familyMono,
      }}>
        {headline}
      </span>
      <span style={{
        fontSize:  12,
        color,
        opacity:   0.8,
        lineHeight: 1.4,
      }}>
        {sub}
      </span>
    </div>
  );
}

// ─── ZONE 2: Immediate Actions (HIGH FIX, max 2) ─────────────────────────────

function ImmediateActionCard({ card }: { card: ActionCard }) {
  const metricParts: string[] = [];
  if (card.metrics?.viewsChange != null) {
    const s = card.metrics.viewsChange >= 0 ? "+" : "";
    metricParts.push(`조회수 ${s}${card.metrics.viewsChange.toFixed(1)}%`);
  }
  if (card.confidence != null) {
    metricParts.push(`신뢰도 ${Math.round(card.confidence * 100)}%`);
  }

  return (
    <div style={{
      borderLeft:    `4px solid ${C.danger}`,
      borderRadius:  8,
      padding:       "14px 16px",
      background:    "#ffffff",
      display:       "flex",
      flexDirection: "column",
      gap:           6,
      boxShadow:     "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{
          flexShrink: 0,
          marginTop:  3,
          width:      18,
          height:     18,
          borderRadius: "50%",
          background: C.dangerBg,
          display:    "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize:   10,
          fontWeight: 800,
          color:      C.danger,
          fontFamily: T.font.familyMono,
        }}>
          !
        </span>
        <span style={{
          flex:       1,
          fontSize:   20,
          fontWeight: 700,
          color:      "#111",
          lineHeight: 1.3,
        }}>
          {card.title}
        </span>
      </div>
      <p style={{
        margin: 0, paddingLeft: 26,
        fontSize: 13, color: T.sub, lineHeight: 1.5,
      }}>
        {card.description}
      </p>
      {metricParts.length > 0 && (
        <div style={{
          paddingLeft: 26,
          fontSize:    11,
          fontFamily:  T.font.familyMono,
          fontWeight:  600,
          color:       C.danger,
        }}>
          {metricParts.join("  ·  ")}
        </div>
      )}
    </div>
  );
}

function ImmediateActionsZone({ cards }: { cards: ActionCard[] }) {
  const fixHigh = cards.filter(c => c.type === "FIX" && c.impact === "HIGH").slice(0, 2);
  if (fixHigh.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        fontSize:      10,
        fontFamily:    T.font.familyMono,
        fontWeight:    700,
        color:         C.danger,
        letterSpacing: "0.08em",
        marginBottom:  2,
      }}>
        지금 할 일
      </div>
      {fixHigh.map(card => (
        <ImmediateActionCard key={card.id} card={card} />
      ))}
    </div>
  );
}

// ─── ZONE 3: Content Strategy (통합 전략 패널) ───────────────────────────────

const LABEL_META: Record<StrategyLabel, { color: string; bg: string }> = {
  HOT:      { color: C.hot,      bg: C.hotBg },
  GROWING:  { color: C.growing,  bg: C.growingBg },
  STRATEGY: { color: C.strat,    bg: C.stratBg },
};

function StrategyLabelBadge({ label }: { label: StrategyLabel }) {
  const { color, bg } = LABEL_META[label];
  return (
    <span style={{
      fontSize:     9,
      fontFamily:   T.font.familyMono,
      fontWeight:   700,
      color,
      background:   bg,
      borderRadius: T.radius.badge,
      padding:      "2px 6px",
      whiteSpace:   "nowrap",
      flexShrink:   0,
    }}>
      {label}
    </span>
  );
}

function StrategyCardRow({ card }: { card: StrategyCard }) {
  const growthText = card.growth != null
    ? `${card.growth >= 0 ? "+" : ""}${card.growth.toFixed(1)}%`
    : null;

  const growthColor = card.growth != null && card.growth >= 15 ? C.hot
    : card.growth != null && card.growth >= 0 ? C.growing
    : T.sub;

  return (
    <div style={{
      padding:       "9px 10px",
      borderRadius:  6,
      background:    T.bgSection,
      display:       "flex",
      flexDirection: "column",
      gap:           5,
    }}>
      {/* 배지 + 제목 행 */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <StrategyLabelBadge label={card.label} />
        <span style={{
          fontSize:   13,
          fontWeight: 600,
          color:      T.text,
          lineHeight: 1.35,
          flex:       1,
        }}>
          {card.title}
        </span>
        {growthText && (
          <span style={{
            fontSize:   11,
            fontFamily: T.font.familyMono,
            fontWeight: 700,
            color:      growthColor,
            flexShrink: 0,
          }}>
            {growthText}
          </span>
        )}
      </div>

      {/* 액션 목록 (priority 순 정렬 + 번호 표시) */}
      {card.actions && card.actions.length > 0 && (
        <ol style={{
          margin:        0,
          padding:       "0 0 0 2px",
          listStyle:     "none",
          display:       "flex",
          flexDirection: "column",
          gap:           2,
        }}>
          {[...card.actions]
            .sort((a: StrategyAction, b: StrategyAction) => a.priority - b.priority)
            .map((action: StrategyAction) => (
              <li key={action.priority} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{
                  flexShrink:  0,
                  minWidth:    14,
                  fontSize:    9,
                  fontFamily:  T.font.familyMono,
                  fontWeight:  700,
                  color:       T.muted,
                  marginTop:   3,
                  textAlign:   "right",
                }}>
                  {action.priority}
                </span>
                <span style={{ fontSize: 11, color: T.sub, lineHeight: 1.45 }}>
                  {action.text}
                </span>
              </li>
            ))}
        </ol>
      )}
    </div>
  );
}

function ContentStrategyZone({ cards }: { cards: StrategyCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* 헤더 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        paddingBottom:  6,
        borderBottom:   `1px solid ${C.strat}40`,
        marginBottom:   8,
      }}>
        <span style={{
          fontSize:      10,
          fontFamily:    T.font.familyMono,
          fontWeight:    700,
          color:         C.strat,
          letterSpacing: "0.08em",
        }}>
          콘텐츠 전략
        </span>
        <span style={{
          fontSize:     9,
          fontFamily:   T.font.familyMono,
          color:        C.strat,
          background:   C.stratBg,
          borderRadius: T.radius.badge,
          padding:      "1px 7px",
          fontWeight:   700,
        }}>
          {cards.length}
        </span>
      </div>

      {/* 카드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {cards.map(card => (
          <StrategyCardRow key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

// ─── ZONE 4: Operation Strategy (운영 전략) ──────────────────────────────────

function OperationStrategyZone({ strategies }: { strategies: UploadStrategy[] }) {
  const [expanded, setExpanded] = useState(true);
  if (strategies.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* 토글 헤더 */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "8px 10px",
          background:     T.bgSection,
          border:         `1px solid ${T.borderSoft}`,
          borderRadius:   expanded ? "8px 8px 0 0" : 8,
          cursor:         "pointer",
          width:          "100%",
        }}
      >
        <span style={{
          fontSize:   10,
          fontFamily: T.font.familyMono,
          fontWeight: 700,
          color:      T.sub,
          letterSpacing: "0.08em",
        }}>
          운영 전략
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize:     9,
            fontFamily:   T.font.familyMono,
            color:        T.muted,
            background:   T.bgCard,
            borderRadius: T.radius.badge,
            padding:      "1px 7px",
            fontWeight:   600,
            border:       `1px solid ${T.borderSoft}`,
          }}>
            {strategies.length}개
          </span>
          <span style={{ fontSize: 10, color: T.muted }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{
          border:        `1px solid ${T.borderSoft}`,
          borderTop:     "none",
          borderRadius:  "0 0 8px 8px",
          padding:       "8px",
          display:       "flex",
          flexDirection: "column",
          gap:           4,
          background:    T.bgCard,
        }}>
          {strategies.map((s, i) => (
            <div key={i} style={{
              borderLeft:    `3px solid ${T.border}`,
              borderRadius:  6,
              padding:       "8px 12px",
              background:    T.bgSection,
              display:       "flex",
              flexDirection: "column",
              gap:           3,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize:   12,
                  fontWeight: 600,
                  color:      T.text,
                  lineHeight: 1.3,
                }}>
                  {s.recommendation}
                </span>
                <span style={{
                  fontSize:     9,
                  fontFamily:   T.font.familyMono,
                  color:        T.muted,
                  background:   T.bgCard,
                  borderRadius: T.radius.badge,
                  padding:      "1px 6px",
                  border:       `1px solid ${T.borderSoft}`,
                  flexShrink:   0,
                  marginLeft:   8,
                }}>
                  {s.typeLabel}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
                {s.reason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 구분선 ───────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{ height: 1, background: T.borderSoft, margin: "0 -2px" }} />
  );
}

// ─── InsightEngine (default export) ──────────────────────────────────────────

interface InsightEngineProps {
  onOpenReport?: () => void;
}

export default function InsightEngine({ onOpenReport }: InsightEngineProps) {
  const { analytics, growth, loadingAnalytics } = useAnalyticsContext();

  const current    = analytics?.current ?? null;
  const keywords   = current?.keywords  ?? [];
  const hitVideos  = analytics?.hitVideos ?? [];
  const channelAvg = current?.summary?.avgDurationSec ?? 0;

  const [redirectLogs, setRedirectLogs] = useState<RedirectLog[]>([]);
  useEffect(() => {
    const api = (window as any).api;
    if (api?.readRedirectLogs) {
      api.readRedirectLogs()
        .then((logs: RedirectLog[] | null) => setRedirectLogs(logs ?? []))
        .catch(() => {});
    }
  }, []);

  // ── 엔진 체인 ──────────────────────────────────────────────────────────────
  const insights = useMemo(
    () => detectInsights(current, growth),
    [current, growth],
  );

  const marketing = useMemo(
    () => analyzeRedirectMarketing(redirectLogs),
    [redirectLogs],
  );

  const opp = useMemo(
    () => analyzeOpportunities(keywords, hitVideos, channelAvg, marketing),
    [keywords, hitVideos, channelAvg, marketing],
  );

  const strat = useMemo(
    () => analyzeStrategies(opp, marketing.timePatterns),
    [opp, marketing.timePatterns],
  );

  const cards = useMemo(
    () => generateActionCards(insights, opp, strat),
    [insights, opp, strat],
  );

  const contentStrategyCards = useMemo(
    () => generateContentStrategy(opp, hitVideos),
    [opp, hitVideos],
  );

  // 헤더 요약 카운트
  const fixHighCount    = cards.filter(c => c.type === "FIX" && c.impact === "HIGH").length;
  const stratCount      = contentStrategyCards.length;

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.lg,
      boxShadow:     T.shadow.card,
    }}>
      {/* ── 패널 헤더 ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{
            fontSize:      10,
            fontWeight:    T.font.weight.semibold,
            color:         T.sub,
            letterSpacing: "0.06em",
            fontFamily:    T.font.familyMono,
          }}>
            전략 액션 리포트
          </span>
          <span style={{
            fontSize:     "10px",
            fontFamily:   T.font.familyMono,
            color:        T.primary,
            background:   T.primarySoft ?? "#EFF6FF",
            borderRadius: T.radius.badge,
            padding:      "1px 6px",
            fontWeight:   600,
          }}>
            v5
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 10, fontFamily: T.font.familyMono }}>
          {fixHighCount > 0 && (
            <span style={{ color: C.danger }}>{fixHighCount} FIX</span>
          )}
          {stratCount > 0 && (
            <span style={{ color: C.strat }}>{stratCount} 전략</span>
          )}
        </div>
      </div>

      {/* ── 로딩 ── */}
      {loadingAnalytics && cards.length === 0 ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>로딩 중···</div>
      ) : cards.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: T.font.size.sm, color: T.muted }}>
            Analytics 데이터를 로드하면 리포트가 생성됩니다
          </span>
          <span style={{ fontSize: 10, color: T.muted }}>
            Google Sheets 연동 후 새로고침하세요
          </span>
        </div>
      ) : (
        <>
          {/* ZONE 1 — Channel Status */}
          <ChannelStatusBar insights={insights} />

          {/* ZONE 2 — Immediate Actions (FIX) */}
          <ImmediateActionsZone cards={cards} />

          <Divider />

          {/* ZONE 3 — Operation Strategy (운영 전략 — 채널 운영 기본 규칙) */}
          <OperationStrategyZone strategies={strat.uploadStrategies} />

          <Divider />

          {/* ZONE 4 — Content Strategy (기회 + 전략 통합) */}
          <ContentStrategyZone cards={contentStrategyCards} />
        </>
      )}

      {/* ── 전체 분석 보기 ── */}
      {onOpenReport && (
        <button
          onClick={onOpenReport}
          style={{
            width:         "100%",
            padding:       `${T.spacing.sm}px 0`,
            background:    "transparent",
            border:        `1px solid ${T.border}`,
            borderRadius:  T.radius.btn,
            color:         T.primary,
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.semibold,
            letterSpacing: "0.05em",
            cursor:        "pointer",
            transition:    "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background  = T.bgSection;
            (e.currentTarget as HTMLElement).style.borderColor = T.primary;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background  = "transparent";
            (e.currentTarget as HTMLElement).style.borderColor = T.border;
          }}
        >
          전체 분석 보기 →
        </button>
      )}
    </div>
  );
}
