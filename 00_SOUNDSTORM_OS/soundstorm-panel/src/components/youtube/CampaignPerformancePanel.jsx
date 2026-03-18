// ─── CampaignPerformancePanel ──────────────────────────────────────────────────
// Redirect Tracker 캠페인 퍼포먼스 패널
// LAYER 1 실행 시그널 영역 — 외부 캠페인 클릭 + 비타겟 경보 표시
//
// Props:
//   stats        CampaignStat[]   computeCampaignStats() 결과
//   onCreatePack (videoId) => void  Content Pack 생성 연결
//
// 데이터 없으면 렌더링하지 않음 (조건부 렌더링은 부모에서 처리)

import {
  Target, AlertTriangle, CheckCircle, MinusCircle,
  MessageCircle, Hash, Camera, AtSign, Globe, Link,
  BookOpen, Send, ChevronRight,
} from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 플랫폼 아이콘 맵 ─────────────────────────────────────────────────────────

const PLATFORM_ICON = {
  DISCORD:   MessageCircle,
  REDDIT:    Hash,
  ARCA:      Hash,
  INSTAGRAM: Camera,
  TWITTER:   AtSign,
  NAVER:     Globe,
  KAKAOTALK: MessageCircle,
  NOTION:    BookOpen,
  TELEGRAM:  Send,
  DIRECT:    Link,
};

const PLATFORM_COLOR = {
  DISCORD:   "#5865F2",
  REDDIT:    "#FF4500",
  ARCA:      "#00A9CE",
  INSTAGRAM: "#E1306C",
  TWITTER:   "#1DA1F2",
  NAVER:     "#03C75A",
  KAKAOTALK: "#FEE500",
  NOTION:    "#000000",
  TELEGRAM:  "#229ED9",
  DIRECT:    T.muted,
};

// ─── quality → 상태 표시 ──────────────────────────────────────────────────────

const QUALITY_CONFIG = {
  high:    { icon: CheckCircle, color: T.success,  label: "정상 전환" },
  medium:  { icon: MinusCircle, color: T.warn,     label: "전환율 보통" },
  low:     { icon: AlertTriangle, color: T.danger, label: "전환율 낮음" },
  no_data: { icon: MinusCircle,  color: T.muted,   label: "데이터 부족" },
};

// ─── 공통 스타일 ──────────────────────────────────────────────────────────────

const CARD = {
  background:   T.bgCard,
  borderRadius: T.radius.card,
  border:       `1px solid ${T.border}`,
  padding:      "20px 24px",
  boxShadow:    T.shadow.card,
  gridColumn:   "span 12",
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function CampaignPerformancePanel({ stats, onCreatePack }) {
  const riskCount = stats.filter(s => s.isNontargetRisk).length;

  return (
    <div style={CARD}>

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <Target size={15} color={T.sub} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
            캠페인 퍼포먼스
          </span>
          <span style={{
            fontSize: 11, color: T.muted,
            fontFamily: "monospace", marginLeft: T.spacing.xs,
          }}>
            Redirect Tracker
          </span>
        </div>

        {/* 비타겟 경보 배지 */}
        {riskCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: T.spacing.xs,
            background: T.dangerBg, border: `1px solid ${T.danger}`,
            borderRadius: T.radius.badge, padding: "3px 10px",
          }}>
            <AlertTriangle size={12} color={T.danger} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.danger }}>
              비타겟 유입 위험 {riskCount}건
            </span>
          </div>
        )}
      </div>

      {/* ── 캠페인 행 목록 ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {stats.map((stat, i) => {
          const PlatformIcon = PLATFORM_ICON[stat.platform] ?? Globe;
          const platformColor = PLATFORM_COLOR[stat.platform] ?? T.muted;
          const qConfig = QUALITY_CONFIG[stat.quality];
          const QualityIcon = qConfig.icon;
          const isLast = i === stats.length - 1;

          return (
            <div key={stat.slug} style={{
              display: "flex", alignItems: "center",
              gap: T.spacing.md, padding: `${T.spacing.md}px 0`,
              borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
            }}>

              {/* 플랫폼 아이콘 */}
              <div style={{
                width: 32, height: 32, borderRadius: T.radius.btn,
                background: T.bgSection,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <PlatformIcon size={15} color={platformColor} />
              </div>

              {/* 캠페인 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                    {stat.campaign}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: platformColor,
                    fontFamily: "monospace", letterSpacing: "0.05em",
                  }}>
                    {stat.platform}
                  </span>
                  {/* 비타겟 경보 인라인 배지 */}
                  {stat.isNontargetRisk && (
                    <span style={{
                      fontSize: 10, color: T.danger, fontWeight: 600,
                      background: T.dangerBg, borderRadius: T.radius.badge,
                      padding: "1px 6px",
                    }}>
                      ⚠ 비타겟
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                  {stat.conversionLabel}
                </div>
              </div>

              {/* 클릭수 */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: T.text,
                  lineHeight: 1, fontFamily: "monospace",
                }}>
                  {stat.clicks.toLocaleString("ko-KR")}
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>클릭</div>
              </div>

              {/* 퀄리티 상태 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                flexShrink: 0, width: 80,
              }}>
                <QualityIcon size={13} color={qConfig.color} />
                <span style={{ fontSize: 11, color: qConfig.color, fontWeight: 600 }}>
                  {qConfig.label}
                </span>
              </div>

              {/* CTA 버튼 */}
              {stat.videoId && (
                <button
                  onClick={() => onCreatePack?.(stat.videoId)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: T.primarySoft, border: `1px solid ${T.primaryBorder}`,
                    borderRadius: T.radius.btn, padding: "5px 10px",
                    cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.primary }}>
                    Pack 생성
                  </span>
                  <ChevronRight size={11} color={T.primary} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── ARCA 비타겟 경보 상세 (dungeon slug 감지 시) ──────────────────── */}
      {stats.some(s => s.campaign === "arca_game") && (
        <div style={{
          marginTop: T.spacing.md,
          padding: "10px 14px",
          background: T.warnBg,
          border: `1px solid ${T.warn}`,
          borderRadius: T.radius.btn,
          display: "flex", alignItems: "flex-start", gap: T.spacing.sm,
        }}>
          <AlertTriangle size={13} color={T.warn} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.warn, lineHeight: 1.5 }}>
            <strong>ARCA 게임 커뮤니티</strong> 유입 감지 — 만검돌격 비타겟 바이럴 패턴과 동일.
            해당 링크 공유 중단을 권장합니다.
          </span>
        </div>
      )}

    </div>
  );
}
