import { T } from "../../styles/tokens";

// ─── AppShell — 단일 root 레이아웃. 비즈니스 로직 없음 ────────────────────────
// Props
//   topbar      {ReactNode} Topbar 슬롯
//   sidebar     {ReactNode} Sidebar 슬롯
//   rightPanel  {ReactNode} 우측 AI 패널 슬롯
//   children    {ReactNode} main 콘텐츠 (toolbar + 스크롤존)

export default function AppShell({ topbar, sidebar, rightPanel, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {topbar}

      {/* ── Body — sidebar + content ──────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minWidth: 0 }}>

        {sidebar}

        {/* Content: main + right panel */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0 }}>
          <main style={{
            flex: 1, minWidth: 0,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            overflowX: "hidden",
            background: T.bgApp,
          }}>
            {children}
          </main>

          {rightPanel}
        </div>

      </div>
    </div>
  );
}
