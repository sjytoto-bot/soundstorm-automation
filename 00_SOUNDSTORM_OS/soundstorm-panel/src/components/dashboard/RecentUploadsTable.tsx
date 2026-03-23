// ─── RecentUploadsTable ────────────────────────────────────────────────────────
// 업로드 성과 테이블 (최근 30일)
//
// 구조:
//   ┌── 요약 1줄 ────────────────────────────────────────────────┐
//   │  최근 30일 CTR 평균: 3.8%  ↓ 채널 평균 대비 -12%          │
//   └────────────────────────────────────────────────────────────┘
//   ┌────────────────┬──────┬───────┬──────┬──────┐
//   │ 제목           │ 날짜  │  노출  │ CTR  │ 조회 │
//   │ …              │ 3/17 │ 1.2만  │ 4.1% │  88  │  ← 행 클릭
//   └────────────────┴──────┴───────┴──────┴──────┘
//
// CTR 배지 4단계:
//   impressions < 500      → 판단 보류 (회색)
//   ctr == null            → —         (회색)
//   ctr > channelAvg       → 양호      (초록)
//   ctr < channelAvg × 0.8 → 점검      (주황)
//   그 외                  → 보통      (파랑)

import { T } from "../../styles/tokens";
import type { RecentPerfVideo } from "@/lib/recentPerformance";

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtCTR(ctr: number | null): string {
  if (ctr == null) return "—";
  return `${(ctr * 100).toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function compactTitle(title: string, maxLen = 22): string {
  const parts = title.split("|").map(s => s.trim()).filter(Boolean);
  const base  = parts.length >= 2
    ? `${parts[0]} | ${parts[1].replace(/\s*\([^)]*\)/g, "").split("·")[0].trim()}`
    : title.replace(/\s*\([^)]*\)/g, "").trim();
  return base.length > maxLen ? `${base.slice(0, maxLen)}…` : base;
}

// ─── CTR 배지 ─────────────────────────────────────────────────────────────────

type BadgeLevel = "hold" | "good" | "warn" | "normal" | "empty";

function getCTRBadge(
  ctr:        number | null,
  impressions: number | null,
  channelAvg:  number | null,
): { level: BadgeLevel; label: string } {
  if (!impressions)                             return { level: "empty",  label: "—"        };  // 0 또는 null → 데이터 없음
  if (impressions < 500)                        return { level: "hold",   label: "판단 보류" };
  if (ctr == null)                              return { level: "empty",  label: "—"        };
  if (channelAvg == null) {
    // 채널 평균 없으면 절대값 fallback
    return ctr * 100 >= 4
      ? { level: "good", label: "양호" }
      : ctr * 100 < 2.5
      ? { level: "warn", label: "점검" }
      : { level: "normal", label: "보통" };
  }
  if (ctr > channelAvg)            return { level: "good",   label: "양호" };
  if (ctr < channelAvg * 0.8)      return { level: "warn",   label: "점검" };
  return                                  { level: "normal", label: "보통" };
}

const BADGE_COLOR: Record<BadgeLevel, string> = {
  good:   T.color.success,
  warn:   T.color.warning,
  normal: T.color.primary,
  hold:   T.muted,
  empty:  T.muted,
};
const BADGE_BG: Record<BadgeLevel, string> = {
  good:   T.successBg,
  warn:   T.warnBg,
  normal: T.primarySoft,
  hold:   T.bgSection,
  empty:  T.bgSection,
};

// ─── 요약 1줄 ─────────────────────────────────────────────────────────────────

function SummaryLine({
  videos,
  channelAvgCTR,
}: {
  videos:       RecentPerfVideo[];
  channelAvgCTR: number | null;
}) {
  const eligible = videos.filter(
    v => v.hasFullMetrics && (v.impressions ?? 0) >= 500,
  );

  if (eligible.length === 0) {
    return (
      <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
        CTR 데이터 수집 중
      </span>
    );
  }

  const recentAvg = eligible.reduce((acc, v) => acc + v.ctr!, 0) / eligible.length;
  const recentPct = (recentAvg * 100).toFixed(1);

  if (channelAvgCTR == null) {
    return (
      <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: T.font.familyMono }}>
        최근 30일 CTR 평균:{" "}
        <span style={{ fontWeight: T.font.weight.bold, color: T.text }}>{recentPct}%</span>
      </span>
    );
  }

  const diffPct  = ((recentAvg - channelAvgCTR) / channelAvgCTR) * 100;
  const isPos    = diffPct >= 0;
  const diffStr  = `${isPos ? "+" : ""}${diffPct.toFixed(0)}%`;
  const arrow    = isPos ? "↑" : "↓";
  const color    = isPos ? T.color.success : T.color.warning;

  return (
    <span style={{ fontSize: T.font.size.xs, color: T.sub, fontFamily: T.font.familyMono }}>
      최근 30일 CTR 평균:{" "}
      <span style={{ fontWeight: T.font.weight.bold, color: T.text }}>{recentPct}%</span>
      {"  "}
      <span style={{ color }}>
        {arrow} 채널 평균 대비 {diffStr}
      </span>
    </span>
  );
}

// ─── 골든아워 배지 ────────────────────────────────────────────────────────────

function GoldenHourBadge({ elapsedHours }: { elapsedHours: number }) {
  const isHot   = elapsedHours <= 6;
  const color   = isHot ? T.color.success : T.color.warning;
  const bg      = isHot ? T.successBg     : T.warnBg;
  const border  = isHot ? T.successBorder : T.warn;
  const label   = isHot ? `⚡ +${elapsedHours.toFixed(0)}h` : `⏱ +${elapsedHours.toFixed(0)}h`;
  return (
    <span style={{
      fontSize:     T.font.size.xxs,
      fontFamily:   T.font.familyMono,
      fontWeight:   700,
      color,
      background:   bg,
      border:       `1px solid ${border}`,
      borderRadius: T.radius.badge,
      padding:      "1px 4px",
      flexShrink:   0,
    }}>
      {label}
    </span>
  );
}

// ─── VideoRow ─────────────────────────────────────────────────────────────────

function VideoRow({
  video,
  channelAvgCTR,
  onClick,
  goldenHour,
}: {
  video:        RecentPerfVideo;
  channelAvgCTR: number | null;
  onClick?:     (v: RecentPerfVideo) => void;
  goldenHour?:  { elapsedHours: number } | null;
}) {
  const badge = getCTRBadge(video.ctr, video.impressions, channelAvgCTR);
  const color = BADGE_COLOR[badge.level];
  const bg    = BADGE_BG[badge.level];

  return (
    <div
      onClick={() => onClick?.(video)}
      style={{
        display:      "grid",
        gridTemplateColumns: "1fr 36px 52px 68px 52px",
        gap:          T.spacing.sm,
        alignItems:   "center",
        padding:      `3px 0`,
        borderBottom: `1px solid ${T.borderSoft}`,
        cursor:       onClick ? "pointer" : "default",
        transition:   "background 0.15s",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* 제목 + 골든아워 배지 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, minWidth: 0 }}>
        <span style={{
          fontSize:     T.font.size.xxs,
          color:        T.sub,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          flex:         1,
        }}>
          {compactTitle(video.title)}
        </span>
        {goldenHour && <GoldenHourBadge elapsedHours={goldenHour.elapsedHours} />}
      </div>

      {/* 날짜 */}
      <span style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono, textAlign: "center" }}>
        {fmtDate(video.publishedAt)}
      </span>

      {/* 노출 */}
      <span style={{ fontSize: T.font.size.xxs, color: T.sub, fontFamily: T.font.familyMono, textAlign: "right" }}>
        {fmtNum(video.impressions)}
      </span>

      {/* CTR 배지 */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span style={{
          fontSize:     T.font.size.xxs,
          fontFamily:   T.font.familyMono,
          fontWeight:   T.font.weight.bold,
          color,
          background:   bg,
          border:       `1px solid ${color}33`,
          borderRadius: T.radius.badge,
          padding:      `1px ${T.spacing.xs}px`,
          whiteSpace:   "nowrap" as const,
        }}>
          {badge.level === "empty" ? "—"
            : badge.level === "hold" ? badge.label          // 판단 보류: CTR 수치 제거 (0.0% 혼동 방지)
            : `${fmtCTR(video.ctr)}  ${badge.label}`}
        </span>
      </div>

      {/* 조회수 */}
      <span style={{ fontSize: T.font.size.xxs, color: T.sub, fontFamily: T.font.familyMono, textAlign: "right" }}>
        {fmtNum(video.views)}
      </span>
    </div>
  );
}

// ─── RecentUploadsTable (메인) ────────────────────────────────────────────────

interface ActiveUploadItem {
  videoId:      string;
  elapsedHours: number;
  status:       string;
}

interface Props {
  videos:        RecentPerfVideo[];
  channelAvgCTR: number | null;
  onRowClick?:   (video: RecentPerfVideo) => void;
  activeUploads?: ActiveUploadItem[];
}

export default function RecentUploadsTable({ videos, channelAvgCTR, onRowClick, activeUploads = [] }: Props) {
  const activeMap = new Map(activeUploads.map(a => [a.videoId, a]));
  if (videos.length === 0) {
    return (
      <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
        최근 30일 업로드 없음
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>

      {/* 요약 1줄 */}
      <SummaryLine videos={videos} channelAvgCTR={channelAvgCTR} />

      {/* 컬럼 헤더 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 36px 52px 68px 52px",
        gap:                 T.spacing.sm,
        paddingBottom:       3,
        borderBottom:        `1px solid ${T.border}`,
      }}>
        {["제목", "날짜", "노출", "CTR", "조회수"].map((label, i) => (
          <span key={label} style={{
            fontSize:   T.font.size.xxs,
            color:      T.muted,
            fontFamily: T.font.familyMono,
            textAlign:  i === 0 ? "left" : i === 3 ? "center" : "right",
          }}>
            {label}
          </span>
        ))}
      </div>

      {/* 영상 행 */}
      {videos.slice(0, 6).map(video => (
        <VideoRow
          key={video.videoId}
          video={video}
          channelAvgCTR={channelAvgCTR}
          onClick={onRowClick}
          goldenHour={activeMap.get(video.videoId) ?? null}
        />
      ))}
    </div>
  );
}
