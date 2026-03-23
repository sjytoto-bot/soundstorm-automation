// ─── CountryPanel v1 ──────────────────────────────────────────────────────────
// 국가별 조회수 패널.
// 기본: 상위 5개 가로막대 | 자세히 보기: 전체 테이블 드릴다운
//
// Props:
//   countries — DimensionRow[]

import { useState } from "react";
import { T } from "../../styles/tokens";
import DrillDownTable from "./DrillDownTable";

// ─── 가로 막대 행 ─────────────────────────────────────────────────────────────
function BarRow({ label, ratio, views }) {
  const pct = Math.max(0, Math.min(1, ratio ?? 0));
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
      marginBottom: T.spacing.sm,
    }}>
      <span style={{
        fontSize:  T.font.size.xs,
        color:     T.sub,
        minWidth:  32,
        fontFamily: "monospace",
        flexShrink: 0,
      }}>
        {label}
      </span>

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
          background:   T.color.primary,
          borderRadius: T.radius.pill,
          transition:   `width ${T.motion.duration} ${T.motion.easing}`,
        }} />
      </div>

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

// ─── CountryPanel ─────────────────────────────────────────────────────────────

const DRILL_COLUMNS = [
  { key: "rank",  label: "순위",  align: "center" },
  { key: "key",   label: "국가",  align: "left"   },
  { key: "views", label: "조회수", align: "right" },
  { key: "ratio", label: "비율",  align: "right"   },
];

export default function CountryPanel({ countries }) {
  const [showDrill, setShowDrill] = useState(false);

  const list = countries ?? [];

  // 드릴다운 테이블용 행 변환
  const drillRows = list.map((row, i) => ({
    rank:  row.rank ?? i + 1,
    key:   row.key,
    views: (row.views ?? 0).toLocaleString("ko-KR"),
    ratio: `${((row.ratio ?? 0) * 100).toFixed(1)}%`,
  }));

  if (list.length === 0) {
    return (
      <div style={{ fontSize: T.font.size.xs, color: T.muted, padding: T.spacing.md }}>
        데이터 없음
      </div>
    );
  }

  return (
    <div>
      {/* 기본 뷰: 상위 5개 */}
      {list.slice(0, 5).map(row => (
        <BarRow
          key={row.key}
          label={row.key}
          ratio={row.ratio}
          views={row.views}
        />
      ))}

      {/* 드릴다운 토글 버튼 */}
      {list.length > 5 && (
        <button
          onClick={() => setShowDrill(true)}
          style={{
            marginTop:    T.spacing.sm,
            fontSize:     T.font.size.xs,
            color:        T.color.primary,
            background:   "none",
            border:       "none",
            cursor:       "pointer",
            padding:      0,
            fontFamily:   "monospace",
          }}
        >
          자세히 보기 ({list.length}개)
        </button>
      )}

      {/* 드릴다운 테이블 */}
      {showDrill && (
        <DrillDownTable
          columns={DRILL_COLUMNS}
          rows={drillRows}
          onClose={() => setShowDrill(false)}
        />
      )}
    </div>
  );
}
