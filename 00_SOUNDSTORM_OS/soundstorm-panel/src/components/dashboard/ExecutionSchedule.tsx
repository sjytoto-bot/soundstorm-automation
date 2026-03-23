// ─── ExecutionSchedule ───────────────────────────────────────────────────────
// 다음 업로드 후보 목록 (opportunityVideos 기반)

import { T } from "../../styles/tokens";
import type { ScheduledVideo } from "@/controllers/useExecutionController";

interface Props {
  scheduledContent: ScheduledVideo[];
}

const SIGNAL_COLOR: Record<string, string> = {
  "모멘텀 ↑":     T.success,
  "알고리즘 부스트": T.primary,
  "알고리즘 진입":  T.primary,
  "조회수 폭발":   T.danger,
  "조회수 상승":   T.warn,
};

export default function ExecutionSchedule({ scheduledContent }: Props) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.sm,
    }}>
      {/* 섹션 헤더 */}
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.sub,
        letterSpacing: "0.06em",
      }}>
        업로드 후보
      </span>

      {scheduledContent.length > 0 ? (
        <ul style={{
          margin:        0,
          padding:       0,
          listStyle:     "none",
          display:       "flex",
          flexDirection: "column",
          gap:           5,
        }}>
          {scheduledContent.map(v => {
            const signalColor = SIGNAL_COLOR[v.signal] ?? T.muted;
            return (
              <li
                key={v.videoId}
                style={{
                  display:       "flex",
                  flexDirection: "column",
                  gap:           1,
                }}
              >
                <span style={{
                  fontSize:     T.font.size.xs,
                  color:        T.text,
                  fontWeight:   T.font.weight.medium,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                }}>
                  {v.title}
                </span>
                <span style={{
                  fontSize:   9,
                  fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.bold,
                  color:      signalColor,
                }}>
                  {v.signal}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
          업로드 후보 없음
        </span>
      )}
    </div>
  );
}
