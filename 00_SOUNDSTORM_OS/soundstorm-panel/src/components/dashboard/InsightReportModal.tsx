// ─── InsightReportModal v1 ─────────────────────────────────────────────────────
// Deep Insight Report — 전체 분석 팝업
//
// 섹션 구조:
//   1. 핵심 인사이트 + AI Summary
//   2. 추천 액션 플랜
//   3. 시청자 타겟팅   (age / gender)
//   4. 지역 특성       (countries)
//   5. 검색 & 유입 패턴 (keywords / trafficSources / internalInfluence)
//   6. 플랫폼 & 기기   (devices)
//   7. 성장 기회        (trendHistory / growth)
//   8. 데이터 기반 액션 플랜 (SEO / 콘텐츠 / 플랫폼)

import React, { useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import type { DimensionRow, TrendPoint } from "@/adapters/AnalyticsAdapter";
import {
  generateInsights, generateActions, generateSummary,
  type InsightItem, type ActionItem,
} from "./InsightEngine";

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
];

const LEVEL_STYLE: Record<string, { bg: string; text: string; bar: string }> = {
  success: { bg: T.successBg, text: T.success,  bar: T.success  },
  warning: { bg: T.warnBg,    text: "#b45309",  bar: "#f59e0b"  },
  danger:  { bg: T.dangerBg,  text: T.danger,   bar: T.danger   },
  info:    { bg: T.bgSection, text: T.sub,       bar: T.primary  },
};

const TAG_COLOR: Record<string, string> = {
  SEO:      "#3b82f6",
  콘텐츠:   "#10b981",
  알고리즘: "#8b5cf6",
  기술:     "#06b6d4",
  전략:     "#f59e0b",
};

const COUNTRY_NAMES: Record<string, string> = {
  KR: "한국", US: "미국", JP: "일본", TW: "대만", CN: "중국",
  SG: "싱가포르", TH: "태국", GB: "영국", CA: "캐나다", AU: "호주",
  DE: "독일", FR: "프랑스", BR: "브라질", IN: "인도", VN: "베트남",
  ID: "인도네시아", MY: "말레이시아", PH: "필리핀", MX: "멕시코",
};

const TRAFFIC_LABEL: Record<string, string> = {
  RELATED_VIDEO:  "추천 영상",
  YT_SEARCH:      "유튜브 검색",
  SUBSCRIBER:     "구독자",
  PLAYLIST:       "플레이리스트",
  YT_CHANNEL:     "채널 페이지",
  NO_LINK_OTHER:  "직접 접속",
  YT_OTHER_PAGE:  "기타 페이지",
  END_SCREEN:     "최종 화면",
  EXT_URL:        "외부 URL",
  NOTIFICATION:   "알림",
};

const DEVICE_LABEL: Record<string, string> = {
  mobile:  "모바일",
  desktop: "데스크탑",
  tablet:  "태블릿",
  tv:      "TV",
};

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function cleanAgeKey(key: string): string {
  return key.replace(/^age/i, "").replace(/_/g, "-").replace(/\s/g, "");
}

// ─── 공통 UI 서브 컴포넌트 ───────────────────────────────────────────────────

function ReportSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        12,
      marginBottom: 20,
    }}>
      <div style={{ width: 3, height: 18, background: T.primary, borderRadius: 2, flexShrink: 0 }} />
      <span style={{
        fontSize:      T.font.size.sm,
        fontWeight:    T.font.weight.bold,
        color:         T.text,
        letterSpacing: "0.04em",
      }}>
        {children}
      </span>
    </div>
  );
}

function ReportCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  12,
      padding:       24,
      boxShadow:     T.shadow?.card,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize:      "10px",
      fontWeight:    T.font.weight.bold,
      fontFamily:    T.font.familyMono,
      color:         T.muted,
      letterSpacing: "0.08em",
      marginBottom:  10,
    }}>
      {children}
    </div>
  );
}

// ─── 인사이트 카드 (보고서용) ─────────────────────────────────────────────────

function InsightCard({ item }: { item: InsightItem }) {
  const style = LEVEL_STYLE[item.level] ?? LEVEL_STYLE.info;
  return (
    <div style={{
      background:  T.bgSection,
      borderRadius: 10,
      padding:     "10px 14px",
      borderLeft:  `4px solid ${style.bar}`,
      display:     "flex",
      alignItems:  "center",
      gap:         10,
    }}>
      <span style={{
        flex:       1,
        fontSize:   T.font.size.sm,
        color:      style.text,
        lineHeight: T.font.lineHeight.normal,
      }}>
        {item.text}
      </span>
      {item.metric && (
        <span style={{
          flexShrink:   0,
          fontSize:     T.font.size.xs,
          fontFamily:   T.font.familyMono,
          fontWeight:   600,
          color:        style.text,
          background:   style.bg,
          borderRadius: 8,
          padding:      "4px 10px",
          whiteSpace:   "nowrap",
        }}>
          {item.metric}
        </span>
      )}
    </div>
  );
}

// ─── 추천 액션 칩 (보고서용) ─────────────────────────────────────────────────

function ActionChip({ item }: { item: ActionItem }) {
  const color = TAG_COLOR[item.tag] ?? T.muted;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0" }}>
      <span style={{
        flexShrink:   0,
        fontSize:     "10px",
        fontFamily:   T.font.familyMono,
        fontWeight:   600,
        color,
        background:   `${color}18`,
        borderRadius: 6,
        padding:      "2px 7px",
        whiteSpace:   "nowrap",
        marginTop:    1,
      }}>
        {item.tag}
      </span>
      <span style={{
        flex:       1,
        fontSize:   T.font.size.sm,
        color:      T.sub,
        lineHeight: T.font.lineHeight.normal,
      }}>
        {item.text}
      </span>
    </div>
  );
}

// ─── 비율 바 (수평 바) ────────────────────────────────────────────────────────

function RatioBar({
  label, ratio, color = T.primary, sublabel,
}: { label: string; ratio: number; color?: string; sublabel?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: T.font.size.sm, color: T.text }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sublabel && (
            <span style={{ fontSize: "10px", color: T.muted, fontFamily: T.font.familyMono }}>
              {sublabel}
            </span>
          )}
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            fontWeight: 600,
            color,
          }}>
            {fmtPct(ratio)}
          </span>
        </div>
      </div>
      <div style={{ height: 6, background: T.bgSection, borderRadius: 3 }}>
        <div style={{
          height: "100%",
          width:  `${Math.min(ratio * 100, 100)}%`,
          background: color,
          borderRadius: 3,
          transition:  "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// ─── Section 1 — 핵심 인사이트 + AI Summary ──────────────────────────────────

function SectionInsights({ insights, summary }: { insights: InsightItem[]; summary: string }) {
  return (
    <ReportCard>
      <ReportSectionHeader>핵심 인사이트</ReportSectionHeader>

      {/* AI Summary */}
      {summary && (
        <div style={{
          background:    T.bgSection,
          border:        `1px solid ${T.borderSoft}`,
          borderRadius:  10,
          padding:       "12px 16px",
          marginBottom:  20,
          display:       "flex",
          flexDirection: "column",
          gap:           6,
        }}>
          <div style={{
            fontSize:      "10px",
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         T.primary,
            letterSpacing: "0.08em",
            marginBottom:  4,
          }}>
            AI SUMMARY
          </div>
          {summary.split("\n").map((line, i) => (
            <div key={i} style={{
              display:    "flex",
              gap:        8,
              fontSize:   T.font.size.sm,
              color:      T.sub,
              lineHeight: T.font.lineHeight.normal,
            }}>
              <span style={{ color: T.muted, fontFamily: T.font.familyMono, flexShrink: 0 }}>
                {i + 1}.
              </span>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* 인사이트 카드 2열 그리드 */}
      {insights.length === 0 ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>분석 데이터 없음</div>
      ) : (
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 8,
        }}>
          {insights.map(item => <InsightCard key={item.id} item={item} />)}
        </div>
      )}
    </ReportCard>
  );
}

// ─── Section 2 — 추천 액션 플랜 ──────────────────────────────────────────────

function SectionActions({ actions }: { actions: ActionItem[] }) {
  const urgent = actions.filter(a => a.priority === 1);
  const seo    = actions.filter(a => a.tag === "SEO" && a.priority !== 1);
  const growth = actions.filter(a => a.tag !== "SEO" && a.priority !== 1);

  const groups = [
    { emoji: "🔥", label: "즉시 실행", items: urgent,  color: T.danger  },
    { emoji: "📈", label: "성장 전략", items: growth,  color: T.primary },
    { emoji: "🔍", label: "SEO 전략", items: seo,     color: "#3b82f6" },
  ].filter(g => g.items.length > 0);

  return (
    <ReportCard>
      <ReportSectionHeader>추천 액션 플랜</ReportSectionHeader>
      <div style={{
        display:             "grid",
        gridTemplateColumns: `repeat(${groups.length}, 1fr)`,
        gap:                 16,
      }}>
        {groups.map(g => (
          <div key={g.label} style={{
            background:    T.bgSection,
            borderRadius:  10,
            padding:       "14px 16px",
          }}>
            <div style={{
              fontSize:      T.font.size.xs,
              fontWeight:    T.font.weight.bold,
              fontFamily:    T.font.familyMono,
              color:         g.color,
              letterSpacing: "0.05em",
              marginBottom:  10,
            }}>
              {g.emoji} {g.label}
            </div>
            {g.items.map((item, i) => <ActionChip key={i} item={item} />)}
          </div>
        ))}
      </div>
    </ReportCard>
  );
}

// ─── Section 3 — 시청자 타겟팅 ───────────────────────────────────────────────

function SectionAudience({
  age, gender,
}: { age: DimensionRow[]; gender: DimensionRow[] }) {
  return (
    <ReportCard>
      <ReportSectionHeader>시청자 타겟팅</ReportSectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* 연령대 */}
        <div>
          <SubLabel>연령대 분포</SubLabel>
          {age.length === 0 ? (
            <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
          ) : (
            age.map((row, i) => (
              <RatioBar
                key={row.key}
                label={cleanAgeKey(row.key)}
                ratio={row.ratio}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))
          )}
        </div>

        {/* 성별 */}
        <div>
          <SubLabel>성별 분포</SubLabel>
          {gender.length === 0 ? (
            <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
          ) : gender.length >= 2 ? (
            <>
              {gender.map((row, i) => (
                <RatioBar
                  key={row.key}
                  label={row.key === "male" ? "남성" : row.key === "female" ? "여성" : row.key}
                  ratio={row.ratio}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
              {/* 파이 차트 */}
              <ResponsiveContainer width="100%" height={140} style={{ marginTop: 12 }}>
                <PieChart>
                  <Pie
                    data={gender.map(r => ({
                      name:  r.key === "male" ? "남성" : r.key === "female" ? "여성" : r.key,
                      value: r.ratio,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={58}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {gender.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => [`${(((Number(v ?? 0)) * 100)).toFixed(1)}%`]}
                    contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </>
          ) : (
            gender.map((row, i) => (
              <RatioBar
                key={row.key}
                label={row.key === "male" ? "남성" : row.key === "female" ? "여성" : row.key}
                ratio={row.ratio}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))
          )}
        </div>
      </div>
    </ReportCard>
  );
}

// ─── Section 4 — 지역 특성 ───────────────────────────────────────────────────

function SectionCountries({ countries }: { countries: DimensionRow[] }) {
  const top10 = countries.slice(0, 10);
  const chartData = top10.map(r => ({
    name:  COUNTRY_NAMES[r.key.toUpperCase()] ?? r.key,
    ratio: Math.round(r.ratio * 1000) / 10,  // → %
  }));

  return (
    <ReportCard>
      <ReportSectionHeader>지역 특성</ReportSectionHeader>
      {countries.length === 0 ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* 순위 리스트 */}
          <div>
            <SubLabel>국가별 시청 비율 TOP 10</SubLabel>
            {top10.map((row, i) => (
              <RatioBar
                key={row.key}
                label={`${COUNTRY_NAMES[row.key.toUpperCase()] ?? row.key}`}
                ratio={row.ratio}
                sublabel={`#${i + 1}`}
                color={i === 0 ? T.primary : i <= 2 ? T.success : T.sub}
              />
            ))}
          </div>

          {/* 바 차트 */}
          <div>
            <SubLabel>시각화</SubLabel>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={T.borderSoft} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: T.muted }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${Number(v ?? 0)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={52}
                  tick={{ fontSize: 10, fill: T.sub }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v: unknown) => [`${Number(v ?? 0)}%`, "비율"]}
                  contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey="ratio" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ReportCard>
  );
}

// ─── Section 5 — 검색 & 유입 패턴 ────────────────────────────────────────────

function SectionTraffic({
  keywords, trafficSources, internalInfluence,
}: {
  keywords:          DimensionRow[];
  trafficSources:    DimensionRow[];
  internalInfluence: DimensionRow[];
}) {
  const topKw      = keywords.slice(0, 10);
  const topTraffic = trafficSources.slice(0, 8);
  const topInfluence = internalInfluence.slice(0, 6);

  const pieData = topTraffic.map(r => ({
    name:  TRAFFIC_LABEL[r.key] ?? r.key,
    value: r.ratio,
  }));

  return (
    <ReportCard>
      <ReportSectionHeader>검색 &amp; 유입 패턴</ReportSectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        {/* 검색 키워드 */}
        <div>
          <SubLabel>검색 키워드 TOP 10</SubLabel>
          {topKw.length === 0 ? (
            <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
          ) : (
            topKw.map((row, i) => (
              <div key={row.key} style={{
                display:     "flex",
                alignItems:  "center",
                gap:         8,
                padding:     "5px 0",
                borderBottom:`1px solid ${T.borderSoft}`,
              }}>
                <span style={{
                  flexShrink:  0,
                  fontSize:    "10px",
                  fontFamily:  T.font.familyMono,
                  color:       i < 3 ? T.primary : T.muted,
                  fontWeight:  i < 3 ? 700 : 400,
                  width:       18,
                  textAlign:   "right",
                }}>
                  {i + 1}
                </span>
                <span style={{
                  flex:        1,
                  fontSize:    T.font.size.sm,
                  color:       T.text,
                  overflow:    "hidden",
                  textOverflow:"ellipsis",
                  whiteSpace:  "nowrap",
                }}>
                  {row.key}
                </span>
                <span style={{
                  flexShrink:  0,
                  fontSize:    "10px",
                  fontFamily:  T.font.familyMono,
                  color:       T.sub,
                }}>
                  {fmtPct(row.ratio)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 트래픽 소스 (파이 차트) */}
        <div>
          <SubLabel>트래픽 소스 분포</SubLabel>
          {topTraffic.length === 0 ? (
            <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => [`${(((Number(v ?? 0)) * 100)).toFixed(1)}%`]}
                    contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {topTraffic.map((row, i) => (
                  <div key={row.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: "11px", color: T.sub }}>
                        {TRAFFIC_LABEL[row.key] ?? row.key}
                      </span>
                    </div>
                    <span style={{ fontSize: "10px", fontFamily: T.font.familyMono, color: T.muted }}>
                      {fmtPct(row.ratio)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 내부 영향 (internal influence) */}
        <div>
          <SubLabel>유입 채널 TOP 6</SubLabel>
          {topInfluence.length === 0 ? (
            <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
          ) : (
            topInfluence.map((row, i) => (
              <div key={row.key} style={{
                padding:     "6px 0",
                borderBottom:`1px solid ${T.borderSoft}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{
                    fontSize:    T.font.size.xs,
                    color:       T.text,
                    overflow:    "hidden",
                    textOverflow:"ellipsis",
                    whiteSpace:  "nowrap",
                    maxWidth:    "70%",
                  }}>
                    {row.key}
                  </span>
                  <span style={{ fontSize: "10px", fontFamily: T.font.familyMono, color: T.muted }}>
                    {fmtPct(row.ratio)}
                  </span>
                </div>
                {row.subtitle && (
                  <span style={{
                    fontSize:    "10px",
                    color:       T.muted,
                    fontFamily:  T.font.familyMono,
                    background:  T.bgSection,
                    borderRadius:4,
                    padding:     "1px 5px",
                  }}>
                    {row.subtitle}
                  </span>
                )}
                <div style={{ height: 3, background: T.bgSection, borderRadius: 2, marginTop: 4 }}>
                  <div style={{
                    height:    "100%",
                    width:     `${Math.min(row.ratio * 100, 100)}%`,
                    background: CHART_COLORS[i % CHART_COLORS.length],
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ReportCard>
  );
}

// ─── Section 6 — 플랫폼 & 기기 ───────────────────────────────────────────────

function SectionDevices({ devices }: { devices: DimensionRow[] }) {
  const pieData = devices.map(r => ({
    name:  DEVICE_LABEL[r.key] ?? r.key,
    value: r.ratio,
  }));

  return (
    <ReportCard>
      <ReportSectionHeader>플랫폼 &amp; 기기</ReportSectionHeader>
      {devices.length === 0 ? (
        <div style={{ fontSize: T.font.size.sm, color: T.muted }}>데이터 없음</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 32, alignItems: "center" }}>
          {/* 파이 차트 */}
          <div>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={76}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: unknown) => [`${(((Number(v ?? 0)) * 100)).toFixed(1)}%`]}
                  contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 비율 바 */}
          <div>
            <SubLabel>기기별 비율</SubLabel>
            {devices.map((row, i) => (
              <RatioBar
                key={row.key}
                label={DEVICE_LABEL[row.key] ?? row.key}
                ratio={row.ratio}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </div>
      )}
    </ReportCard>
  );
}

// ─── Section 7 — 성장 기회 ───────────────────────────────────────────────────

function SectionGrowth({
  trendHistory, growth, summary, prev30,
}: {
  trendHistory: TrendPoint[];
  growth: { views: number|null; likes: number|null; watchTime: number|null; avgDuration: number|null; subscribers: number|null };
  summary: { views: number; likes: number; watchTimeMin: number; avgDurationSec: number } | null;
  prev30:  { views: number; likes: number; watchTimeMin: number; avgDurationSec: number } | null;
}) {
  const chartData = trendHistory.map(p => ({ date: fmtDate(p.date), views: p.views }));

  const metrics = [
    { label: "조회수",       cur: summary?.views,         prv: prev30?.views,         pct: growth.views       },
    { label: "좋아요",       cur: summary?.likes,         prv: prev30?.likes,         pct: growth.likes       },
    { label: "총 시청시간",  cur: summary?.watchTimeMin,  prv: prev30?.watchTimeMin,  pct: growth.watchTime   },
    { label: "평균 시청시간",cur: summary?.avgDurationSec,prv: prev30?.avgDurationSec,pct: growth.avgDuration },
  ];

  return (
    <ReportCard>
      <ReportSectionHeader>성장 기회</ReportSectionHeader>

      {/* 추세 라인 차트 */}
      {trendHistory.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <SubLabel>KPI 조회수 추세</SubLabel>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderSoft} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: T.muted, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: T.muted }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => fmtViews(v)}
                width={48}
              />
              <Tooltip
                contentStyle={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, fontFamily: "monospace" }}
                formatter={(v: unknown) => [(Number(v ?? 0)).toLocaleString("ko-KR"), "조회수"]}
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
        </div>
      ) : (
        <div style={{
          height:         80,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       T.font.size.xs,
          color:          T.muted,
          background:     T.bgSection,
          borderRadius:   8,
          marginBottom:   24,
        }}>
          추세 데이터 없음
        </div>
      )}

      {/* 성장율 비교 테이블 */}
      <SubLabel>기간 비교 (현재 vs 이전 30일)</SubLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        {metrics.map(m => {
          const pos = m.pct != null && m.pct >= 0;
          const neg = m.pct != null && m.pct < 0;
          return (
            <div key={m.label} style={{
              background:    T.bgSection,
              borderRadius:  10,
              padding:       "12px 14px",
              textAlign:     "center",
            }}>
              <div style={{ fontSize: "10px", color: T.muted, fontFamily: T.font.familyMono, marginBottom: 6 }}>
                {m.label}
              </div>
              <div style={{
                fontSize:   T.font.size.xl ?? "1.25rem",
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color:      pos ? T.success : neg ? T.danger : T.text,
              }}>
                {m.pct == null ? "—" : pos ? `▲ +${m.pct}%` : `▼ ${m.pct}%`}
              </div>
            </div>
          );
        })}
      </div>
    </ReportCard>
  );
}

// ─── Section 8 — 데이터 기반 액션 플랜 ───────────────────────────────────────

function SectionActionPlan({ actions }: { actions: ActionItem[] }) {
  const groups = [
    {
      title: "SEO 전략",
      color: "#3b82f6",
      items: actions.filter(a => a.tag === "SEO"),
    },
    {
      title: "콘텐츠 전략",
      color: T.success,
      items: actions.filter(a => a.tag === "콘텐츠" || a.tag === "기술"),
    },
    {
      title: "플랫폼 전략",
      color: "#f59e0b",
      items: actions.filter(a => a.tag === "전략" || a.tag === "알고리즘"),
    },
  ];

  return (
    <ReportCard>
      <ReportSectionHeader>데이터 기반 액션 플랜</ReportSectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {groups.map(g => (
          <div key={g.title} style={{
            background:    T.bgSection,
            borderRadius:  10,
            padding:       "16px",
            borderTop:     `3px solid ${g.color}`,
          }}>
            <div style={{
              fontSize:      T.font.size.xs,
              fontWeight:    T.font.weight.bold,
              color:         g.color,
              fontFamily:    T.font.familyMono,
              letterSpacing: "0.05em",
              marginBottom:  12,
            }}>
              {g.title}
            </div>
            {g.items.length === 0 ? (
              <div style={{ fontSize: T.font.size.xs, color: T.muted }}>해당 없음</div>
            ) : (
              g.items.map((item, i) => (
                <div key={i} style={{
                  display:    "flex",
                  alignItems: "flex-start",
                  gap:        8,
                  padding:    "6px 0",
                  borderBottom: i < g.items.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                }}>
                  <span style={{
                    flexShrink:  0,
                    width:       18,
                    height:      18,
                    borderRadius:"50%",
                    background:  `${g.color}22`,
                    color:       g.color,
                    fontSize:    "10px",
                    fontFamily:  T.font.familyMono,
                    fontWeight:  700,
                    display:     "flex",
                    alignItems:  "center",
                    justifyContent: "center",
                  }}>
                    {i + 1}
                  </span>
                  <span style={{
                    flex:       1,
                    fontSize:   T.font.size.sm,
                    color:      T.sub,
                    lineHeight: T.font.lineHeight.normal,
                  }}>
                    {item.text}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </ReportCard>
  );
}

// ─── InsightReportModal ───────────────────────────────────────────────────────

interface InsightReportModalProps {
  open:    boolean;
  onClose: () => void;
}

export default function InsightReportModal({ open, onClose }: InsightReportModalProps) {
  const { analytics, growth, period, loadingAnalytics } = useAnalyticsContext();

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 스크롤 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const current    = analytics?.current ?? null;
  const prev30data = analytics?.prev30 ?? null;
  const hitVideos  = analytics?.hitVideos ?? [];
  const keywords   = current?.keywords ?? [];

  const insights = useMemo(
    () => generateInsights(current, growth),
    [current, growth],
  );

  const actions = useMemo(
    () => generateActions(insights, keywords, hitVideos),
    [insights, keywords, hitVideos],
  );

  const summary = useMemo(
    () => generateSummary(insights),
    [insights],
  );

  const PERIOD_LABEL: Record<string, string> = { "7d": "최근 7일", "30d": "최근 30일", all: "전체 기간" };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(0, 0, 0, 0.65)",
        zIndex:         50,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        padding:        24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:    T.bgApp,
          borderRadius:  16,
          width:         "min(960px, calc(100vw - 48px))",
          maxHeight:     "calc(100vh - 48px)",
          overflowY:     "auto",
          boxShadow:     "0 24px 80px rgba(0,0,0,0.5)",
          display:       "flex",
          flexDirection: "column",
        }}
      >
        {/* ── 스티키 헤더 ──────────────────────────────────────────────────── */}
        <div style={{
          position:       "sticky",
          top:            0,
          zIndex:         10,
          background:     T.bgApp,
          borderBottom:   `1px solid ${T.border}`,
          padding:        "16px 28px",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              fontSize:   T.font.size.sm,
              fontWeight: T.font.weight.bold,
              color:      T.text,
            }}>
              Deep Insight Report
            </span>
            <span style={{
              fontSize:   "10px",
              fontFamily: T.font.familyMono,
              color:      T.primary,
              background: `${T.primary}18`,
              borderRadius: 6,
              padding:    "2px 8px",
              fontWeight: 600,
            }}>
              {PERIOD_LABEL[period] ?? period}
            </span>
            {loadingAnalytics && (
              <span style={{ fontSize: "10px", color: T.muted, fontFamily: T.font.familyMono }}>
                로딩 중···
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              background:   "transparent",
              border:       `1px solid ${T.border}`,
              borderRadius: 8,
              color:        T.sub,
              fontSize:     T.font.size.sm,
              padding:      "6px 14px",
              cursor:       "pointer",
              fontFamily:   T.font.familyMono,
            }}
          >
            ✕ 닫기
          </button>
        </div>

        {/* ── 리포트 본문 ──────────────────────────────────────────────────── */}
        <div style={{
          padding: "28px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}>
          {loadingAnalytics ? (
            <div style={{
              padding:        80,
              textAlign:      "center",
              fontSize:       T.font.size.sm,
              color:          T.muted,
              fontFamily:     T.font.familyMono,
            }}>
              데이터 로딩 중···
            </div>
          ) : (
            <>
              <SectionInsights insights={insights} summary={summary} />
              <SectionActions actions={actions} />
              <SectionAudience
                age={current?.age ?? []}
                gender={current?.gender ?? []}
              />
              <SectionCountries countries={current?.countries ?? []} />
              <SectionTraffic
                keywords={current?.keywords ?? []}
                trafficSources={current?.trafficSources ?? []}
                internalInfluence={current?.internalInfluence ?? []}
              />
              <SectionDevices devices={current?.devices ?? []} />
              <SectionGrowth
                trendHistory={current?.trendHistory ?? []}
                growth={growth}
                summary={current?.summary ?? null}
                prev30={prev30data}
              />
              <SectionActionPlan actions={actions} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
