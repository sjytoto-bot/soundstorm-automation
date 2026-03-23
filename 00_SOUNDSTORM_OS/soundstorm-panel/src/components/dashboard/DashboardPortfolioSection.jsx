// ─── DashboardPortfolioSection.jsx ───────────────────────────────────────────
// 채널 포트폴리오 섹션 — ChannelHealthCard
//
// 인기 영상 / 기회 영상은 RightSidePanel > topVideos / opportunity 섹션으로 이동됨
// GrowthPanel은 CHANNEL INSIGHT 확장 섹션으로 이동됨
//
// Props:
//   healthData — computeChannelHealth() 반환값

import ChannelHealthCard from "../youtube/ChannelHealthCard";

export default function DashboardPortfolioSection({ healthData }) {
  if (!healthData) return null;

  return <ChannelHealthCard healthData={healthData} />;
}
