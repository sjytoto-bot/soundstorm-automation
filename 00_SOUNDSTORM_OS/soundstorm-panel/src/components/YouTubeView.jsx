import { useState, useEffect } from "react";
import { Eye, DollarSign, Clock, Users, Globe, Smartphone, TrendingUp } from "lucide-react";
import { T } from "../styles/tokens";
import { computeCampaignStats, fetchRedirectLinks } from "../adapters/redirectAdapter";
import { fetchReachData }         from "../adapters/reachAdapter";
import { fetchChannelKPI }        from "../adapters/ChannelKPIAdapter";
import { fetchVideoDiagnostics }  from "../adapters/VideoDiagnosticsAdapter";
import CampaignPerformancePanel   from "./youtube/CampaignPerformancePanel";
import CTRAlertPanel              from "./youtube/CTRAlertPanel";

// ─── MOCK (KPI 로딩 전 fallback 표시용) ───────────────────────────────────────

const KPI_FALLBACK = [
  { label: "30일 조회수",  value: "—",    icon: Eye,         color: T.primary },
  { label: "구독자 변화",  value: "—",    icon: TrendingUp,  color: T.success },
  { label: "시청 시간",    value: "—",    icon: Clock,       color: T.color.warning },
  { label: "예상 수익",    value: "—",    icon: DollarSign,  color: T.color.primary },
];

const MOCK_AUDIENCE = [
  { label: "25-34 남성", pct: 40.5, color: T.primary },
  { label: "18-24 남성", pct: 21.9, color: T.primary },
  { label: "35-44 남성", pct: 11.7, color: T.primary },
  { label: "25-34 여성", pct: 10.2, color: T.danger  },
];

const MOCK_COUNTRIES = [
  { flag: "🇰🇷", name: "한국", count: "96,143", pct: "96.2%" },
  { flag: "🇺🇸", name: "미국", count: "2,033",  pct: "2.0%"  },
  { flag: "🇹🇼", name: "대만", count: "189",     pct: "0.2%"  },
];

const MOCK_DEVICES = [
  { label: "MOBILE",  pct: "69.6%" },
  { label: "DESKTOP", pct: "23.9%" },
  { label: "TABLET",  pct: "5.6%"  },
  { label: "TV",      pct: "0.9%"  },
];

// ─── KPI 포맷 헬퍼 ────────────────────────────────────────────────────────────

function fmtViews(n)   { return n > 0 ? n.toLocaleString("ko-KR") : "—"; }
function fmtSubs(n)    { return n > 0 ? `+${n}` : n < 0 ? `${n}` : "—"; }
function fmtHours(min) { return min > 0 ? `${Math.round(min / 60)}h` : "—"; }
function fmtRevenue(n) { return n > 0 ? `$${n.toFixed(2)}` : "—"; }

// ─── 카드 공통 스타일 ─────────────────────────────────────────────────────────

const CARD = {
  background:   T.bgCard,
  borderRadius: T.radius.card,
  border:       `1px solid ${T.border}`,
  padding:      "20px 24px",
  boxShadow:    T.shadow.card,
};

const CARD_TITLE = {
  display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: 20,
};

const CARD_TITLE_TEXT = {
  fontSize: 13, fontWeight: 700, color: T.text,
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function YouTubeView() {
  const [kpiCards,      setKpiCards]      = useState(KPI_FALLBACK);
  const [campaignStats, setCampaignStats] = useState([]);
  const [diagnostics,   setDiagnostics]   = useState([]);

  // ── Channel KPI 로드 ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchChannelKPI().then(({ latest }) => {
      if (cancelled || !latest) return;
      setKpiCards([
        { label: "30일 조회수", value: fmtViews(latest.views30d),            icon: Eye,        color: T.primary },
        { label: "구독자 변화", value: fmtSubs(latest.subscriberChange),      icon: TrendingUp, color: T.success },
        { label: "시청 시간",   value: fmtHours(latest.watchTimeMin),         icon: Clock,      color: T.color.warning },
        { label: "예상 수익",   value: fmtRevenue(latest.estimatedRevenueUsd),icon: DollarSign, color: T.color.primary },
      ]);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Redirect Tracker 캠페인 데이터 로드 ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const api = window.api;
        if (!api?.readRedirectLogs) return;
        const [logs, links, reachRows] = await Promise.all([
          api.readRedirectLogs(),
          fetchRedirectLinks(),
          fetchReachData(),
        ]);
        if (cancelled) return;
        setCampaignStats(computeCampaignStats(logs, links, reachRows));
      } catch (err) {
        console.warn("[YouTubeView] 캠페인 데이터 로드 실패:", err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Video Diagnostics (CTR 경보) 로드 ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchVideoDiagnostics().then(data => {
      if (!cancelled) setDiagnostics(data);
    });
    return () => { cancelled = true; };
  }, []);

  function handleCreatePack(videoId) {
    console.log("[YouTubeView] Pack 생성 트리거:", videoId);
    // TODO: Content Pack 생성 모달 연결
  }

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(12, 1fr)",
      gap:                 T.spacing.lg,
    }}>

      {/* ── LAYER 0: KPI × 4 (실제 데이터) ──────────────────────────────── */}
      {kpiCards.map(kpi => {
        const KpiIcon = kpi.icon;
        return (
          <div key={kpi.label} style={{ ...CARD, gridColumn: "span 3" }}>
            <div style={{ marginBottom: 10 }}>
              <KpiIcon size={20} color={kpi.color} />
            </div>
            <div style={{ fontSize: 12, color: T.sub, marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: T.text, lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        );
      })}

      {/* ── LAYER 1: CTR 경보 ─────────────────────────────────────────────── */}
      {diagnostics.length > 0 && (
        <CTRAlertPanel diagnostics={diagnostics} />
      )}

      {/* ── LAYER 1: 캠페인 퍼포먼스 (Redirect Tracker) ───────────────────── */}
      {campaignStats.length > 0 && (
        <CampaignPerformancePanel
          stats={campaignStats}
          onCreatePack={handleCreatePack}
        />
      )}

      {/* ── Audience Segments ─────────────────────────────────────────────── */}
      <div style={{ ...CARD, gridColumn: "span 6" }}>
        <div style={CARD_TITLE}>
          <Users size={15} color={T.sub} />
          <span style={CARD_TITLE_TEXT}>Audience Segments</span>
        </div>
        {MOCK_AUDIENCE.map(({ label, pct, color }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: T.sub }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: T.borderSoft, borderRadius: 999 }}>
              <div style={{
                height: "100%", width: `${pct}%`, background: color,
                borderRadius: T.radius.pill, transition: "width 0.3s",
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Top Countries ─────────────────────────────────────────────────── */}
      <div style={{ ...CARD, gridColumn: "span 6" }}>
        <div style={CARD_TITLE}>
          <Globe size={15} color={T.sub} />
          <span style={CARD_TITLE_TEXT}>Top Countries</span>
        </div>
        {MOCK_COUNTRIES.map(({ flag, name, count, pct }, i) => (
          <div key={name} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0",
            borderBottom: i < MOCK_COUNTRIES.length - 1 ? `1px solid ${T.borderSoft}` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: T.spacing.md }}>
              <span style={{ fontSize: 20 }}>{flag}</span>
              <span style={{ fontSize: 13, color: T.text }}>{name}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, color: T.sub, marginRight: 12 }}>{count}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>{pct}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Devices ───────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, gridColumn: "span 12" }}>
        <div style={CARD_TITLE}>
          <Smartphone size={15} color={T.sub} />
          <span style={CARD_TITLE_TEXT}>Devices</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: T.spacing.lg }}>
          {MOCK_DEVICES.map(({ label, pct }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>{pct}</div>
              <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace", letterSpacing: "0.08em" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
