// ─── useOnVideoPublished ──────────────────────────────────────────────────────
// ContentPack에 video_id가 새로 세팅될 때 실행되는 훅.
//
// 트리거 조건:
//   pack.video_id 가 null → 비어있지않은 string 으로 변경됨
//   + pack.campaign_links 에 slug가 1개 이상 있음
//
// 동작:
//   slugs.forEach(slug => updateRedirectLink(slug, videoId))
//   → redirectLinks.json[slug].video = videoId 자동 업데이트
//
// 사용:
//   ContentPackContext.tsx 내 ContentPackProvider 에서 호출

import { useEffect, useRef } from "react";
import type { ContentPack } from "@/core/types/contentPack";

/**
 * @param packs  - ContentPackManagerState.packs
 */
export function useOnVideoPublished(packs: ContentPack[]) {
  // 이전 video_id 맵 추적 (packId → video_id | null)
  const prevVideoIds = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    const prev = prevVideoIds.current;
    const api  = (window as any).api;

    for (const pack of packs) {
      const oldVideoId = prev.get(pack.id) ?? null;
      const newVideoId = pack.video_id;

      // video_id가 새로 세팅된 경우
      if (newVideoId && newVideoId !== oldVideoId) {
        const slugs = pack.campaign_links.filter(Boolean);

        if (slugs.length > 0 && api?.updateRedirectLink) {
          for (const slug of slugs) {
            api.updateRedirectLink(slug, newVideoId)
              .then((res: { ok: boolean; error?: string }) => {
                if (res.ok) {
                  console.log(`[onVideoPublished] ${slug} → ${newVideoId} 연결 완료`);
                } else {
                  console.warn(`[onVideoPublished] ${slug} 연결 실패:`, res.error);
                }
              })
              .catch((err: unknown) => {
                console.warn(`[onVideoPublished] IPC 오류:`, err);
              });
          }
        }
      }

      // 상태 갱신
      prev.set(pack.id, newVideoId);
    }

    // 삭제된 팩 정리
    const currentIds = new Set(packs.map(p => p.id));
    for (const id of prev.keys()) {
      if (!currentIds.has(id)) prev.delete(id);
    }
  }, [packs]);
}
