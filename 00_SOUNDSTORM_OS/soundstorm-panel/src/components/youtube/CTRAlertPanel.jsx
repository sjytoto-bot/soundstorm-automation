// ─── CTRAlertPanel ─────────────────────────────────────────────────────────────
// Video_Diagnostics 기반 CTR 경보 패널
// LAYER 1 실행 시그널 — THUMBNAIL_WEAK / CTR < 4% 영상 경보 + 교체 CTA
//
// Props:
//   diagnostics  VideoDiagnostic[]   fetchVideoDiagnostics() 결과
//
// 데이터 없거나 경보 대상 없으면 렌더링하지 않음 (부모에서 조건부 처리)

import { AlertTriangle, TrendingDown, ExternalLink } from "lucide-react";
import { T } from "../../styles/tokens";
import { getSafeTitle } from "@/utils/videoTitle";

// ─── 경보 기준 ────────────────────────────────────────────────────────────────

const CTR_DANGER_THRESHOLD = 0.04;   // 4% 미만 → 경보
const CTR_WARN_THRESHOLD   = 0.05;   // 5% 미만 → 주의

// ─── 진단 코드 → 레이블 ───────────────────────────────────────────────────────

const DIAGNOSIS_LABEL = {
  THUMBNAIL_WEAK:          "썸네일 교체 필요",
  CONTENT_RETENTION_WEAK:  "시청유지율 약함",
  TITLE_DISCOVERY_WEAK:    "제목 키워드 약함",
  NORMAL:                  "정상",
};

// ─── CTR 수준 분류 ────────────────────────────────────────────────────────────

function getCtrLevel(ctr) {
  if (ctr < CTR_DANGER_THRESHOLD) return "danger";
  if (ctr < CTR_WARN_THRESHOLD)   return "warn";
  return "normal";
}

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

export default function CTRAlertPanel({ diagnostics }) {
  // 경보 대상: THUMBNAIL_WEAK 또는 CTR < 5% (인상 100 이상)
  const alerts = diagnostics
    .filter(d =>
      d.impressions >= 100 &&
      (d.diagnosis === "THUMBNAIL_WEAK" || d.ctr < CTR_WARN_THRESHOLD)
    )
    .sort((a, b) => a.ctr - b.ctr);  // CTR 낮은 순 정렬

  if (alerts.length === 0) return null;

  const dangerCount = alerts.filter(d => d.ctr < CTR_DANGER_THRESHOLD).length;

  return (
    <div style={CARD}>

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <TrendingDown size={15} color={T.danger} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
            CTR 경보
          </span>
          <span style={{
            fontSize: 11, background: T.dangerBg,
            color: T.danger, fontWeight: 600,
            borderRadius: T.radius.badge, padding: "2px 8px",
            border: `1px solid ${T.danger}`,
          }}>
            {dangerCount > 0 ? `위험 ${dangerCount}건` : `주의 ${alerts.length}건`}
          </span>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>
          기준: 노출 100↑ 영상 중 CTR 5% 미만
        </span>
      </div>

      {/* ── 경보 행 목록 ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {alerts.map((d, i) => {
          const level    = getCtrLevel(d.ctr);
          const color    = level === "danger" ? T.danger : T.warn;
          const bgColor  = level === "danger" ? T.dangerBg : T.warnBg;
          const ctrPct   = `${(d.ctr * 100).toFixed(2)}%`;
          const diagLabel = DIAGNOSIS_LABEL[d.diagnosis] ?? d.diagnosis;
          const isLast   = i === alerts.length - 1;
          const videoTitle = getSafeTitle(d.trackName || d.title, d.videoId);
          const ytUrl    = `https://studio.youtube.com/video/${d.videoId}/edit`;

          return (
            <div key={d.videoId} style={{
              display: "flex", alignItems: "center", gap: T.spacing.md,
              padding: `${T.spacing.md}px 0`,
              borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
            }}>

              {/* CTR 수치 강조 */}
              <div style={{
                minWidth: 72, textAlign: "center",
                background: bgColor, borderRadius: T.radius.btn,
                padding: "6px 10px", flexShrink: 0,
              }}>
                <div style={{
                  fontSize: 16, fontWeight: 800, color,
                  lineHeight: 1, fontFamily: "monospace",
                }}>
                  {ctrPct}
                </div>
                <div style={{ fontSize: 10, color, marginTop: 2 }}>CTR</div>
              </div>

              {/* 영상 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: T.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {videoTitle}
                </div>
                <div style={{
                  display: "flex", alignItems: "center",
                  gap: T.spacing.sm, marginTop: 3,
                }}>
                  <span style={{
                    fontSize: 11, color,
                    background: bgColor, borderRadius: T.radius.badge,
                    padding: "1px 6px", fontWeight: 600,
                  }}>
                    {diagLabel}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    노출 {d.impressions.toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>

              {/* 권장 액션 */}
              <div style={{ fontSize: 11, color: T.muted, flexShrink: 0, textAlign: "right" }}>
                {d.recommendation || (level === "danger" ? "썸네일 교체" : "A/B 테스트")}
              </div>

              {/* YouTube Studio 바로가기 */}
              <a
                href={ytUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: bgColor, border: `1px solid ${color}`,
                  borderRadius: T.radius.btn, padding: "5px 10px",
                  textDecoration: "none", flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color }}>
                  Studio
                </span>
                <ExternalLink size={10} color={color} />
              </a>

            </div>
          );
        })}
      </div>

      {/* ── 기준 영상 안내 ────────────────────────────────────────────────── */}
      <div style={{
        marginTop: T.spacing.md,
        padding: "10px 14px",
        background: T.bgSection,
        borderRadius: T.radius.btn,
        fontSize: 12, color: T.sub, lineHeight: 1.6,
      }}>
        <AlertTriangle size={12} color={T.sub} style={{ marginRight: 6, verticalAlign: "middle" }} />
        참조 기준: <strong>척살II CTR 9.66%</strong> · <strong>군주 CTR 9.05%</strong> —
        썸네일 교체 시 이 스타일 기준으로 진행. 썸네일 반자동 생성 도구 사용 권장.
      </div>

    </div>
  );
}
