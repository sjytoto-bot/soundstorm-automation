// ─── DiagnosticsPanel ──────────────────────────────────────────────────────────
// Video_Diagnostics 데이터 기반 진단 허브 컴포넌트
//
// 역할:
//   - ImpressionDropPanel / CTRAlertPanel / RetentionDropPanel 조건부 렌더링
//   - INSUFFICIENT_DATA 필터링 (prev 데이터 없는 1회차 실행 시 잘못된 CRITICAL 방지)
//   - 이슈 없음 상태 처리 (빈 패널로 보이는 버그 방지)
//
// Props:
//   diagnostics   VideoDiagnostic[]   fetchVideoDiagnostics() 결과
//   campaignStats CampaignStat[]      ImpressionDropPanel 에 전달
//
// 데이터 흐름:
//   YouTubeView → DiagnosticsPanel → ImpressionDropPanel / CTRAlertPanel

import { CheckCircle } from "lucide-react";
import { T } from "../../styles/tokens";
import ImpressionDropPanel from "./ImpressionDropPanel";
import CTRAlertPanel       from "./CTRAlertPanel";
import ExternalDropPanel   from "./ExternalDropPanel";

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function DiagnosticsPanel({ diagnostics = [], campaignStats = [], externalDrop = null, onVideoClick, autoExpandVideoId }) {
  // INSUFFICIENT_DATA 제거: prev 없는 첫 실행 데이터 — UI에서 노출하지 않음
  const actionable = diagnostics.filter(d => d.problemType !== "INSUFFICIENT_DATA");

  const hasImpDrop      = actionable.some(d => d.problemType === "IMPRESSION_DROP");
  const hasRetention    = actionable.some(d => d.problemType === "RETENTION_WEAK");
  // RETENTION_WEAK 존재 시 CTR_WEAK 패널 억제 (우선순위: RETENTION > CTR, 혼란 방지)
  // RetentionDropPanel은 RightSidePanel > retention 탭으로 이동됨
  const hasCtrWeak      = !hasRetention && actionable.some(d => d.problemType === "CTR_WEAK");
  const hasExternalDrop = (externalDrop?.drops?.length ?? 0) > 0;

  const hasAnyIssue = hasImpDrop || hasCtrWeak || hasExternalDrop;

  // ── 이슈 없음 상태 ────────────────────────────────────────────────────────
  if (!hasAnyIssue) {
    return (
      <div style={{
        gridColumn:    "span 12",
        display:       "flex",
        alignItems:    "center",
        gap:           T.spacing.md,
        background:    T.bgCard,
        border:        `1px solid ${T.border}`,
        borderRadius:  T.radius.card,
        padding:       "18px 24px",
        boxShadow:     T.shadow.card,
      }}>
        <CheckCircle size={16} color={T.success} />
        <span style={{ fontSize: 13, color: T.sub }}>
          현재 노출·CTR·시청유지율·외부유입 진단 이슈 없음
        </span>
        {actionable.length > 0 && (
          <span style={{ fontSize: 12, color: T.muted, marginLeft: "auto" }}>
            {actionable.length}개 영상 정상
          </span>
        )}
        {diagnostics.length > actionable.length && (
          <span style={{ fontSize: 12, color: T.muted }}>
            · {diagnostics.length - actionable.length}개 데이터 수집 중
          </span>
        )}
      </div>
    );
  }

  // ── 이슈 있음: 패널 조건부 렌더링 ────────────────────────────────────────
  return (
    <>
      {hasImpDrop && (
        <ImpressionDropPanel
          diagnostics={actionable}
          campaignStats={campaignStats}
          onVideoClick={onVideoClick}
        />
      )}
      {hasCtrWeak && (
        <CTRAlertPanel
          diagnostics={actionable}
          onVideoClick={onVideoClick}
          autoExpandVideoId={autoExpandVideoId}
        />
      )}
      {hasExternalDrop && (
        <ExternalDropPanel externalDrop={externalDrop} />
      )}
    </>
  );
}
