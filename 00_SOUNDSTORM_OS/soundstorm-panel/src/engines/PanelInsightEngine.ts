// ─── PanelInsightEngine v1 ────────────────────────────────────────────────────
// 각 패널 전용 인사이트 + 추천 액션 생성 엔진
//
// 반환 구조:
//   { insights: string[], actions: string[] }
//
// 적용 패널:
//   GrowthPanel       — generateGrowthInsights / generateGrowthActions
//   AudienceTabs      — generateAudienceInsights / generateAudienceActions
//   VideoIntelligence — generateVideoInsights / generateVideoActions
//   TrafficCluster    — generateTrafficInsights / generateTrafficActions
//   OpportunityEngine — generateOpportunityInsights / generateOpportunityActions

import type { DimensionRow } from "@/adapters/AnalyticsAdapter";
import type { GrowthResult } from "@/controllers/useAnalyticsController";

// ─── 공통 타입 ────────────────────────────────────────────────────────────────

export interface PanelInsight {
  insights: string[];
  actions:  string[];
}

/** 인사이트 카드 내 실행 버튼 */
export interface CTAButton {
  label:      string;
  actionType: string;
}

/** 인사이트 + 액션 1:1 연결 쌍 */
export interface InsightPair {
  insight:   string;
  action:    string;
  severity?: "danger" | "warning" | "positive";
  ctas?:     CTAButton[];
}

/** 인사이트 배열 + 액션 배열을 1:1 쌍으로 병합 */
export function zipPairs(
  insights:    string[],
  actions:     string[],
  severities?: ("danger" | "warning" | "positive")[],
  ctasList?:   (CTAButton[] | undefined)[],
): InsightPair[] {
  if (insights.length === 0) return [];
  return insights.map((insight, i) => ({
    insight,
    action:   actions[i] ?? actions[0] ?? "모니터링 유지",
    severity: severities?.[i],
    ctas:     ctasList?.[i],
  }));
}

// ─── 내부 유틸 ────────────────────────────────────────────────────────────────

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function cleanAge(key: string): string {
  return key.replace(/^age/i, "").replace(/_/g, "-").replace(/\s/g, "");
}

const TRAFFIC_KO: Record<string, string> = {
  RELATED_VIDEO:  "추천 영상",
  YT_SEARCH:      "유튜브 검색",
  SUBSCRIBER:     "구독자",
  PLAYLIST:       "재생목록",
  YT_CHANNEL:     "채널 페이지",
  NO_LINK_OTHER:  "직접 접속",
  YT_OTHER_PAGE:  "기타 페이지",
  END_SCREEN:     "최종 화면",
  EXT_URL:        "외부 URL",
  NOTIFICATION:   "알림",
};

// ─── 1. Growth ─────────────────────────────────────────────────────────────────

export function generateGrowthInsights(growth: GrowthResult): string[] {
  const items: string[] = [];

  if (growth.views != null) {
    if (growth.views > 20)
      items.push(`조회수 +${growth.views}% 급성장 — 성장 모멘텀 활성`);
    else if (growth.views < -15)
      items.push(`조회수 ${growth.views}% 하락 — 즉각 대응 필요`);
    else if (growth.views < -5)
      items.push(`조회수 소폭 감소 중 (${growth.views}%)`);
  }

  if (growth.avgDuration != null) {
    if (growth.avgDuration > 10)
      items.push(`평균 시청시간 +${growth.avgDuration}% 상승 — 콘텐츠 품질 개선`);
    else if (growth.avgDuration < -10)
      items.push(`평균 시청시간 ${growth.avgDuration}% 하락 — 인트로 구간 점검 필요`);
  }

  if (growth.subscribers != null) {
    if (growth.subscribers > 20)
      items.push(`구독 전환율 +${growth.subscribers}% 급상승`);
    else if (growth.subscribers < 5 && growth.subscribers > -5)
      items.push(`구독 전환율 정체 — CTA 개선 필요`);
    else if (growth.subscribers < -10)
      items.push(`구독자 이탈 증가 (${growth.subscribers}%)`);
  }

  if (growth.watchTime != null && growth.watchTime < -15)
    items.push(`총 시청시간 ${growth.watchTime}% 감소 — 영상 구조 재검토 권장`);

  if (growth.likes != null && growth.likes > 30)
    items.push(`좋아요 +${growth.likes}% 증가 — 콘텐츠 공감도 상승`);

  if (items.length === 0)
    items.push("전 지표 안정권 — 현재 전략 유지 권장");

  return items;
}

/**
 * generateGrowthInsights 와 동일한 분기 구조 — 인덱스 정렬 보장
 * 각 인사이트에 대응하는 CTA 버튼 배열 반환 (없으면 undefined)
 */
export function generateGrowthCTAs(growth: GrowthResult): (CTAButton[] | undefined)[] {
  const ctas: (CTAButton[] | undefined)[] = [];

  if (growth.views != null) {
    if (growth.views > 20)
      ctas.push([{ label: "Pack 생성 →", actionType: "create_pack" }]);
    else if (growth.views < -15)
      ctas.push([
        { label: "가설 생성",        actionType: "create_hypothesis" },
        { label: "썸네일 2안 만들기", actionType: "create_thumbnail_variant" },
      ]);
    else if (growth.views < -5)
      ctas.push([
        { label: "가설 생성",        actionType: "create_hypothesis" },
        { label: "썸네일 2안 만들기", actionType: "create_thumbnail_variant" },
      ]);
  }

  if (growth.avgDuration != null) {
    if (growth.avgDuration > 10)     ctas.push(undefined);
    else if (growth.avgDuration < -10)
      ctas.push([{ label: "Pack 생성 →", actionType: "create_pack" }]);
  }

  if (growth.subscribers != null) {
    if (growth.subscribers > 20)                                      ctas.push(undefined);
    else if (growth.subscribers < 5 && growth.subscribers > -5)       ctas.push(undefined);
    else if (growth.subscribers < -10)                                ctas.push(undefined);
  }

  if (growth.watchTime != null && growth.watchTime < -15) ctas.push(undefined);
  if (growth.likes     != null && growth.likes     > 30)  ctas.push(undefined);

  if (ctas.length === 0) ctas.push(undefined); // "전 지표 안정권" default

  return ctas;
}

export function generateGrowthActions(growth: GrowthResult): string[] {
  const actions: string[] = [];

  if (growth.views != null && growth.views < -5)
    actions.push("제목·썸네일 A/B 테스트 즉시 진행");

  if (growth.avgDuration != null && growth.avgDuration < -10)
    actions.push("인트로 20초 이내로 단축, 핵심 내용 선행 배치");

  if (growth.subscribers != null && (growth.subscribers < 5))
    actions.push("영상 말미 구독 CTA 강화 (마지막 15초 집중 설계)");

  if (growth.watchTime != null && growth.watchTime < -15)
    actions.push("Retention 곡선 분석 후 이탈 구간 재편집");

  if (growth.views != null && growth.views > 20)
    actions.push("업로드 빈도 증가 — 성장 모멘텀 즉시 활용");

  if (actions.length === 0)
    actions.push("주간 지표 정기 모니터링 유지");

  return actions;
}

// ─── 2. Audience ──────────────────────────────────────────────────────────────

export function generateAudienceInsights(
  age:    DimensionRow[],
  gender: DimensionRow[],
): string[] {
  const items: string[] = [];

  if (age.length > 0) {
    const top = age[0];
    items.push(`${cleanAge(top.key)} 연령대 ${pct(top.ratio)} — 핵심 타겟층`);

    const young = age
      .filter(a => ["13-17", "18-24", "1317", "1824"].some(k =>
        a.key.replace(/\D/g, "").includes(k.replace(/\D/g, ""))
      ))
      .reduce((s, a) => s + a.ratio, 0);

    if (young > 0.5)
      items.push(`10~20대 비중 ${pct(young)} — 트렌디 콘텐츠 적합`);
    else if (young < 0.2 && age.length > 2)
      items.push("30대 이상 시청자 우세 — 정보성·심층 콘텐츠 선호");
  }

  if (gender.length > 0) {
    const male   = gender.find(g => g.key.toLowerCase() === "male");
    const female = gender.find(g => g.key.toLowerCase() === "female");

    if (male && male.ratio > 0.75)
      items.push(`남성 시청자 편향 ${pct(male.ratio)} — 여성 유입 확대 여지`);
    else if (female && female.ratio > 0.6)
      items.push(`여성 시청자 우세 ${pct(female.ratio)}`);
    else if (male && female)
      items.push(`남${pct(male.ratio)} / 여${pct(female.ratio)} — 균형 분포`);
  }

  if (items.length === 0)
    items.push("시청자 데이터 수집 중");

  return items;
}

export function generateAudienceActions(
  age:    DimensionRow[],
  gender: DimensionRow[],
): string[] {
  const actions: string[] = [];

  const young = age
    .filter(a => ["13-17", "18-24", "1317", "1824"].some(k =>
      a.key.replace(/\D/g, "").includes(k.replace(/\D/g, ""))
    ))
    .reduce((s, a) => s + a.ratio, 0);

  if (young > 0.5)
    actions.push("Shorts 콘텐츠 병행 제작 — 10~20대 확장");
  else
    actions.push("롱폼 심층 콘텐츠 강화 — 주요 연령층 선호도 대응");

  const male   = gender.find(g => g.key.toLowerCase() === "male");
  const female = gender.find(g => g.key.toLowerCase() === "female");

  if (male && male.ratio > 0.75)
    actions.push("여성 친화 키워드·썸네일 A/B 테스트 검토");
  else if (female && female.ratio > 0.6)
    actions.push("여성 커뮤니티 채널 콜라보 및 공유 유도");
  else
    actions.push("현재 타겟층 유지하며 부차 세그먼트 점진 확장");

  return actions;
}

// ─── 3. Video ─────────────────────────────────────────────────────────────────

export function generateVideoInsights(hitVideos: DimensionRow[]): string[] {
  const items: string[] = [];
  if (hitVideos.length === 0) return ["영상 데이터 수집 중"];

  const top = hitVideos[0];
  const topTitle = top.title ?? top.key;
  items.push(`#1 "${topTitle.length > 20 ? topTitle.slice(0, 20) + "…" : topTitle}" — 채널 최다 조회`);

  // 상위 3개 집중도
  if (hitVideos.length >= 3) {
    const top3Views = hitVideos.slice(0, 3).reduce((s, v) => s + v.views, 0);
    const totalViews = hitVideos.reduce((s, v) => s + v.views, 0);
    if (totalViews > 0) {
      const concentration = top3Views / totalViews;
      if (concentration > 0.6)
        items.push(`상위 3개 영상이 총 조회수의 ${pct(concentration)} 차지`);
    }
  }

  // 평균 시청시간
  const topDur = top.avgDurationSec;
  if (topDur && topDur > 0) {
    const m = Math.floor(topDur / 60);
    const s = Math.floor(topDur % 60);
    items.push(`인기 영상 평균 길이 ${m}분 ${String(s).padStart(2, "0")}초`);
  }

  return items;
}

export function generateVideoActions(hitVideos: DimensionRow[]): string[] {
  if (hitVideos.length === 0) return ["데이터 축적 후 재분석 권장"];

  const top = hitVideos[0];
  const topTitle = top.title ?? top.key;
  const actions: string[] = [];

  actions.push(
    `"${topTitle.length > 15 ? topTitle.slice(0, 15) + "…" : topTitle}" 시리즈 확장 — 후속편 기획`,
  );
  actions.push("인기 영상 제목·포맷을 신규 영상에 적용");

  // 좋아요율 체크
  if (top.views > 0 && top.likes != null) {
    const likeRatio = top.likes / top.views;
    if (likeRatio < 0.02)
      actions.push("영상 말미 좋아요 CTA 추가 (좋아요율 낮음)");
  }

  return actions;
}

// ─── 4. Traffic ───────────────────────────────────────────────────────────────

export function generateTrafficInsights(
  trafficSources: DimensionRow[],
  keywords:       DimensionRow[],
): string[] {
  const items: string[] = [];
  if (trafficSources.length === 0 && keywords.length === 0)
    return ["트래픽 데이터 수집 중"];

  const top = trafficSources[0];
  if (top) {
    const label = TRAFFIC_KO[top.key] ?? top.key;
    items.push(`주요 유입 경로: ${label} ${pct(top.ratio)}`);
  }

  const related = trafficSources.find(t => t.key === "RELATED_VIDEO");
  if (related && related.ratio > 0.4)
    items.push(`추천 알고리즘 트래픽 강함 ${pct(related.ratio)} — 연속 시청 유도 중`);

  const ytSearch = trafficSources.find(t => t.key === "YT_SEARCH");
  if (ytSearch && ytSearch.ratio > 0.35)
    items.push(`검색 유입 지배적 ${pct(ytSearch.ratio)} — SEO 최적화 효과`);

  const topKw = keywords[0];
  if (topKw && topKw.ratio > 0.1)
    items.push(`핵심 키워드 "${topKw.key}" — 검색 유입 기여 ${pct(topKw.ratio)}`);

  if (items.length === 0)
    items.push("유입 경로 분산 — 다채널 트래픽 구조");

  return items;
}

export function generateTrafficActions(
  trafficSources: DimensionRow[],
  keywords:       DimensionRow[],
): string[] {
  const actions: string[] = [];

  const related  = trafficSources.find(t => t.key === "RELATED_VIDEO");
  const ytSearch = trafficSources.find(t => t.key === "YT_SEARCH");
  const subscriber = trafficSources.find(t => t.key === "SUBSCRIBER");

  if (related && related.ratio > 0.3)
    actions.push("관련 영상 시리즈 확장 — 추천 알고리즘 최적화");

  if (ytSearch && ytSearch.ratio > 0.25)
    actions.push("제목·설명란에 핵심 키워드 반복 강화");

  const topKw = keywords[0];
  if (topKw && topKw.ratio > 0.1)
    actions.push(`"${topKw.key}" 전용 심층 영상 제작 검토`);

  if (subscriber && subscriber.ratio > 0.3)
    actions.push("구독자 알림 클릭율 향상 — 업로드 시간 최적화");

  if (actions.length === 0)
    actions.push("트래픽 소스 다변화 — SNS 공유·외부 유입 경로 확보");

  return actions;
}

// ─── 5. Trending Videos ───────────────────────────────────────────────────────

export function generateTrendingInsights(
  count:    number,
  topScore: number,
  topTitle: string,
): string[] {
  if (count === 0) return ["현재 급상승 영상 없음 — trend_score > 1.5 기준"];
  const items: string[] = [
    `${count}개 영상 급상승 중 — 최고 ${topScore}× 성장`,
  ];
  if (topTitle)
    items.push(`"${topTitle.length > 20 ? topTitle.slice(0, 20) + "…" : topTitle}" 가장 빠른 성장`);
  if (topScore >= 3)
    items.push("급격한 바이럴 신호 감지 — 알고리즘 최적화 작동 중");
  return items;
}

export function generateTrendingActions(
  count:    number,
  topScore: number,
  topTitle: string,
): string[] {
  if (count === 0) return ["콘텐츠 업로드 빈도 증가로 트렌드 신호 생성"];
  const actions: string[] = [
    "급상승 영상 포맷·길이·키워드 즉시 분석 후 복제 제작",
  ];
  if (topScore >= 3)
    actions.unshift(
      `"${topTitle.length > 15 ? topTitle.slice(0, 15) + "…" : topTitle}" 후속 영상 즉시 기획`,
    );
  if (count >= 3)
    actions.push("급상승 패턴 공통점 분석 → 시리즈 기획에 반영");
  return actions;
}

// ─── 6. TrafficCluster 전용 ───────────────────────────────────────────────────

export function generateClusterInsights(
  topLabel:     string,
  topRatio:     number,
  totalSources: number,
): string[] {
  if (!topLabel) return ["트래픽 데이터 수집 중"];
  const items: string[] = [
    `${topLabel} 경로가 주요 유입 (${pct(topRatio)})`,
  ];
  if (topRatio > 0.5)
    items.push("단일 경로 의존도 높음 — 트래픽 다변화 권장");
  else if (totalSources >= 4)
    items.push(`${totalSources}개 경로에서 고른 분산 — 안정적 유입 구조`);
  return items;
}

export function generateClusterActions(
  topLabel: string,
  topRatio: number,
): string[] {
  if (!topLabel) return ["SNS 공유 및 외부 링크로 유입 경로 다변화"];
  const actions: string[] = [];
  if (topLabel === "Algorithm" || topLabel === "Search")
    actions.push("최적화된 제목·태그 전략 유지 — 알고리즘·검색 경로 강화");
  else
    actions.push(`${topLabel} 경로 강화 — 전략적 콘텐츠 배포 계획 수립`);
  if (topRatio > 0.5)
    actions.push("유튜브 외 채널(SNS·블로그) 교차 프로모션 확대");
  return actions;
}

// ─── 8. Country ───────────────────────────────────────────────────────────────

export function generateCountryInsights(countries: DimensionRow[]): string[] {
  if (countries.length === 0) return ["국가별 데이터 수집 중"];
  const items: string[] = [];

  const top = countries[0];
  items.push(`${top.key} 최다 조회 — ${pct(top.ratio)}`);

  const top3Ratio = countries.slice(0, 3).reduce((s, c) => s + c.ratio, 0);
  if (top3Ratio > 0.8)
    items.push(`상위 3개국이 조회수의 ${pct(top3Ratio)} 차지 — 집중 분포`);
  else if (countries.length >= 5)
    items.push(`${countries.length}개국 분산 유입 — 글로벌 도달 양호`);

  const isKoreaTop = ["KR", "KOREA"].some(k => top.key.toUpperCase().includes(k));
  if (isKoreaTop && top.ratio > 0.5)
    items.push("한국 시청자 중심 채널 — 글로벌 확장 여지 있음");

  return items;
}

export function generateCountryActions(countries: DimensionRow[]): string[] {
  if (countries.length === 0) return ["국내외 SEO 키워드 최적화 후 재분석"];
  const actions: string[] = [];

  const top = countries[0];
  const isKoreaTop = ["KR", "KOREA"].some(k => top.key.toUpperCase().includes(k));

  if (isKoreaTop && top.ratio > 0.5)
    actions.push("영어 자막 추가 및 글로벌 키워드 적용 — 해외 유입 확대");
  else
    actions.push(`${top.key} 시청자 맞춤 콘텐츠 기획 — 현지 선호도 분석`);

  if (countries.length >= 5)
    actions.push("다국어 자막 지원 확대 — 분산된 해외 시청자 전환율 향상");

  if (actions.length === 0)
    actions.push("주요 국가 타겟 콘텐츠 전략 수립");

  return actions;
}

// ─── 9. Keywords ──────────────────────────────────────────────────────────────

export function generateKeywordsInsights(keywords: DimensionRow[]): string[] {
  if (keywords.length === 0) return ["검색 키워드 데이터 수집 중"];
  const items: string[] = [];

  const top = keywords[0];
  items.push(`핵심 키워드 "${top.key}" — 검색 유입 ${pct(top.ratio)}`);

  const strongKws = keywords.filter(k => k.ratio > 0.08);
  if (strongKws.length >= 3)
    items.push(`강세 키워드 ${strongKws.length}개 — SEO 분산 효과`);

  if (top.ratio > 0.3)
    items.push("단일 키워드 의존도 높음 — 다양화 필요");

  return items;
}

export function generateKeywordsActions(keywords: DimensionRow[]): string[] {
  if (keywords.length === 0) return ["제목·설명·태그에 핵심 키워드 적용 권장"];
  const actions: string[] = [];

  const top = keywords[0];
  actions.push(`"${top.key}" 키워드 제목·설명에 반복 강화`);

  const strongKws = keywords.filter(k => k.ratio > 0.08);
  if (strongKws.length >= 3)
    actions.push("강세 키워드별 전용 영상 기획 — 롱테일 SEO 확장");

  if (top.ratio > 0.3)
    actions.push("연관 키워드 태그 다변화 — 단일 키워드 의존도 낮추기");

  if (actions.length === 0)
    actions.push("상위 키워드 클러스터 분석 후 전략 수립");

  return actions;
}

// ─── 10. Device ───────────────────────────────────────────────────────────────

export function generateDeviceInsights(devices: DimensionRow[]): string[] {
  if (devices.length === 0) return ["기기 데이터 수집 중"];
  const items: string[] = [];

  const mobile  = devices.find(d => d.key.toUpperCase() === "MOBILE");
  const desktop = devices.find(d => d.key.toUpperCase() === "DESKTOP");
  const tv      = devices.find(d => d.key.toUpperCase() === "TV");

  if (mobile && mobile.ratio > 0.6)
    items.push(`모바일 시청 비율 높음 ${pct(mobile.ratio)} — 세로형 최적화 필요`);
  else if (mobile && mobile.ratio > 0.4)
    items.push(`모바일 유입 우세 ${pct(mobile.ratio)}`);

  if (tv && tv.ratio > 0.15)
    items.push(`TV 시청 비중 증가 ${pct(tv.ratio)} — 고해상도 대응 필요`);

  if (desktop && desktop.ratio > 0.4)
    items.push(`데스크탑 시청자 비중 높음 ${pct(desktop.ratio)} — 긴 콘텐츠 선호`);

  if (items.length === 0) {
    const top = devices[0];
    items.push(`${top.key} 기기가 주요 시청 환경 ${pct(top.ratio)}`);
  }

  return items;
}

export function generateDeviceActions(devices: DimensionRow[]): string[] {
  if (devices.length === 0) return ["반응형 썸네일·자막 최적화 권장"];
  const actions: string[] = [];

  const mobile  = devices.find(d => d.key.toUpperCase() === "MOBILE");
  const tv      = devices.find(d => d.key.toUpperCase() === "TV");
  const desktop = devices.find(d => d.key.toUpperCase() === "DESKTOP");

  if (mobile && mobile.ratio > 0.6)
    actions.push("썸네일 세로형 레이아웃 + 대형 텍스트 적용 (모바일 최적화)");

  if (tv && tv.ratio > 0.15)
    actions.push("썸네일 해상도 최소 1280×720 유지 (TV 대응)");

  if (desktop && desktop.ratio > 0.4)
    actions.push("롱폼 심층 콘텐츠 강화 — 데스크탑 시청자 체류시간 향상");

  if (actions.length === 0)
    actions.push("주요 기기 환경 맞춤 썸네일·자막 최적화");

  return actions;
}

// ─── 7. Opportunity (OpportunityEngine 전용) ──────────────────────────────────

export function generateOpportunityInsights(
  count:      number,
  topScore:   number,
  topTitle:   string,
  topReasons: string[],
): string[] {
  if (count === 0) return ["현재 기회 조건 미충족 — 데이터 축적 중"];

  const items: string[] = [
    `${count}개 콘텐츠 기회 감지 — 최고 점수 ${topScore}점`,
  ];

  if (topTitle)
    items.push(`최우선: "${topTitle.length > 20 ? topTitle.slice(0, 20) + "…" : topTitle}"`);

  if (topReasons.length > 0)
    items.push(`주요 신호: ${topReasons.slice(0, 2).join(", ")}`);

  if (topScore >= 70)
    items.push("고득점 기회 — 즉시 제작 전략 수립 권장");

  return items;
}

export function generateOpportunityActions(
  count:    number,
  topScore: number,
  topTitle: string,
): string[] {
  if (count === 0)
    return ["트렌드 키워드 모니터링 강화 후 재분석"];

  const actions: string[] = [
    "기회 점수 상위 영상의 제목·키워드 분석 후 신규 콘텐츠 기획",
    "트렌드 급상승 영상 포맷·길이 벤치마킹",
  ];

  if (topScore >= 70 && topTitle)
    actions.unshift(
      `"${topTitle.length > 15 ? topTitle.slice(0, 15) + "…" : topTitle}" 관련 시리즈 즉시 기획`,
    );

  return actions;
}
