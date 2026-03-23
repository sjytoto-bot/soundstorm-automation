import { describe, expect, it } from "vitest";
import { buildSelectedVideo } from "../src/lib/buildSelectedVideo";

describe("buildSelectedVideo", () => {
  it("dataLastUpdated는 VideoTrend latest date를 reach timestamp보다 우선한다", () => {
    const result = buildSelectedVideo(
      "video1234567",
      [],
      [{
        video_id: "video1234567",
        title: "테스트 영상",
        views: 1000,
        likes: 10,
        watchTimeMin: 100,
        avgDurationSec: 90,
        impressions: 5000,
        ctr: 0.05,
        comments: 1,
        shares: 0,
        runtimeSec: 180,
        subscribersGained: 3,
        ctrUpdatedAt: "2026-03-20T10:00:00.000Z",
      }],
      [],
      [],
      {
        videoTrendMap: new Map([
          ["video1234567", [
            { date: "2026-03-18", views: 100 },
            { date: "2026-03-22", views: 200 },
          ]],
        ]),
      },
    );

    expect(result.dataLastUpdated).toBe("2026-03-22T00:00:00.000Z");
  });

  it("VideoTrend가 없으면 reach.ctrUpdatedAt으로 fallback한다", () => {
    const result = buildSelectedVideo(
      "video1234567",
      [],
      [{
        video_id: "video1234567",
        title: "테스트 영상",
        views: 1000,
        likes: 10,
        watchTimeMin: 100,
        avgDurationSec: 90,
        impressions: 5000,
        ctr: 0.05,
        comments: 1,
        shares: 0,
        runtimeSec: 180,
        subscribersGained: 3,
        ctrUpdatedAt: "2026-03-20T10:00:00.000Z",
      }],
      [],
      [],
    );

    expect(result.dataLastUpdated).toBe("2026-03-20T10:00:00.000Z");
  });
});
