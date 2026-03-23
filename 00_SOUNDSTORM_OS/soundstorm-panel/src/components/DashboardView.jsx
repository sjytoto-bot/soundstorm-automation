import { Youtube, ShoppingBag, Music } from "lucide-react";
import { T, L } from "../styles/tokens";
import { selectDashboardData } from "../lib/selectors";

// ─── DASHBOARD VIEW ────────────────────────────────────────────────────────────

const CARD = {
  background:   T.bgCard,
  borderRadius: T.radius.card,
  boxShadow:    T.shadow.card,
  padding:      `${T.spacing.lg}px ${T.spacing.xl}px`,
};

// ── GlobalStatusBar ────────────────────────────────────────────────────────────

function GlobalStatusBar({ stats }) {
  const kpis = [
    { label: "월 수익",   value: stats.monthlyRevenue, unit: ""  },
    { label: "30일 조회", value: stats.last30Views,    unit: ""  },
    { label: "진행 트랙", value: stats.activeTracks,   unit: "개" },
    { label: "달성률",    value: stats.completion,     unit: "%" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: T.spacing.lg, marginBottom: T.spacing.xl,
    }}>
      {kpis.map(({ label, value, unit }) => (
        <div key={label} style={{ ...CARD }}>
          <div style={{ fontSize: T.font.size.xs, color: T.sub, marginBottom: T.spacing.sm }}>{label}</div>
          <div style={{ fontSize: T.font.size.title, fontWeight: T.font.weight.bold, color: T.text, fontFamily: T.font.familyMono, lineHeight: T.font.lineHeight.tight }}>
            {value}
            <span style={{ fontSize: T.font.size.md, color: T.muted, fontWeight: T.font.weight.regular }}>{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PlatformSummaryCards ───────────────────────────────────────────────────────

// Icon map — SVG icons replace emoji (no-emoji-icons rule)
const PLATFORM_ICON = { youtube: Youtube, store: ShoppingBag, master: Music };

function PlatformSummaryCards({ onNavigate }) {
  const platforms = [
    { id: "youtube", label: "YouTube",     color: "#FF0000", desc: "채널 분석 · 수익 · 업로드" },
    { id: "store",   label: "네이버스토어", color: "#03C75A", desc: "주문 · 재고 · 자동화"      },
    { id: "master",  label: "음원 마스터",  color: "#6366F1", desc: "유통 · 정산 · 릴리즈"      },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: T.spacing.lg, marginBottom: T.spacing.xl,
    }}>
      {platforms.map(platform => {
        const Icon = PLATFORM_ICON[platform.id];
        return (
          <div
            key={platform.id}
            onClick={() => onNavigate(platform.id)}
            style={{
              ...CARD,
              cursor: "pointer",
              borderTop: `3px solid ${platform.color}`,
              transition: "box-shadow 0.2s, transform 0.2s",
            }}
            className="platform-card"
          >
            <Icon style={{ width: 22, height: 22, color: platform.color, marginBottom: T.spacing.sm }} />
            <div style={{ fontSize: T.font.size.lg, fontWeight: T.font.weight.semibold, color: T.text, marginBottom: T.spacing.xs }}>{platform.label}</div>
            <div style={{ fontSize: T.font.size.xs, color: T.sub }}>{platform.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── InsightSummary ─────────────────────────────────────────────────────────────

function InsightSummary({ stats }) {
  const { active, blocked, currentPhase: phase, focusTrackId: focus, tracks } = stats;

  return (
    <div style={{ ...CARD }}>
      <div style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.semibold, color: T.text, marginBottom: T.spacing.md }}>현황 요약</div>
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
        <Row label="현재 단계" value={phase} />
        {focus && <Row label="집중 트랙"  value={tracks[focus]?.name ?? focus} color={T.primary} />}
        <Row label="진행중 작업" value={`${active}개`} color={active > 0 ? T.primary : undefined} />
        {blocked > 0 && <Row label="보류 작업" value={`${blocked}개`} color={T.warn} />}
      </div>
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: T.font.size.xs }}>
      <span style={{ color: T.sub }}>{label}</span>
      <span style={{ color: color ?? T.text, fontWeight: T.font.weight.medium }}>{value}</span>
    </div>
  );
}

// ── TrendPreview ───────────────────────────────────────────────────────────────

function TrendPreview({ stats }) {
  const { goalDistribution: d } = stats;
  const total = d.total || 1;
  const bars = [
    { label: "완료",   count: d.done,    color: T.success },
    { label: "진행중", count: d.active,  color: T.primary },
    { label: "대기",   count: d.planned, color: T.muted   },
    { label: "보류",   count: d.blocked, color: T.warn    },
  ];

  return (
    <div style={{ ...CARD }}>
      <div style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.semibold, color: T.text, marginBottom: T.spacing.md }}>작업 분포</div>
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
        {bars.map(({ label, count, color }) => (
          /* grid: [40px 레이블] [1fr 바] [24px 카운트]
             alignItems: center — 레이블/바/카운트 수직 중앙 정렬 통일 */
          <div key={label} style={{
            display: "grid",
            gridTemplateColumns: `${L.iconCol}px 1fr 24px`,
            alignItems: "center",
            columnGap: 8,
          }}>
            <span style={{ fontSize: T.font.size.xs, color: T.sub }}>{label}</span>
            <div style={{ height: 8, background: T.border, borderRadius: T.radius.badge, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: T.radius.badge, background: color,
                width: `${Math.round(count / total * 100)}%`,
                transition: "width 0.3s",
              }} />
            </div>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, textAlign: "right", fontFamily: T.font.familyMono }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DashboardView ──────────────────────────────────────────────────────────────

export default function DashboardView({ officialState, onNavigate }) {
  const stats = selectDashboardData(officialState);
  return (
    <div>
      <GlobalStatusBar stats={stats} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.spacing.lg, marginBottom: 24 }}>
        <InsightSummary stats={stats} />
        <TrendPreview   stats={stats} />
      </div>
      <PlatformSummaryCards onNavigate={onNavigate} />
    </div>
  );
}
