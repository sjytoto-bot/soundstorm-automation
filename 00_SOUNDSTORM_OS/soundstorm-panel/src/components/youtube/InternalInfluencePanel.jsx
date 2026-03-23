// ─── InternalInfluencePanel v3 ────────────────────────────────────────────────
// Top Referrer 패널 (내부 영향 분석).
// _RawData_FullPeriod EXTERNAL_DETAIL 기반:
//   dim_1 = referrer (video ID 또는 외부 URL)
//   dim_2 = traffic type (RELATED_VIDEO, SUBSCRIBER, ...)
//   value = views
//
// Props:
//   internalInfluence — DimensionRow[]  (rank=1..10, subtitle=dominant dim_2)

import { T } from "../../styles/tokens";

// ─── dim_2 (traffic type) 한국어 레이블 ─────────────────────────────────────
const TYPE_LABELS = {
  RELATED_VIDEO:  "연관 영상",
  SUBSCRIBER:     "구독자 피드",
  PLAYLIST:       "재생목록",
  YT_CHANNEL:     "채널 페이지",
  YT_SEARCH:      "유튜브 검색",
  END_SCREEN:     "최종 화면",
  NOTIFICATION:   "알림",
  EXT_URL:        "외부 링크",
  NO_LINK_OTHER:  "기타",
};

// ─── referrer 키 표시 포맷 ───────────────────────────────────────────────────
// YouTube video ID: 11자 영숫자 → 축약 표시
// URL: 도메인만 추출
function formatReferrerKey(key) {
  if (!key) return "—";
  // YouTube video ID 패턴 (11자 영숫자 + _ + -)
  if (/^[A-Za-z0-9_-]{11}$/.test(key)) {
    return key;  // 그대로 표시 (짧고 식별 가능)
  }
  // URL 패턴
  try {
    const url = new URL(key.startsWith("http") ? key : `https://${key}`);
    return url.hostname.replace("www.", "");
  } catch {
    return key.length > 28 ? `${key.slice(0, 26)}…` : key;
  }
}

// ─── 행 컴포넌트 ─────────────────────────────────────────────────────────────
function ReferrerRow({ row, isLast }) {
  const pct      = Math.max(0, Math.min(1, row.ratio ?? 0));
  const label    = formatReferrerKey(row.key);
  const typeKey  = (row.subtitle ?? "").toUpperCase();
  const typeLabel = TYPE_LABELS[typeKey] ?? row.subtitle ?? "";

  const isVideoId = /^[A-Za-z0-9_-]{11}$/.test(row.key ?? "");

  return (
    <div style={{
      padding:      `${T.spacing.sm}px 0`,
      borderBottom: isLast ? "none" : `1px solid ${T.border}`,
    }}>
      {/* 상단: 순위 + 레이블 + 조회수 */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        T.spacing.sm,
        marginBottom: T.spacing.xs,
      }}>
        {/* 순위 */}
        <span style={{
          fontSize:     10,
          fontFamily:   "monospace",
          color:        row.rank === 1 ? T.color?.primary ?? "#6366F1" : T.muted,
          fontWeight:   row.rank === 1 ? 700 : 400,
          minWidth:     16,
          textAlign:    "right",
          flexShrink:   0,
        }}>
          {row.rank}
        </span>

        {/* referrer key */}
        <span style={{
          fontSize:     T.font.size.xs,
          color:        T.text,
          fontWeight:   row.rank === 1 ? T.font.weight.semibold : T.font.weight.regular,
          flex:         1,
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
          fontFamily:   isVideoId ? "monospace" : "inherit",
        }}>
          {label}
        </span>

        {/* traffic type 배지 */}
        {typeLabel && (
          <span style={{
            fontSize:     10,
            color:        T.muted,
            background:   T.bgSection,
            border:       `1px solid ${T.border}`,
            borderRadius: T.radius.badge,
            padding:      `1px ${T.spacing.xs}px`,
            flexShrink:   0,
            whiteSpace:   "nowrap",
          }}>
            {typeLabel}
          </span>
        )}

        {/* 조회수 */}
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.muted,
          fontFamily: "monospace",
          flexShrink: 0,
        }}>
          {(row.views ?? 0).toLocaleString("ko-KR")}
        </span>
      </div>

      {/* 진행 바 */}
      <div style={{ paddingLeft: 24 }}>
        <div style={{
          height:       4,
          borderRadius: T.radius.pill,
          background:   T.bgSection,
          overflow:     "hidden",
        }}>
          <div style={{
            height:       "100%",
            width:        `${(pct * 100).toFixed(1)}%`,
            borderRadius: T.radius.pill,
            background:   row.rank === 1
              ? (T.color?.primary ?? "#6366F1")
              : (T.sub ?? "#888"),
            transition:   "width 0.3s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── InternalInfluencePanel ───────────────────────────────────────────────────

export default function InternalInfluencePanel({ internalInfluence }) {
  const list = internalInfluence ?? [];

  if (list.length === 0) {
    return (
      <div style={{ fontSize: T.font.size.xs, color: T.muted, padding: T.spacing.md }}>
        데이터 없음
      </div>
    );
  }

  return (
    <div>
      {/* ── 헤더 정보 ─────────────────────────────────────────────────────── */}
      <div style={{
        display:       "flex",
        justifyContent:"space-between",
        alignItems:    "center",
        marginBottom:  T.spacing.md,
      }}>
        <span style={{
          fontSize:   T.font.size.xs,
          color:      T.muted,
          fontFamily: "monospace",
        }}>
          Top {list.length} 유입 경로
        </span>
        <span style={{
          fontSize:     10,
          color:        T.muted,
          background:   T.bgSection,
          border:       `1px solid ${T.border}`,
          borderRadius: T.radius.badge,
          padding:      `2px ${T.spacing.sm}px`,
          fontFamily:   "monospace",
        }}>
          EXTERNAL_DETAIL
        </span>
      </div>

      {/* ── referrer 목록 ─────────────────────────────────────────────────── */}
      {list.map((row, i) => (
        <ReferrerRow
          key={row.key ? `${row.key}-${i}` : i}
          row={row}
          isLast={i === list.length - 1}
        />
      ))}
    </div>
  );
}
