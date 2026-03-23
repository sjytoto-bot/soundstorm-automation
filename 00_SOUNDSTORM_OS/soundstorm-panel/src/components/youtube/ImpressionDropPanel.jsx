// ─── ImpressionDropPanel ────────────────────────────────────────────────────────
// IMPRESSION_DROP 진단 영상을 서브타입·심각도별로 그룹화해서 표시하는 운영 도구 패널.
//
// 서브타입 우선순위 (심각도 순):
//   BROWSE_DROP    — 홈 피드 노출 감소
//   SUGGESTED_DROP — 추천 영상 노출 감소
//   EXTERNAL_DROP  — 외부 유입 감소 (Redirect Tracker 연결)
//   MIXED_DROP     — 복합 감소
//   IMPRESSION_DROP — traffic source 데이터 없을 때 generic
//
// Props:
//   diagnostics    VideoDiagnostic[]   fetchVideoDiagnostics() 결과 전체
//   campaignStats  CampaignStat[]      EXTERNAL_DROP 액션 연결용 (옵셔널)

import { useState } from "react";
import {
  TrendingDown, ExternalLink, ChevronDown, ChevronRight,
  AlertTriangle, BarChart2, Link,
} from "lucide-react";
import { T } from "../../styles/tokens";
import { getSafeTitle } from "@/utils/videoTitle";

// ─── severity 메타 ─────────────────────────────────────────────────────────────

const SEVERITY_META = {
  CRITICAL: { label: "CRITICAL", color: "#DC2626", bg: "#FEF2F2", dot: "🔴" },
  HIGH:     { label: "HIGH",     color: "#EA580C", bg: "#FFF7ED", dot: "🟠" },
  MEDIUM:   { label: "MEDIUM",   color: "#D97706", bg: "#FFFBEB", dot: "🟡" },
  NONE:     { label: "—",        color: T.muted,   bg: T.bgSection, dot: "⚪" },
};

function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity] ?? SEVERITY_META.NONE;
  if (severity === "NONE") return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: m.color,
      background: m.bg, borderRadius: T.radius.badge,
      padding: "2px 6px", border: `1px solid ${m.color}`,
      fontFamily: "monospace", letterSpacing: "0.04em",
    }}>
      {m.dot} {m.label}
    </span>
  );
}

// ─── 서브타입 메타데이터 ────────────────────────────────────────────────────────

const SUBTYPE_META = {
  BROWSE_DROP: {
    label:  "홈 피드 노출 감소",
    color:  T.danger,
    bg:     T.dangerBg,
    cause:  "YouTube 홈 피드 알고리즘 신뢰도 하락 가능\n최근 영상 CTR 저하 또는 업로드 공백이 원인일 수 있음",
    actions: [
      { id: "ctr_check",    icon: BarChart2, label: "최근 영상 CTR 확인",  desc: "CTR 경보 패널에서 임계값 미달 영상 점검" },
      { id: "upload_gap",   icon: null,      label: "업로드 간격 분석",    desc: "최근 3개 업로드 간격이 14일 이상이면 알고리즘 가중치 감소" },
      { id: "ab_thumbnail", icon: null,      label: "썸네일 A/B 테스트",   desc: "홈 피드 CTR 직접 타격 → 썸네일 교체 효과 즉시 확인 가능" },
    ],
  },
  SUGGESTED_DROP: {
    label:  "추천 영상 노출 감소",
    color:  T.danger,
    bg:     T.dangerBg,
    cause:  "연관 영상 추천 알고리즘에서 이탈\n시리즈 연결성 약화 또는 경쟁 영상 등장이 원인",
    actions: [
      { id: "series",      icon: null, label: "시리즈화 강화",        desc: "제목·태그에 시리즈 키워드 통일 → 연관 영상 클러스터 형성" },
      { id: "keyword",     icon: null, label: "제목 키워드 정렬",     desc: "기존 인기 영상과 키워드 오버랩 확인 후 제목 수정" },
      { id: "endcard",     icon: null, label: "엔드카드 연결 점검",   desc: "추천 영상으로 연결되는 엔드카드 배치 최적화" },
    ],
  },
  EXTERNAL_DROP: {
    label:  "외부 유입 감소",
    color:  T.warn,
    bg:     T.warnBg,
    cause:  "외부 링크·커뮤니티 배포 유입 감소\nRedirect Tracker 캠페인 정지 또는 링크 만료 가능성",
    actions: [
      { id: "redirect",    icon: Link, label: "Redirect Tracker 확인", desc: "캠페인별 클릭·유입 현황 점검 — 정지된 캠페인 재개" },
      { id: "redistribute",icon: null, label: "외부 배포 재개",         desc: "커뮤니티·SNS 배포 채널 현황 점검 후 재배포" },
      { id: "link_check",  icon: null, label: "링크 유효성 검사",       desc: "기존 배포 링크 만료 여부 확인" },
    ],
  },
  MIXED_DROP: {
    label:  "복합 노출 감소",
    color:  T.warn,
    bg:     T.warnBg,
    cause:  "복수 소스에서 균일하게 노출 감소\n단일 원인으로 귀인하기 어려운 채널 전반적 신호 약화",
    actions: [
      { id: "upload_pattern", icon: null, label: "업로드 패턴 점검",         desc: "최근 30일 업로드 빈도·시간대 확인" },
      { id: "full_check",     icon: null, label: "썸네일 + 키워드 종합 점검", desc: "홈·추천·검색 모두 영향 → 전반적 최적화 필요" },
      { id: "benchmark",      icon: null, label: "채널 벤치마크 비교",        desc: "동기간 채널 전체 조회수 추이와 비교해 이상치 확인" },
    ],
  },
  IMPRESSION_DROP: {
    label:  "노출 감소 (소스 불명)",
    color:  T.warn,
    bg:     T.warnBg,
    cause:  "Traffic source 데이터 미수집 상태 — api_data_shuttler.py 재실행 필요",
    actions: [
      { id: "rerun", icon: null, label: "데이터 수집 재실행", desc: "api_data_shuttler.py 실행 후 _VideoTrafficSources 데이터 생성 필요" },
    ],
  },
};

const SUBTYPE_ORDER = [
  "BROWSE_DROP", "SUGGESTED_DROP", "EXTERNAL_DROP", "MIXED_DROP", "IMPRESSION_DROP",
];

// ─── 공통 스타일 ───────────────────────────────────────────────────────────────

const CARD = {
  background:   T.bgCard,
  borderRadius: T.radius.card,
  border:       `1px solid ${T.border}`,
  padding:      "20px 24px",
  boxShadow:    T.shadow.card,
  gridColumn:   "span 12",
};

// ─── EXTERNAL_DROP용 관련 캠페인 인라인 표시 ─────────────────────────────────

function RelatedCampaigns({ videoId, campaignStats }) {
  if (!campaignStats?.length) return null;

  const related = campaignStats.filter(c =>
    c.videoId === videoId || c.videoId === videoId
  );
  if (!related.length) return null;

  return (
    <div style={{
      marginTop: T.spacing.sm,
      background: T.bgSection,
      borderRadius: T.radius.btn,
      padding: `${T.spacing.sm}px ${T.spacing.md}px`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: T.spacing.xs }}>
        연결된 캠페인 ({related.length}개)
      </div>
      {related.map(c => (
        <div key={c.slug} style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          padding: `${T.spacing.xs}px 0`,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{c.campaign}</span>
            <span style={{
              fontSize: 10, color: T.sub,
              background: T.bgCard, borderRadius: T.radius.badge,
              padding: "1px 5px", border: `1px solid ${T.border}`,
            }}>
              {c.platform}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: T.sub }}>
              {c.clicks} 클릭
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: c.quality === "high" ? T.success
                   : c.quality === "medium" ? T.warn
                   : T.danger,
            }}>
              {c.conversionPct}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 개별 서브타입 섹션 ────────────────────────────────────────────────────────

function SubtypeSection({ subtype, videos, campaignStats, onVideoClick }) {
  const [expanded, setExpanded]           = useState(true);
  const [actionExpanded, setActionExpanded] = useState(false);

  const meta = SUBTYPE_META[subtype] ?? SUBTYPE_META.IMPRESSION_DROP;
  const { color, bg, label, cause, actions } = meta;

  // 심각도별 정렬: CRITICAL → HIGH → MEDIUM → NONE
  const SORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, NONE: 3 };
  const sorted = [...videos].sort(
    (a, b) => (SORDER[a.severity] ?? 3) - (SORDER[b.severity] ?? 3)
  );

  const criticalCount = videos.filter(v => v.severity === "CRITICAL").length;
  const highCount     = videos.filter(v => v.severity === "HIGH").length;

  return (
    <div style={{
      border:       `1px solid ${color}44`,
      borderRadius: T.radius.btn,
      marginBottom: T.spacing.md,
      overflow:     "hidden",
    }}>

      {/* ── 섹션 헤더 ── */}
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between",
          background: bg, border: "none", cursor: "pointer",
          padding: `${T.spacing.sm}px ${T.spacing.lg}px`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color,
            background: color + "22", borderRadius: T.radius.badge,
            padding: "2px 8px", border: `1px solid ${color}`,
          }}>
            {subtype}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color }}>{label}</span>
          <span style={{
            fontSize: 11, color: T.sub,
            background: T.bgSection, borderRadius: T.radius.badge,
            padding: "1px 6px",
          }}>
            {videos.length}개
          </span>
          {/* 심각도 카운트 미리보기 */}
          {criticalCount > 0 && (
            <span style={{ fontSize: 10, color: SEVERITY_META.CRITICAL.color }}>
              🔴×{criticalCount}
            </span>
          )}
          {highCount > 0 && (
            <span style={{ fontSize: 10, color: SEVERITY_META.HIGH.color }}>
              🟠×{highCount}
            </span>
          )}
        </div>
        {expanded
          ? <ChevronDown size={14} color={color} />
          : <ChevronRight size={14} color={color} />
        }
      </button>

      {expanded && (
        <div style={{ padding: `${T.spacing.md}px ${T.spacing.lg}px` }}>

          {/* ── 원인 설명 ── */}
          <div style={{
            background: bg,
            borderRadius: T.radius.btn,
            padding: `${T.spacing.sm}px ${T.spacing.md}px`,
            marginBottom: T.spacing.md,
            fontSize: 12, color, lineHeight: T.font.lineHeight.relaxed,
            whiteSpace: "pre-line",
          }}>
            <AlertTriangle size={11} color={color}
              style={{ marginRight: 5, verticalAlign: "middle" }} />
            <strong>원인:</strong> {cause}
          </div>

          {/* ── 영상 목록 (severity 기준 정렬) ── */}
          <div style={{ marginBottom: T.spacing.md }}>
            {sorted.map((d, i) => {
              const changePct = d.impressionsChange !== null && d.impressionsChange !== undefined
                ? `${(d.impressionsChange * 100).toFixed(1)}%`
                : "—";
              const isLast = i === sorted.length - 1;
              const ytUrl  = `https://studio.youtube.com/video/${d.videoId}/edit`;
              const sm     = SEVERITY_META[d.severity] ?? SEVERITY_META.NONE;

              return (
                <div key={d.videoId}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: T.spacing.md,
                    padding: `${T.spacing.sm}px 0`,
                    borderBottom: isLast && subtype !== "EXTERNAL_DROP"
                      ? "none"
                      : `1px solid ${T.borderSoft}`,
                  }}>

                    {/* severity + 변화율 */}
                    <div style={{
                      minWidth: 72, textAlign: "center",
                      background: sm.bg, borderRadius: T.radius.btn,
                      padding: "5px 8px", flexShrink: 0,
                      border: `1px solid ${sm.color}44`,
                    }}>
                      <div style={{
                        fontSize: 13, fontWeight: 800, color: sm.color,
                        lineHeight: 1, fontFamily: "monospace",
                      }}>
                        {changePct}
                      </div>
                      <div style={{ fontSize: 9, color: sm.color, marginTop: 2, fontWeight: 700 }}>
                        {sm.dot} {sm.label !== "—" ? sm.label : "노출↓"}
                      </div>
                    </div>

                    {/* 영상 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => onVideoClick?.(d)}
                        style={{
                          fontSize: 13, fontWeight: 600, color: T.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          cursor: onVideoClick ? "pointer" : "default",
                          textDecoration: onVideoClick ? "underline" : "none",
                          textDecorationColor: T.borderSoft,
                        }}
                      >
                        {getSafeTitle(d.trackName || d.title, d.videoId)}
                      </div>
                      <div style={{
                        display: "flex", gap: T.spacing.sm, marginTop: 3, flexWrap: "wrap",
                      }}>
                        <span style={{ fontSize: 11, color: T.muted }}>
                          현재 {(d.impressions ?? 0).toLocaleString("ko-KR")}
                          {d.impressionsPrev > 0 && (
                            <> → 이전 {d.impressionsPrev.toLocaleString("ko-KR")}</>
                          )}
                        </span>
                        {d.ctr > 0 && (
                          <span style={{ fontSize: 11, color: T.sub }}>
                            CTR {(d.ctr * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Studio 바로가기 */}
                    <a
                      href={ytUrl} target="_blank" rel="noreferrer"
                      onClick={() => {
                        window.api?.registerActionStart?.({
                          video_id:     d.videoId,
                          action_type:  "IMPRESSION_RECOVERY",
                          action_label: `${subtype} — Studio 열기`,
                          source:       "impression_drop_panel",
                        }).catch(() => {});
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: T.bgSection, border: `1px solid ${T.border}`,
                        borderRadius: T.radius.btn, padding: "5px 10px",
                        textDecoration: "none", flexShrink: 0,
                      }}
                    >
                      <ExternalLink size={10} color={T.muted} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.sub }}>
                        Studio
                      </span>
                    </a>
                  </div>

                  {/* EXTERNAL_DROP: 연결 캠페인 인라인 표시 */}
                  {subtype === "EXTERNAL_DROP" && (
                    <RelatedCampaigns
                      videoId={d.videoId}
                      campaignStats={campaignStats}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── 액션 가이드 (토글) ── */}
          <button
            onClick={() => setActionExpanded(p => !p)}
            style={{
              display: "flex", alignItems: "center", gap: T.spacing.xs,
              background: "none", border: `1px solid ${color}44`,
              borderRadius: T.radius.btn, padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            {actionExpanded
              ? <ChevronDown size={11} color={color} />
              : <ChevronRight size={11} color={color} />
            }
            <span style={{ fontSize: 11, fontWeight: 700, color }}>
              {actionExpanded ? "액션 가이드 접기" : "액션 가이드 보기"}
            </span>
          </button>

          {actionExpanded && (
            <div style={{ marginTop: T.spacing.sm }}>
              {actions.map(({ id, icon: Icon, label: aLabel, desc }) => (
                <div key={id} style={{
                  display: "flex", alignItems: "flex-start", gap: T.spacing.sm,
                  padding: `${T.spacing.xs}px 0`,
                  borderBottom: `1px solid ${T.borderSoft}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {Icon && <Icon size={11} color={color} />}
                    <span style={{
                      fontSize: 11, fontWeight: 700, color,
                      background: bg, borderRadius: T.radius.badge,
                      padding: "2px 8px", border: `1px solid ${color}44`,
                    }}>
                      {aLabel}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11, color: T.sub, lineHeight: 1.6, marginTop: 1,
                  }}>
                    {desc}
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

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function ImpressionDropPanel({ diagnostics, campaignStats = [], onVideoClick }) {
  const alerts = diagnostics.filter(d => d.problemType === "IMPRESSION_DROP");
  if (alerts.length === 0) return null;

  // 서브타입별 그룹화
  const groups = {};
  for (const d of alerts) {
    const key = d.diagnosis || "IMPRESSION_DROP";
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  }

  const orderedKeys = SUBTYPE_ORDER.filter(k => groups[k]);

  // 심각도 집계 (헤더용)
  const criticalTotal = alerts.filter(d => d.severity === "CRITICAL").length;
  const highTotal     = alerts.filter(d => d.severity === "HIGH").length;
  const headerColor   = criticalTotal > 0 ? SEVERITY_META.CRITICAL.color
                      : highTotal > 0     ? SEVERITY_META.HIGH.color
                      : T.warn;
  const headerBadgeText = criticalTotal > 0 ? `🔴 CRITICAL ${criticalTotal}건`
                        : highTotal > 0     ? `🟠 HIGH ${highTotal}건`
                        : `🟡 주의 ${alerts.length}건`;

  return (
    <div style={CARD}>

      {/* ── 헤더 ── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <TrendingDown size={15} color={headerColor} />
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
            노출 감소 감지
          </span>
          <span style={{
            fontSize: 11,
            background: criticalTotal > 0 ? SEVERITY_META.CRITICAL.bg
                       : highTotal > 0    ? SEVERITY_META.HIGH.bg
                       : T.warnBg,
            color: headerColor, fontWeight: 600,
            borderRadius: T.radius.badge, padding: "2px 8px",
            border: `1px solid ${headerColor}`,
          }}>
            {headerBadgeText}
          </span>
          {/* 서브타입 분포 미리보기 */}
          <span style={{ fontSize: 11, color: T.muted }}>
            {orderedKeys.map(k => `${k.replace("_DROP", "")} ${groups[k].length}`).join(" · ")}
          </span>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>
          기준: 직전 대비 노출 20% 이상 감소
        </span>
      </div>

      {/* ── 서브타입별 섹션 (심각도 기준 영상 정렬) ── */}
      {orderedKeys.map(subtype => (
        <SubtypeSection
          key={subtype}
          subtype={subtype}
          videos={groups[subtype]}
          campaignStats={campaignStats}
          onVideoClick={onVideoClick}
        />
      ))}

    </div>
  );
}
