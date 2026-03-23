import { describe, expect, it } from "vitest";
import { getUnderperformingVideos } from "../src/lib/getUnderperformingVideos";

describe("getUnderperformingVideos", () => {
  const kpiHistory = [
    {
      date: "2026-03-20",
      subscribers: 1000,
      views30d: 50000,
      avgViews: 1000,
      watchTimeMin: 10000,
      subscriberChange: 12,
      algorithmScore: 60,
      estimatedRevenueUsd: 10,
      estimatedRevenueKrw: 14000,
    },
  ];

  it("최근 영상 10개 중 조회수/CTR 기준 미달 영상만 반환한다", () => {
    const result = getUnderperformingVideos({
      kpiHistory,
      videoDiagnostics: [
        {
          videoId: "video000001",
          title: "좋은 영상",
          ctr: 0.08,
          impressions: 10000,
          impressionsPrev: 9000,
          impressionsChange: 0.1,
          views: 1500,
          avgWatchTime: 120,
          retentionRate: 0.45,
          problemType: "NORMAL",
          trafficSourceType: "BROWSE",
          severity: "NONE",
          diagnosis: "NORMAL",
          confidence: 0.8,
          recommendation: "",
          rowIndex: 20,
        },
        {
          videoId: "video000002",
          title: "CTR 약한 영상",
          ctr: 0.03,
          impressions: 8000,
          impressionsPrev: 8500,
          impressionsChange: -0.05,
          views: 900,
          avgWatchTime: 100,
          retentionRate: 0.4,
          problemType: "CTR_WEAK",
          trafficSourceType: "BROWSE",
          severity: "HIGH",
          diagnosis: "THUMBNAIL_WEAK",
          confidence: 0.9,
          recommendation: "",
          rowIndex: 19,
        },
        {
          videoId: "video000003",
          title: "노출 감소 영상",
          ctr: 0.05,
          impressions: 3000,
          impressionsPrev: 6000,
          impressionsChange: -0.5,
          views: 700,
          avgWatchTime: 95,
          retentionRate: 0.38,
          problemType: "IMPRESSION_DROP",
          trafficSourceType: "BROWSE",
          severity: "HIGH",
          diagnosis: "ALGORITHM_DISTRIBUTION_LOW",
          confidence: 0.85,
          recommendation: "",
          rowIndex: 18,
        },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result.map(video => video.videoId)).toEqual(["video000003", "video000002"]);
    expect(result[0]?.reason).toBe("추천 노출 감소");
    expect(result[1]?.reason).toBe("클릭률 저조");
  });

  it("title이 videoId 형식이면 제목 없음으로 안전 처리한다", () => {
    const result = getUnderperformingVideos({
      kpiHistory,
      videoDiagnostics: [
        {
          videoId: "abc123DEF45",
          title: "abc123DEF45",
          ctr: 0.02,
          impressions: 2000,
          impressionsPrev: 2500,
          impressionsChange: -0.1,
          views: 500,
          avgWatchTime: 80,
          retentionRate: 0.3,
          problemType: "CTR_WEAK",
          trafficSourceType: "BROWSE",
          severity: "HIGH",
          diagnosis: "THUMBNAIL_WEAK",
          confidence: 0.9,
          recommendation: "",
          rowIndex: 10,
        },
      ],
    });

    expect(result[0]?.title).toBe("제목 없음");
  });

  it("최근 10개만 계산 대상으로 삼는다", () => {
    const videoDiagnostics = Array.from({ length: 12 }, (_, index) => ({
      videoId: `video${String(index).padStart(6, "0")}`,
      title: `영상 ${index}`,
      ctr: index < 2 ? 0.02 : 0.08,
      impressions: 5000,
      impressionsPrev: 5000,
      impressionsChange: 0,
      views: index < 2 ? 500 : 1500,
      avgWatchTime: 100,
      retentionRate: 0.4,
      problemType: index < 2 ? "CTR_WEAK" : "NORMAL",
      trafficSourceType: "BROWSE",
      severity: index < 2 ? "HIGH" : "NONE",
      diagnosis: index < 2 ? "THUMBNAIL_WEAK" : "NORMAL",
      confidence: 0.8,
      recommendation: "",
      rowIndex: index + 1,
    }));

    const result = getUnderperformingVideos({ videoDiagnostics, kpiHistory });

    expect(result).toHaveLength(0);
  });
});
