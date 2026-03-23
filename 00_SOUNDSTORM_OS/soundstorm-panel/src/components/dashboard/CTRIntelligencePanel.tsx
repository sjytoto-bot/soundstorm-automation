// ─── CTRIntelligencePanel ─────────────────────────────────────────────────────
// CTR 인텔리전스 패널: 썸네일 스타일 성능 + 영상 진단 + 레퍼런스 영상
//
// 3열 구조 (각 열 독립 스크롤):
//   Left  — ThumbnailStyles  : weighted CTR 바 차트
//   Center — VideoDiagnostics : 진단 배지 + 신뢰도
//   Right  — ReferenceVideos  : 레퍼런스 점수 랭킹

import { BarChart2, AlertCircle, Trophy } from "lucide-react";
import { T } from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { DIAGNOSIS_LABEL, DIAGNOSIS_ACTION, REFERENCE_WHY_LABEL } from "@/constants/diagnosisMap";
import { getSafeTitle } from "@/utils/videoTitle";

// ─── 썸네일 스타일 태그 한글화 ────────────────────────────────────────────────

const STYLE_TAG_KO: Record<string, string> = {
  high_contrast:  "고대비",
  dark:           "다크",
  bright:         "밝은",
  minimal:        "미니멀",
  mini:           "미니",
  text_overlay:   "텍스트 오버레이",
  text:           "텍스트",
  neutral:        "뉴트럴",
  red_dominant:   "레드 강조",
  colorful:       "컬러풀",
  face_close:     "클로즈업",
  face:           "얼굴",
  thumbnail:      "썸네일",
  warm:           "따뜻한",
  cool:           "쿨톤",
  gradient:       "그라데이션",
  simple:         "심플",
  bold:           "볼드",
};

function styleTagToKo(tag: string): string {
  return tag
    .split(",")
    .map(seg => {
      const s = seg.trim();
      return STYLE_TAG_KO[s] ?? s;
    })
    .join(", ");
}

// ─── 진단 뱃지 스타일 ─────────────────────────────────────────────────────────

const DIAG_MAP: Record<string, { bg: string; color: string; label: string }> = {
  NORMAL:                     { bg: T.successBg, color: T.success,  label: DIAGNOSIS_LABEL["NORMAL"]                     },
  THUMBNAIL_WEAK:             { bg: T.dangerBg,  color: T.danger,   label: DIAGNOSIS_LABEL["THUMBNAIL_WEAK"]             },
  TITLE_DISCOVERY_WEAK:       { bg: T.warnBg,    color: T.warn,     label: DIAGNOSIS_LABEL["TITLE_DISCOVERY_WEAK"]       },
  CONTENT_RETENTION_WEAK:     { bg: T.warnBg,    color: T.warn,     label: DIAGNOSIS_LABEL["CONTENT_RETENTION_WEAK"]     },
  ALGORITHM_DISTRIBUTION_LOW: { bg: T.primarySoft, color: T.primary,  label: DIAGNOSIS_LABEL["ALGORITHM_DISTRIBUTION_LOW"] },
};

function diagStyle(d: string) {
  return DIAG_MAP[d] ?? { bg: T.bgSection, color: T.sub, label: d.slice(0, 6) };
}

// ─── PanelColumn ──────────────────────────────────────────────────────────────

function PanelColumn({
  icon,
  title,
  badge,
  children,
}: {
  icon:     React.ReactNode;
  title:    string;
  badge?:   string | number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.md }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <span style={{ color: T.primary, display: "flex", alignItems: "center" }}>
          {icon}
        </span>
        <span style={{
          fontSize:      T.font.size.xs,
          fontFamily:    T.font.familyMono,
          fontWeight:    T.font.weight.bold,
          color:         T.sub,
          letterSpacing: "0.06em",
        }}>
          {title}
        </span>
        {badge != null && (
          <span style={{
            fontSize:     T.font.size.xs,
            fontFamily:   T.font.familyMono,
            color:        T.muted,
            background:   T.bgSection,
            borderRadius: T.radius.badge,
            padding:      `0px ${T.spacing.xs}px`,
          }}>
            {badge}
          </span>
        )}
      </div>

      {/* 콘텐츠 */}
      {children}
    </div>
  );
}

// ─── ThumbnailStylesColumn ────────────────────────────────────────────────────

function ThumbnailStylesColumn() {
  const { thumbnailStyles } = useAnalyticsContext();

  if (thumbnailStyles.length === 0) {
    return (
      <PanelColumn icon={<BarChart2 size={14} />} title="썸네일 스타일 성과">
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>데이터 없음</span>
      </PanelColumn>
    );
  }

  const maxCtr = Math.max(...thumbnailStyles.map(s => s.weightedCtr), 0.001);

  return (
    <PanelColumn
      icon={<BarChart2 size={14} />}
      title="썸네일 스타일 성과"
      badge={thumbnailStyles.length}
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {thumbnailStyles.map((s, i) => (
          <li key={s.style} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* 스타일명 + CTR 수치 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
                <span style={{
                  fontSize:   T.font.size.xs,
                  fontFamily: T.font.familyMono,
                  color:      T.muted,
                  minWidth:   16,
                }}>
                  {i + 1}.
                </span>
                <span style={{
                  fontSize:   T.font.size.xs,
                  color:      T.text,
                  fontWeight: T.font.weight.medium,
                  maxWidth:   120,
                  overflow:   "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {styleTagToKo(s.style)}
                </span>
                <span style={{
                  fontSize:   T.font.size.xs,
                  color:      T.muted,
                  fontFamily: T.font.familyMono,
                }}>
                  ×{s.videos}
                </span>
              </div>
              <span style={{
                fontSize:   T.font.size.xs,
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color:      i === 0 ? T.success : T.sub,
              }}>
                {(s.weightedCtr * 100).toFixed(1)}%
              </span>
            </div>

            {/* CTR 바 */}
            <div style={{
              height:       T.component.size.progressSm,
              background:   T.borderSoft,
              borderRadius: T.radius.pill,
              overflow:     "hidden",
            }}>
              <div style={{
                height:       "100%",
                width:        `${(s.weightedCtr / maxCtr) * 100}%`,
                background:   i === 0 ? T.success : T.primary,
                borderRadius: T.radius.pill,
                opacity:      i === 0 ? 1 : 0.5 + (0.4 * (1 - i / thumbnailStyles.length)),
                transition:   `width ${T.motion.base}`,
              }} />
            </div>
          </li>
        ))}
      </ul>
    </PanelColumn>
  );
}

// ─── VideoDiagnosticsColumn ───────────────────────────────────────────────────

function VideoDiagnosticsColumn({ onVideoClick }: { onVideoClick?: (videoId: string) => void }) {
  const { videoDiagnostics } = useAnalyticsContext();

  if (videoDiagnostics.length === 0) {
    return (
      <PanelColumn icon={<AlertCircle size={14} />} title="영상 문제 진단">
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>데이터 없음</span>
      </PanelColumn>
    );
  }

  // NORMAL이 아닌 것 먼저, 그 다음 NORMAL (confidence DESC)
  const sorted = [...videoDiagnostics].sort((a, b) => {
    const aNormal = a.diagnosis === "NORMAL" ? 1 : 0;
    const bNormal = b.diagnosis === "NORMAL" ? 1 : 0;
    if (aNormal !== bNormal) return aNormal - bNormal;
    return b.confidence - a.confidence;
  });

  // 상위 10개만 표시
  const displayed = sorted.slice(0, 10);

  const abnormalCount = videoDiagnostics.filter(v => v.diagnosis !== "NORMAL").length;

  return (
    <PanelColumn
      icon={<AlertCircle size={14} />}
      title="영상 문제 진단"
      badge={abnormalCount > 0 ? `${abnormalCount} 주의` : videoDiagnostics.length}
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {displayed.map(v => {
          const ds  = diagStyle(v.diagnosis);
          const key = v.videoId;

          return (
            <li
              key={key}
              onClick={() => onVideoClick?.(v.videoId)}
              style={{
                padding:       `${T.spacing.xs}px ${T.spacing.sm}px`,
                borderRadius:  T.radius.btn,
                border:        `1px solid ${T.borderSoft}`,
                background:    T.bgCard,
                cursor:        onVideoClick ? "pointer" : "default",
                display:       "flex",
                alignItems:    "center",
                gap:           T.spacing.sm,
                transition:    `background ${T.motion.duration}`,
                userSelect:    "none",
              }}
              onMouseEnter={e => { if (onVideoClick) (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.bgCard; }}
            >
              {/* 진단 배지 */}
              <span style={{
                display:      "inline-flex",
                alignItems:   "center",
                padding:      `0 ${T.spacing.xs}px`,
                fontSize:     T.font.size.xxs,
                fontFamily:   T.font.familyMono,
                fontWeight:   T.font.weight.bold,
                color:        ds.color,
                background:   ds.bg,
                borderRadius: T.radius.badge,
                whiteSpace:   "nowrap",
                flexShrink:   0,
              }}>
                {ds.label}
              </span>

              {/* 영상 제목 (없으면 videoId fallback) */}
              <span style={{
                flex:         1,
                fontSize:     T.font.size.xs,
                color:        T.sub,
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}>
                {getSafeTitle(v.title)}
              </span>

              {/* CTR */}
              <span style={{
                fontSize:   T.font.size.xs,
                fontFamily: T.font.familyMono,
                color:      T.muted,
                flexShrink: 0,
              }}>
                {(v.ctr * 100).toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </PanelColumn>
  );
}

// ─── ReferenceVideosColumn ────────────────────────────────────────────────────

function ReferenceVideosColumn({ onVideoClick }: { onVideoClick?: (videoId: string) => void }) {
  const { referenceVideos } = useAnalyticsContext();

  if (referenceVideos.length === 0) {
    return (
      <PanelColumn icon={<Trophy size={14} />} title="성공 레퍼런스 영상">
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>데이터 없음</span>
      </PanelColumn>
    );
  }

  const maxScore = Math.max(...referenceVideos.map(v => v.score), 0.001);

  return (
    <PanelColumn
      icon={<Trophy size={14} />}
      title="성공 레퍼런스 영상"
      badge={`TOP ${referenceVideos.length}`}
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
        {referenceVideos.map((v, i) => (
          <li
            key={v.videoId}
            onClick={() => onVideoClick?.(v.videoId)}
            style={{
              display:    "flex",
              flexDirection: "column",
              gap:        3,
              cursor:     onVideoClick ? "pointer" : "default",
              borderRadius: T.radius.btn,
              padding:    `2px ${T.spacing.xs}px`,
              transition: `background ${T.motion.duration}`,
            }}
            onMouseEnter={e => { if (onVideoClick) (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            {/* 영상 행 */}
            <div style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", alignItems: "center", gap: T.spacing.sm }}>
              {/* 순위 */}
              <span style={{
                fontSize:   T.font.size.xs,
                fontFamily: T.font.familyMono,
                color:      i === 0 ? T.warn : T.muted,
                fontWeight: i === 0 ? T.font.weight.bold : T.font.weight.regular,
              }}>
                {i + 1}
              </span>

              {/* 영상 제목 + why */}
              <div style={{ overflow: "hidden" }}>
                <div style={{
                  fontSize:     T.font.size.xs,
                  color:        T.sub,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                }}>
                  {getSafeTitle(v.title)}
                </div>
                {v.why && (
                  <div style={{
                    fontSize:     T.font.size.xxs,
                    color:        T.muted,
                    overflow:     "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace:   "nowrap",
                    marginTop:    1,
                  }}>
                    {REFERENCE_WHY_LABEL[v.why] ?? v.why}
                  </div>
                )}
              </div>

              {/* 스코어 + CTR */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{
                  fontSize:   T.font.size.xs,
                  fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.bold,
                  color:      i === 0 ? T.warn : T.primary,
                }}>
                  {v.score.toFixed(2)}
                </div>
                <div style={{
                  fontSize:   T.font.size.xxs,
                  fontFamily: T.font.familyMono,
                  color:      T.muted,
                }}>
                  {(v.ctr * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* 점수 바 */}
            <div style={{
              height:       3,
              background:   T.borderSoft,
              borderRadius: T.radius.pill,
              overflow:     "hidden",
              marginLeft:   22,
            }}>
              <div style={{
                height:       "100%",
                width:        `${(v.score / maxScore) * 100}%`,
                background:   i === 0 ? T.warn : T.primary,
                borderRadius: T.radius.pill,
                opacity:      0.5 + 0.5 * (1 - i / referenceVideos.length),
                transition:   "width 0.3s",
              }} />
            </div>
          </li>
        ))}
      </ul>
    </PanelColumn>
  );
}

// ─── CTRIntelligencePanel (메인) ──────────────────────────────────────────────

export default function CTRIntelligencePanel({
  onVideoClick,
  compact = false,
}: {
  onVideoClick?: (videoId: string) => void;
  compact?:      boolean;
}) {
  const { videoDiagnostics, thumbnailStyles, referenceVideos, loadingAnalytics } = useAnalyticsContext();

  const hasAnyData =
    videoDiagnostics.length > 0 ||
    thumbnailStyles.length  > 0 ||
    referenceVideos.length  > 0;

  if (loadingAnalytics || !hasAnyData) return null;

  if (compact) {
    // 우측 패널 narrow 모드 — 카드 없이 1열 스택
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xl }}>
        <ThumbnailStylesColumn />
        <VideoDiagnosticsColumn onVideoClick={onVideoClick} />
        <ReferenceVideosColumn  onVideoClick={onVideoClick} />
      </div>
    );
  }

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      gap:           T.spacing.lg,
      boxShadow:     T.shadow.card,
    }}>
      {/* 패널 헤더 */}
      <span style={{
        fontSize:      T.font.size.xs,
        fontFamily:    T.font.familyMono,
        fontWeight:    T.font.weight.bold,
        color:         T.sub,
        letterSpacing: "0.08em",
      }}>
        CTR 인텔리전스
      </span>

      {/* 3열 그리드 */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:                 T.spacing.xl,
        alignItems:          "start",
      }}>
        <ThumbnailStylesColumn />
        <VideoDiagnosticsColumn onVideoClick={onVideoClick} />
        <ReferenceVideosColumn  onVideoClick={onVideoClick} />
      </div>
    </div>
  );
}
