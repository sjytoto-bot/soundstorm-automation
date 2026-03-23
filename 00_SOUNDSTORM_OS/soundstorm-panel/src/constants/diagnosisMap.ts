// ─── diagnosisMap.ts ──────────────────────────────────────────────────────────
// Video_Diagnostics 진단 코드 → 한국어 라벨 / 권장 액션 매핑
//
// 사용처:
//   CTRIntelligencePanel — 진단 배지 라벨
//   RiskSummaryCard      — 카드 제목
//   VideoDiagnostics 드릴다운 — 권장 액션 (recommendation 없을 때 fallback)

export const DIAGNOSIS_LABEL: Record<string, string> = {
  THUMBNAIL_WEAK:             "썸네일 개선 필요",
  TITLE_DISCOVERY_WEAK:       "검색 노출 부족",
  CONTENT_RETENTION_WEAK:     "초반 몰입도 문제",
  ALGORITHM_DISTRIBUTION_LOW: "알고리즘 확산 부족",
  NORMAL:                     "정상",
};

export const DIAGNOSIS_ACTION: Record<string, string> = {
  THUMBNAIL_WEAK:             "썸네일 교체 테스트 권장",
  TITLE_DISCOVERY_WEAK:       "제목 키워드 확장 권장",
  CONTENT_RETENTION_WEAK:     "영상 시작 10초 개선 필요",
  ALGORITHM_DISTRIBUTION_LOW: "외부 유입 유도 필요",
  NORMAL:                     "",
};

// Reference_Videos `why` 컬럼 → 한국어 전략 문장
export const REFERENCE_WHY_LABEL: Record<string, string> = {
  "dark high contrast thumbnail": "고대비 다크 썸네일 효과",
  "strong early CTR":             "초반 CTR 강세",
  "algorithm pickup":             "알고리즘 픽업 (노출 급증)",
  "above-median CTR + impressions": "CTR·노출 동시 중앙값 초과",
};
