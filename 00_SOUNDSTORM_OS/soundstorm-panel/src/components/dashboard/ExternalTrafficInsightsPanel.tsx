// ─── ExternalTrafficInsightsPanel ────────────────────────────────────────────
// PHASE 8A — External Traffic Insights UI
//
// 구조:
//   섹션 헤더 (EXTERNAL TRAFFIC INSIGHTS)
//   카테고리 분포 요약 바
//   ExternalInsight 카드 목록 (Action-first, severity 없음 → 카테고리 색상 사용)
//
// 데이터: analyzeExternalTraffic(internalInfluence)

import { useMemo, useState, useEffect } from "react";
import { T }       from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { useDashboardDiagFilter } from "@/contexts/DashboardDiagFilterContext";
import { useReachData } from "@/controllers/ReachDataContext";
import { reachRowsToDimensionRows } from "@/adapters/redirectAdapter";
import {
  analyzeExternalTraffic,
  type ExternalInsight,
  type CampaignResult,
  type ConversionResult,
  type RedirectLog,
} from "@/engines/externalTraffic/ExternalTrafficEngine";
import {
  analyzeRedirectMarketing,
  type RedirectMarketingInsights,
} from "@/engines/redirectIntelligence/RedirectMarketingEngine";

// ─── 카테고리 색상 ────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  "검색":     T.primary,
  "AI 검색":  T.component.palette.ai,
  "소셜":     T.component.palette.social,
  "메신저":   T.component.palette.messenger,
  "커뮤니티": T.component.palette.community,
  "블로그":   T.success,
  "협업툴":   T.component.palette.tool,
  "미디어":   T.component.palette.media,
  "기타":     T.muted,
};

function categoryColor(label: string): string {
  return CATEGORY_COLOR[label] ?? T.muted;
}

const QUALITY_COLOR: Record<string, string> = {
  high:   T.success,
  medium: T.warn,
  low:    T.muted,
};

const SECTION_ACCENT = T.component.palette.ai;
const CAMPAIGN_ACCENT = T.component.palette.media;
const COMMUNITY_ACCENT = T.component.palette.messenger;

function DotDivider() {
  return <span style={{ color: T.component.palette.divider }}>·</span>;
}

// ─── score label ──────────────────────────────────────────────────────────────

function scoreLabel(n: number): string {
  if (n > 80) return "높음";
  if (n > 60) return "중간";
  return "낮음";
}

function pickTopVideoId(logs: RedirectLog[], matcher: (log: RedirectLog) => boolean): string | null {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (!matcher(log)) continue;
    const videoId = log.target_video?.trim();
    if (!videoId) continue;
    counts.set(videoId, (counts.get(videoId) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
}

function DrilldownButton({ videoId }: { videoId: string | null }) {
  const { openVideoDrilldown } = useDashboardDiagFilter();
  if (!videoId) return null;

  return (
    <button
      onClick={() => openVideoDrilldown?.({ videoId, context: { source: "EXTERNAL", triggerMetric: "EXTERNAL" } })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: T.component.size.rowCompact,
        padding: `0 ${T.spacing.md}px`,
        background: T.semantic.surface.insetTint,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: T.component.radius.control,
        cursor: "pointer",
        fontSize: T.font.size.xs,
        fontWeight: T.font.weight.semibold,
        color: T.text,
        whiteSpace: "nowrap",
      }}
    >
      영상 상세 보기
    </button>
  );
}

// ─── CategoryBadge ────────────────────────────────────────────────────────────

function CategoryBadge({ label }: { label: string }) {
  const color = categoryColor(label);
  return (
    <span style={{
      fontSize:     T.font.size.xxs,
      fontFamily:   T.font.familyMono,
      fontWeight:   T.font.weight.semibold,
      color,
      background:   `${color}18`,
      borderRadius: T.radius.badge,
      padding:      "2px 7px",
      whiteSpace:   "nowrap",
    }}>
      {label}
    </span>
  );
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({ insight, videoId }: { insight: ExternalInsight; videoId: string | null }) {
  const color = categoryColor(insight.category);

  return (
    <div style={{
      background:    T.bgCard,
      borderRadius:  T.component.radius.control,
      borderLeft:    `4px solid ${color}`,
      padding:       "14px 16px",
      display:       "flex",
      flexDirection: "column",
      gap:           8,
      boxShadow:     T.shadow.card,
    }}>
      {/* 배지 행 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <CategoryBadge label={insight.category} />
        <span style={{
          fontSize:   T.font.size.xxs,
          fontFamily: T.font.familyMono,
          color:      T.muted,
        }}>
          {insight.intent}
        </span>
      </div>

      {/* Action 문장 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: T.font.size.sm, lineHeight: 1.2, flexShrink: 0, marginTop: 2 }}>
          🎯
        </span>
        <span style={{
          flex:       1,
          fontSize:   T.font.size.lg,
          fontWeight: T.font.weight.bold,
          color:      T.text,
          lineHeight: 1.35,
        }}>
          {insight.action}
        </span>
      </div>

      {/* Reason */}
      <p style={{
        margin:      0,
        paddingLeft: 22,
        fontSize:    T.font.size.sm,
        color:       T.sub,
        lineHeight:  1.6,
      }}>
        {insight.reason}
      </p>

      {/* 👥 Audience row */}
      {insight.audience && (
        <div style={{
          paddingLeft: 22,
          fontSize:    T.font.size.xs,
          fontFamily:  T.font.familyMono,
          color:       T.muted,
          display:     "flex",
          alignItems:  "center",
          gap:         4,
        }}>
          <span>👥</span>
          <span>{insight.audience}</span>
          <span style={{ color: T.component.palette.divider }}>·</span>
          <span>{insight.consumptionReason}</span>
        </div>
      )}

      {/* Footer */}
      <div style={{
        paddingLeft: 22,
        fontSize:    T.font.size.xs,
        color:       T.muted,
        fontFamily:  T.font.familyMono,
        display:     "flex",
        gap:         4,
      }}>
        <span>영향도 {scoreLabel(insight.impact)}</span>
        <span style={{ color: T.component.palette.divider }}>·</span>
        <span>분석 신뢰도 {scoreLabel(insight.confidence)}</span>
      </div>
      <div style={{ paddingLeft: 22 }}>
        <DrilldownButton videoId={videoId} />
      </div>
    </div>
  );
}

// ─── CategoryBar — 카테고리 분포 한 줄 요약 ───────────────────────────────────

interface CategoryBarItem {
  label:      string;
  totalViews: number;
  totalRatio: number;
}

function CategoryDistBar({ items }: { items: CategoryBarItem[] }) {
  if (items.length === 0) return null;
  const maxViews = items[0].totalViews;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           6,
      padding:       "10px 12px",
      background:    T.bgSection,
      borderRadius:  T.component.radius.inset,
    }}>
      <div style={{
        fontSize:      T.font.size.xxs,
        fontFamily:    T.font.familyMono,
        color:         T.muted,
        letterSpacing: "0.06em",
        marginBottom:  4,
      }}>
        카테고리별 외부 유입
      </div>
      {items.slice(0, 5).map(item => {
        const pct = maxViews > 0 ? (item.totalViews / maxViews) * 100 : 0;
        const color = categoryColor(item.label);
        return (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize:   T.font.size.xs,
              color:      T.sub,
              minWidth:   52,
              fontFamily: T.font.familyMono,
            }}>
              {item.label}
            </span>
            <div style={{ flex: 1, height: T.component.size.progressSm, background: T.border, borderRadius: T.component.radius.rail }}>
              <div style={{
                width:      `${pct}%`,
                height:     "100%",
                background: color,
                borderRadius: T.component.radius.rail,
                transition: `width ${T.motion.base}`,
              }} />
            </div>
            <span style={{
              fontSize:   T.font.size.xxs,
              fontFamily: T.font.familyMono,
              color:      T.muted,
              minWidth:   36,
              textAlign:  "right",
            }}>
              {(item.totalRatio * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── CampaignCard ─────────────────────────────────────────────────────────────

function ConversionCard({ conv, videoId }: { conv: ConversionResult; videoId: string | null }) {
  const color   = QUALITY_COLOR[conv.quality] ?? T.muted;
  const pct     = Math.min(conv.conversion_rate * 100, 100);

  return (
    <div style={{
      padding:       "10px 12px",
      background:    T.bgSection,
      borderRadius:  T.component.radius.inset,
      borderLeft:    `3px solid ${color}`,
      display:       "flex",
      flexDirection: "column",
      gap:           6,
    }}>
      {/* 캠페인 이름 + 플랫폼 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize:   T.font.size.sm,
          fontWeight: T.font.weight.semibold,
          color:      T.text,
        }}>
          {conv.campaign.replace(/_/g, " ")}
        </span>
        <span style={{
          fontSize:   T.font.size.xxs,
          fontFamily: T.font.familyMono,
          color:      T.muted,
          background: T.bgCard,
          padding:    "1px 6px",
          borderRadius: T.radius.badge,
        }}>
          {conv.platform}
        </span>
      </div>

      {/* 전환율 바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: T.component.size.progressSm, background: T.border, borderRadius: T.component.radius.rail }}>
          <div style={{
            width:        `${pct}%`,
            height:       "100%",
            background:   color,
            borderRadius: T.component.radius.rail,
            transition:   `width ${T.motion.base}`,
          }} />
        </div>
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.semibold,
          color,
          minWidth:   32,
          textAlign:  "right",
        }}>
          {conv.conversion_pct}
        </span>
      </div>

      {/* 클릭 → 조회 인라인 요약 */}
      <div style={{
        fontSize:   T.font.size.xxs,
        fontFamily: T.font.familyMono,
        color:      T.muted,
        display:    "flex",
        alignItems: "center",
        gap:        4,
        flexWrap:   "wrap",
      }}>
        <span style={{ color: T.sub, fontWeight: T.font.weight.semibold }}>
          {conv.clicks.toLocaleString("ko-KR")} 클릭
        </span>
        <span>→</span>
        <span style={{ color: conv.youtube_views > 0 ? T.sub : T.muted, fontWeight: T.font.weight.semibold }}>
          {conv.youtube_views > 0
            ? `${conv.youtube_views.toLocaleString("ko-KR")} 조회`
            : "조회 데이터 없음"
          }
        </span>
        {conv.youtube_views > 0 && (
          <span style={{ color, fontWeight: T.font.weight.bold }}>
            ({conv.conversion_pct})
          </span>
        )}
      </div>
      <DrilldownButton videoId={videoId} />
    </div>
  );
}

// ─── ExternalTrafficInsightsPanel (default export) ───────────────────────────

export default function ExternalTrafficInsightsPanel({ embedded = false }: { embedded?: boolean }) {
  const { analytics, loadingAnalytics } = useAnalyticsContext();
  const reachRows     = useReachData();
  const internalInfluence = analytics?.current?.internalInfluence ?? [];
  const channelAvg    = analytics?.current?.summary?.avgDurationSec ?? 0;

  // _Analytics_Snapshot videos가 비어있을 때 reachRows를 fallback으로 사용
  const analyticsVideos = analytics?.current?.videos ?? [];
  const videoRows = useMemo(
    () => analyticsVideos.length > 0
      ? analyticsVideos
      : reachRowsToDimensionRows(reachRows),
    [analyticsVideos, reachRows],
  );

  // Phase 8B: Redirect Tracker 로그 로드
  const [redirectLogs, setRedirectLogs] = useState<RedirectLog[]>([]);
  useEffect(() => {
    const api = (window as any).api;
    if (api?.readRedirectLogs) {
      api.readRedirectLogs().then((logs: RedirectLog[] | null) => {
        setRedirectLogs(logs ?? []);
      }).catch(() => {});
    }
  }, []);

  const result = useMemo(
    () => analyzeExternalTraffic(internalInfluence, channelAvg, redirectLogs, videoRows),
    [internalInfluence, channelAvg, redirectLogs, videoRows],
  );

  const marketing = useMemo(
    () => analyzeRedirectMarketing(redirectLogs),
    [redirectLogs],
  );

  const insightVideoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const insight of result.insights) {
      map.set(
        `${insight.platform}|${insight.category}|${insight.intent}`,
        pickTopVideoId(redirectLogs, log => (log.platform || "") === insight.platform),
      );
    }
    return map;
  }, [result.insights, redirectLogs]);

  const campaignVideoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const campaign of result.campaigns) {
      map.set(
        campaign.campaign,
        pickTopVideoId(redirectLogs, log =>
          (log.campaign || log.link_slug || "unknown") === campaign.campaign ||
          log.link_slug === campaign.link_slug,
        ),
      );
    }
    return map;
  }, [result.campaigns, redirectLogs]);

  const communityVideoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const community of marketing.communities) {
      map.set(
        community.community,
        pickTopVideoId(redirectLogs, log => (log.campaign || log.link_slug || "unknown") === community.community),
      );
    }
    return map;
  }, [marketing.communities, redirectLogs]);

  const slugVideoMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const reaction of marketing.contentReaction) {
      map.set(
        reaction.slug,
        pickTopVideoId(redirectLogs, log => (log.link_slug || "unknown") === reaction.slug),
      );
    }
    return map;
  }, [marketing.contentReaction, redirectLogs]);

  const categoryBarItems = useMemo(
    () => result.categoryGroups.map(g => ({
      label:      g.categoryLabel,
      totalViews: g.totalViews,
      totalRatio: g.totalRatio,
    })),
    [result.categoryGroups],
  );

  if (loadingAnalytics) {
    return (
      <div style={{
        marginTop:  embedded ? 0 : T.spacing.lg,
        borderTop:  embedded ? "none" : `1px solid ${T.borderSoft}`,
        paddingTop: embedded ? 0 : T.spacing.lg,
        fontSize:   T.font.size.sm,
        color:      T.muted,
      }}>
        외부 유입 분석 중···
      </div>
    );
  }

  if (!result.hasData || result.insights.length === 0) {
    return (
      <div style={{
        marginTop:    embedded ? 0 : T.spacing.lg,
        borderTop:    embedded ? "none" : `1px solid ${T.borderSoft}`,
        paddingTop:   embedded ? 0 : T.spacing.lg,
        fontSize:     T.font.size.sm,
        color:        T.muted,
        textAlign:    "center",
        padding:      `${T.spacing.xl}px 0`,
      }}>
        외부 유입 상세 데이터 없음
      </div>
    );
  }

  return (
    <div style={{
      marginTop:     embedded ? 0 : T.spacing.lg,
      borderTop:     embedded ? "none" : `1px solid ${T.borderSoft}`,
      paddingTop:    embedded ? 0 : T.spacing.lg,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.md,
    }}>
      {/* 섹션 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{
        fontSize:      T.font.size.xxs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.primary,
          letterSpacing: "0.08em",
        }}>
          EXTERNAL TRAFFIC INSIGHTS
        </div>
        <span style={{
          fontSize:   T.font.size.xxs,
          fontFamily: T.font.familyMono,
          color:      T.muted,
        }}>
          {result.enriched.length}개 소스 분석
        </span>
      </div>

      {/* 카테고리 분포 바 */}
      {categoryBarItems.length > 0 && (
        <CategoryDistBar items={categoryBarItems} />
      )}

      {/* Insight 카드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {result.insights.map((insight, i) => (
          <InsightCard
            key={`${insight.platform}-${i}`}
            insight={insight}
            videoId={insightVideoMap.get(`${insight.platform}|${insight.category}|${insight.intent}`) ?? null}
          />
        ))}
      </div>

      {/* ── Phase 8B: TOP EXTERNAL CAMPAIGNS ── */}
      {result.hasCampaignData && (
        <div style={{
          marginTop:     T.spacing.md,
          borderTop:     `1px solid ${T.borderSoft}`,
          paddingTop:    T.spacing.md,
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.sm,
        }}>
          {/* 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{
              fontSize:      T.font.size.xxs,
              fontFamily:    T.font.familyMono,
              fontWeight:    T.font.weight.bold,
              color:         CAMPAIGN_ACCENT,
              letterSpacing: "0.08em",
            }}>
              TOP EXTERNAL CAMPAIGNS
            </div>
            {result.conversionSummary.campaign_count > 0 && (
              <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.muted }}>
                전체 {result.conversionSummary.total_clicks.toLocaleString("ko-KR")}클릭
              </span>
            )}
          </div>

          {/* 전환율 없는 캠페인 (youtube_views=0) — 클릭만 표시 */}
          {result.conversions.length === 0 && result.campaigns.slice(0, 5).map((c, i) => (
            <div key={i} style={{
              padding:       "8px 12px",
              background:    T.bgSection,
              borderRadius:  T.component.radius.inset,
              borderLeft:    `3px solid ${T.muted}`,
              display:       "flex",
              flexDirection: "column",
              gap:           6,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: T.font.size.sm, color: T.text }}>
                  {c.campaign.replace(/_/g, " ")}
                </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.muted }}>
                    {c.platform}
                  </span>
                  <span style={{
                    fontSize:   T.font.size.xxs,
                    fontFamily: T.font.familyMono,
                    fontWeight: T.font.weight.semibold,
                    color:      T.sub,
                  }}>
                    클릭 {c.clicks.toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>
              <DrilldownButton videoId={campaignVideoMap.get(c.campaign) ?? null} />
            </div>
          ))}

          {/* 전환율 카드 */}
          {result.conversions.slice(0, 5).map((conv, i) => (
            <ConversionCard key={i} conv={conv} videoId={campaignVideoMap.get(conv.campaign) ?? null} />
          ))}

          {/* 전체 요약 */}
          {result.conversionSummary.campaign_count > 0 &&
            result.conversionSummary.avg_conversion > 0 && (
            <div style={{
              padding:       "8px 12px",
              background:    T.bgSection,
              borderRadius:  T.component.radius.inset,
              fontSize:      T.font.size.xxs,
              fontFamily:    T.font.familyMono,
              color:         T.muted,
              display:       "flex",
              gap:           8,
            }}>
              <span>전체 전환율</span>
              <span style={{ fontWeight: T.font.weight.bold, color: T.primary }}>
                {Math.round(result.conversionSummary.avg_conversion * 100)}%
              </span>
              {result.conversionSummary.best_campaign && (
                <>
                  <DotDivider />
                  <span>최고 캠페인: {result.conversionSummary.best_campaign.campaign.replace(/_/g, " ")}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Phase 8C: Redirect Marketing Intelligence ── */}
      {marketing.hasData && (
        <RedirectMarketingSection
          marketing={marketing}
          campaignVideoMap={campaignVideoMap}
          communityVideoMap={communityVideoMap}
          slugVideoMap={slugVideoMap}
        />
      )}
    </div>
  );
}

// ─── RedirectMarketingSection ─────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <div style={{
        fontSize:      T.font.size.xxs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         SECTION_ACCENT,
        letterSpacing: "0.08em",
      }}>
        {label}
      </div>
      {count !== undefined && (
        <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.muted }}>
          {count}건
        </span>
      )}
    </div>
  );
}

function RedirectMarketingSection({
  marketing,
  campaignVideoMap,
  communityVideoMap,
  slugVideoMap,
}: {
  marketing: RedirectMarketingInsights;
  campaignVideoMap: Map<string, string | null>;
  communityVideoMap: Map<string, string | null>;
  slugVideoMap: Map<string, string | null>;
}) {
  return (
    <div style={{
      marginTop:     T.spacing.md,
      borderTop:     `1px solid ${T.borderSoft}`,
      paddingTop:    T.spacing.md,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.lg,
    }}>
      {/* ── 1. TOP CAMPAIGNS ── */}
      <div>
        <SectionHeader label="TOP CAMPAIGNS" count={marketing.campaigns.length} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {marketing.campaigns.slice(0, 5).map((c, i) => {
            const topPlatform = Object.entries(c.platformBreakdown)
              .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
            return (
              <div key={i} style={{
                padding:       "9px 12px",
                background:    T.bgSection,
                borderRadius:  T.component.radius.inset,
                borderLeft:    `3px solid ${SECTION_ACCENT}`,
                display:       "flex",
                flexDirection: "column",
                gap:           4,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize:   T.font.size.sm,
                    fontWeight: T.font.weight.semibold,
                    color:      T.text,
                  }}>
                    {c.campaign.replace(/_/g, " ")}
                  </span>
                  <span style={{
                    fontSize:   T.font.size.xxs,
                    fontFamily: T.font.familyMono,
                    fontWeight: T.font.weight.bold,
                    color:      SECTION_ACCENT,
                  }}>
                    {c.clicks.toLocaleString("ko-KR")} 클릭
                  </span>
                </div>
                <div style={{
                  fontSize:   T.font.size.xxs,
                  fontFamily: T.font.familyMono,
                  color:      T.muted,
                  display:    "flex",
                  gap:        8,
                }}>
                  <span>유니크 {c.uniqueUsers}</span>
                  <DotDivider />
                  <span>주 플랫폼 {topPlatform}</span>
                </div>
                <div>
                  <DrilldownButton videoId={campaignVideoMap.get(c.campaign) ?? null} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. TOP COMMUNITIES ── */}
      <div>
        <SectionHeader label="TOP COMMUNITIES" count={marketing.communities.length} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {marketing.communities.slice(0, 5).map((c, i) => (
            <div key={i} style={{
              padding:        "9px 12px",
              background:     T.bgSection,
              borderRadius:   T.component.radius.inset,
              borderLeft:     `3px solid ${COMMUNITY_ACCENT}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{
                  fontSize:   T.font.size.sm,
                  fontWeight: T.font.weight.semibold,
                  color:      T.text,
                }}>
                  {c.community.replace(/_/g, " ")}
                </span>
                {c.slugs.length > 0 && (
                  <span style={{
                    fontSize:   T.font.size.xxs,
                    fontFamily: T.font.familyMono,
                    color:      T.muted,
                  }}>
                    슬러그 {c.slugs.join(", ")}
                  </span>
                )}
                <DrilldownButton videoId={communityVideoMap.get(c.community) ?? null} />
              </div>
              <span style={{
                fontSize:   T.font.size.xxs,
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color:      COMMUNITY_ACCENT,
                whiteSpace: "nowrap",
              }}>
                {c.clicks.toLocaleString("ko-KR")} 클릭
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. CONTENT REACTION ── */}
      <div>
        <SectionHeader label="CONTENT REACTION" count={marketing.contentReaction.length} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {marketing.contentReaction.slice(0, 5).map((r, i) => {
            const maxClicks = marketing.contentReaction[0]?.clicks ?? 1;
            const pct = (r.clicks / maxClicks) * 100;
            return (
              <div key={i} style={{
                padding:       "9px 12px",
                background:    T.bgSection,
                borderRadius:  T.component.radius.inset,
                display:       "flex",
                flexDirection: "column",
                gap:           5,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize:   T.font.size.sm,
                    fontWeight: T.font.weight.semibold,
                    color:      T.text,
                    fontFamily: T.font.familyMono,
                  }}>
                    /{r.slug}
                  </span>
                  <span style={{
                    fontSize:   T.font.size.xxs,
                    fontFamily: T.font.familyMono,
                    fontWeight: T.font.weight.bold,
                    color:      T.success,
                  }}>
                    {r.clicks.toLocaleString("ko-KR")} 클릭
                  </span>
                </div>
                <div style={{ height: T.component.size.rail, background: T.border, borderRadius: T.component.radius.rail }}>
                  <div style={{
                    width:        `${pct}%`,
                    height:       "100%",
                    background:   T.success,
                    borderRadius: T.component.radius.rail,
                    transition:   `width ${T.motion.base}`,
                  }} />
                </div>
                {r.campaigns.length > 0 && (
                  <span style={{
                    fontSize:   T.font.size.xxs,
                    fontFamily: T.font.familyMono,
                    color:      T.muted,
                  }}>
                    캠페인 {r.campaigns.map(c => c.replace(/_/g, " ")).join(", ")}
                  </span>
                )}
                <DrilldownButton videoId={slugVideoMap.get(r.slug) ?? null} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. CLICK TIME PATTERN ── */}
      <div>
        <SectionHeader label="CLICK TIME PATTERN" />
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           5,
          padding:       "10px 12px",
          background:    T.bgSection,
          borderRadius:  T.component.radius.inset,
        }}>
          {marketing.timePatterns.slice(0, 6).map((p, i) => {
            const maxClicks = marketing.timePatterns[0]?.clicks ?? 1;
            const pct = (p.clicks / maxClicks) * 100;
            const color = p.isPeak ? T.warn : T.primary;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize:   T.font.size.xs,
                  fontFamily: T.font.familyMono,
                  color:      p.isPeak ? T.warn : T.sub,
                  minWidth:   36,
                  fontWeight: p.isPeak ? T.font.weight.bold : T.font.weight.regular,
                }}>
                  {String(p.hour).padStart(2, "0")}시
                </span>
                <div style={{ flex: 1, height: T.component.size.progressSm, background: T.border, borderRadius: T.component.radius.rail }}>
                  <div style={{
                    width:        `${pct}%`,
                    height:       "100%",
                    background:   color,
                    borderRadius: T.component.radius.rail,
                    transition:   `width ${T.motion.base}`,
                  }} />
                </div>
                <span style={{
                  fontSize:   T.font.size.xxs,
                  fontFamily: T.font.familyMono,
                  color:      p.isPeak ? T.warn : T.muted,
                  minWidth:   28,
                  textAlign:  "right",
                  fontWeight: p.isPeak ? T.font.weight.bold : T.font.weight.regular,
                }}>
                  {p.clicks}
                </span>
              </div>
            );
          })}
          {marketing.timePatterns.length === 0 && (
            <span style={{ fontSize: T.font.size.xs, color: T.muted }}>데이터 없음</span>
          )}
        </div>
      </div>
    </div>
  );
}
