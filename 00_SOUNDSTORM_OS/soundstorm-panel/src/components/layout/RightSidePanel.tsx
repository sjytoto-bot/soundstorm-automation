// ─── RightSidePanel ───────────────────────────────────────────────────────────
// 우측 고정 패널 — 수직 아코디언 (한 번에 1섹션만 열림)
//
// 섹션: 블록관리 / 인기영상 / 기회영상 / 시청유지율 / 외부유입
// 문제 있는 섹션: 자동 펼침 + 강조 border
// 나머지: 기본 접힘
//
// 레이아웃 원칙:
//   - 모든 행: flex row (가로)
//   - 텍스트: nowrap + ellipsis
//   - 카드: border + borderRadius
//   - CTA: h-44px, 전체너비

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutGrid, TrendingUp, Target, TimerOff, Globe, ShieldAlert, BarChart2,
  ChevronDown, ChevronUp, ChevronRight, ChevronLeft,
  CheckCircle, ExternalLink,
} from "lucide-react";
import { detectInsights }           from "@/engines/insightEngineV3";
import { analyzeRedirectMarketing } from "@/engines/redirectIntelligence/RedirectMarketingEngine";
import { analyzeOpportunities }     from "@/engines/opportunity/OpportunityEngine";
import { analyzeStrategies }        from "@/engines/strategy/StrategyEngine";
import { generateActionCards }      from "@/engines/action/ActionGenerator";
import { generateContentStrategy }  from "@/engines/strategy/ContentStrategyEngine";
import { generateStrategies }       from "@/engines/StrategyEngine";
import { T } from "../../styles/tokens";
import { useBlocks }              from "../../contexts/BlocksContext";
import { useAnalyticsContext }    from "../../controllers/useAnalyticsController";
import { useDashboardDiagFilter } from "../../contexts/DashboardDiagFilterContext";
import { useVideoPortfolio }      from "../../hooks/useVideoPortfolio";
import { useRightPanelState }     from "../../hooks/useRightPanelState";
import { getRightPanelFocusLabel, getStrategyFocusVisibility } from "./rightPanelFocus";
import type { VideoClickContext } from "@/types/dashboardData";
import WidgetCard                 from "../dashboard/WidgetCard";
import AudienceTabs               from "../dashboard/AudienceTabs";
import CTRIntelligencePanel       from "../dashboard/CTRIntelligencePanel";
import ExternalSectionContent     from "./right-panel/ExternalSectionContent";
import KpiInspectorContent, { getKpiInspectorTitle } from "./right-panel/KpiInspectorContent";
import TopVideosSectionContent    from "./right-panel/TopVideosSectionContent";
import RetentionSectionContent    from "./right-panel/RetentionSectionContent";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type SectionId = "kpi" | "blocks" | "strategy" | "analytics" | "topVideos" | "opportunity" | "retention" | "external";

const OUTER_WIDTH    = 312;
const COLLAPSED_W    = 40;
const PANEL_INSET    = 10;

const SECTION_HEADER_HEIGHT = 46;
const MICRO = T.font.size.xxs;
const CAPTION = T.font.size.xs;
const CONTROL_SM = T.component.size.buttonSm;
const CONTROL_ICON = T.component.size.iconButton;
const ROW_STYLE = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: T.spacing.sm,
  alignItems: "center",
  padding: "10px 0",
  borderBottom: `1px solid ${T.borderSoft}`,
};

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: "22px 18px", textAlign: "left",
      fontSize: CAPTION, color: T.muted, fontFamily: T.font.familyMono,
      letterSpacing: "0.04em",
    }}>
      {text}
    </div>
  );
}

function InspectorRow({
  left,
  right,
  tone = "neutral",
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  return (
    <div style={{
      ...ROW_STYLE,
      color: tone === "danger" ? T.danger : T.text,
    }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : <div />}
    </div>
  );
}

function openVideoFromPanel(
  openVideoDrilldown: ((params: { videoId: string; context: VideoClickContext }) => void) | null,
  videoId: string,
  context: VideoClickContext,
) {
  openVideoDrilldown?.({ videoId, context });
}

// ════════════════════════════════════════════════════════════════════════════
// 섹션 콘텐츠
// ════════════════════════════════════════════════════════════════════════════

// ─── BlocksContent ────────────────────────────────────────────────────────────

function BlocksContent() {
  const {
    visibility, defs, blockMeta, isRecommended,
    markHandled, markAllHandled, toggleOffWithSave, toggleOnWithRestore, updateLayout,
  } = useBlocks();
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const sortedDefs    = [...defs].sort((a, b) => {
    const score = (d: any) => isRecommended(d.id) ? 2 : (visibility[d.id] ? 1 : 0);
    return score(b) - score(a);
  });
  const recommendedIds = defs.filter(d => isRecommended(d.id)).map(d => d.id);

  function handleToggle(id: string) {
    if (visibility[id]) { toggleOffWithSave(id); }
    else {
      toggleOnWithRestore(id);
      if (isRecommended(id)) {
        markHandled(id);
        showFeedback(`${defs.find(d => d.id === id)?.label} 활성화됨`);
      }
    }
  }
  function handleBatch() {
    recommendedIds.forEach(id => { if (!visibility[id]) toggleOnWithRestore(id); updateLayout(id, { pinned: true }); });
    markAllHandled(recommendedIds);
    showFeedback(`추천 블록 ${recommendedIds.length}개 활성화됨`);
  }
  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 2000);
  }

  const batchNames  = recommendedIds.map(id => defs.find(d => d.id === id)?.label ?? id);
  const batchLabel  = recommendedIds.length >= 2
    ? (recommendedIds.length === 2 ? `${batchNames[0]} + ${batchNames[1]} 켜기` : `추천 ${batchNames.length}개 활성화`)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {batchLabel && (
        <div style={{ padding: "6px 12px" }}>
          <button onClick={handleBatch} style={{
            width: "100%", height: CONTROL_SM,
            background: T.warnBg, border: `1px solid ${T.warn}60`,
            borderRadius: T.component.radius.control, cursor: "pointer",
            fontSize: MICRO, fontWeight: T.font.weight.bold, color: T.warn,
            fontFamily: T.font.familyMono, whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>{batchLabel}</button>
        </div>
      )}
      {feedbackMsg && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", background: T.successBg,
        }}>
          <CheckCircle size={11} color={T.success} />
          <span style={{ fontSize: CAPTION, color: T.success, fontFamily: T.font.familyMono, whiteSpace: "nowrap" }}>
            {feedbackMsg}
          </span>
        </div>
      )}
      <div style={{
        padding: "4px 12px 4px",
        fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono,
        borderBottom: `1px solid ${T.borderSoft}`, whiteSpace: "nowrap",
      }}>
        드래그해서 대시보드에 배치
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 6 }}>
        {sortedDefs.map(def => (
          <WidgetCard
            key={def.id} id={def.id} def={def}
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

// ─── OpportunityContent ───────────────────────────────────────────────────────

function OpportunityContent() {
  const portfolio     = useVideoPortfolio();
  const { openVideoDrilldown } = useDashboardDiagFilter();
  const opportunities = (portfolio?.opportunities ?? []) as any[];
  const [openId, setOpenId] = useState<string | null>(null);

  if (!opportunities.length) return <EmptyState text="기회 영상 없음" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: `${T.spacing.sm}px ${T.spacing.md} ${T.spacing.md}px` }}>
      {opportunities.map((v: any, i: number) => {
        const id     = v.videoId ?? v.id ?? String(i);
        const isOpen = openId !== null && openId === id;
        const title  = v.title ?? v.videoTitle ?? id;
        const reason = v.reason ?? v.opportunity ?? "성장 기회";

        return (
          <div key={id} style={{
            background: isOpen ? T.bgSection : "transparent",
            border: `1px solid ${isOpen ? (T.primaryBorder ?? T.border) : T.borderSoft}`,
            borderRadius: T.component.radius.control, overflow: "hidden",
          }}>
            <button onClick={() => setOpenId(isOpen ? null : id)} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "10px 12px",
              background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
            }}>
              <span style={{
                flex: 1, fontSize: CAPTION, fontWeight: T.font.weight.semibold, color: T.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
              }}>{title}</span>
              {isOpen ? <ChevronUp size={13} color={T.muted} style={{ flexShrink: 0 }} />
                      : <ChevronDown size={13} color={T.muted} style={{ flexShrink: 0 }} />}
            </button>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T.borderSoft}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: CAPTION, color: T.sub, lineHeight: T.font.lineHeight.normal }}>{reason}</span>
                <button onClick={() => openVideoFromPanel(openVideoDrilldown, id, { source: "OPPORTUNITY", triggerMetric: "VIEWS" })} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  height: T.component.size.rowCompact, background: T.semantic.surface.insetTint,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: T.component.radius.control, cursor: "pointer",
                  fontSize: CAPTION, fontWeight: T.font.weight.bold, color: T.text,
                }}>
                  영상 상세 보기
                </button>
                <a href={`https://studio.youtube.com/video/${id}/edit`} target="_blank" rel="noreferrer" style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  height: T.component.size.rowCompact, background: T.semantic.surface.insetTint,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: T.component.radius.control, textDecoration: "none",
                  fontSize: CAPTION, fontWeight: T.font.weight.bold, color: T.text,
                }}>
                  <ExternalLink size={12} />Studio에서 확인
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── StrategyContent ─────────────────────────────────────────────────────────
// 채널 전략 섹션: 즉시 수정 / 콘텐츠 제작 전략 / 운영 전략 / 검색 키워드 전략

function StratSectionGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
          {title}
        </span>
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted, background: T.bgSection, borderRadius: T.radius.badge, padding: `0px ${T.spacing.xs}px`, flexShrink: 0 }}>
          {count}
        </span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </ul>
    </div>
  );
}

function StratFixItem({ card }: { card: any }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      onClick={() => setOpen(p => !p)}
      style={{ padding: `${T.spacing.sm}px ${T.spacing.md}px`, borderRadius: T.radius.btn, border: `1px solid ${T.borderSoft}`, background: open ? T.bgSection : "transparent", cursor: "pointer", display: "flex", flexDirection: "column", transition: `background ${T.motion.base}`, userSelect: "none" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
      onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: `0 ${T.spacing.sm}px`, fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.danger, border: `1px solid ${T.danger}50`, borderRadius: T.radius.btn, whiteSpace: "nowrap", flexShrink: 0 }}>
          FIX
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.text, fontWeight: T.font.weight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {card.title}
        </span>
        <span style={{ color: T.muted, flexShrink: 0 }}>{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
      </div>
      {open && card.description && (
        <div style={{ marginTop: T.spacing.sm, paddingTop: T.spacing.sm, borderTop: `1px solid ${T.borderSoft}` }}>
          <p style={{ margin: 0, fontSize: T.font.size.xs, color: T.sub, lineHeight: T.font.lineHeight.normal }}>{card.description}</p>
        </div>
      )}
    </li>
  );
}

function StratEngineCard({ strategy }: { strategy: any }) {
  const [open, setOpen] = useState(false);
  const isProduction = strategy.type === "production";
  const color  = isProduction ? T.primary : T.danger;
  const border = isProduction ? (T.primaryBorder ?? T.border) : `${T.danger}50`;
  const text   = isProduction ? "STRATEGY" : "FIX";
  return (
    <li
      onClick={() => setOpen(p => !p)}
      style={{ padding: `${T.spacing.sm}px ${T.spacing.md}px`, borderRadius: T.radius.btn, border: `1px solid ${T.borderSoft}`, background: open ? T.bgSection : "transparent", cursor: "pointer", display: "flex", flexDirection: "column", transition: `background ${T.motion.base}`, userSelect: "none" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
      onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{ display: "inline-flex", alignItems: "center", padding: `0 ${T.spacing.sm}px`, fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color, border: `1px solid ${border}`, borderRadius: T.radius.btn, whiteSpace: "nowrap", flexShrink: 0 }}>
          {text}
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.text, fontWeight: T.font.weight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {strategy.title}
        </span>
        {open ? <ChevronUp size={12} color={T.muted} style={{ flexShrink: 0 }} /> : <ChevronDown size={12} color={T.muted} style={{ flexShrink: 0 }} />}
      </div>
      {strategy.description && (
        <span style={{ marginTop: 2, fontSize: T.font.size.xs, color: T.muted, lineHeight: T.font.lineHeight.normal }}>{strategy.description}</span>
      )}
      {open && strategy.impact && (
        <span style={{ marginTop: 2, fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color }}>{strategy.impact}</span>
      )}
    </li>
  );
}

function StratStaticItem({ badgeText, badgeColor, badgeBorder, title }: {
  badgeText: string; badgeColor: string; badgeBorder: string; title: string;
}) {
  return (
    <li style={{ padding: `${T.spacing.sm}px ${T.spacing.md}px`, borderRadius: T.radius.btn, border: `1px solid ${T.borderSoft}`, background: T.bgCard, display: "flex", alignItems: "center", gap: T.spacing.sm }}>
      <span style={{ display: "inline-flex", alignItems: "center", padding: `0 ${T.spacing.sm}px`, fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: badgeColor, border: `1px solid ${badgeBorder}`, borderRadius: T.radius.btn, whiteSpace: "nowrap", flexShrink: 0 }}>
        {badgeText}
      </span>
      <span style={{ fontSize: T.font.size.xs, color: T.text, fontWeight: T.font.weight.semibold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {title}
      </span>
    </li>
  );
}

function StrategyContent() {
  const {
    analytics, growth, videoDiagnostics,
    thumbnailStyles, referenceVideos, ctrBuckets,
  } = useAnalyticsContext();
  const { activeDiagFilter, openVideoDrilldown } = useDashboardDiagFilter();

  const current    = analytics?.current ?? null;
  const keywords   = current?.keywords  ?? [];
  const hitVideos  = analytics?.hitVideos ?? [];
  const channelAvg = current?.summary?.avgDurationSec ?? 0;

  const [redirectLogs, setRedirectLogs] = useState<any[]>([]);

  useEffect(() => {
    const api = (window as any).api;
    if (api?.readRedirectLogs) {
      api.readRedirectLogs().then((logs: any) => setRedirectLogs(logs ?? [])).catch(() => {});
    }
  }, []);

  const insights   = useMemo(() => detectInsights(current, growth), [current, growth]);
  const marketing  = useMemo(() => analyzeRedirectMarketing(redirectLogs), [redirectLogs]);
  const opp        = useMemo(() => analyzeOpportunities(keywords, hitVideos, channelAvg, marketing), [keywords, hitVideos, channelAvg, marketing]);
  const strat      = useMemo(() => analyzeStrategies(opp, marketing.timePatterns), [opp, marketing.timePatterns]);
  const cards      = useMemo(() => generateActionCards(insights, opp, strat), [insights, opp, strat]);
  const stratCards = useMemo(() => generateContentStrategy(opp, hitVideos), [opp, hitVideos]);
  const seStrategies = useMemo(() => generateStrategies({
    diagnostics: videoDiagnostics, thumbnailStyles, referenceVideos, ctrBuckets,
  }), [videoDiagnostics, thumbnailStyles, referenceVideos, ctrBuckets]);

  const fixActionCards  = cards.filter((c: any) => c.type === "FIX").slice(0, 3);
  const seFixStrategies = seStrategies.filter((s: any) => s.type === "fix");
  const seProductions   = seStrategies.filter((s: any) => s.type === "production");
  const uploadStrats    = strat.uploadStrategies.slice(0, 4);
  const keywordCards    = stratCards.filter((c: any) => c.label === "GROWING").slice(0, 4);

  const totalCount = fixActionCards.length + seFixStrategies.length + seProductions.length + uploadStrats.length + keywordCards.length;
  if (totalCount === 0) return <EmptyState text="전략 데이터 없음" />;

  const focusLabel = getRightPanelFocusLabel(activeDiagFilter);
  const {
    showCtrPanel,
    showFixGroup,
    showProductionGroup,
    showOpsGroup,
    showKeywordGroup,
  } = getStrategyFocusVisibility(activeDiagFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md, padding: `${T.spacing.sm}px ${T.spacing.md}px ${T.spacing.md}px` }}>
      {focusLabel && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
          background: T.bgSection,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: T.radius.btn,
        }}>
          <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: T.font.familyMono }}>
            현재 포커스
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.primary, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold }}>
            {focusLabel}
          </span>
        </div>
      )}
      {showCtrPanel && (
        <CTRIntelligencePanel
          compact
          onVideoClick={(videoId) => openVideoFromPanel(openVideoDrilldown, videoId, { source: "CTR_INTELLIGENCE", triggerMetric: "CTR" })}
        />
      )}
      {showFixGroup && (
      <StratSectionGroup title="즉시 수정" count={fixActionCards.length + seFixStrategies.length}>
        {fixActionCards.map((c: any) => <StratFixItem key={c.id} card={c} />)}
        {seFixStrategies.map((s: any) => <StratEngineCard key={s.id} strategy={s} />)}
      </StratSectionGroup>
      )}
      {showProductionGroup && (
      <StratSectionGroup title="콘텐츠 제작 전략" count={seProductions.length}>
        {seProductions.map((s: any) => <StratEngineCard key={s.id} strategy={s} />)}
      </StratSectionGroup>
      )}
      {showOpsGroup && (
      <StratSectionGroup title="운영 전략" count={uploadStrats.length}>
        {uploadStrats.map((s: any) => (
          <StratStaticItem
            key={s.type}
            badgeText={s.typeLabel ?? s.type.toUpperCase()}
            badgeColor={T.primary}
            badgeBorder={T.primaryBorder ?? T.border}
            title={s.recommendation}
          />
        ))}
      </StratSectionGroup>
      )}
      {showKeywordGroup && (
      <StratSectionGroup title="검색 키워드 전략" count={keywordCards.length}>
        {keywordCards.map((c: any) => (
          <StratStaticItem
            key={c.id}
            badgeText="KEYWORD"
            badgeColor={T.sub}
            badgeBorder={T.border}
            title={c.title}
          />
        ))}
      </StratSectionGroup>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 섹션 정의 + 아코디언
// ════════════════════════════════════════════════════════════════════════════

type SectionDef = {
  id:      SectionId;
  label:   string;
  icon:    React.ComponentType<{ size?: number; color?: string }>;
  content: () => JSX.Element | null;
  getBadge: (ctx: { videoDiagnostics: any[]; analytics: any }) => { count: number; color: string } | null;
};

const SECTIONS: SectionDef[] = [
  {
    id: "blocks", label: "블록 관리", icon: LayoutGrid,
    content: BlocksContent,
    getBadge: () => null,
  },
  {
    id: "strategy", label: "콘텐츠 전략", icon: ShieldAlert,
    content: StrategyContent,
    getBadge: ({ videoDiagnostics }) => {
      const n = (videoDiagnostics ?? []).filter((d: any) =>
        d.problemType !== "INSUFFICIENT_DATA" && d.problemType !== "NORMAL"
      ).length;
      return n > 0 ? { count: n, color: T.warn } : null;
    },
  },
  {
    id: "analytics", label: "시청자 분석", icon: BarChart2,
    content: () => <AudienceTabs />,
    getBadge: () => null,
  },
  {
    id: "topVideos", label: "인기 영상", icon: TrendingUp,
    content: TopVideosSectionContent,
    getBadge: ({ analytics }) => {
      const n = analytics?.hitVideos?.length ?? 0;
      return n > 0 ? { count: n, color: T.primary } : null;
    },
  },
  {
    id: "opportunity", label: "기회 영상", icon: Target,
    content: OpportunityContent,
    getBadge: () => null,
  },
  {
    id: "retention", label: "시청유지율", icon: TimerOff,
    content: RetentionSectionContent,
    getBadge: ({ videoDiagnostics }) => {
      const n = (videoDiagnostics ?? []).filter((d: any) => d.problemType === "RETENTION_WEAK").length;
      const hasCrit = (videoDiagnostics ?? []).some((d: any) => d.problemType === "RETENTION_WEAK" && d.severity === "CRITICAL");
      return n > 0 ? { count: n, color: hasCrit ? T.danger : T.warn } : null;
    },
  },
  {
    id: "external", label: "외부 유입", icon: Globe,
    content: ExternalSectionContent,
    getBadge: () => null,
  },
];

// ─── AccordionSection ─────────────────────────────────────────────────────────

function AccordionSection({
  def, isOpen, onToggle, ctx,
}: {
  def:      SectionDef;
  isOpen:   boolean;
  onToggle: () => void;
  ctx:      { videoDiagnostics: any[]; analytics: any };
}) {
  const badge = def.getBadge(ctx);
  const Icon  = def.icon;
  const accentColor = badge?.color ?? null;

  return (
    <div style={{
      border: `1px solid ${isOpen ? T.border : T.borderSoft}`,
      borderRadius: T.component.radius.control,
      background:   isOpen ? T.bgCard : T.semantic.surface.card,
      overflow: "hidden",
    }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", height: SECTION_HEADER_HEIGHT, padding: "0 14px",
          background: isOpen ? T.semantic.surface.insetTint : "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          transition: `background ${T.motion.fast}`,
        }}
      >
        <span style={{
          width: T.component.size.dotMd,
          height: T.component.size.dotMd,
          borderRadius: "50%",
          background: accentColor ?? T.border,
          boxShadow: isOpen && accentColor ? `0 0 0 3px ${accentColor}14` : "none",
          flexShrink: 0,
        }} />
        <Icon size={14} color={T.sub} />

        <span style={{
          flex: 1, fontSize: CAPTION, fontWeight: T.font.weight.bold,
          color: T.text,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontFamily: T.font.familyMono,
        }}>
          {def.label}
        </span>

        {badge && (
          <span style={{
            fontSize: MICRO, fontWeight: T.font.weight.bold, fontFamily: T.font.familyMono,
            color: T.sub, background: T.semantic.surface.insetTint,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: T.radius.badge, padding: "1px 6px",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {badge.count}
          </span>
        )}

        {isOpen
          ? <ChevronUp   size={13} color={T.sub} style={{ flexShrink: 0 }} />
          : <ChevronDown size={13} color={T.sub} style={{ flexShrink: 0 }} />}
      </button>

      {/* 콘텐츠 — lazy: 열린 섹션만 렌더 */}
      {isOpen && (
        <div style={{ borderTop: `1px solid ${T.borderSoft}`, background: T.bgCard }}>
          <def.content />
        </div>
      )}
    </div>
  );
}

// ─── RightSidePanel ───────────────────────────────────────────────────────────

export default function RightSidePanel() {
  const { videoDiagnostics, analytics } = useAnalyticsContext();
  const ctx = { videoDiagnostics: videoDiagnostics ?? [], analytics };
  const { activeDiagFilter, selectedKpiInspector } = useDashboardDiagFilter();
  const { isOpen, setIsOpen, openSection, setOpenSection, toggleSection } = useRightPanelState({
    videoDiagnostics: videoDiagnostics ?? [],
    activeDiagFilter,
  });
  const sectionDefs: SectionDef[] = useMemo(() => (
    selectedKpiInspector
      ? [{
          id: "kpi",
          label: getKpiInspectorTitle(selectedKpiInspector.label),
          icon: BarChart2,
          content: () => <KpiInspectorContent data={selectedKpiInspector} />,
          getBadge: () => null,
        }, ...SECTIONS]
      : SECTIONS
  ), [selectedKpiInspector]);

  useEffect(() => {
    if (selectedKpiInspector) {
      setIsOpen(true);
      setOpenSection("kpi");
    }
  }, [selectedKpiInspector, setIsOpen, setOpenSection]);

  // ── Collapsed ────────────────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <div style={{
        width: COLLAPSED_W, flexShrink: 0,
        borderLeft: `1px solid ${T.border}`,
        background: T.semantic.surface.card,
        display: "flex", flexDirection: "column",
        alignItems: "center", paddingTop: 12, gap: 8,
      }}>
        <button onClick={() => setIsOpen(true)} title="패널 열기" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: CONTROL_ICON, height: CONTROL_ICON,
          border: `1px solid ${T.border}`, borderRadius: T.component.radius.control,
          background: "transparent", cursor: "pointer",
        }}>
          <ChevronLeft size={13} color={T.sub} />
        </button>
        {sectionDefs.map(s => {
          const badge = s.getBadge(ctx);
          const Icon  = s.icon;
          return (
            <button key={s.id}
              onClick={() => { setOpenSection(s.id); setIsOpen(true); }}
              title={s.label}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: CONTROL_ICON, height: CONTROL_ICON,
                border: `1px solid ${openSection === s.id ? T.primaryBorder : "transparent"}`,
                borderRadius: T.component.radius.control,
                background: openSection === s.id ? T.primarySoft : "transparent",
                cursor: "pointer", position: "relative",
              }}
            >
              <Icon size={13} color={openSection === s.id ? T.primary : (badge?.color ?? T.sub)} />
              {badge && (
                <div style={{
                  position: "absolute", top: 2, right: 2,
                  width: T.component.size.dotSm, height: T.component.size.dotSm, borderRadius: "50%",
                  background: badge.color,
                }} />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Open ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      width: OUTER_WIDTH,
      minWidth: OUTER_WIDTH,
      maxWidth: OUTER_WIDTH,
      flexShrink: 0,
      boxSizing: "border-box",
      borderLeft: `1px solid ${T.border}`,
      background: T.semantic.surface.card,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: T.component.size.topbar, borderBottom: `1px solid ${T.border}`,
        padding: `0 12px`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: MICRO, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.08em" }}>
            SECONDARY INSPECTOR
          </span>
          <span style={{ fontSize: CAPTION, color: T.text, fontWeight: T.font.weight.bold }}>
            Right Panel
          </span>
        </div>
        <button onClick={() => setIsOpen(false)} title="패널 닫기" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: CONTROL_ICON, height: CONTROL_ICON,
          border: `1px solid ${T.border}`, borderRadius: T.component.radius.control,
          background: "transparent", cursor: "pointer",
        }}>
          <ChevronRight size={13} color={T.sub} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: `${PANEL_INSET}px` }}>
        {sectionDefs.map(def => (
          <div key={def.id} style={{ marginBottom: T.spacing.sm }}>
            <AccordionSection
              def={def}
              isOpen={openSection === def.id}
              onToggle={() => toggleSection(def.id)}
              ctx={ctx}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
