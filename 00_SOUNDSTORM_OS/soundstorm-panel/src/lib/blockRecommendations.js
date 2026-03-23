// ─── blockRecommendations ─────────────────────────────────────────────────────
// diagnostics + contentPacks → 블록별 추천 메타 계산 (순수 함수)
//
// 출력: Record<BlockId, BlockMeta>
//
// BlockMeta {
//   recommended:  boolean   // 🔥 뱃지 + 상단 정렬
//   urgencyLine:  string    // "지금 안 하면 손해" 프레이밍 (추천 시 표시)
//   impactLabel:  string    // "CTR 낮음 (-1.8%p)" — 서브 라인 1
//   actionLabel:  string    // 버튼 텍스트 (행동 동사 + 대상)
//   resultLabel:  string    // ON 상태 시 표시할 수치 결과
//   description:  string    // expanded 설명 1줄
//   expectedGain: string    // "교체 시 조회수 1.5~2배 가능"
// }

// ─── 채널 평균 CTR 계산 ───────────────────────────────────────────────────────

function getChannelAvgCTR(diagnostics) {
  const valid = diagnostics.filter(d => d.ctr != null && d.ctr > 0);
  if (!valid.length) return null;
  return valid.reduce((s, d) => s + d.ctr, 0) / valid.length;
}

// ─── CTR 델타 계산 ────────────────────────────────────────────────────────────

function getCTRDelta(diagnostics) {
  const avgCTR = getChannelAvgCTR(diagnostics);
  if (!avgCTR) return null;
  const weakest = diagnostics
    .filter(d => d.ctr != null && d.problemType === "CTR_WEAK")
    .sort((a, b) => a.ctr - b.ctr)[0];
  if (!weakest) {
    const below4 = diagnostics
      .filter(d => d.ctr != null && d.ctr < 0.04)
      .sort((a, b) => a.ctr - b.ctr)[0];
    if (!below4) return null;
    return ((avgCTR - below4.ctr) * 100).toFixed(1);
  }
  return ((avgCTR - weakest.ctr) * 100).toFixed(1);
}

// ─── 노출 감소율 계산 ─────────────────────────────────────────────────────────

function getImpressionDropPct(diagnostics) {
  const drops = diagnostics.filter(d => d.problemType === "IMPRESSION_DROP");
  if (!drops.length) return null;
  // impressionDropPct 필드 있으면 사용, 없으면 고정값
  const avg = drops.reduce((s, d) => s + (d.impressionDropPct ?? 0.3), 0) / drops.length;
  return Math.round(avg * 100);
}

// ─── 메인 계산 함수 ───────────────────────────────────────────────────────────

export function computeBlockMeta(diagnostics = [], contentPacks = []) {
  const ctrWeakList   = diagnostics.filter(d => d.problemType === "CTR_WEAK" || (d.ctr != null && d.ctr < 0.04));
  const criticalList  = diagnostics.filter(d => d.severity === "CRITICAL" && d.problemType !== "INSUFFICIENT_DATA");
  const dropList      = diagnostics.filter(d => d.problemType === "IMPRESSION_DROP");
  const readyPacks    = contentPacks.filter(p => p.status === "ready");

  const ctrDelta      = getCTRDelta(diagnostics);
  const dropPct       = getImpressionDropPct(diagnostics);

  return {
    thumbnailAnalyzer: {
      recommended:  ctrWeakList.length > 0,
      impactLabel:  ctrWeakList.length > 0 && ctrDelta
        ? `CTR 낮음 (-${ctrDelta}%p)`
        : ctrWeakList.length > 0 ? "CTR 기준 미달" : "",
      urgencyLine:  ctrWeakList.length > 0
        ? "지금 안 바꾸면 노출 계속 감소"
        : "",
      actionLabel:  "지금 분석 시작",
      resultLabel:  "썸네일 분석 실행됨",
      description:  "썸네일 성과 분석",
      expectedGain: "교체 시 조회수 1.5~2배 가능",
    },

    opportunity: {
      recommended:  dropList.length > 0,
      impactLabel:  dropList.length > 0 && dropPct
        ? `노출 -${dropPct}%`
        : dropList.length > 0 ? "노출 급감 감지됨" : "",
      urgencyLine:  dropList.length > 0
        ? "지금 기회 잡지 않으면 노출 소멸"
        : "",
      actionLabel:  "기회 영상 보기",
      resultLabel:  dropList.length > 0
        ? `기회 ${dropList.length}개 추적 중`
        : "기회 영상 추적 중",
      description:  "노출 급감 영상 기회 분석",
      expectedGain: "재최적화 시 노출 회복 가능",
    },

    execution: {
      recommended:  readyPacks.length > 0,
      impactLabel:  readyPacks.length > 0
        ? `대기 팩 ${readyPacks.length}개`
        : "",
      urgencyLine:  readyPacks.length > 0
        ? "대기 팩이 쌓이면 알고리즘 타이밍 손실"
        : "",
      actionLabel:  "업로드 시작",
      resultLabel:  "실행 모니터링 중",
      description:  "콘텐츠 실행 + 업로드 관리",
      expectedGain: "정기 업로드 시 알고리즘 노출 증가",
    },

    upload: {
      recommended:  readyPacks.length > 0,
      impactLabel:  readyPacks.length > 0
        ? `대기 팩 ${readyPacks.length}개`
        : "",
      urgencyLine:  readyPacks.length > 0
        ? "준비된 팩 업로드를 미루면 타이밍 손실"
        : "",
      actionLabel:  "업로드 가이드 열기",
      resultLabel:  "업로드 흐름 안내 중",
      description:  "업로드 준비 완료 팩 가이드",
      expectedGain: "가이드 기반 업로드 오류 0건",
    },

    growth: {
      recommended:  false,
      impactLabel:  "",
      urgencyLine:  "",
      actionLabel:  "지금 활성화",
      resultLabel:  "채널 성장 루프 모니터링 중",
      description:  "크리에이터 성장 루프 시각화",
      expectedGain: "성장 루프 유지 시 복리 성장",
    },

    strategy: {
      recommended:  false,
      impactLabel:  "",
      urgencyLine:  "",
      actionLabel:  "지금 활성화",
      resultLabel:  "오늘 전략 브리핑 연결됨",
      description:  "오늘의 전략 브리핑 + 업로드 타이밍",
      expectedGain: "전략 기반 업로드 시 CTR +15% 기대",
    },

    insight: {
      recommended:  false,
      impactLabel:  "",
      urgencyLine:  "",
      actionLabel:  "지금 활성화",
      resultLabel:  "채널 KPI 실시간 연동 중",
      description:  "채널 KPI + Analytics 통합 뷰",
      expectedGain: "KPI 모니터링으로 이상 조기 감지",
    },
  };
}
