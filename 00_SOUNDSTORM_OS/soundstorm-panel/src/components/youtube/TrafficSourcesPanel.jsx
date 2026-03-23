// ─── TrafficSourcesPanel v1 ───────────────────────────────────────────────────
// 채널 트래픽 소스 분포 패널.
// AnalyticsData.trafficSources (DimensionRow[]) 기반.
//
// Props:
//   trafficSources — DimensionRow[]

import { T } from "../../styles/tokens";

// ─── EXTERNAL dim_1 한국어 변환 맵 ────────────────────────────────────────────
// 실제 _RawData_FullPeriod EXTERNAL dim_1 값 기준
const TRAFFIC_LABELS = {
  SUBSCRIBER:      "구독자 피드",
  RELATED_VIDEO:   "연관 영상",
  PLAYLIST:        "재생목록",
  YT_CHANNEL:      "채널 페이지",
  YT_SEARCH:       "유튜브 검색",
  NO_LINK_OTHER:   "기타",
  YT_OTHER_PAGE:   "유튜브 기타",
  END_SCREEN:      "최종 화면",
  EXT_URL:         "외부 링크",
  NOTIFICATION:    "알림",
  // 레거시 키 (구 데이터 호환)
  YOUTUBE_SEARCH:  "유튜브 검색",
  SUGGESTED_VIDEO: "추천 영상",
  BROWSE_FEATURES: "탐색 기능",
  CARDS:           "카드",
};

// ─── 색상 배열 (순서대로 할당) ──────────────────────────────────────────────
const BAR_COLORS = [
  T.color?.primary  ?? "#6366F1",
  T.color?.success  ?? "#22C55E",
  T.color?.warning  ?? "#F59E0B",
  T.color?.danger   ?? "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#F97316",
  "#EC4899",
];

// ─── 가로 막대 행 ─────────────────────────────────────────────────────────────
function BarRow({ label, ratio, barColor, views }) {
  const pct = Math.max(0, Math.min(1, ratio ?? 0));

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
      marginBottom: T.spacing.sm,
    }}>
      {/* 레이블 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.sub,
        minWidth:   88,
        flexShrink: 0,
      }}>
        {label}
      </span>

      {/* 막대 트랙 */}
      <div style={{
        flex:         1,
        height:       6,
        background:   T.bgSection,
        borderRadius: T.radius.pill,
        overflow:     "hidden",
      }}>
        <div style={{
          width:        `${(pct * 100).toFixed(1)}%`,
          height:       "100%",
          background:   barColor,
          borderRadius: T.radius.pill,
          transition:   `width ${T.motion?.duration ?? "0.2s"} ${T.motion?.easing ?? "ease"}`,
        }} />
      </div>

      {/* 비율 */}
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
        fontFamily: "monospace",
        minWidth:   36,
        textAlign:  "right",
        flexShrink: 0,
      }}>
        {(pct * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ─── TrafficSourcesPanel ──────────────────────────────────────────────────────

export default function TrafficSourcesPanel({ trafficSources }) {
  const list = trafficSources ?? [];

  if (list.length === 0) {
    return (
      <div style={{ fontSize: T.font.size.xs, color: T.muted, padding: T.spacing.md }}>
        데이터 없음
      </div>
    );
  }

  // 상위 8개만 표시
  const visible = list.slice(0, 8);

  return (
    <div>
      {visible.map((row, i) => {
        const keyUpper = (row.key ?? "").toUpperCase();
        const label    = TRAFFIC_LABELS[keyUpper] ?? row.key;
        const color    = BAR_COLORS[i % BAR_COLORS.length];

        return (
          <BarRow
            key={row.key ? `${row.key}-${i}` : i}
            label={label}
            ratio={row.ratio}
            views={row.views}
            barColor={color}
          />
        );
      })}
    </div>
  );
}
