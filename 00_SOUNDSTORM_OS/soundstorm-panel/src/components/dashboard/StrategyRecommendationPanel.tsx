// ─── StrategyRecommendationPanel ──────────────────────────────────────────────
// 추천 제작 전략 패널
//
// Props:  diagnostics / thumbnailStyles / referenceVideos
// 로직:  thumbnailWeakCount + bestThumbnailStyle + referenceVideos 기반 권장 사항 생성
// UI:    체크 리스트 형태로 추천 전략 표시

import { CheckCircle2 } from "lucide-react";
import { T } from "../../styles/tokens";
import type { VideoDiagnostic } from "@/adapters/VideoDiagnosticsAdapter";
import type { ThumbnailStyle }  from "@/adapters/ThumbnailStyleAdapter";
import type { ReferenceVideo }  from "@/adapters/ReferenceVideosAdapter";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  diagnostics:    VideoDiagnostic[];
  thumbnailStyles: ThumbnailStyle[];
  referenceVideos: ReferenceVideo[];
}

// ─── StrategyRecommendationPanel ──────────────────────────────────────────────

export default function StrategyRecommendationPanel({
  diagnostics,
  thumbnailStyles,
  referenceVideos,
}: Props) {
  // 렌더 조건
  if (
    diagnostics.length    === 0 &&
    thumbnailStyles.length === 0 &&
    referenceVideos.length === 0
  ) return null;

  // ── 로직 ──────────────────────────────────────────────────────────────────
  const thumbnailWeakCount = diagnostics.filter(
    d => d.diagnosis === "THUMBNAIL_WEAK"
  ).length;

  const bestThumbnailStyle = thumbnailStyles[0] ?? null;

  const recommendations: string[] = [];

  if (bestThumbnailStyle) {
    recommendations.push("어두운 고대비 썸네일 전략 추천");
  }

  if (thumbnailWeakCount > 3) {
    recommendations.push(
      `썸네일 교체 테스트 필요 영상 ${thumbnailWeakCount}개 발견`
    );
  }

  if (referenceVideos.length > 0) {
    recommendations.push("초반 CTR 강한 영상 패턴 발견");
  }

  if (recommendations.length === 0) return null;

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.md,
      boxShadow:     T.shadow.card,
    }}>
      {/* 헤더 */}
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.sub,
        letterSpacing: "0.08em",
      }}>
        추천 제작 전략
      </span>

      {/* 추천 리스트 */}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: T.spacing.sm }}>
        {recommendations.map((rec, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
            <CheckCircle2
              size={14}
              color={T.success}
              style={{ flexShrink: 0 }}
            />
            <span style={{
              fontSize:   T.font.size.xs,
              color:      T.text,
              lineHeight: T.font.lineHeight.normal,
              wordBreak:  "keep-all",
            }}>
              {rec}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
