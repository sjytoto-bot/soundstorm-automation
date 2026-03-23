// ─── RiskSummaryCard ──────────────────────────────────────────────────────────
// 채널 리스크 요약 카드 — Video_Diagnostics 진단 결과를 3열로 표시
//
// 데이터: videoDiagnostics → useAnalyticsContext().risk
//
// 3열 구조:
//   Thumbnail Weak   (danger)  — THUMBNAIL_WEAK
//   Title Discovery  (warning) — TITLE_DISCOVERY_WEAK
//   Retention Issues (warning) — CONTENT_RETENTION_WEAK
//
// 전체 이상 없으면 (total === 0) 렌더 안 함

import { ShieldAlert } from "lucide-react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { DIAGNOSIS_ACTION } from "@/constants/diagnosisMap";

// ─── 리스크 항목 정의 ─────────────────────────────────────────────────────────

interface RiskItem {
  label:    string;
  diagKey:  string;   // DIAGNOSIS_ACTION 키
  count:    number;
  color:    string;
  bg:       string;
}

// ─── RiskCell ─────────────────────────────────────────────────────────────────

function RiskCell({ item }: { item: RiskItem }) {
  const isZero  = item.count === 0;
  const action  = DIAGNOSIS_ACTION[item.diagKey] ?? "";

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
      background:    isZero ? T.bgSection : item.bg,
      borderRadius:  T.radius.btn,
      border:        `1px solid ${isZero ? T.borderSoft : item.color + "30"}`,
      gap:           T.spacing.xs,
    }}>
      {/* 제목 */}
      <span style={{
        fontSize:   T.font.size.xs,
        fontWeight: T.font.weight.semibold,
        color:      isZero ? T.muted : T.text,
        lineHeight: T.font.lineHeight.tight,
      }}>
        {item.label}
      </span>

      {/* 카운트 */}
      <span style={{
        fontSize:   T.font.size.xl,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color:      isZero ? T.muted : item.color,
        lineHeight: 1,
      }}>
        {item.count}
      </span>

      {/* 액션 문구 */}
      {action && (
        <span style={{
          fontSize:   10,
          color:      isZero ? T.muted : item.color,
          lineHeight: T.font.lineHeight.normal,
          wordBreak:  "keep-all",
          opacity:    isZero ? 0.5 : 1,
        }}>
          {action}
        </span>
      )}
    </div>
  );
}

// ─── RiskSummaryCard ──────────────────────────────────────────────────────────

export default function RiskSummaryCard() {
  const { risk, videoDiagnostics, loadingAnalytics } = useAnalyticsContext();

  if (loadingAnalytics || videoDiagnostics.length === 0) return null;

  const items: RiskItem[] = [
    {
      label:   "썸네일 개선 필요",
      diagKey: "THUMBNAIL_WEAK",
      count:   risk.thumbnailWeak,
      color:   T.danger,
      bg:      T.dangerBg,
    },
    {
      label:   "검색 노출 부족",
      diagKey: "TITLE_DISCOVERY_WEAK",
      count:   risk.titleWeak,
      color:   T.warn,
      bg:      T.warnBg,
    },
    {
      label:   "초반 몰입도 문제",
      diagKey: "CONTENT_RETENTION_WEAK",
      count:   risk.retentionWeak,
      color:   T.warn,
      bg:      T.warnBg,
    },
    {
      label:   "알고리즘 확산 부족",
      diagKey: "ALGORITHM_DISTRIBUTION_LOW",
      count:   risk.algoLow,
      color:   T.primary,
      bg:      T.primarySoft,
    },
  ];

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${risk.total > 0 ? T.danger + "30" : T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.md,
      boxShadow:     T.shadow.card,
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <ShieldAlert
            size={14}
            color={risk.total > 0 ? T.danger : T.muted}
          />
          <span style={{
            fontSize:      T.font.size.xs,
            fontFamily:    T.font.familyMono,
            fontWeight:    T.font.weight.bold,
            color:         T.sub,
            letterSpacing: "0.08em",
          }}>
            채널 상태 진단
          </span>
        </div>

        {/* 전체 이상 합계 */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{
            fontSize:   T.font.size.xs,
            fontFamily: T.font.familyMono,
            color:      T.muted,
          }}>
            {videoDiagnostics.length}개 분석
          </span>
          {risk.total > 0 && (
            <span style={{
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.bold,
              color:        T.danger,
              background:   T.dangerBg,
              borderRadius: T.radius.badge,
              padding:      `0px ${T.spacing.sm}px`,
            }}>
              {risk.total} 이상
            </span>
          )}
          {risk.total === 0 && (
            <span style={{
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              color:        T.success,
              background:   T.successBg,
              borderRadius: T.radius.badge,
              padding:      `0px ${T.spacing.sm}px`,
            }}>
              정상
            </span>
          )}
        </div>
      </div>

      {/* 4열 리스크 그리드 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 T.spacing.sm,
      }}>
        {items.map(item => (
          <RiskCell key={item.diagKey} item={item} />
        ))}
      </div>
    </div>
  );
}
