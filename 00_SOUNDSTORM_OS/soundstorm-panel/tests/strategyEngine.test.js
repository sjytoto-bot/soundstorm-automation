// ─── strategyEngine.test.js ───────────────────────────────────────────────────
// computeGoldenHour 레벨별 스냅샷 + 비즈니스 룰 테스트
// npm run test

import { describe, it, expect } from "vitest";
import { computeGoldenHour } from "../src/engine/strategyEngine.js";

// ─── Mock 데이터 팩토리 ────────────────────────────────────────────────────────

// KST ISO 형식 업로드 날짜 생성 헬퍼
function kstDate(y, m, d, h = 20) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00+09:00`;
}

// reachRow 팩토리
function makeRow(videoId, publishedAt, views = 1000) {
  return { video_id: videoId, published_at: publishedAt, views, title: videoId };
}

// 금요일 18~20시에 집중된 업로드 데이터 (Lv.3 진입용 — 3개 이상 필요)
const LV3_REACH_ROWS = [
  makeRow("v1",  kstDate(2025, 3, 7,  19), 5000),   // 금요일 19시
  makeRow("v2",  kstDate(2025, 3, 14, 18), 4200),   // 금요일 18시
  makeRow("v3",  kstDate(2025, 3, 21, 19), 3800),   // 금요일 19시
  makeRow("v4",  kstDate(2025, 2, 28, 20), 3100),   // 금요일 20시
  makeRow("v5",  kstDate(2025, 3, 1,  15), 1200),   // 토요일 15시
  makeRow("v6",  kstDate(2025, 2, 22, 15), 900),    // 토요일 15시
];

// 날짜 전용 (시간 없음) — Lv.2 fallback 유도
const DATE_ONLY_REACH_ROWS = [
  { video_id: "d1", published_at: "2025-03-07", views: 5000, title: "d1" },
  { video_id: "d2", published_at: "2025-03-14", views: 4000, title: "d2" },
  { video_id: "d3", published_at: "2025-03-21", views: 3000, title: "d3" },
];

// kpiHistory — 4개 이상이면 Lv.2
const KPI_HISTORY_4 = [
  { date: "2025-01-01", views30d: 10000 },
  { date: "2025-02-01", views30d: 12000 },
  { date: "2025-03-01", views30d: 11500 },
  { date: "2025-03-15", views30d: 13000 },
];

// hourlyViews — 19시 피크
const HOURLY_VIEWS_19 = Array.from({ length: 24 }, (_, h) => ({
  hour: h,
  views: h === 19 ? 500 : h === 20 ? 300 : 50,
}));

// ─── 공통 shape 검증 헬퍼 ─────────────────────────────────────────────────────

const REQUIRED_KEYS = [
  "bestDay", "bestHour", "bestCount", "bestVideos", "peakHour",
  "secondaryDay", "secondaryHour", "secondaryCount",
  "leadTimeHours", "timezone", "confidence", "basis", "level", "days", "heatmapData",
];

function assertShape(result) {
  for (const key of REQUIRED_KEYS) {
    expect(result, `필드 누락: ${key}`).toHaveProperty(key);
  }
  expect([1, 2, 3, 4]).toContain(result.level);
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(typeof result.basis).toBe("string");
  expect(result.basis.length).toBeGreaterThan(0);
  expect(result.leadTimeHours).toBe(3);
  expect(result.timezone).toBe("KST (UTC+9)");
}

// ─── Level 1 ──────────────────────────────────────────────────────────────────

describe("computeGoldenHour — Lv.1 (휴리스틱)", () => {
  const result = computeGoldenHour([], [], []);

  it("GoldenHourResult shape을 완전히 반환한다", () => {
    assertShape(result);
  });

  it("level이 1이다", () => {
    expect(result.level).toBe(1);
  });

  it("confidence가 0.55이다", () => {
    expect(result.confidence).toBe(0.55);
  });

  it("bestDay와 bestHour가 null이 아니다", () => {
    expect(result.bestDay).not.toBeNull();
    expect(result.bestHour).not.toBeNull();
  });

  it("days 배열이 7개 요소를 갖는다", () => {
    expect(result.days).toHaveLength(7);
  });

  it("heatmapData가 undefined이다 (Lv.1에서는 없음)", () => {
    expect(result.heatmapData).toBeUndefined();
  });

  it("결과가 freeze되어 있다 (외부 변경 불가)", () => {
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ─── Level 1 + peakHour ───────────────────────────────────────────────────────

describe("computeGoldenHour — Lv.1 + hourlyViews", () => {
  const result = computeGoldenHour([], [], HOURLY_VIEWS_19);

  it("peakHour가 19시 시간대 문자열이다", () => {
    expect(result.peakHour).toBe("19:00~21:00");
  });
});

// ─── Level 2 ──────────────────────────────────────────────────────────────────

describe("computeGoldenHour — Lv.2 (kpiHistory 보정)", () => {
  const result = computeGoldenHour(KPI_HISTORY_4, DATE_ONLY_REACH_ROWS, []);

  it("GoldenHourResult shape을 완전히 반환한다", () => {
    assertShape(result);
  });

  it("level이 2이다", () => {
    expect(result.level).toBe(2);
  });

  it("confidence가 0.72이다", () => {
    expect(result.confidence).toBe(0.72);
  });

  it("bestCount가 null이 아니다 (날짜 전용 데이터에서도 요일 집계됨)", () => {
    expect(result.bestCount).not.toBeNull();
    expect(result.bestCount).toBeGreaterThan(0);
  });

  it("bestVideos가 배열이다", () => {
    expect(Array.isArray(result.bestVideos)).toBe(true);
  });

  it("heatmapData가 undefined이다", () => {
    expect(result.heatmapData).toBeUndefined();
  });

  it("결과가 freeze되어 있다", () => {
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ─── Level 2 + peakHour ───────────────────────────────────────────────────────

describe("computeGoldenHour — Lv.2 + hourlyViews", () => {
  const result = computeGoldenHour(KPI_HISTORY_4, DATE_ONLY_REACH_ROWS, HOURLY_VIEWS_19);

  it("peakHour가 존재한다", () => {
    expect(result.peakHour).not.toBeNull();
    expect(result.peakHour).toBe("19:00~21:00");
  });

  it("level은 여전히 2이다 (hourlyViews는 레벨 승격 조건 아님)", () => {
    expect(result.level).toBe(2);
  });
});

// ─── Level 3 ──────────────────────────────────────────────────────────────────

describe("computeGoldenHour — Lv.3 (heatmap)", () => {
  const result = computeGoldenHour([], LV3_REACH_ROWS, []);

  it("GoldenHourResult shape을 완전히 반환한다", () => {
    assertShape(result);
  });

  it("level이 3이다", () => {
    expect(result.level).toBe(3);
  });

  it("confidence가 0보다 크고 0.9 이하이다 (log(n+1)/5 공식 기반)", () => {
    // 6개 샘플 → log(7)/5 ≈ 0.389, 공식 범위 검증
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });

  it("bestCount가 null이 아니다", () => {
    expect(result.bestCount).not.toBeNull();
    expect(result.bestCount).toBeGreaterThan(0);
  });

  it("bestDay가 금요일이다 (데이터 기반)", () => {
    expect(result.bestDay).toBe("금요일");
  });

  it("heatmapData가 존재한다 (Lv.3+ 필수)", () => {
    expect(result.heatmapData).toBeDefined();
  });

  it("결과가 freeze되어 있다", () => {
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ─── Level 4 ──────────────────────────────────────────────────────────────────

describe("computeGoldenHour — Lv.4 (heatmap × peak 결합)", () => {
  const result = computeGoldenHour([], LV3_REACH_ROWS, HOURLY_VIEWS_19);

  it("GoldenHourResult shape을 완전히 반환한다", () => {
    assertShape(result);
  });

  it("level이 4이다", () => {
    expect(result.level).toBe(4);
  });

  it("confidence가 Lv.3보다 높다 (peak 보정 +0.05)", () => {
    const lv3 = computeGoldenHour([], LV3_REACH_ROWS, []);
    expect(result.confidence).toBeGreaterThan(lv3.confidence);
  });

  it("peakHour가 19시 시간대이다", () => {
    expect(result.peakHour).toBe("19:00~21:00");
  });

  it("heatmapData가 존재한다", () => {
    expect(result.heatmapData).toBeDefined();
  });

  it("결과가 freeze되어 있다", () => {
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ─── 레벨 승격 경로 검증 ──────────────────────────────────────────────────────

describe("레벨 승격 조건", () => {
  it("reachRows < 3개면 Lv.3 진입 안 함", () => {
    const twoRows = LV3_REACH_ROWS.slice(0, 2);
    const result = computeGoldenHour([], twoRows, []);
    expect(result.level).toBeLessThan(3);
  });

  it("kpiHistory < 4개면 Lv.2 진입 안 함", () => {
    const threeKpi = KPI_HISTORY_4.slice(0, 3);
    const result = computeGoldenHour(threeKpi, [], []);
    expect(result.level).toBe(1);
  });

  it("reachRows가 충분하면 kpiHistory 개수 무관하게 Lv.3+ 진입", () => {
    const result = computeGoldenHour(KPI_HISTORY_4, LV3_REACH_ROWS, []);
    expect(result.level).toBeGreaterThanOrEqual(3);
  });
});

// ─── 불변성 검증 ──────────────────────────────────────────────────────────────

describe("반환값 불변성", () => {
  it("반환값에 직접 대입하면 strict mode에서 throw 또는 조용히 무시된다", () => {
    const result = computeGoldenHour([], [], []);
    // frozen object에 대한 쓰기는 strict mode에서 TypeError
    expect(() => {
      "use strict";
      result.bestDay = "강제 변경";
    }).toThrow();
  });
});
