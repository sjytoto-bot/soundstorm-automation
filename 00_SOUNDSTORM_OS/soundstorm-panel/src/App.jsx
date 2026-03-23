import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { selectGoalStats } from "./lib/selectors";
import { roadmapReducer } from "./engine/roadmapReducer";
import { appendHistoryToFile, readHistoryFromFile } from "./engine/historyLogger";
import { parseCommand } from "./engine/commandParser";
import DashboardPage from "./pages/DashboardPage";
import { BlocksProvider } from "./contexts/BlocksContext";
import { DashboardDiagFilterProvider } from "./contexts/DashboardDiagFilterContext";
import RightSidePanel from "./components/layout/RightSidePanel";
import { AnalyticsProvider } from "./controllers/useAnalyticsController";
import { ContentPackProvider } from "./controllers/ContentPackContext";
import AppShell from "./components/layout/AppShell";
import Topbar from "./components/layout/Topbar";
import Sidebar from "./components/layout/Sidebar";
import RoadmapPage from "./pages/RoadmapPage";
import { LayoutDashboard, Map, ShoppingBag, Music, Zap, Construction } from "lucide-react";
import { T, L } from "./styles/tokens";
import "./styles/app.css";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// C는 T 토큰의 로컬 앨리어스 — 직접 hex 하드코딩 금지
const C = {
  bg:         T.bgApp,
  panelBg:    T.bgSection,
  white:      T.bgCard,
  border:     T.border,
  borderSoft: T.borderSoft,
  text:       T.text,
  sub:        T.sub,
  muted:      T.muted,
  blue:       T.primary,
  blueBg:     T.primarySoft,
  blueBorder: T.primaryBorder,
  green:      T.status.done.text,
  greenBg:    T.status.done.bg,
  greenBorder: T.successBorder,
};

const MONO = { fontFamily: "monospace" };

const TABS = [
  { id: "dashboard", label: "대시보드",    icon: LayoutDashboard },
  { id: "roadmap",   label: "OS 로드맵",   icon: Map             },
  { id: "store",     label: "네이버스토어", icon: ShoppingBag     },
  { id: "master",    label: "음원 마스터",  icon: Music           },
];

// 탭별 표시 제목 — topbar center
const TAB_TITLES = {
  dashboard: "Dashboard",
  roadmap:   "MASTER ROADMAP",
  store:     "Store Overview",
  master:    "Mastering",
};

const TEAM_SOURCE_MAP = {
  "콘텐츠팀_제작":     "콘텐츠팀",
  "네이버스토어팀":    "네이버스토어팀",
  "전략팀_데이터분석": "데이터전략팀",
};

const SNAPSHOT_STATUS_MAP = {
  "해결 완료": "done",
  "진행 중":   "active",
  "미완료":    "planned",
  "다음 단계": "planned",
};

function parseTeamTag(title) {
  const m = title?.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function mapTeamSource(src) {
  if (!src) return null;
  if (TEAM_SOURCE_MAP[src]) return TEAM_SOURCE_MAP[src];
  if (src.startsWith("운영팀")) return "운영·개발팀";
  return null;
}

function parseSnapshot(text) {
  const items   = [];
  const blockRe = /SNAPSHOT_START\s+(\S+)([\s\S]*?)SNAPSHOT_END/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const team = mapTeamSource(m[1].trim());
    if (!team) continue;
    const lineRe = /^-\s*\[([^\]]+)\]\s+(.+)$/gm;
    let lm;
    while ((lm = lineRe.exec(m[2])) !== null) {
      const status = SNAPSHOT_STATUS_MAP[lm[1].trim()] ?? "planned";
      items.push({ team, title: `[${team}] ${lm[2].trim()}`, status });
    }
  }
  return items;
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [officialState,    setOfficialState]    = useState(null);
  const [activeTab,        setActiveTab]        = useState(
    () => localStorage.getItem("soundstorm_active_tab") ?? "dashboard"
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    window.api?.loadOfficialState?.().then(s => setOfficialState(s ?? null));
  }, []);

  useEffect(() => {
    readHistoryFromFile().then(events => {
      if (!events.length) return;
      setOfficialState(prev => {
        let next = prev;
        for (const evt of events) next = roadmapReducer(next, evt);
        return next;
      });
    });
  }, []);

  function dispatchRoadmap(event) {
    setOfficialState(prev => roadmapReducer(prev, event));
    appendHistoryToFile(event);
  }

  async function handleUndo() {
    const base   = await window.api?.loadOfficialState?.() ?? null;
    const events = (officialState?.history ?? []).slice(0, -1);
    let next = base;
    for (const evt of events) next = roadmapReducer(next, evt);
    setOfficialState(next);
  }

  // Computed stats — 계산 로직은 selectors.js에 위임
  const { progressPct } = selectGoalStats(officialState);

  return (
    <AnalyticsProvider>
    <ContentPackProvider>
    <BlocksProvider>
    <DashboardDiagFilterProvider>
    <>
    <AppShell
      topbar={
        <Topbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          title={TAB_TITLES[activeTab]}
          progressPct={progressPct}
          aiPanelCollapsed={false}
          onToggleAiPanel={() => {}}
        />
      }
      sidebar={
        <Sidebar
          collapsed={sidebarCollapsed}
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={tab => {
            setActiveTab(tab);
            localStorage.setItem("soundstorm_active_tab", tab);
          }}
        />
      }
      rightPanel={<RightSidePanel />}
    >
      {/* ── 탭 라우팅 ── */}
      {activeTab === "roadmap" ? (
        <RoadmapPage officialState={officialState} onDispatch={dispatchRoadmap} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {activeTab === "dashboard" && <DashboardPage />}
          {(activeTab === "store" || activeTab === "master") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 48, gap: T.spacing.md }}>
              <Construction style={{ width: 40, height: 40, color: T.border }} />
              <div style={{ fontSize: 13, color: T.muted, fontFamily: "monospace", letterSpacing: "0.08em" }}>
                COMING SOON
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{ style: { fontFamily: "Fira Code, monospace", fontSize: 12 } }}
    />
    </>
    </DashboardDiagFilterProvider>
    </BlocksProvider>
    </ContentPackProvider>
    </AnalyticsProvider>
  );
}

