// ─── SaveStatusBadge ──────────────────────────────────────────────────────────
// ContentPack 저장 상태 표시 뱃지
//
// lastSavedAt → "마지막 저장: X초 전" (1초마다 갱신)
// saveError   → "저장 실패: {message}" (빨간 점)
// 둘 다 없으면 null 반환 (렌더 없음)

import { useEffect, useState } from "react";
import { useContentPackCtx } from "@/controllers/ContentPackContext";
import { T } from "@/styles/tokens";

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 5)    return "방금";
  if (diff < 60)   return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

export default function SaveStatusBadge() {
  const { lastSavedAt, saveError } = useContentPackCtx();
  const [, forceUpdate] = useState(0);

  // 1초마다 timeAgo 재계산
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  if (!lastSavedAt && !saveError) return null;

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.xs,
      fontSize:   10,
      fontFamily: T.font.familyMono,
      color:      saveError ? T.color.danger : T.color.textMuted,
    }}>
      <span style={{
        width:        6,
        height:       6,
        borderRadius: "50%",
        flexShrink:   0,
        background:   saveError ? T.color.danger : T.color.success,
      }} />
      {saveError
        ? `저장 실패: ${saveError}`
        : lastSavedAt
          ? `마지막 저장: ${timeAgo(lastSavedAt)}`
          : null
      }
    </div>
  );
}
