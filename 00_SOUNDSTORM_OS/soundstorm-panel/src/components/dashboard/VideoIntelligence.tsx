// ─── VideoIntelligence v2 ─────────────────────────────────────────────────────
// 영상 인텔리전스 패널: 3열 그리드 + 인사이트/액션
// 좌: TopVideos | 중: TrendingVideos | 우: TrafficCluster
//
// v2: InsightActionBox 추가 (패널 하단)

import TopVideos      from "./TopVideos";
import TrendingVideos from "./TrendingVideos";
import TrafficCluster from "./TrafficCluster";
import { T }          from "../../styles/tokens";
import type { SelectedVideo } from "./VideoDetailModal";

interface VideoIntelligenceProps {
  onVideoClick?: (v: SelectedVideo) => void;
}

export default function VideoIntelligence({ onVideoClick }: VideoIntelligenceProps) {

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.lg }}>
      {/* 3열 패널 그리드 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:                 T.spacing.xl,
        alignItems:          "flex-start",
      }}>
        <TopVideos      onVideoClick={onVideoClick} />
        <TrendingVideos onVideoClick={onVideoClick} />
        <TrafficCluster />
      </div>

    </div>
  );
}
