// ─── ExecutionStatus ─────────────────────────────────────────────────────────
// 업로드 성과 테이블

import { T } from "../../styles/tokens";
import type { RecentPerfVideo } from "@/lib/recentPerformance";
import RecentUploadsTable from "./RecentUploadsTable";

interface ActiveUploadItem {
  videoId:      string;
  elapsedHours: number;
  status:       string;
}

interface Props {
  recentPerfVideos: RecentPerfVideo[];
  channelAvgCTR:    number | null;
  onRowClick?:      (v: RecentPerfVideo) => void;
  activeUploads?:   ActiveUploadItem[];
}

export default function ExecutionStatus({
  recentPerfVideos,
  channelAvgCTR,
  onRowClick,
  activeUploads = [],
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.sub,
        letterSpacing: "0.06em",
      }}>
        업로드 성과
      </span>
      <RecentUploadsTable
        videos={recentPerfVideos}
        channelAvgCTR={channelAvgCTR}
        onRowClick={onRowClick}
        activeUploads={activeUploads}
      />
    </div>
  );
}
