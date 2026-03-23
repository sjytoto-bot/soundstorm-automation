// ─── ExecutionCandidates ─────────────────────────────────────────────────────
// 업로드 후보 패널 (우측 그리드)
// 구조: MOMENTUM 후보 (드릴다운) — 스케줄 기반
// 콘텐츠 트렌드 / 추천 콘텐츠는 StrategyPanel > OpportunitySection으로 이동

import { useState } from "react";
import { ChevronDown, ChevronUp, Flame, TrendingUp } from "lucide-react";
import { T } from "../../styles/tokens";
import type {
  ScheduledVideo,
  UploadCandidate,
  CandidateInsight,
} from "@/controllers/useExecutionController";

interface Props {
  scheduledContent: ScheduledVideo[];
}

// ScheduledVideo → UploadCandidate(MOMENTUM) 변환
function toMomentumCandidate(v: ScheduledVideo): UploadCandidate {
  return {
    id:      v.videoId,
    type:    "MOMENTUM",
    title:   v.title,
    reason:  v.signal,
    insight: v.insight,
  };
}

// ─── 라벨 뱃지 ───────────────────────────────────────────────────────────────
// height 22px = inline-flex + align center + font 12px + padding 0 8px 자연 높이
function TypeBadge({ type }: { type: "HOT" | "MOMENTUM" }) {
  const isHot = type === "HOT";
  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:          3,
      padding:      `0 ${T.spacing.sm}px`,
      fontSize:     T.font.size.xs,
      fontFamily:   T.font.familyMono,
      fontWeight:   T.font.weight.bold,
      borderRadius: T.radius.btn,      // 6px
      whiteSpace:   "nowrap",
      flexShrink:   0,
      background:   "transparent",
      color:        isHot ? T.primary : T.sub,
      border:       isHot
        ? `1px solid ${T.primaryBorder}`
        : `1px solid ${T.border}`,
    }}>
      {isHot ? <Flame size={10} /> : <TrendingUp size={10} />}
      {isHot ? "HOT" : "모멘텀"}
    </span>
  );
}

// ─── Insight 드릴다운 (MOMENTUM 전용) ────────────────────────────────────────
const GROWTH_LABEL: Record<string, string> = {
  Exploding: "조회수 폭발", Growing: "조회수 성장", Steady: "안정적", Declining: "감소 중",
};
const MOMENTUM_LABEL: Record<string, string> = {
  Rising: "모멘텀 상승", Steady: "모멘텀 안정", Falling: "모멘텀 감소",
};

function MomentumDrilldown({ insight }: { insight: CandidateInsight }) {
  const rows: { label: string; value: string }[] = [];
  if (insight.strategyScore !== undefined) {
    const grade = insight.strategyGrade ? ` (${insight.strategyGrade})` : "";
    rows.push({ label: "전략 점수", value: `${insight.strategyScore}${grade}` });
  }
  if (insight.growthStatus)
    rows.push({ label: "조회 트렌드", value: GROWTH_LABEL[insight.growthStatus] ?? insight.growthStatus });
  if (insight.momentumStatus)
    rows.push({ label: "모멘텀", value: MOMENTUM_LABEL[insight.momentumStatus] ?? insight.momentumStatus });
  if (insight.topVideoViews) rows.push({ label: "유사 조회수", value: insight.topVideoViews });
  if (insight.ctr)           rows.push({ label: "CTR",        value: insight.ctr });
  if (insight.trafficSource) rows.push({ label: "주요 유입",  value: insight.trafficSource });
  if (insight.keywordGrowth) rows.push({ label: "키워드 성장", value: insight.keywordGrowth });

  if (rows.length === 0) {
    return (
      <div style={{ marginTop: T.spacing.sm, paddingTop: T.spacing.sm, borderTop: `1px solid ${T.borderSoft}` }}>
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>분석 데이터 준비 중</span>
      </div>
    );
  }
  return (
    <div style={{ marginTop: T.spacing.sm, paddingTop: T.spacing.sm, borderTop: `1px solid ${T.borderSoft}`, display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
        추천 근거
      </span>
      {rows.map(r => (
        <div key={r.label} style={{ display: "flex", gap: T.spacing.sm, alignItems: "baseline" }}>
          <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, minWidth: 72 }}>{r.label}</span>
          <span style={{ fontSize: T.font.size.xs, color: T.text, fontWeight: T.font.weight.medium }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── HOT 드릴다운 ─────────────────────────────────────────────────────────────
function HotDrilldown({ candidate }: { candidate: UploadCandidate }) {
  const actions = candidate.actions
    ? [...candidate.actions].sort((a, b) => a.priority - b.priority)
    : [];

  return (
    <div style={{ marginTop: T.spacing.sm, paddingTop: T.spacing.sm, borderTop: `1px solid ${T.borderSoft}`, display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
      {candidate.reason && (
        <p style={{ margin: 0, fontSize: T.font.size.xs, color: T.sub, lineHeight: T.font.lineHeight.normal, wordBreak: "keep-all" }}>
          {candidate.reason}
        </p>
      )}
      {actions.length > 0 && (
        <>
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em", marginTop: T.spacing.xs }}>
            실행 순서
          </span>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
            {actions.map(a => (
              <li key={a.priority} style={{ display: "flex", gap: T.spacing.sm, alignItems: "flex-start" }}>
                <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.primary, minWidth: 14, flexShrink: 0 }}>
                  {a.priority}.
                </span>
                <span style={{ fontSize: T.font.size.xs, color: T.sub, lineHeight: T.font.lineHeight.normal, wordBreak: "keep-all" }}>
                  {a.text}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// ─── CandidateCard ────────────────────────────────────────────────────────────
function CandidateCard({
  candidate,
  expanded,
  onToggle,
}: {
  candidate: UploadCandidate;
  expanded:  boolean;
  onToggle:  () => void;
}) {
  const isHot = candidate.type === "HOT";

  return (
    <li
      onClick={onToggle}
      style={{
        padding:       `${T.spacing.sm}px ${T.spacing.sm}px`,
        borderRadius:  T.radius.btn,
        border:        `1px solid ${T.borderSoft}`,
        background:    T.bgCard,
        cursor:        "pointer",
        display:       "flex",
        flexDirection: "column",
        transition:    `background ${T.motion.duration}`,
        userSelect:    "none",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bgCard; }}
    >
      {/* Header — grid: badge | title | chevron */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems:          "center",
        gap:                 T.spacing.sm,
      }}>
        <TypeBadge type={candidate.type} />
        <span style={{
          fontSize:     T.font.size.xs,
          color:        T.text,
          fontWeight:   T.font.weight.semibold,
          lineHeight:   T.font.lineHeight.tight,
          wordBreak:    "keep-all",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {candidate.title}
        </span>
        <span style={{ color: T.muted, flexShrink: 0 }}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </div>

      {/* Drilldown */}
      {expanded && isHot  && <HotDrilldown candidate={candidate} />}
      {expanded && !isHot && candidate.insight && <MomentumDrilldown insight={candidate.insight} />}
      {expanded && !isHot && !candidate.insight && (
        <div style={{ marginTop: T.spacing.sm, paddingTop: T.spacing.sm, borderTop: `1px solid ${T.borderSoft}` }}>
          <span style={{ fontSize: T.font.size.xs, color: T.muted }}>분석 데이터 준비 중</span>
        </div>
      )}
    </li>
  );
}

// ─── ExecutionCandidates (메인) ───────────────────────────────────────────────
export default function ExecutionCandidates({ scheduledContent }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const candidates: UploadCandidate[] = scheduledContent.map(toMomentumCandidate);

  function toggleCard(id: string) { setExpandedId(prev => prev === id ? null : id); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.sub,
        letterSpacing: "0.06em",
      }}>
        업로드 후보
      </span>

      {candidates.length > 0 ? (
        <ul style={{
          margin:        0,
          padding:       0,
          listStyle:     "none",
          display:       "flex",
          flexDirection: "column",
          gap:           T.spacing.xs,
          maxHeight:     300,
          overflowY:     "auto",
        }}>
          {candidates.map(c => (
            <CandidateCard
              key={c.id}
              candidate={c}
              expanded={expandedId === c.id}
              onToggle={() => toggleCard(c.id)}
            />
          ))}
        </ul>
      ) : (
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>
          업로드 후보 없음
        </span>
      )}
    </div>
  );
}
