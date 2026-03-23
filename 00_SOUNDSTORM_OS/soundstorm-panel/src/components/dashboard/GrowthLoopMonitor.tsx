// ─── GrowthLoopMonitor (STAGE 6) ─────────────────────────────────────────────
// Creator Growth Loop 시각화 + Next Content Recommendation
//
// 입력: packs (ContentPack[]) + suggestedThemes (Theme Intelligence 출력)
// 출력:
//   ① Loop Pipeline — 9단계 시각화 (현재 어느 단계에 Pack이 있는지)
//   ② Status Flow   — 단계별 Pack 수 요약
//   ③ Next Opportunity — 다음 추천 테마 + "Pack 만들기" CTA
//
// 스타일: T.color.* (v1 namespace 의무)

import { useMemo } from "react";
import { Sparkles, ArrowRight, RotateCcw, RefreshCw, BarChart2, Plus, AlertTriangle } from "lucide-react";
import { T } from "../../styles/tokens";
import { useContentPackCtx } from "@/controllers/ContentPackContext";
import { calcPerformanceScore, scoreColor } from "@/engines/packPerformanceEngine";
import { analyzeHypotheses, type PatternResult } from "@/engines/hypothesisEngine";
import type { ContentPack, ContentPackStatus } from "@/core/types/contentPack";
import { parseSyncStatus } from "@/utils/syncStatus";
import { useSuggestedThemes } from "@/contexts/SuggestedThemesContext";
import { usePackDraft } from "@/contexts/PackDraftContext";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Props {
  /** null = 정상 | "SYNC_FAILED" | "STALE_SNAPSHOT:ISO" */
  syncError?: string | null;
}

// ─── Loop Stage 정의 (헌법 §3 Creator Growth Loop) ─────────────────────────────

interface LoopStage {
  id:       string;
  label:    string;
  short:    string;     // compact 표시용
  statuses: ContentPackStatus[];  // 연결된 Pack 상태
}

const LOOP_STAGES: LoopStage[] = [
  { id: "opportunity",  label: "기회 발굴",   short: "기회",    statuses: []               },
  { id: "theme",        label: "테마 선정",   short: "테마",    statuses: ["idea"]         },
  { id: "content",      label: "콘텐츠 팩",   short: "팩",      statuses: ["draft"]        },
  { id: "thumbnail",    label: "썸네일",      short: "썸네일",  statuses: ["ready"]        },
  { id: "upload",       label: "업로드",      short: "업로드",  statuses: ["uploaded"]     },
  { id: "analytics",    label: "성과 분석",   short: "데이터",  statuses: ["analyzing"]    },
  { id: "ext_traffic",  label: "외부 유입",   short: "트래픽",  statuses: []               },
  { id: "community",    label: "커뮤니티",    short: "커뮤니티", statuses: []              },
  { id: "next_opp",     label: "다음 기회",   short: "→ 기회",  statuses: []               },
];

// ─── 상태별 색상 ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ContentPackStatus, string> = {
  idea:      T.color.primary,
  draft:     T.color.warning,
  ready:     T.color.success,
  uploaded:  T.component.palette.ai,
  analyzing: T.color.warning,
};

// ─── LoopNode ─────────────────────────────────────────────────────────────────

function LoopNode({
  stage,
  count,
  isLast,
}: {
  stage:  LoopStage;
  count:  number;
  isLast: boolean;
}) {
  const isActive = count > 0;
  const isReturn = stage.id === "next_opp";

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        T.spacing.xs,
      flexShrink: 0,
    }}>
      {/* 노드 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: T.spacing.xs }}>
        <div style={{
          width:        32,
          height:       32,
          borderRadius: T.radius.pill,
          border:       `2px solid ${isActive ? T.color.primary : T.color.border}`,
          background:   isActive ? T.color.primarySoft : T.color.bgSection,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          position:     "relative",
          transition:   `all ${T.motion.duration}`,
          flexShrink:   0,
        }}>
          {isReturn
            ? <RotateCcw size={12} color={isActive ? T.color.primary : T.color.textMuted} />
            : <span style={{
                fontSize:   T.font.size.xxs,
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color:      isActive ? T.color.primary : T.color.textMuted,
                letterSpacing: "0.04em",
              }}>
                {LOOP_STAGES.indexOf(stage) + 1}
              </span>
          }

          {/* 활성 Pack 수 뱃지 */}
          {isActive && (
            <div style={{
              position:     "absolute",
              top:          -6,
              right:        -6,
              minWidth:     16,
              height:       16,
              borderRadius: T.radius.pill,
              background:   T.color.primary,
              color:        T.semantic.text.inverse,
              fontSize:     T.font.size.xxs,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.bold,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              padding:      `0 ${T.spacing.xs}px`,
            }}>
              {count}
            </div>
          )}
        </div>

        <span style={{
          fontSize:     T.font.size.xxs,
          fontFamily:   T.font.familyMono,
          fontWeight:   isActive ? T.font.weight.bold : T.font.weight.regular,
          color:        isActive ? T.color.textPrimary : T.color.textMuted,
          whiteSpace:   "nowrap",
          letterSpacing: "0.04em",
        }}>
          {stage.short}
        </span>
      </div>

      {/* 화살표 */}
      {!isLast && (
        <ArrowRight
          size={12}
          color={T.color.border}
          style={{ flexShrink: 0, marginBottom: T.spacing.lg + 4 }}
        />
      )}
    </div>
  );
}

// ─── StatusFlowBar ────────────────────────────────────────────────────────────

function StatusFlowBar({ packs }: { packs: ContentPack[] }) {
  const counts: Record<ContentPackStatus, number> = {
    idea: 0, draft: 0, ready: 0, uploaded: 0, analyzing: 0,
  };
  packs.forEach(p => { counts[p.status as ContentPackStatus]++; });

  const items: Array<{ status: ContentPackStatus; label: string }> = [
    { status: "idea",      label: "아이디어"  },
    { status: "draft",     label: "작업중"    },
    { status: "ready",     label: "자동화 완료" },
    { status: "uploaded",  label: "업로드 완료" },
    { status: "analyzing", label: "성과 수집중" },
  ];

  const total = packs.length;
  if (total === 0) return null;

  return (
    <div style={{
      display:   "flex",
      gap:       T.spacing.lg,
      flexWrap:  "wrap",
    }}>
      {items.map(({ status, label }) => {
        const n = counts[status];
        return (
          <div key={status} style={{
            display:    "flex",
            alignItems: "center",
            gap:        T.spacing.xs,
          }}>
            <div style={{
              width:        8,
              height:       8,
              borderRadius: T.radius.pill,
              background:   n > 0 ? STATUS_COLORS[status] : T.color.border,
            }} />
            <span style={{
              fontSize:   T.font.size.xxs,
              fontFamily: T.font.familyMono,
              fontWeight: n > 0 ? T.font.weight.bold : T.font.weight.regular,
              color:      n > 0 ? T.color.textPrimary : T.color.textMuted,
            }}>
              {label}
            </span>
            <span style={{
              fontSize:   T.font.size.xxs,
              fontFamily: T.font.familyMono,
              color:      n > 0 ? T.color.primary : T.color.textMuted,
              minWidth:   12,
            }}>
              {n}
            </span>
          </div>
        );
      })}

      <span style={{
        marginLeft: "auto",
        fontSize:   T.font.size.xxs,
        fontFamily: T.font.familyMono,
        color:      T.color.textMuted,
      }}>
        총 {total}개 팩
      </span>
    </div>
  );
}

// ─── NextOpportunitySection ───────────────────────────────────────────────────

function NextOpportunitySection({
  themes,
  analyzingThemes,
  onCreatePack,
}: {
  themes:          string[];
  analyzingThemes: string[];
  onCreatePack:    (t: string) => void;
}) {
  // analyzing 완료 Pack의 테마에서 파생 + Theme Intelligence 추천 합산
  const combined = [...new Set([...analyzingThemes, ...themes])].slice(0, 6);

  if (combined.length === 0) {
    return (
      <div style={{
        padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
        borderRadius: T.radius.btn,
        background:   T.color.bgSection,
        border:       `1px dashed ${T.color.border}`,
        textAlign:    "center",
      }}>
        <span style={{
          fontSize:  T.font.size.xs,
          color:     T.color.textMuted,
          fontFamily: T.font.familyMono,
        }}>
          콘텐츠 성과 데이터 축적 후 추천 생성
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.sm }}>
      {combined.map(theme => (
        <button
          key={theme}
          onClick={() => onCreatePack(theme)}
          title={`"${theme}" 테마로 새 Pack 생성`}
          style={{
            display:      "inline-flex",
            alignItems:   "center",
            gap:          T.spacing.xs,
            padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
            borderRadius: T.radius.pill,
            border:       `1px solid ${T.color.primary}40`,
            background:   T.color.primarySoft,
            color:        T.color.primary,
            fontSize:     T.font.size.sm,
            fontFamily:   T.font.familyMono,
            fontWeight:   T.font.weight.semibold,
            cursor:       "pointer",
            whiteSpace:   "nowrap" as const,
            transition:   `all ${T.motion.duration}`,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = T.color.primary;
            (e.currentTarget as HTMLElement).style.color = T.semantic.text.inverse;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = T.color.primarySoft;
            (e.currentTarget as HTMLElement).style.color = T.color.primary;
          }}
        >
          <Sparkles size={9} />
          {theme}
        </button>
      ))}
    </div>
  );
}

// ─── GrowthLoopMonitor (메인) ─────────────────────────────────────────────────

export default function GrowthLoopMonitor({ syncError = null }: Props) {
  const syncStatus      = parseSyncStatus(syncError);
  const { state, syncAllPerformance } = useContentPackCtx();
  const { packs }       = state;
  const suggestedThemes = useSuggestedThemes();
  const { setDraft }    = usePackDraft();

  const onCreatePack = (theme: string) =>
    setDraft({ theme, sourceHint: "growth_loop" });

  // 각 Loop Stage별 Pack 수 계산
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    LOOP_STAGES.forEach(s => { counts[s.id] = 0; });
    packs.forEach(pack => {
      LOOP_STAGES.forEach(stage => {
        if (stage.statuses.includes(pack.status)) {
          counts[stage.id]++;
        }
      });
    });
    return counts;
  }, [packs]);

  // analyzing 완료 → next_opp 노드 활성화
  const hasAnalyzing = packs.some(p => p.status === "analyzing");
  if (hasAnalyzing) stageCounts["next_opp"] = 1;

  // analyzing Pack의 테마 → next opportunity 입력
  const analyzingThemes = useMemo(() =>
    packs
      .filter(p => p.status === "analyzing")
      .map(p => p.theme)
      .filter(Boolean)
  , [packs]);

  // STAGE 7.5: Hypothesis Engine 분석
  const hypothesisInsight = useMemo(() => analyzeHypotheses(packs), [packs]);

  // 활성 Loop 수 (Pack이 진행 중인 단계 수)
  const activeStageCount = LOOP_STAGES.filter(s => stageCounts[s.id] > 0).length;

  return (
    <div style={{
      background:   T.color.bgPrimary,
      border:       `1px solid ${T.color.border}`,
      borderRadius: T.radius.card,
      overflow:     "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding:        `${T.spacing.md}px ${T.spacing.lg}px`,
        borderBottom:   `1px solid ${T.color.border}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <RotateCcw size={14} color={T.color.primary} />
          <span style={{
            fontSize:     T.font.size.sm,
            fontFamily:   T.font.familyMono,
            fontWeight:   T.font.weight.bold,
            color:        T.color.textPrimary,
            letterSpacing: "0.04em",
          }}>
            크리에이터 성장 루프
          </span>

          {activeStageCount > 0 && (
            <span style={{
              display:      "inline-flex",
              alignItems:   "center",
              padding:      `0 ${T.spacing.sm}px`,
              height:       18,
              borderRadius: T.radius.badge,
              background:   T.color.primarySoft,
              color:        T.color.primary,
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.bold,
            }}>
              {activeStageCount}개 단계 진행중
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{ fontSize: T.font.size.xs, color: T.color.textMuted, fontFamily: T.font.familyMono }}>
            {packs.length === 0 ? "팩 없음" : `${packs.length}개 팩 추적중`}
          </span>
          {packs.some(p => p.video_id) && (
            <button
              onClick={() => syncAllPerformance()}
              title="video_id 있는 전체 Pack 성과 수집"
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          T.spacing.xs,
                padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
                borderRadius: T.radius.btn,
                border:       `1px solid ${T.color.border}`,
                background:   T.color.bgSection,
                color:        T.color.textSecondary,
                fontSize:     T.font.size.xs,
                fontFamily:   T.font.familyMono,
                fontWeight:   T.font.weight.semibold,
                cursor:       "pointer",
                whiteSpace:   "nowrap" as const,
              }}
            >
              <RefreshCw size={9} />
              전체 성과 수집
            </button>
          )}
        </div>
      </div>

      {/* ── 빈 상태: 팩이 없을 때 ── */}
      {packs.length === 0 && (
        <div style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          gap:            T.spacing.md,
          padding:        `${T.spacing.xxl}px ${T.spacing.xl}px`,
          textAlign:      "center",
        }}>
          <div style={{
            width:        48,
            height:       48,
            borderRadius: T.radius.pill,
            border:       `2px dashed ${T.color.border}`,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
          }}>
            <RotateCcw size={20} color={T.color.textMuted} strokeWidth={1.5} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
            <span style={{
              fontSize:   T.font.size.sm,
              fontWeight: T.font.weight.semibold,
              color:      T.color.textSecondary,
            }}>
              콘텐츠 팩을 생성하면
            </span>
            <span style={{
              fontSize:   T.font.size.sm,
              fontWeight: T.font.weight.bold,
              color:      T.color.textPrimary,
            }}>
              크리에이터 성장 루프가 시작됩니다
            </span>
            <span style={{
              fontSize:   T.font.size.xs,
              color:      T.color.textMuted,
              marginTop:  T.spacing.xs,
            }}>
              테마 → 자동화 → 업로드 → 성과 분석 → 다음 기회
            </span>
          </div>
          <button
            onClick={() => onCreatePack("새 콘텐츠")}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.sm}px ${T.spacing.lg}px`,
              borderRadius: T.radius.btn,
              border:       `1px solid ${T.color.primary}50`,
              background:   T.color.primarySoft,
              color:        T.color.primary,
              fontSize:     T.font.size.xs,
              fontFamily:   T.font.familyBase,
              fontWeight:   T.font.weight.semibold,
              cursor:       "pointer",
              transition:   `all ${T.motion.duration} ${T.motion.easing}`,
            }}
          >
            <Plus size={13} />
            첫 콘텐츠 팩 만들기
          </button>
        </div>
      )}

      {packs.length > 0 && (
      <div style={{ padding: `${T.spacing.lg}px` }}>

        {/* ── Loop Pipeline ── */}
        <div style={{
          overflowX:  "auto",
          paddingBottom: T.spacing.xs,
          marginBottom:  T.spacing.lg,
        }}>
          <div style={{
            display:   "flex",
            alignItems: "flex-start",
            gap:       0,
            minWidth:  "max-content",
          }}>
            {LOOP_STAGES.map((stage, idx) => (
              <LoopNode
                key={stage.id}
                stage={stage}
                count={stageCounts[stage.id]}
                isLast={idx === LOOP_STAGES.length - 1}
              />
            ))}
          </div>
        </div>

        {/* ── Status Flow Summary ── */}
        {packs.length > 0 && (
          <div style={{ marginBottom: T.spacing.lg }}>
            <StatusFlowBar packs={packs} />
          </div>
        )}

        {/* ── Best Performing Pattern (STAGE 7.5 Hypothesis Engine) ── */}
        {hypothesisInsight.bestPatterns.length > 0 ? (
          <div style={{ marginBottom: T.spacing.lg }}>
            <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginBottom: T.spacing.sm }}>
              <BarChart2 size={11} color={T.color.primary} />
              <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.color.textSecondary, letterSpacing: "0.06em" }}>
                최고 성과 패턴
              </span>
              <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.color.textMuted }}>
                — {hypothesisInsight.experimentCount}개 실험 기반
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
              {hypothesisInsight.bestPatterns.slice(0, 3).map(pattern => {
                const color = scoreColor(pattern.avgScore);
                const { theme, thumbnailStyle, hookType, targetEmotion } = pattern.dimensions;
                return (
                  <div key={pattern.label} style={{
                    padding:      `${T.spacing.sm}px ${T.spacing.md}px`,
                    borderRadius: T.radius.btn,
                    background:   T.color.bgSection,
                    border:       `1px solid ${color}30`,
                    display:      "flex",
                    flexDirection: "column",
                    gap:          T.spacing.xs,
                  }}>
                    {/* 패턴 차원 태그 */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: T.spacing.xs, alignItems: "center" }}>
                      {theme && (
                        <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.color.textPrimary, background: T.color.bgSubtle, borderRadius: T.radius.badge, padding: `0 ${T.spacing.xs}px` }}>
                          {theme}
                        </span>
                      )}
                      {thumbnailStyle && (
                        <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.color.textSecondary, background: T.color.bgSubtle, borderRadius: T.radius.badge, padding: `0 ${T.spacing.xs}px` }}>
                          {thumbnailStyle}
                        </span>
                      )}
                      {hookType && (
                        <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.color.textSecondary, background: T.color.bgSubtle, borderRadius: T.radius.badge, padding: `0 ${T.spacing.xs}px` }}>
                          {hookType}
                        </span>
                      )}
                      {targetEmotion && (
                        <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.color.textSecondary, background: T.color.bgSubtle, borderRadius: T.radius.badge, padding: `0 ${T.spacing.xs}px` }}>
                          {targetEmotion}
                        </span>
                      )}
                      <div style={{ marginLeft: "auto", display: "flex", gap: T.spacing.sm, alignItems: "center", flexShrink: 0 }}>
                        {pattern.avgCtr > 0 && (
                          <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.color.textMuted }}>
                            CTR {(pattern.avgCtr * 100).toFixed(2)}%
                          </span>
                        )}
                        <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color, background: `${color}15`, borderRadius: T.radius.badge, padding: `0 ${T.spacing.xs}px` }}>
                          평균 {Math.round(pattern.avgScore)}
                        </span>
                        {/* sample size — 신뢰도의 핵심 */}
                        <span style={{
                          fontSize:     T.font.size.xxs,
                          fontFamily:   T.font.familyMono,
                          fontWeight:   T.font.weight.bold,
                          color:        pattern.packCount >= 3 ? T.color.success : T.color.textMuted,
                          background:   pattern.packCount >= 3 ? `${T.color.success}15` : T.color.bgSubtle,
                          borderRadius: T.radius.badge,
                          padding:      `0 ${T.spacing.xs}px`,
                        }}>
                          {pattern.packCount}개 실험
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : packs.filter(p => p.status === "analyzing" && p.performance).length > 0 ? (
          /* 가설 없이 성과만 있는 경우: 기본 성과 요약 */
          <div style={{ marginBottom: T.spacing.lg }}>
            <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginBottom: T.spacing.sm }}>
              <BarChart2 size={11} color={T.color.primary} />
              <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.color.textSecondary, letterSpacing: "0.06em" }}>
                성과 결과
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
              {packs.filter(p => p.status === "analyzing" && p.performance).map(pack => {
                const s = calcPerformanceScore(pack.performance!);
                const color = scoreColor(s.total);
                return (
                  <div key={pack.id} style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, padding: `${T.spacing.xs}px ${T.spacing.sm}px`, borderRadius: T.radius.btn, background: T.color.bgSection, border: `1px solid ${T.color.border}`, flexWrap: "wrap" }}>
                    <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.semibold, color: T.color.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pack.theme}
                    </span>
                    {pack.performance?.ctr !== undefined && (
                      <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: T.color.textMuted }}>
                        {(pack.performance.ctr * 100).toFixed(2)}% CTR
                      </span>
                    )}
                    {s.total > 0 && (
                      <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color, background: `${color}15`, borderRadius: T.radius.badge, padding: `0 ${T.spacing.xs}px` }}>
                        {s.total}점 · {s.grade}등급
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Next Opportunity ── */}
        <div>
          <div style={{
            display:       "flex",
            alignItems:    "center",
            gap:           T.spacing.xs,
            marginBottom:  T.spacing.sm,
          }}>
            <Sparkles size={11} color={T.color.primary} />
            <span style={{
              fontSize:     T.font.size.xxs,
              fontFamily:   T.font.familyMono,
              fontWeight:   T.font.weight.bold,
              color:        T.color.textSecondary,
              letterSpacing: "0.06em",
            }}>
              다음 기회
            </span>
            <span style={{
              fontSize:  T.font.size.xxs,
              color:     T.color.textMuted,
              fontFamily: T.font.familyMono,
            }}>
              — 클릭 시 새 팩 생성
            </span>
          </div>

          {/* 데이터 stale 경고 — 추천 정확도 저하 알림 */}
          {syncStatus.isStale && (
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          T.spacing.xs,
              padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
              borderRadius: T.radius.btn,
              background:   T.warnBg,
              border:       `1px solid ${T.component.palette.goldBorder}`,
              marginBottom: T.spacing.sm,
            }}>
              <AlertTriangle size={11} color={T.warn} />
              <span style={{
                fontSize:   T.font.size.xxs,
                fontFamily: T.font.familyMono,
                color:      T.component.palette.goldText,
              }}>
                추천 정확도 낮음 — {syncStatus.label} (데이터 동기화 필요)
              </span>
            </div>
          )}

          {/* 패턴 기반 추천 우선, 없으면 Theme Intelligence + analyzing 테마 fallback */}
          <NextOpportunitySection
            themes={
              hypothesisInsight.nextOpportunities.length > 0
                ? hypothesisInsight.nextOpportunities
                : [...analyzingThemes, ...suggestedThemes]
            }
            analyzingThemes={[]}
            onCreatePack={onCreatePack}
          />
        </div>
      </div>
      )}
    </div>
  );
}
