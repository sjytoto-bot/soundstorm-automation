// ─── KeywordsPanel v1 ─────────────────────────────────────────────────────────
// 검색 키워드 패널.
// 기본: 상위 5개 칩 목록 | 자세히 보기: 전체 테이블 드릴다운
//
// Props:
//   keywords — DimensionRow[]

import { useState } from "react";
import { T } from "../../styles/tokens";
import DrillDownTable from "./DrillDownTable";

// ─── 키워드 칩 ────────────────────────────────────────────────────────────────
function KeywordChip({ keyword, views }) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.xs,
      background:   T.bgSection,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.pill,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      marginBottom: T.spacing.xs,
      flexWrap:     "nowrap",
    }}>
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.text,
        fontWeight: T.font.weight.medium,
      }}>
        {keyword}
      </span>
      <span style={{
        fontSize:   T.font.size.xs,
        color:      T.muted,
        fontFamily: "monospace",
      }}>
        {(views ?? 0).toLocaleString("ko-KR")}회
      </span>
    </div>
  );
}

// ─── KeywordsPanel ────────────────────────────────────────────────────────────

const DRILL_COLUMNS = [
  { key: "rank",    label: "순위",  align: "center" },
  { key: "keyword", label: "키워드", align: "left"  },
  { key: "views",   label: "조회수", align: "right" },
];

export default function KeywordsPanel({ keywords }) {
  const [showDrill, setShowDrill] = useState(false);

  const list = keywords ?? [];

  const drillRows = list.map((row, i) => ({
    rank:    row.rank ?? i + 1,
    keyword: row.key,
    views:   (row.views ?? 0).toLocaleString("ko-KR"),
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
      {/* 기본 뷰: 칩 목록 (상위 5개) */}
      <div style={{
        display:   "flex",
        flexWrap:  "wrap",
        gap:       T.spacing.xs,
      }}>
        {list.slice(0, 5).map(row => (
          <KeywordChip key={row.key} keyword={row.key} views={row.views} />
        ))}
      </div>

      {/* 드릴다운 토글 버튼 */}
      {list.length > 5 && (
        <button
          onClick={() => setShowDrill(true)}
          style={{
            marginTop:  T.spacing.sm,
            fontSize:   T.font.size.xs,
            color:      T.color.primary,
            background: "none",
            border:     "none",
            cursor:     "pointer",
            padding:    0,
            fontFamily: "monospace",
            display:    "block",
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
