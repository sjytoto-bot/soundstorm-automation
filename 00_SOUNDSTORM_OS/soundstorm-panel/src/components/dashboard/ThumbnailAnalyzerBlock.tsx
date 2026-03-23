// ─── ThumbnailAnalyzerBlock ──────────────────────────────────────────────────────
// Block: ThumbnailAnalyzer
//
// 규칙:
//   - DashboardData + DashboardActions만 사용
//   - 데이터 생성·fetch·상태 생성 금지 (표시 전용)
//   - 필요한 데이터는 Engine → dashData 경로로 주입받는다

import type { DashboardData, DashboardActions } from "@/types/dashboardData";
import { T } from "@/styles/tokens";

interface Props {
  data:    DashboardData;
  actions: DashboardActions;
}

export default function ThumbnailAnalyzerBlock({ data, actions }: Props) {
  return (
    <div style={{
      background:   T.color.bgPrimary,
      border:       `1px solid ${T.color.border}`,
      borderRadius: T.radius.card,
      padding:      T.spacing.lg,
      display:      "flex",
      flexDirection: "column",
      gap:           T.spacing.sm,
    }}>
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: T.font.familyMono,
        fontWeight: T.font.weight.bold,
        color:      T.color.textMuted,
        letterSpacing: "0.1em",
      }}>
        THUMBNAILANALYZER
      </span>
      <span style={{ fontSize: T.font.size.sm, color: T.color.textPrimary }}>
        구현 예정 — Engine 연결 후 여기서 표시
      </span>
    </div>
  );
}
