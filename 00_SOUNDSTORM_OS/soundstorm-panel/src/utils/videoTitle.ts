// ─── videoTitle ───────────────────────────────────────────────────────────────
// 영상 제목 안전 처리 유틸
//
// 문제: title 필드가 비어있을 때 videoId가 fallback으로 표시됨
//   → `d.title || d.videoId` 패턴이 원인
//   → YouTube video ID 형식 (/^[a-zA-Z0-9_-]{11}$/)을 title로 노출하면 안 됨
//
// 해결:
//   1. getSafeTitle — title이 videoId 형식이면 "제목 없음" 반환
//   2. isVideoId    — YouTube ID 형식 여부 검사
//   3. title_original / title_custom 구분 (데이터 계층에서 사용)

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * 문자열이 YouTube video ID 형식인지 검사한다.
 * 형식: 영문 대소문자 + 숫자 + _ + - 조합, 정확히 11자.
 */
export function isVideoId(str: string | undefined | null): boolean {
  if (!str) return false;
  return VIDEO_ID_REGEX.test(str.trim());
}

/**
 * 영상 제목을 안전하게 반환한다.
 *
 * - title이 없거나 빈 문자열이면 → fallback 반환
 * - title이 YouTube video ID 형식이면 → fallback 반환 (ID가 title로 노출되는 버그 방지)
 * - 그 외 → title 반환
 *
 * @param title      표시할 제목 후보
 * @param fallback   대체 텍스트 (기본값: "제목 없음")
 */
export function getSafeTitle(
  title: string | undefined | null,
  fallback = "제목 없음",
): string {
  if (!title || !title.trim()) return fallback;
  if (isVideoId(title)) return fallback;
  return title.trim();
}

/**
 * 데이터 계층에서 title 덮어쓰기 방지 로직.
 * API fetch 시 custom 제목이 있으면 original만 업데이트하고 custom은 유지한다.
 *
 * 사용 예:
 *   const updated = mergeTitle(existing, fetchedTitle);
 *   → existing.title_custom이 있으면 그것을 우선, fetchedTitle은 title_original에만 저장
 *
 * 반환:
 *   { title_original, title_custom, title }
 *   - title: 최종 표시용 = title_custom || title_original (getSafeTitle 적용)
 */
export function mergeTitle(
  existing: { title?: string; title_original?: string; title_custom?: string },
  fetchedTitle: string | undefined | null,
): { title: string; title_original: string; title_custom: string | undefined } {
  const original = fetchedTitle?.trim() || existing.title_original || "";
  const custom   = existing.title_custom;

  const displayTitle = getSafeTitle(custom || original);

  return {
    title_original: original,
    title_custom:   custom,
    title:          displayTitle,
  };
}
