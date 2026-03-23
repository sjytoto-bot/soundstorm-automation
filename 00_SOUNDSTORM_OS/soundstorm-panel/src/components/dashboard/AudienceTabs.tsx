// ─── AudienceTabs v2 ──────────────────────────────────────────────────────────
// 시청자·트래픽 분석 탭 패널
//
// 탭 구조:
//   Traffic  — 유입 경로 (BarChart) + ExternalTrafficInsightsPanel
//   Audience — 연령(PieChart) + 성별(PieChart)
//   Country  — Top 10 국가 (BarChart)
//   Keywords — 검색 키워드 테이블
//   Device   — 기기 분포 (PieChart)
//
// 데이터 소스: useAnalyticsContext()
// 차트 라이브러리: recharts

import { useState, useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import QuickInsightBar from "./QuickInsightBar";
import ExternalTrafficInsightsPanel from "./ExternalTrafficInsightsPanel";
import {
  generateAudienceInsights,
  generateAudienceActions,
  generateTrafficInsights,
  generateTrafficActions,
  generateCountryInsights,
  generateCountryActions,
  generateKeywordsInsights,
  generateKeywordsActions,
  generateDeviceInsights,
  generateDeviceActions,
  zipPairs,
} from "@/engines/PanelInsightEngine";

// ─── 차트 팔레트 ──────────────────────────────────────────────────────────────

const PIE_COLORS = [
  T.primary,
  "#8B5CF6",
  T.success,
  T.warn,
  T.danger,
  "#06B6D4",
  "#EC4899",
  "#F97316",
];

const GENDER_COLORS: Record<string, string> = {
  male:    T.primary,
  female:  "#EC4899",
  unknown: T.muted,
};

// ─── 탭 정의 ──────────────────────────────────────────────────────────────────

type TabKey = "audience" | "country" | "keywords" | "device" | "traffic";

const TABS: { key: TabKey; label: string }[] = [
  { key: "traffic",  label: "유입 경로"   },
  { key: "audience", label: "연령 · 성별" },
  { key: "country",  label: "국가"        },
  { key: "keywords", label: "검색 키워드"  },
  { key: "device",   label: "시청 기기"   },
];

// ─── 공통 유틸 ────────────────────────────────────────────────────────────────

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtCount(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

// ─── 빈 상태 ──────────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      height:         200,
      fontSize:       T.font.size.sm,
      color:          T.muted,
    }}>
      {label} 데이터 없음
    </div>
  );
}

// ─── 커스텀 Pie Tooltip ────────────────────────────────────────────────────────

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.btn,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      fontSize:     T.font.size.xs,
      fontFamily:   "monospace",
    }}>
      {name}: {typeof value === "number" ? fmtPct(value) : value}
    </div>
  );
}

// ─── Audience 탭 ──────────────────────────────────────────────────────────────

function AudiencePanel({ age, gender }: { age: DimensionRow[]; gender: DimensionRow[] }) {
  if (age.length === 0 && gender.length === 0) return <EmptyState label="시청자" />;

  const ageData    = age.map(r    => ({ name: r.key, value: r.ratio }));
  const genderData = gender.map(r => ({ name: r.key, value: r.ratio }));

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "1fr 1fr",
      gap:                 T.spacing.xl,
    }}>
      {/* 연령 분포 */}
      <div>
        <SubLabel>연령 분포</SubLabel>
        {ageData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={ageData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={70} innerRadius={32}
                  paddingAngle={2}
                >
                  {ageData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <PieLegend items={ageData.map((d, i) => ({
              label: d.name,
              value: fmtPct(d.value),
              color: PIE_COLORS[i % PIE_COLORS.length],
            }))} />
          </>
        ) : <EmptyState label="연령" />}
      </div>

      {/* 성별 분포 */}
      <div>
        <SubLabel>성별 분포</SubLabel>
        {genderData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={genderData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={70} innerRadius={32}
                  paddingAngle={2}
                >
                  {genderData.map((d, i) => (
                    <Cell key={i} fill={GENDER_COLORS[d.name.toLowerCase()] ?? PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <PieLegend items={genderData.map(d => ({
              label: d.name === "male" ? "남성" : d.name === "female" ? "여성" : "미분류",
              value: fmtPct(d.value),
              color: GENDER_COLORS[d.name.toLowerCase()] ?? T.muted,
            }))} />
          </>
        ) : <EmptyState label="성별" />}
      </div>
    </div>
  );
}

// ─── Country 탭 ───────────────────────────────────────────────────────────────

function CountryPanel({ countries }: { countries: DimensionRow[] }) {
  if (countries.length === 0) return <EmptyState label="국가" />;

  const data = countries.slice(0, 10).map(r => ({
    name:  r.key,
    views: r.views,
    ratio: r.ratio,
  }));

  return (
    <div>
      <SubLabel>국가별 조회수 Top 10</SubLabel>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: T.muted, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
            tickFormatter={fmtCount}
          />
          <YAxis
            type="category" dataKey="name"
            tick={{ fontSize: 11, fill: T.sub, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: T.radius.btn, fontSize: T.font.size.xs, fontFamily: "monospace",
            }}
            formatter={(val: unknown) => [fmtCount(Number(val ?? 0)), "조회수"]}
          />
          <Bar dataKey="views" fill={T.primary} radius={[0, 3, 3, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Keywords 탭 ──────────────────────────────────────────────────────────────

function KeywordsPanel({ keywords }: { keywords: DimensionRow[] }) {
  if (keywords.length === 0) return <EmptyState label="키워드" />;

  return (
    <div>
      <SubLabel>검색 키워드 Top {keywords.length}</SubLabel>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {(["순위", "키워드", "조회수", "비율"] as const).map(h => (
              <th key={h} style={{
                fontSize:     T.font.size.xs,
                color:        T.muted,
                fontWeight:   T.font.weight.medium,
                textAlign:    h === "순위" ? "center" : h === "조회수" || h === "비율" ? "right" : "left",
                padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
                borderBottom: `1px solid ${T.border}`,
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw, i) => (
            <tr key={kw.key} style={{
              borderBottom: `1px solid ${T.borderSoft}`,
              background:   i % 2 === 0 ? "transparent" : T.bgSection,
            }}>
              <td style={{ textAlign: "center", padding: `${T.spacing.xs}px ${T.spacing.sm}px` }}>
                <span style={{
                  fontSize:     T.font.size.xs,
                  fontFamily:   "monospace",
                  color:        i < 3 ? T.warn : T.muted,
                  fontWeight:   i < 3 ? T.font.weight.bold : T.font.weight.regular,
                }}>
                  {kw.rank ?? i + 1}
                </span>
              </td>
              <td style={{ padding: `${T.spacing.xs}px ${T.spacing.sm}px` }}>
                <span style={{ fontSize: T.font.size.sm, color: T.text }}>{kw.key}</span>
              </td>
              <td style={{ textAlign: "right", padding: `${T.spacing.xs}px ${T.spacing.sm}px` }}>
                <span style={{ fontSize: T.font.size.xs, fontFamily: "monospace", color: T.sub }}>
                  {fmtCount(kw.views)}
                </span>
              </td>
              <td style={{ textAlign: "right", padding: `${T.spacing.xs}px ${T.spacing.sm}px` }}>
                <span style={{ fontSize: T.font.size.xs, fontFamily: "monospace", color: T.muted }}>
                  {fmtPct(kw.ratio)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Device 탭 ────────────────────────────────────────────────────────────────

const DEVICE_LABELS: Record<string, string> = {
  mobile:  "모바일",
  desktop: "데스크탑",
  tablet:  "태블릿",
  tv:      "TV",
};

function DevicePanel({ devices }: { devices: DimensionRow[] }) {
  if (devices.length === 0) return <EmptyState label="기기" />;

  const data = devices.map(r => ({
    name:  DEVICE_LABELS[r.key.toLowerCase()] ?? r.key,
    value: r.ratio,
  }));

  return (
    <div>
      <SubLabel>기기 분포</SubLabel>
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xl }}>
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name"
              cx="50%" cy="50%" outerRadius={80} innerRadius={40}
              paddingAngle={3}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <PieLegend items={data.map((d, i) => ({
          label: d.name,
          value: fmtPct(d.value),
          color: PIE_COLORS[i % PIE_COLORS.length],
        }))} />
      </div>
    </div>
  );
}

// ─── Traffic 탭 ───────────────────────────────────────────────────────────────

const TRAFFIC_LABELS: Record<string, string> = {
  SUBSCRIBER:      "구독자",
  RELATED_VIDEO:   "추천 영상",
  YT_SEARCH:       "YouTube 검색",
  YT_CHANNEL:      "채널 페이지",
  EXT_URL:         "외부 URL",
  NO_LINK_OTHER:   "직접 유입",
  END_SCREEN:      "마지막 화면",
  NOTIFICATION:    "알림",
  YT_OTHER_PAGE:   "기타 YouTube",
  PLAYLIST:        "재생목록",
};

function TrafficPanel({ trafficSources }: { trafficSources: DimensionRow[] }) {
  if (trafficSources.length === 0) return <EmptyState label="트래픽" />;

  const data = trafficSources.slice(0, 8).map(r => ({
    name:  TRAFFIC_LABELS[r.key] ?? r.key,
    views: r.views,
    ratio: r.ratio,
  }));

  return (
    <div>
      <SubLabel>트래픽 소스</SubLabel>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: T.muted, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
            tickFormatter={v => `${(v * 100).toFixed(0)}%`}
            domain={[0, 1]}
          />
          <YAxis
            type="category" dataKey="name"
            tick={{ fontSize: 10, fill: T.sub, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
            width={80}
          />
          <Tooltip
            contentStyle={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: T.radius.btn, fontSize: T.font.size.xs, fontFamily: "monospace",
            }}
            formatter={(val: unknown) => [`${(((Number(val ?? 0)) * 100)).toFixed(1)}%`, "비율"]}
          />
          <Bar dataKey="ratio" fill="#8B5CF6" radius={[0, 3, 3, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PieLegend (공통) ─────────────────────────────────────────────────────────

interface LegendItem { label: string; value: string; color: string; }

function PieLegend({ items }: { items: LegendItem[] }) {
  return (
    <div style={{
      display:        "flex",
      flexWrap:       "wrap",
      gap:            `${T.spacing.xs}px ${T.spacing.md}px`,
      marginTop:      T.spacing.sm,
    }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   item.color,
            flexShrink:   0,
          }} />
          <span style={{ fontSize: T.font.size.xs, color: T.sub }}>{item.label}</span>
          <span style={{ fontSize: T.font.size.xs, fontFamily: "monospace", color: T.muted }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── SubLabel ─────────────────────────────────────────────────────────────────

function SubLabel({ children }: { children: React.ReactNode }) {
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

// ─── AudienceTabs ─────────────────────────────────────────────────────────────

export default function AudienceTabs() {
  const { analytics, loadingAnalytics } = useAnalyticsContext();
  const [activeTab, setActiveTab] = useState<TabKey>("traffic");

  const current = analytics?.current;

  // 탭별 인사이트/액션 (메모이즈)
  const audienceInsight = useMemo(() => ({
    insights: generateAudienceInsights(current?.age ?? [], current?.gender ?? []),
    actions:  generateAudienceActions(current?.age ?? [], current?.gender ?? []),
  }), [current]);

  const trafficInsight = useMemo(() => ({
    insights: generateTrafficInsights(current?.trafficSources ?? [], current?.keywords ?? []),
    actions:  generateTrafficActions(current?.trafficSources ?? [], current?.keywords ?? []),
  }), [current]);

  const countryInsight = useMemo(() => ({
    insights: generateCountryInsights(current?.countries ?? []),
    actions:  generateCountryActions(current?.countries ?? []),
  }), [current]);

  const keywordsInsight = useMemo(() => ({
    insights: generateKeywordsInsights(current?.keywords ?? []),
    actions:  generateKeywordsActions(current?.keywords ?? []),
  }), [current]);

  const deviceInsight = useMemo(() => ({
    insights: generateDeviceInsights(current?.devices ?? []),
    actions:  generateDeviceActions(current?.devices ?? []),
  }), [current]);

  // 현재 탭에 맞는 인사이트 선택
  const activeInsight = useMemo(() => {
    switch (activeTab) {
      case "traffic":  return trafficInsight;
      case "country":  return countryInsight;
      case "keywords": return keywordsInsight;
      case "device":   return deviceInsight;
      default:         return audienceInsight;
    }
  }, [activeTab, audienceInsight, trafficInsight, countryInsight, keywordsInsight, deviceInsight]);

  const activePairs = useMemo(() => zipPairs(
    activeInsight.insights,
    activeInsight.actions,
  ), [activeInsight]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 탭 헤더 */}
      <div style={{
        display:    "flex",
        borderBottom: `1px solid ${T.border}`,
        background: T.bgSection,
      }}>
        {TABS.map(tab => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
                fontSize:     T.font.size.sm,
                fontWeight:   active ? T.font.weight.semibold : T.font.weight.regular,
                color:        active ? T.primary : T.sub,
                background:   active ? T.bgCard : "transparent",
                border:       "none",
                borderBottom: active ? `2px solid ${T.primary}` : "2px solid transparent",
                cursor:       "pointer",
                transition:   `color ${T.motion.duration}, background ${T.motion.duration}`,
                whiteSpace:   "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ padding: T.spacing.xl }}>
        {loadingAnalytics ? (
          <div style={{ height: 200, display: "flex", alignItems: "center",
            justifyContent: "center", color: T.muted, fontSize: T.font.size.sm }}>
            데이터 로딩 중···
          </div>
        ) : (
          <>
            {activeTab === "audience" && (
              <AudiencePanel
                age={current?.age ?? []}
                gender={current?.gender ?? []}
              />
            )}
            {activeTab === "country" && (
              <CountryPanel countries={current?.countries ?? []} />
            )}
            {activeTab === "keywords" && (
              <KeywordsPanel keywords={current?.keywords ?? []} />
            )}
            {activeTab === "device" && (
              <DevicePanel devices={current?.devices ?? []} />
            )}
            {activeTab === "traffic" && (
              <>
                <TrafficPanel trafficSources={current?.trafficSources ?? []} />
                <ExternalTrafficInsightsPanel />
              </>
            )}
            <QuickInsightBar pairs={activePairs} />
          </>
        )}
      </div>
    </div>
  );
}
