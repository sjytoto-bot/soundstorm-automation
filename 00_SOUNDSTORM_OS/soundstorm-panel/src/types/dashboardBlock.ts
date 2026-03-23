// ─── Dashboard Block System ────────────────────────────────────────────────────
// Phase 1: 가시성 관리 + 순서 배열 기반 렌더링
// Phase 2: 순서 변경 (reorder — DnD 연결 준비 완료)

export type BlockId =
  | "execution"   // Content Execution: ActiveUploadMonitor + ExecutionPanel + ContentPackManager
  | "upload"      // Upload Assistant: ready 팩 업로드 가이드
  | "growth"      // Growth Loop Monitor: 크리에이터 성장 루프
  | "strategy"    // Content Strategy: TodayBrief + ChannelStatusPanel
  | "insight"     // Channel Insight: KPI + Analytics (HealthBar + GrowthPanel + AudienceTabs)
  | "thumbnailAnalyzer"; // ThumbnailAnalyzer

export interface BlockDef {
  id:      BlockId;
  label:   string;         // UI 표시명
  section: string | null;  // SectionLabel 헤더 (null = 이전 섹션에 포함)
  defaultVisible: boolean;
}

export const BLOCK_DEFS: readonly BlockDef[] = [
  { id: "insight",           label: "Channel Insight",   section: "CHANNEL INSIGHT",   defaultVisible: true  },
  { id: "execution",         label: "Content Execution", section: "CONTENT EXECUTION", defaultVisible: true  },
  { id: "upload",            label: "Upload Assistant",  section: null,                defaultVisible: true  },
  { id: "growth",            label: "Growth Loop",       section: null,                defaultVisible: true  },
  { id: "strategy",          label: "Content Strategy",  section: "CONTENT STRATEGY",  defaultVisible: true  },
  { id: "thumbnailAnalyzer", label: "ThumbnailAnalyzer", section: null,                defaultVisible: true  },
] as const;
