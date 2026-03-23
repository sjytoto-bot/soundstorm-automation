import { T } from "../../styles/tokens";

// ─── 로컬 색상 앨리어스 ────────────────────────────────────────────────────────
const C = {
  white:  T.bgCard,
  bg:     T.bgApp,
  border: T.border,
  text:   T.text,
  sub:    T.sub,
  muted:  T.muted,
};

// ─── Algorithm Fit 색상 (internalRatio 기준) ──────────────────────────────────
// >= 60% → success  (알고리즘 추천 우세)
// >= 40% → warning  (혼합)
// <  40% → danger   (검색/외부 우세)
function fitColor(ratio) {
  if (ratio >= 0.6) return T.color.success;
  if (ratio >= 0.4) return T.color.warning;
  return T.color.danger;
}

function fitBg(ratio) {
  if (ratio >= 0.6) return T.successBg;
  if (ratio >= 0.4) return T.warnBg;
  return T.dangerBg;
}

function fitLabel(ratio) {
  if (ratio >= 0.6) return "알고리즘 우세";
  if (ratio >= 0.4) return "혼합";
  return "검색/외부 우세";
}

// ─── 소스 표시 그룹 정의 ─────────────────────────────────────────────────────
// 여러 소스 키를 하나의 표시 레이블로 묶는다.
const SOURCE_GROUPS = [
  {
    label: "Internal",
    keys:  ["RELATED_VIDEO", "WHAT_TO_WATCH", "MY_HISTORY", "WATCH_LATER"],
    desc:  "알고리즘 추천",
  },
  {
    label: "Search",
    keys:  ["YT_SEARCH"],
    desc:  "YouTube 검색",
  },
  {
    label: "Channel",
    keys:  ["BROWSE_FEATURES"],
    desc:  "채널 탐색",
  },
  {
    label: "External",
    keys:  ["EXTERNAL"],
    desc:  "외부 유입",
  },
  {
    label: "Subscriber",
    keys:  ["NOTIFICATION"],
    desc:  "구독자 알림",
  },
  {
    label: "Playlist",
    keys:  ["PLAYLIST"],
    desc:  "재생목록",
  },
];

// ─── TrafficBar ───────────────────────────────────────────────────────────────
function TrafficBar({ label, desc, ratio, barColor }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  if (pct === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: C.sub, fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}>
            {label}
          </span>
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "monospace" }}>
            {desc}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontFamily: "monospace", fontWeight: 700,
          color: C.text, minWidth: 32, textAlign: "right",
        }}>
          {pct}%
        </span>
      </div>
      <div style={{
        height: T.spacing.xs,
        background: C.border,
        borderRadius: T.radius.pill,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: barColor,
          borderRadius: T.radius.pill,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// ─── ChannelTrafficPanel ──────────────────────────────────────────────────────
// Props
//   traffic         { totalViews, groups: Record<string,number>, internalRatio }
//   internalRatio   number (0~1) — = traffic.internalRatio (명시적 prop)

export default function ChannelTrafficPanel({ traffic, internalRatio }) {
  if (!traffic) return null;

  const ratio    = internalRatio ?? traffic.internalRatio ?? 0;
  const pctFit   = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const color    = fitColor(ratio);
  const bg       = fitBg(ratio);
  const groups   = traffic.groups ?? {};

  // 정의된 그룹 집계
  const groupedRows = SOURCE_GROUPS.map(g => ({
    ...g,
    ratio: g.keys.reduce((s, k) => s + (groups[k] ?? 0), 0),
  })).filter(r => r.ratio > 0.001);

  // 그룹에 속하지 않는 나머지 소스 합산
  const knownKeys   = new Set(SOURCE_GROUPS.flatMap(g => g.keys));
  const otherRatio  = Object.entries(groups)
    .filter(([k]) => !knownKeys.has(k))
    .reduce((s, [, v]) => s + v, 0);

  return (
    <div style={{
      background:    C.white,
      border:        `1px solid ${C.border}`,
      borderRadius:  T.radius.card,
      padding:       `${T.spacing.xl}px`,
      boxShadow:     T.shadow.card,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.xl,
    }}>

      {/* ── 헤더 ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{
            fontSize: 9, color: C.muted, fontFamily: "monospace",
            letterSpacing: "0.1em", marginBottom: T.spacing.xs,
          }}>
            CHANNEL TRAFFIC SUMMARY
          </div>
          <div style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
            채널 트래픽 분석
          </div>
        </div>
      </div>

      {/* ── Algorithm Fit 메트릭 ──────────────────────────────────────────────── */}
      <div style={{
        padding:      `${T.spacing.md}px`,
        borderRadius: T.radius.btn,
        border:       `1px solid ${color}33`,
        background:   bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.spacing.sm }}>
          <div>
            <div style={{
              fontSize: 9, color: C.muted, fontFamily: "monospace",
              letterSpacing: "0.08em", marginBottom: T.spacing.xs,
            }}>
              ALGORITHM FIT
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: T.spacing.sm }}>
              <span style={{
                fontSize: 28, fontWeight: 800, color, fontFamily: "monospace",
                lineHeight: 1,
              }}>
                {pctFit}%
              </span>
              <span style={{
                fontSize:     9,
                fontFamily:   "monospace",
                letterSpacing: "0.06em",
                color,
                border:       `1px solid ${color}44`,
                background:   `${color}11`,
                borderRadius: T.radius.badge,
                padding:      `1px ${T.spacing.xs}px`,
              }}>
                {fitLabel(ratio)}
              </span>
            </div>
          </div>
        </div>

        {/* 메인 progress bar */}
        <div style={{
          height: T.spacing.sm,
          background: C.border,
          borderRadius: T.radius.pill,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${pctFit}%`,
            background: color,
            borderRadius: T.radius.pill,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* ── 소스별 브레이크다운 ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
        <div style={{
          fontSize: 9, color: C.muted, fontFamily: "monospace",
          letterSpacing: "0.08em",
        }}>
          SOURCE BREAKDOWN
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
          {groupedRows.map(r => (
            <TrafficBar
              key={r.label}
              label={r.label}
              desc={r.desc}
              ratio={r.ratio}
              barColor={r.label === "Internal" ? color : C.border}
            />
          ))}
          {otherRatio > 0.001 && (
            <TrafficBar
              label="Other"
              desc="기타"
              ratio={otherRatio}
              barColor={C.border}
            />
          )}
        </div>
      </div>

    </div>
  );
}
