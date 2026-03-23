// ─── ROADMAP CONSTANTS ────────────────────────────────────────────────────────
// RoadmapView + RoadmapPage 공용 — 수정 시 양쪽에 영향
import { T } from "../styles/tokens";

export const PHASES = [
  { id: "1", label: "1단계", name: "시스템 안정화", desc: "OS 구축, 파일 구조, 기본 엔진" },
  { id: "2", label: "2단계", name: "스토어 자동화", desc: "상품 등록, 주문 흐름, 자동화 파이프라인" },
  { id: "3", label: "3단계", name: "콘텐츠 확장",  desc: "콘텐츠 생산, 채널 확장, 편집 시스템" },
  { id: "4", label: "4단계", name: "팀 시스템화",  desc: "역할 분리, 위임 구조, 내부 프로토콜" },
];

export const DEFAULT_TEAMS = ["운영·개발팀", "콘텐츠팀", "데이터전략팀", "네이버스토어팀"];

export const STATUS_CONFIG = {
  planned: { label: "대기",   color: T.status.planned.text, bg: T.status.planned.bg },
  active:  { label: "진행중", color: T.status.active.text,  bg: T.status.active.bg  },
  blocked: { label: "보류",   color: T.status.blocked.text, bg: T.status.blocked.bg },
  done:    { label: "완료",   color: T.status.done.text,    bg: T.status.done.bg    },
};

export const TEAM_TAGS = ["콘텐츠팀", "네이버스토어팀", "데이터전략팀", "운영·개발팀"];
