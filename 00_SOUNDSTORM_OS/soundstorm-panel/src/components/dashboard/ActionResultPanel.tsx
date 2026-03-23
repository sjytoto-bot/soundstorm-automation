// ─── ActionResultPanel ─────────────────────────────────────────────────────────
// 최근 7일 액션 추적 결과를 표시하는 학습 피드백 패널.
//
// 데이터 소스: action_tracking.json (load-action-results IPC)
// 표시 기준: status === SUCCESS | FAILED, result 날짜가 7일 이내
// confidence: HIGH / MEDIUM / LOW — 외부 요인 간섭 가능성 표시

import { useEffect, useState } from "react";
import { T } from "../../styles/tokens";

interface ActionResult {
  video_id:        string;
  action_type:     string;
  problem_type?:   string;
  status:          "SUCCESS" | "FAILED";
  confidence:      "HIGH" | "MEDIUM" | "LOW";
  action_date:     string;
  result:          string;
  baseline?:       { impressions?: number; ctr?: number };
  current_metrics?: { impressions?: number; ctr?: number };
  linked_alert_key?: string | null;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH:   "HIGH",
  MEDIUM: "MED",
  LOW:    "LOW",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH:   T.success,
  MEDIUM: T.warn,
  LOW:    T.muted,
};

function metricDelta(entry: ActionResult): string {
  const prob     = entry.problem_type ?? entry.action_type ?? "";
  const baseline = entry.baseline ?? {};
  const current  = entry.current_metrics ?? {};

  if (prob === "CTR_WEAK" || prob.includes("CTR")) {
    const base = baseline.ctr;
    const cur  = current.ctr;
    if (base != null && cur != null) {
      const delta = ((cur - base) * 100).toFixed(1);
      return `CTR ${delta}%p`;
    }
  }
  if (baseline.impressions != null && current.impressions != null) {
    const ratio = ((current.impressions - baseline.impressions) / (baseline.impressions || 1) * 100).toFixed(0);
    return `노출 ${ratio}%`;
  }
  return "";
}

export default function ActionResultPanel() {
  const [results, setResults] = useState<ActionResult[]>([]);

  useEffect(() => {
    const api = (window as any).api;
    if (!api?.loadActionResults) return;
    api.loadActionResults()
      .then((data: ActionResult[]) => setResults(data ?? []))
      .catch(console.error);
  }, []);

  if (results.length === 0) return null;

  const successes = results.filter(r => r.status === "SUCCESS");
  const failures  = results.filter(r => r.status === "FAILED");

  // HIGH confidence 성공/실패만 TOP 항목으로 표시
  const topSuccess = successes.find(r => r.confidence === "HIGH") ?? successes[0];
  const topFailed  = failures.find(r => r.confidence === "HIGH")  ?? failures[0];

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       `${T.spacing.md}px ${T.spacing.lg}px`,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.md,
      boxShadow:     T.shadow?.card,
    }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{
          fontSize:      T.font.size.xs,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          fontFamily:    T.font.familyMono,
          letterSpacing: "0.08em",
        }}>
          액션 추적 결과
        </span>
        <span style={{ fontSize: T.font.size.xxs, color: T.muted, marginLeft: "auto" }}>
          최근 7일
        </span>
      </div>

      {/* 요약 카운트 */}
      <div style={{ display: "flex", gap: T.spacing.lg }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{ fontSize: T.font.size.base, color: T.success, fontWeight: T.font.weight.bold }}>
            {successes.length}
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.muted }}>SUCCESS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{ fontSize: T.font.size.base, color: T.danger, fontWeight: T.font.weight.bold }}>
            {failures.length}
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.muted }}>FAILED</span>
        </div>
      </div>

      {/* TOP 성공 */}
      {topSuccess && (
        <ResultRow
          label="TOP 성공"
          entry={topSuccess}
          accentColor={T.success}
          prefix="+"
        />
      )}

      {/* TOP 실패 */}
      {topFailed && (
        <ResultRow
          label="TOP 실패"
          entry={topFailed}
          accentColor={T.danger}
          prefix=""
        />
      )}

      {/* Action Type별 성과율 */}
      <ActionTypeStats results={results} />

      {/* 전체 목록 (최대 5건) */}
      {results.length > 0 && (
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           2,
          borderTop:     `1px solid ${T.borderSoft}`,
          paddingTop:    T.spacing.sm,
        }}>
          {results.slice(0, 5).map((r, i) => (
            <div key={i} style={{
              display:    "flex",
              alignItems: "center",
              gap:        T.spacing.sm,
              fontSize:   T.font.size.xs,
              color:      T.text,
            }}>
              <span style={{ color: r.status === "SUCCESS" ? T.success : T.danger, flexShrink: 0 }}>
                {r.status === "SUCCESS" ? "✓" : "✗"}
              </span>
              <span style={{
                fontSize:        T.font.size.xxs,
                fontWeight:      T.font.weight.bold,
                color:           CONFIDENCE_COLOR[r.confidence] ?? T.muted,
                fontFamily:      T.font.familyMono,
                border:          `1px solid ${CONFIDENCE_COLOR[r.confidence] ?? T.muted}`,
                borderRadius:    T.radius.badge,
                padding:         "0px 4px",
                flexShrink:      0,
                opacity:         0.85,
              }}>
                {CONFIDENCE_LABEL[r.confidence]}
              </span>
              <span style={{ color: T.sub, flexShrink: 0, fontSize: T.font.size.xxs }}>
                {r.action_type}
              </span>
              <span style={{ color: T.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.video_id}
              </span>
              <span style={{ color: T.muted, flexShrink: 0, fontSize: T.font.size.xxs }}>
                {metricDelta(r)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Action Type별 성과율 ─────────────────────────────────────────────────────

function ActionTypeStats({ results }: { results: ActionResult[] }) {
  // 집계: action_type → { success, total }
  const statsMap: Record<string, { success: number; total: number }> = {};
  for (const r of results) {
    const key = r.action_type || r.problem_type || "UNKNOWN";
    if (!statsMap[key]) statsMap[key] = { success: 0, total: 0 };
    statsMap[key].total += 1;
    if (r.status === "SUCCESS") statsMap[key].success += 1;
  }

  const entries = Object.entries(statsMap)
    .map(([type, { success, total }]) => ({
      type,
      success,
      total,
      rate: total > 0 ? Math.round(success / total * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  if (entries.length === 0) return null;

  return (
    <div style={{
      borderTop:  `1px solid ${T.borderSoft}`,
      paddingTop: T.spacing.sm,
      display:    "flex",
      flexDirection: "column",
      gap:        4,
    }}>
      <span style={{ fontSize: T.font.size.xxs, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em" }}>
        액션 유형별 성공률
      </span>
      {entries.map(({ type, success, total, rate }) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{ fontSize: T.font.size.xs, color: T.sub, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {type}
          </span>
          <span style={{ fontSize: T.font.size.xxs, color: T.muted, flexShrink: 0 }}>
            {success}/{total}
          </span>
          {/* 진행 바 */}
          <div style={{ width: 60, height: T.component.size.progressSm, background: T.bgSection, borderRadius: T.component.radius.rail, flexShrink: 0, overflow: "hidden" }}>
            <div style={{
              width:        `${rate}%`,
              height:       "100%",
              background:   rate >= 60 ? T.success : rate >= 30 ? T.warn : T.danger,
              borderRadius: T.component.radius.rail,
              transition:   `width ${T.motion.base}`,
            }} />
          </div>
          <span style={{
            fontSize:   T.font.size.xxs,
            fontWeight: T.font.weight.bold,
            color:      rate >= 60 ? T.success : rate >= 30 ? T.warn : T.danger,
            flexShrink: 0,
            minWidth:   28,
            textAlign:  "right",
          }}>
            {rate}%
          </span>
        </div>
      ))}
    </div>
  );
}


// ─── ResultRow ────────────────────────────────────────────────────────────────

function ResultRow({
  label,
  entry,
  accentColor,
  prefix,
}: {
  label:       string;
  entry:       ActionResult;
  accentColor: string;
  prefix:      string;
}) {
  const delta = metricDelta(entry);
  return (
    <div style={{
      background:   T.bgSection,
      borderRadius: T.radius.btn,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
    }}>
      <span style={{ fontSize: T.font.size.xxs, color: T.muted, flexShrink: 0, minWidth: 44 }}>
        {label}
      </span>
      <span style={{ fontSize: T.font.size.xs, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.action_type}
      </span>
      {delta && (
        <span style={{ fontSize: T.font.size.xs, color: accentColor, fontWeight: T.font.weight.bold, flexShrink: 0 }}>
          {prefix}{delta}
        </span>
      )}
      <span style={{
        fontSize:     T.font.size.xxs,
        fontWeight:   T.font.weight.bold,
        color:        CONFIDENCE_COLOR[entry.confidence] ?? T.muted,
        fontFamily:   T.font.familyMono,
        border:       `1px solid ${CONFIDENCE_COLOR[entry.confidence] ?? T.muted}`,
        borderRadius: T.radius.badge,
        padding:      "0px 4px",
        flexShrink:   0,
      }}>
        {CONFIDENCE_LABEL[entry.confidence]}
      </span>
    </div>
  );
}
