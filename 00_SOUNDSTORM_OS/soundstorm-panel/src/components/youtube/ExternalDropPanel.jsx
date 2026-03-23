// ─── ExternalDropPanel.jsx ────────────────────────────────────────────────────
// redirect_logs.csv 기반 외부 유입 트래픽 감소 리포트
//
// Props:
//   externalDrop — computeExternalDrop() 반환값
//                  { drops[], totalCampaigns, healthyCampaigns, windowDays }

import { useState } from "react";
import { Link, TrendingDown, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 상태 메타 ────────────────────────────────────────────────────────────────

const STATUS_META = {
  DEAD:     { label: "DEAD",     color: "#DC2626", bg: "#FEF2F2" },
  DROPPING: { label: "DROPPING", color: T.warn,    bg: T.warnBg  },
};

// ─── 캠페인 행 ────────────────────────────────────────────────────────────────

function DropRow({ stat }) {
  const sm      = STATUS_META[stat.status] ?? STATUS_META.DROPPING;
  const dropPct = `${Math.round(stat.dropRate * 100)}%`;

  return (
    <div style={{
      display:    "grid",
      gridTemplateColumns: "80px 1fr auto auto",
      alignItems: "center",
      gap:        T.spacing.md,
      padding:    `${T.spacing.sm}px 0`,
      borderBottom: `1px solid ${T.borderSoft}`,
    }}>
      {/* 감소율 뱃지 */}
      <div style={{
        textAlign:    "center",
        background:   sm.bg,
        borderRadius: T.radius.btn,
        padding:      "5px 8px",
        border:       `1px solid ${sm.color}44`,
      }}>
        <div style={{
          fontSize: 14, fontWeight: 800, fontFamily: "monospace",
          color: sm.color, lineHeight: 1,
        }}>
          -{dropPct}
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: sm.color, marginTop: 2 }}>
          {sm.label}
        </div>
      </div>

      {/* 캠페인 정보 */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: T.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {stat.campaign}
        </div>
        <div style={{ display: "flex", gap: T.spacing.sm, marginTop: 3 }}>
          <span style={{
            fontSize: 10, color: T.sub,
            background: T.bgSection, borderRadius: T.radius.badge,
            padding: "1px 5px", border: `1px solid ${T.border}`,
          }}>
            {stat.platform}
          </span>
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            /{stat.slug}
          </span>
        </div>
      </div>

      {/* 클릭 추이 */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
          <span style={{ color: T.sub }}>{stat.prevClicks}</span>
          {" → "}
          <span style={{ color: sm.color, fontWeight: 700 }}>{stat.recentClicks}</span>
        </div>
        <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>이전→최근 (클릭)</div>
      </div>

      {/* YouTube Studio 링크 */}
      {stat.videoId && (
        <a
          href={`https://studio.youtube.com/video/${stat.videoId}/edit`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: T.bgSection, border: `1px solid ${T.border}`,
            borderRadius: T.radius.btn, padding: "5px 10px",
            textDecoration: "none", flexShrink: 0,
          }}
        >
          <ExternalLink size={10} color={T.muted} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.sub }}>Studio</span>
        </a>
      )}
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function ExternalDropPanel({ externalDrop }) {
  const [actionExpanded, setActionExpanded] = useState(false);

  if (!externalDrop?.drops?.length) return null;

  const { drops, totalCampaigns, healthyCampaigns, windowDays } = externalDrop;
  const deadCount     = drops.filter(d => d.status === "DEAD").length;
  const droppingCount = drops.filter(d => d.status === "DROPPING").length;

  const headerColor = deadCount > 0 ? "#DC2626" : T.warn;
  const headerBg    = deadCount > 0 ? "#FEF2F2" : T.warnBg;
  const badgeText   = deadCount > 0
    ? `DEAD ${deadCount}건`
    : `DROPPING ${droppingCount}건`;

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      padding:      "20px 24px",
      boxShadow:    T.shadow.card,
      gridColumn:   "span 12",
    }}>

      {/* ── 헤더 ── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <Link size={15} color={headerColor} />
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
            외부 유입 트래픽 감소
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: headerBg, color: headerColor,
            borderRadius: T.radius.badge, padding: "2px 8px",
            border: `1px solid ${headerColor}`,
          }}>
            {badgeText}
          </span>
          <span style={{ fontSize: 11, color: T.muted }}>
            전체 {totalCampaigns}개 캠페인 중 {drops.length}개 감소
          </span>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>
          기준: {windowDays}일 이전 대비 50% 이상 감소
        </span>
      </div>

      {/* ── 캠페인 목록 ── */}
      <div style={{ marginBottom: T.spacing.md }}>
        {drops.map(stat => (
          <DropRow key={stat.slug} stat={stat} />
        ))}
      </div>

      {/* ── 요약 라인 ── */}
      {healthyCampaigns > 0 && (
        <div style={{
          fontSize: 11, color: T.muted,
          marginBottom: T.spacing.md,
          paddingLeft: T.spacing.xs,
        }}>
          {healthyCampaigns}개 캠페인 정상 운영 중
        </div>
      )}

      {/* ── 액션 가이드 (토글) ── */}
      <button
        onClick={() => setActionExpanded(p => !p)}
        style={{
          display: "flex", alignItems: "center", gap: T.spacing.xs,
          background: "none", border: `1px solid ${headerColor}44`,
          borderRadius: T.radius.btn, padding: "5px 10px",
          cursor: "pointer",
        }}
      >
        {actionExpanded
          ? <ChevronDown size={11} color={headerColor} />
          : <ChevronRight size={11} color={headerColor} />
        }
        <span style={{ fontSize: 11, fontWeight: 700, color: headerColor }}>
          {actionExpanded ? "액션 가이드 접기" : "액션 가이드 보기"}
        </span>
      </button>

      {actionExpanded && (
        <div style={{ marginTop: T.spacing.sm }}>
          {[
            {
              label: "Redirect Tracker 점검",
              desc:  "redirect_server.py 실행 상태 확인 — 서버 중단 시 모든 링크 클릭이 로깅되지 않음",
            },
            {
              label: "배포 링크 유효성 검사",
              desc:  "커뮤니티·SNS에 배포된 링크가 만료·삭제되었는지 직접 접속 확인",
            },
            {
              label: "캠페인 재배포",
              desc:  "DEAD 캠페인은 즉시 재배포 권장 — 기존 링크를 새 게시글에 다시 첨부",
            },
            {
              label: "플랫폼별 유입 확인",
              desc:  "YouTube Studio → 트래픽 소스 탭에서 외부 유입 비율 변화 대조",
            },
          ].map(({ label, desc }) => (
            <div key={label} style={{
              display: "flex", alignItems: "flex-start", gap: T.spacing.sm,
              padding: `${T.spacing.xs}px 0`,
              borderBottom: `1px solid ${T.borderSoft}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: headerColor,
                background: headerBg, borderRadius: T.radius.badge,
                padding: "2px 8px", border: `1px solid ${headerColor}44`,
                flexShrink: 0,
              }}>
                {label}
              </span>
              <span style={{ fontSize: 11, color: T.sub, lineHeight: 1.6, marginTop: 1 }}>
                {desc}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
