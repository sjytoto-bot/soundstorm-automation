// src/types/alertTypes.ts
// PHASE 10-E: auto_alert Task 공유 타입
// DashboardPage ↔ ExecutionPanel 순환 import 방지용 독립 모듈

export interface AutoAlertTask {
  id:                  string;
  video_id:            string;
  title:               string;
  priority:            "CRITICAL";
  status:              string;
  source:              "auto_alert";
  problem_type:        string;
  traffic_source_type: string;
  created_at:          string;
  linked_alert_key:    string;
  context_log?:        unknown[];
}
