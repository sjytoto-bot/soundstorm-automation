// ─── EarlyPerformancePanel ───────────────────────────────────────────────────
// 영상 퍼포먼스 아코디언 패널
//
// 데이터 소스: _RawData_Master (reachAdapter)
// 표시 영상:   published_date 기준 가장 최근 영상
// 기본 상태:   collapsed (요약 행)
// 확장 상태:   지표 + CTR 인사이트 배지

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 공개 타입 (EarlyPerformanceCompact에서 import) ──────────────────────────
export interface EarlyPerfData {
  videoId:          string;
  videoTitle:       string;
  publishedAt:      string;        // ISO 8601 or YYYY-MM-DD
  views:            number | null;
  impressions:      number | null;
  ctr:              number | null; // 0~1
  avgViewDuration:  number | null; // seconds
  channelAvgCTR:    number | null; // 0~1, 채널 평균 CTR
}

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
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── 인사이트 룰 ──────────────────────────────────────────────────────────────
// Rule 1: CTR < 4%                          → "썸네일 개선 필요"
// Rule 2: impressions > 5000 AND CTR < 4%  → "노출 대비 클릭률 낮음"

interface InsightBadge {
  message: string;
  color:   string;
  bg:      string;
}

function getInsights(ctr: number | null, impressions: number | null): InsightBadge[] {
  const badges: InsightBadge[] = [];
  if (ctr == null) return badges;

  const ctrPct = ctr * 100;

  if (ctrPct < 4) {
    badges.push({
      message: "썸네일 개선 필요",
      color:   T.warn,
      bg:      T.warnBg,
    });
  }

  if ((impressions ?? 0) > 5000 && ctrPct < 4) {
    badges.push({
      message: "노출 대비 클릭률 낮음",
      color:   T.danger,
      bg:      T.dangerBg,
    });
  }

  return badges;
}

// ─── EarlyPerformancePanel (메인) ─────────────────────────────────────────────
export default function EarlyPerformancePanel({ data }: { data?: EarlyPerfData }) {
  const [open, setOpen] = useState(false);

  // 데이터 없음 상태
  if (!data) {
    return (
      <div style={{
        background:   T.bgCard,
        border:       `1px solid ${T.border}`,
        borderRadius: T.radius.card,
        padding:      `${T.spacing.md}px ${T.spacing.xl}px`,
        boxShadow:    T.shadow.card,
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.md,
        minHeight:    60,
      }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          letterSpacing: "0.06em",
        }}>
          영상 퍼포먼스
        </span>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
          데이터 없음
        </span>
      </div>
    );
  }

  const insights = getInsights(data.ctr, data.impressions);

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       `${T.spacing.md}px ${T.spacing.xl}px`,
      boxShadow:     T.shadow.card,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.sm,
    }}>

      {/* ── Collapsed 요약 행 ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.spacing.md }}>

        {/* 좌: 헤더 + 핵심 지표 */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.lg, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexShrink: 0 }}>
            <span style={{
              fontSize:      T.font.size.xs,
              fontFamily:    T.font.familyMono,
              fontWeight:    T.font.weight.bold,
              color:         T.sub,
              letterSpacing: "0.06em",
            }}>
              영상 퍼포먼스
            </span>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
              · {fmtDate(data.publishedAt)}
            </span>
          </div>

          {/* 제목 */}
          <span style={{
            fontSize:     T.font.size.xs,
            color:        T.sub,
            fontWeight:   T.font.weight.regular,
            lineHeight:   T.font.lineHeight.tight,
            wordBreak:    "keep-all",
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {data.videoTitle}
          </span>

          {/* 핵심 지표 (collapsed 상태) */}
          {!open && (
            <div style={{ display: "flex", alignItems: "center", gap: T.spacing.lg, flexShrink: 0 }}>
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                조회수 <span style={{ color: T.text, fontWeight: T.font.weight.bold }}>{fmtNum(data.views)}</span>
              </span>
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                CTR <span style={{ color: data.ctr != null ? T.text : T.muted, fontWeight: T.font.weight.bold }}>{fmtCTR(data.ctr)}</span>
              </span>
              {insights.length > 0 && (
                <AlertTriangle size={11} color={T.warn} />
              )}
            </div>
          )}
        </div>

        {/* 우: 토글 버튼 */}
        <button
          onClick={() => setOpen(p => !p)}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          4,
            background:   "transparent",
            border:       `1px solid ${T.borderSoft}`,
            borderRadius: T.radius.badge,
            padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
            cursor:       "pointer",
            fontSize:     T.font.size.xs,
            fontFamily:   T.font.familyMono,
            color:        T.muted,
            flexShrink:   0,
          }}
        >
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {open ? "접기" : "열기"}
        </button>
      </div>

      {/* ── Expanded 내용 ── */}
      {open && (
        <div style={{
          paddingTop:    T.spacing.sm,
          borderTop:     `1px solid ${T.borderSoft}`,
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.sm,
        }}>

          {/* 지표 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
            {[
              { label: "제목",       value: data.videoTitle,          always: true  },
              { label: "업로드일",   value: fmtDate(data.publishedAt), always: true  },
              { label: "조회수",     value: fmtNum(data.views),        always: true  },
              { label: "노출수",     value: fmtNum(data.impressions),  always: false },
              { label: "CTR",        value: fmtCTR(data.ctr),          always: false },
            ]
              .filter(r => r.always || r.value !== "—")
              .map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{
                    fontSize:   T.font.size.xs,
                    color:      T.muted,
                    fontFamily: T.font.familyMono,
                    minWidth:   72,
                  }}>
                    {r.label}
                  </span>
                  <span style={{
                    fontSize:   T.font.size.xs,
                    fontFamily: T.font.familyMono,
                    fontWeight: T.font.weight.bold,
                    color:      T.text,
                    maxWidth:   220,
                    overflow:   "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {r.value}
                  </span>
                </div>
              ))
            }
          </div>

          {/* 인사이트 배지 */}
          {insights.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
              {insights.map(badge => (
                <div
                  key={badge.message}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          T.spacing.xs,
                    padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
                    borderRadius: T.radius.badge,
                    background:   badge.bg,
                    border:       `1px solid ${badge.color}40`,
                    alignSelf:    "flex-start",
                  }}
                >
                  <AlertTriangle size={11} color={badge.color} />
                  <span style={{
                    fontSize:   T.font.size.xs,
                    fontFamily: T.font.familyMono,
                    fontWeight: T.font.weight.bold,
                    color:      badge.color,
                  }}>
                    {badge.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
