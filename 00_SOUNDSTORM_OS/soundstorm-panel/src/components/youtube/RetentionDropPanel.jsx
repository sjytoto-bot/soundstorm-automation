// ─── RetentionDropPanel ─────────────────────────────────────────────────────────
// Video_Diagnostics 기반 시청유지율 경보 패널
// LAYER 1 실행 시그널 — RETENTION_WEAK 영상 경보 + 인트로 개선 CTA
//
// Props:
//   diagnostics  VideoDiagnostic[]   fetchVideoDiagnostics() 결과
//   onVideoClick (d) => void         영상 제목 클릭 시 모달 오픈
//
// 조건: problemType === "RETENTION_WEAK"
// 정렬: avgWatchTime 낮은 순 (가장 심각한 영상 위)

import { TimerOff, ExternalLink, ChevronRight } from "lucide-react";
import { T } from "../../styles/tokens";
import { getSafeTitle } from "@/utils/videoTitle";

// ─── 진단 코드 → 레이블 ───────────────────────────────────────────────────────

const DIAGNOSIS_LABEL = {
  INTRO_DROP:             "초반 이탈",
  MID_DROP:               "중반 이탈",
  FLAT_DROP:              "전반 저하",
  CONTENT_RETENTION_WEAK: "초반 이탈 과다",  // 구버전 호환
  RETENTION_WEAK:         "시청유지율 저하",
};

// ─── 서브타입 → 개선 힌트 ─────────────────────────────────────────────────────

const SUBTYPE_HINT = {
  INTRO_DROP: "인트로 5초",
  MID_DROP:   "중반 재편집",
  FLAT_DROP:  "전체 재구성",
  CONTENT_RETENTION_WEAK: "인트로 점검",
  RETENTION_WEAK: "인트로 점검",
};

// ─── 시간 포맷 (초 → m:ss) ───────────────────────────────────────────────────

function fmtSec(sec) {
  if (sec == null || isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── 유지율 포맷 ──────────────────────────────────────────────────────────────

function fmtRetention(r) {
  if (r == null || isNaN(r)) return null;
  return `${(r * 100).toFixed(1)}%`;
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

export default function RetentionDropPanel({ diagnostics, onVideoClick }) {
  // RETENTION_WEAK만 필터, avgWatchTime 낮은 순 정렬
  const alerts = diagnostics
    .filter(d => d.problemType === "RETENTION_WEAK")
    .sort((a, b) => {
      // avgWatchTime null은 맨 뒤
      if (a.avgWatchTime == null) return 1;
      if (b.avgWatchTime == null) return -1;
      return a.avgWatchTime - b.avgWatchTime;
    });

  if (alerts.length === 0) return null;

  // 임계값: 채널 평균의 80% 이하가 진단 기준 — 참고 표시만
  const warnColor  = T.color?.warning ?? "#f0a500";
  const warnBg     = T.warnBg ?? `${warnColor}15`;

  return (
    <div style={CARD}>

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: T.spacing.lg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <TimerOff size={15} color={warnColor} />
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
            시청유지율 경보
          </span>
          <span style={{
            fontSize: 11, background: warnBg,
            color: warnColor, fontWeight: 600,
            borderRadius: T.radius.badge, padding: "2px 8px",
            border: `1px solid ${warnColor}`,
          }}>
            주의 {alerts.length}건
          </span>
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>
          기준: 채널 평균 시청시간 80% 미만
        </span>
      </div>

      {/* ── 경보 행 목록 ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {alerts.map((d, i) => {
          const isLast      = i === alerts.length - 1;
          const videoTitle  = getSafeTitle(d.trackName || d.title, d.videoId);
          const ytUrl       = `https://studio.youtube.com/video/${d.videoId}/edit`;
          const diagLabel   = DIAGNOSIS_LABEL[d.diagnosis] ?? DIAGNOSIS_LABEL[d.problemType] ?? d.diagnosis;
          const retStr      = fmtRetention(d.retentionRate);
          const hint        = SUBTYPE_HINT[d.diagnosis] ?? SUBTYPE_HINT[d.problemType] ?? "인트로 점검";

          return (
            <div
              key={d.videoId}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          T.spacing.md,
                padding:      `${T.spacing.md}px 0`,
                borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
              }}
            >
              {/* 듀얼 메트릭: avg 시청시간 + 유지율 */}
              <div style={{
                display: "flex", gap: 6, flexShrink: 0,
              }}>
                {/* avgWatchTime */}
                <div style={{
                  minWidth: 64, textAlign: "center",
                  background: warnBg, borderRadius: T.radius.btn,
                  padding: "6px 10px",
                }}>
                  <div style={{
                    fontSize: 16, fontWeight: 800, color: warnColor,
                    lineHeight: 1, fontFamily: "monospace",
                  }}>
                    {fmtSec(d.avgWatchTime)}
                  </div>
                  <div style={{ fontSize: 10, color: warnColor, marginTop: 2 }}>avg</div>
                </div>
                {/* retentionRate — 있을 때만 */}
                {retStr && (
                  <div style={{
                    minWidth: 52, textAlign: "center",
                    background: T.bgSection, borderRadius: T.radius.btn,
                    border: `1px solid ${T.borderSoft}`,
                    padding: "6px 10px",
                  }}>
                    <div style={{
                      fontSize: 16, fontWeight: 800, color: warnColor,
                      lineHeight: 1, fontFamily: "monospace",
                    }}>
                      {retStr}
                    </div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>유지율</div>
                  </div>
                )}
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
                  {videoTitle}
                </div>
                <div style={{
                  display: "flex", alignItems: "center",
                  gap: T.spacing.sm, marginTop: 3,
                }}>
                  <span style={{
                    fontSize: 11, color: warnColor,
                    background: warnBg, borderRadius: T.radius.badge,
                    padding: "1px 6px", fontWeight: 600,
                  }}>
                    {diagLabel}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    조회수 {d.views.toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>

              {/* 개선 방향 힌트 (서브타입별) */}
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                background: warnBg,
                border: `1px solid ${warnColor}`,
                borderRadius: T.radius.btn, padding: "5px 10px",
                flexShrink: 0,
              }}>
                <ChevronRight size={11} color={warnColor} />
                <span style={{ fontSize: 11, fontWeight: 700, color: warnColor }}>
                  {hint}
                </span>
              </div>

              {/* YouTube Studio 바로가기 */}
              <a
                href={ytUrl}
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
                <span style={{ fontSize: 11, fontWeight: 600, color: T.sub }}>
                  Studio
                </span>
              </a>
            </div>
          );
        })}
      </div>

      {/* ── 개선 방향 안내 ────────────────────────────────────────────────── */}
      <div style={{
        marginTop: T.spacing.md,
        padding: "10px 14px",
        background: T.bgSection,
        borderRadius: T.radius.btn,
        fontSize: 12, color: T.sub, lineHeight: 1.6,
      }}>
        <TimerOff size={12} color={T.sub} style={{ marginRight: 6, verticalAlign: "middle" }} />
        개선 우선순위: <strong>인트로 15초 재편집</strong> →
        <strong> 챕터 마커 추가</strong> →
        <strong> 핵심 내용 앞배치</strong> —
        이탈 구간을 YouTube Analytics에서 직접 확인 후 해당 구간 재편집 권장.
      </div>

    </div>
  );
}
