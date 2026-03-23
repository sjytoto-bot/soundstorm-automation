// ─── External Platform Profiles ──────────────────────────────────────────────
// 플랫폼별 사용자 프로파일: audience, 소비 이유, 권장 전략

export interface PlatformProfile {
  audience: string;          // 주요 유입 사용자 유형
  reason:   string;          // 콘텐츠 소비 이유
  strategy: string;          // 권장 전략 방향
}

export const EXTERNAL_PLATFORM_PROFILES: Record<string, PlatformProfile> = {

  // ── 국내 검색 ──────────────────────────────────────────────────────────────
  NAVER: {
    audience: "국내 일반 검색 사용자",
    reason:   "특정 음악·장르 키워드 검색",
    strategy: "네이버 SEO 키워드 강화",
  },
  DAUM: {
    audience: "국내 포털 검색 사용자",
    reason:   "음악·영상 관련 검색",
    strategy: "포털 SEO 키워드 최적화",
  },

  // ── 해외 검색 ──────────────────────────────────────────────────────────────
  GOOGLE: {
    audience: "글로벌 검색 사용자",
    reason:   "장르·분위기 기반 음악 검색",
    strategy: "영어 제목·설명 SEO 강화",
  },
  BRAVE: {
    audience: "프라이버시 중시 검색 사용자",
    reason:   "광고 없는 음악 검색",
    strategy: "메타데이터 완성도 강화",
  },
  DUCKDUCKGO: {
    audience: "프라이버시 중시 검색 사용자",
    reason:   "추적 없는 음악 탐색",
    strategy: "메타데이터 완성도 강화",
  },
  BING: {
    audience: "MS 생태계 사용자",
    reason:   "Bing/Copilot 통합 검색",
    strategy: "구조화된 메타데이터 작성",
  },

  // ── AI 검색 ────────────────────────────────────────────────────────────────
  PERPLEXITY: {
    audience: "AI 검색 헤비 유저",
    reason:   "AI 큐레이션 음악 추천",
    strategy: "AI 검색 노출 강화 — 명확한 장르·용도 설명",
  },
  CHATGPT: {
    audience: "ChatGPT 사용자",
    reason:   "AI가 추천한 BGM·음악 탐색",
    strategy: "ChatGPT 인덱싱용 질문형 제목 작성",
  },
  COPILOT: {
    audience: "Microsoft 365 업무 사용자",
    reason:   "업무·프레젠테이션용 BGM 탐색",
    strategy: "비즈니스 용도 BGM 라이선스 전면 표시",
  },
  CLAUDE: {
    audience: "AI 어시스턴트 사용자",
    reason:   "AI 추천 기반 음악 발견",
    strategy: "콘텐츠 용도 명확화 — AI 인덱싱 최적화",
  },
  GEMINI: {
    audience: "구글 AI 검색 사용자",
    reason:   "Gemini 추천 음악 탐색",
    strategy: "Google AI 검색 최적화",
  },

  // ── 소셜 ───────────────────────────────────────────────────────────────────
  INSTAGRAM: {
    audience: "댄서 및 영상 콘텐츠 제작자",
    reason:   "Reels·Short 배경 음악 탐색",
    strategy: "세로형 Short 클립 + 훅 3초 이내 설계",
  },
  FACEBOOK: {
    audience: "30~50대 일반 소셜 사용자",
    reason:   "피드 발견형 콘텐츠 소비",
    strategy: "감성·스토리 중심 썸네일 설계",
  },
  TWITTER: {
    audience: "트렌드 민감 콘텐츠 소비자",
    reason:   "트위터/X 바이럴 콘텐츠 발견",
    strategy: "짧은 티저 클립 + 인용하기 쉬운 제목",
  },

  // ── 메신저 ────────────────────────────────────────────────────────────────
  MESSENGER: {
    audience: "지인 공유 기반 일반 사용자",
    reason:   "친구·가족에게 추천 받은 콘텐츠",
    strategy: "30초 미리듣기 클립 + 공유 유도 문구",
  },
  WHATSAPP: {
    audience: "친구 또는 업무 팀",
    reason:   "그룹 채팅 개인 공유",
    strategy: "짧은 preview 클립 + 명확한 사용 용도 표시",
  },
  KAKAOTALK: {
    audience: "국내 일반 사용자",
    reason:   "카카오톡 오픈채팅·단톡 공유",
    strategy: "오픈채팅 배포 전략 + 썸네일 감성 강화",
  },
  LINE: {
    audience: "일본·동남아 사용자",
    reason:   "라인 메신저 링크 공유",
    strategy: "일본어 자막·태그 추가",
  },
  TELEGRAM: {
    audience: "커뮤니티 중심 사용자",
    reason:   "텔레그램 채널·그룹 공유",
    strategy: "텔레그램 채널 구독자 유도 전략",
  },

  // ── 커뮤니티 ──────────────────────────────────────────────────────────────
  DISCORD: {
    audience: "게임 개발자 / 음악 커뮤니티",
    reason:   "서버 내 추천 공유",
    strategy: "Discord 음악·게임 서버 정기 배포 루틴",
  },
  ARCA: {
    audience: "국내 오타쿠·창작 커뮤니티",
    reason:   "아카라이브 게시글 추천",
    strategy: "아카라이브 음악·영상 갤러리 배포",
  },
  DCINSIDE: {
    audience: "국내 커뮤니티 헤비 유저",
    reason:   "디시인사이드 갤러리 공유",
    strategy: "관련 갤러리 정기 홍보 글 작성",
  },
  REDDIT: {
    audience: "영어권 음악·게임 커뮤니티",
    reason:   "서브레딧 공유 추천",
    strategy: "r/GameMusic r/LoFi 등 관련 서브레딧 배포",
  },

  // ── 블로그 ────────────────────────────────────────────────────────────────
  TISTORY: {
    audience: "블로그 독자 — 음악·영상 관심층",
    reason:   "티스토리 포스트 임베드",
    strategy: "임베드 친화적 설명 + 라이선스 안내 추가",
  },
  NAVER_BLOG: {
    audience: "네이버 블로그 독자",
    reason:   "네이버 블로그 포스트 레퍼런스",
    strategy: "네이버 블로그 협업 + SEO 최적화",
  },
  VELOG: {
    audience: "개발자·기술 블로거",
    reason:   "기술 포스트 BGM·분위기 탐색",
    strategy: "개발·집중 BGM 카테고리 강화",
  },
  MEDIUM: {
    audience: "글로벌 독자·창작자",
    reason:   "미디엄 아티클 레퍼런스",
    strategy: "영문 메타데이터 + 창작자 타겟 라이선스",
  },

  // ── 협업 ──────────────────────────────────────────────────────────────────
  NOTION: {
    audience: "영상 제작 팀 / 스타트업",
    reason:   "노션 프로젝트 BGM 레퍼런스",
    strategy: "라이선싱 패키지 전면 강조 + 팀 BGM 플랜 제안",
  },
  GOOGLE_DOCS: {
    audience: "업무·프로젝트 팀",
    reason:   "구글 문서 내 BGM 임베드",
    strategy: "업무용 BGM 라이선스 패키지 제안",
  },
  GOOGLE_DRIVE: {
    audience: "영상 제작 팀",
    reason:   "드라이브 공유 파일 내 레퍼런스",
    strategy: "파일 기반 배포 + 라이선스 키트 제공",
  },

  // ── 미디어 ────────────────────────────────────────────────────────────────
  JUKEBOX: {
    audience: "같이 듣기 참여자",
    reason:   "Jukebox 온라인 같이 듣기",
    strategy: "테마별 플레이리스트 큐레이션 + 연속 시청 유도",
  },
  SYNC_TUBE: {
    audience: "온라인 동시 시청 참여자",
    reason:   "SyncTube 동시 재생",
    strategy: "동시 시청 친화적 긴 재생 가능 콘텐츠 구성",
  },
  SOUNDCLOUD: {
    audience: "음악 제작자·팬",
    reason:   "사운드클라우드 연관 탐색",
    strategy: "사운드클라우드 크로스 프로모션",
  },
  SPOTIFY: {
    audience: "스트리밍 음악 팬",
    reason:   "스포티파이 플레이리스트 연결 탐색",
    strategy: "스포티파이 배포 전략 연계",
  },
};
