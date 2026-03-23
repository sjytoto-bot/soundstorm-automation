// ─── Strategy Insight Engine v1 ────────────────────────────────────────────────
// 4축 점수 기반 자동 진단 메시지 생성 — pure function, side effect 없음
//
// 규칙:
//   score >= 80  → positive  (강점)
//   score < 40   → critical  (경고)
//   score < 60   → warning   (개선 제안)
//   60 ≤ score < 80  → 메시지 없음 (중간 구간)

// ─── 축별 메시지 정의 ─────────────────────────────────────────────────────────
const AXIS_MESSAGES = {
  growth: {
    positive: "Growth 강세 — 구독자 확장 기회",
    warning:  "Growth 둔화 — 업로드 주기 점검 필요",
    critical: "Growth 위기 — 채널 성장 전략 재검토",
  },
  reach: {
    positive: "Reach 우수 — 썸네일·제목 효과적",
    warning:  "Reach 저조 — 썸네일·제목 개선 필요",
    critical: "Reach 위기 — SEO 및 노출 전략 필요",
  },
  engagement: {
    positive: "Engagement 우수 — 시청자 반응 양호",
    warning:  "Engagement 낮음 — CTA 개선 필요",
    critical: "Engagement 위기 — 콘텐츠 포맷 재검토",
  },
  monetization: {
    positive: "Monetize 우수 — 광고 수익 최적화됨",
    warning:  "Monetize 저조 — 광고 길이·타겟 검토",
    critical: "Monetize 위기 — 수익화 전략 재설계 필요",
  },
};

const AXES = ["growth", "reach", "engagement", "monetization"];

// ─── generateInsights ──────────────────────────────────────────────────────────
// @param  strategy  { growth, reach, engagement, monetization, total, grade }
// @returns Array<{ type: "positive"|"warning"|"critical", message: string }>

export function generateInsights(strategy) {
  const insights = [];

  for (const axis of AXES) {
    const score = strategy[axis];
    const msgs  = AXIS_MESSAGES[axis];

    if (score >= 80) {
      insights.push({ type: "positive", message: msgs.positive });
    } else if (score < 40) {
      insights.push({ type: "critical", message: msgs.critical });
    } else if (score < 60) {
      insights.push({ type: "warning",  message: msgs.warning  });
    }
    // 60 ≤ score < 80: 메시지 없음
  }

  return insights;
}
