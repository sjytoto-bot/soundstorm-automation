// ─── ChannelStatusPanel ───────────────────────────────────────────────────────
// 채널 상태 요약 4-카드 + 드릴다운
//
// 인터랙션:
//   카드 클릭 → 해당 진단 영상 리스트 펼침
//   영상 행 클릭 → onSelectVideo(videoId) → VideoDetailModal 오픈
//
// Props:
//   topicMomentum  — (미사용, blockRegistry 하위호환)
//   onSelectVideo  — (videoId: string) => void

import { useState, useEffect } from "react";
import { ShieldAlert, ChevronDown, ChevronUp, Play } from "lucide-react";
import { T }           from "../../styles/tokens";
import { useAnalyticsContext } from "@/controllers/useAnalyticsController";
import { fetchVideoTitleMap } from "@/adapters/VideoTitleMapAdapter";
import type { VideoDiagnostic } from "@/adapters/VideoDiagnosticsAdapter";

// videoId 패턴 (11자리 영숫자/밑줄/하이픈) — title 필드가 videoId인 경우 걸러냄
const _VID_RE = /^[a-zA-Z0-9_-]{11}$/;

function resolveTitle(titleMap: Record<string, string>, diag: VideoDiagnostic): string {
  const mapped = titleMap[diag.videoId];
  if (mapped) return mapped;
  if (diag.trackName?.trim()) return diag.trackName.trim();
  const raw = (diag.title ?? "").trim();
  if (raw && !_VID_RE.test(raw)) return raw;
  return diag.videoId;
}

// ─── 진단 타입 정의 ────────────────────────────────────────────────────────────

const DIAG_ITEMS = [
  { label: "썸네일 개선 필요",   diagKey: "THUMBNAIL_WEAK",            color: T.danger,  bg: T.dangerBg   },
  { label: "검색 노출 부족",     diagKey: "TITLE_DISCOVERY_WEAK",      color: T.danger,  bg: T.dangerBg   },
  { label: "초반 몰입도 문제",   diagKey: "CONTENT_RETENTION_WEAK",    color: T.danger,  bg: T.dangerBg   },
  { label: "알고리즘 확산 부족", diagKey: "ALGORITHM_DISTRIBUTION_LOW", color: T.primary, bg: T.primarySoft },
] as const;

// ─── VideoRow ─────────────────────────────────────────────────────────────────

function VideoRow({
  diag,
  titleMap,
  onSelectVideo,
}: {
  diag:          VideoDiagnostic;
  titleMap:      Record<string, string>;
  onSelectVideo: (params: { videoId: string; diagnosis: string }) => void;
}) {
  const title = resolveTitle(titleMap, diag);

  return (
    <li
      onClick={() => onSelectVideo({ videoId: diag.videoId, diagnosis: diag.diagnosis })}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           T.spacing.sm,
        padding:       `${T.spacing.xs}px ${T.spacing.md}px`,
        cursor:        "pointer",
        borderRadius:  T.radius.btn,
        transition:    `background ${T.motion.duration}`,
        userSelect:    "none",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bgSection; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <Play size={10} color={T.muted} style={{ flexShrink: 0 }} />
      <span style={{
        flex:         1,
        fontSize:     T.font.size.xs,
        color:        T.text,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
      }}>
        {title}
      </span>
      {diag.ctr != null && diag.ctr > 0 && (
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          color:      diag.ctr < 0.03 ? T.danger : diag.ctr < 0.05 ? T.warn : T.sub,
          flexShrink: 0,
        }}>
          {(diag.ctr * 100).toFixed(1)}%
        </span>
      )}
      {diag.impressions != null && diag.impressions > 0 && (
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          color:      T.muted,
          flexShrink: 0,
        }}>
          {diag.impressions >= 1000
            ? `${(diag.impressions / 1000).toFixed(1)}K 노출`
            : `${diag.impressions} 노출`}
        </span>
      )}
    </li>
  );
}

// ─── ChannelStatusSection ─────────────────────────────────────────────────────

function ChannelStatusSection({
  diagnostics,
  onSelectVideo,
  onFocusDiagnosis,
}: {
  diagnostics:   VideoDiagnostic[];
  onSelectVideo?: (params: { videoId: string; diagnosis: string }) => void;
  onFocusDiagnosis?: (diagnosis: string) => void;
}) {
  const [openDiag, setOpenDiag] = useState<string | null>(null);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchVideoTitleMap().then(setTitleMap).catch(() => {});
  }, []);

  if (!diagnostics.length) return null;

  const counts = Object.fromEntries(
    DIAG_ITEMS.map(item => [item.diagKey, diagnostics.filter(d => d.diagnosis === item.diagKey).length])
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  function toggleDiag(diagKey: string, count: number) {
    if (count === 0 || !onSelectVideo) return;
    setOpenDiag(prev => (prev === diagKey ? null : diagKey));
    onFocusDiagnosis?.(diagKey);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.sm }}>

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <ShieldAlert size={12} color={total > 0 ? T.danger : T.muted} />
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
            채널 상태 요약
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>
            {diagnostics.length}개 분석
          </span>
          {total > 0
            ? <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.danger, background: T.dangerBg, borderRadius: T.radius.badge, padding: `0px ${T.spacing.sm}px` }}>{total} 이상</span>
            : <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.success, background: T.successBg, borderRadius: T.radius.badge, padding: `0px ${T.spacing.sm}px` }}>정상</span>
          }
        </div>
      </div>

      {/* 4-카드 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: T.spacing.sm }}>
        {DIAG_ITEMS.map(item => {
          const count    = counts[item.diagKey] ?? 0;
          const z        = count === 0;
          const isOpen   = openDiag === item.diagKey;
          const canClick = count > 0 && !!onSelectVideo;

          return (
            <div
              key={item.diagKey}
              onClick={() => toggleDiag(item.diagKey, count)}
              style={{
                display:       "flex",
                flexDirection: "column",
                padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
                background:    z ? T.bgSection : item.bg,
                borderRadius:  T.radius.btn,
                border:        `1px solid ${z ? T.borderSoft : item.color + "30"}`,
                gap:           T.spacing.xs,
                cursor:        canClick ? "pointer" : "default",
                transition:    `opacity ${T.motion.duration}`,
              }}
              onMouseEnter={e => { if (canClick) (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: T.font.size.xs, fontWeight: T.font.weight.semibold, color: z ? T.muted : T.text, lineHeight: T.font.lineHeight.tight }}>
                  {item.label}
                </span>
                {canClick && (
                  <span style={{ color: T.muted, flexShrink: 0 }}>
                    {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  </span>
                )}
              </div>
              <span style={{ fontSize: T.font.size.xl, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: z ? T.muted : item.color, lineHeight: 1 }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* 드릴다운: 선택된 진단 카드의 영상 리스트 */}
      {openDiag && onSelectVideo && (() => {
        const videos = diagnostics.filter(d => d.diagnosis === openDiag);
        const item   = DIAG_ITEMS.find(i => i.diagKey === openDiag);
        if (!videos.length || !item) return null;
        return (
          <div style={{
            background:   T.bgCard,
            border:       `1px solid ${item.color}30`,
            borderRadius: T.radius.btn,
            overflow:     "hidden",
          }}>
            {/* 드릴다운 헤더 */}
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        `${T.spacing.xs}px ${T.spacing.md}px`,
              borderBottom:   `1px solid ${T.borderSoft}`,
              background:     item.bg,
            }}>
              <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: item.color, letterSpacing: "0.06em" }}>
                {item.label} — {videos.length}개 영상
              </span>
              <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted }}>
                클릭 → 상세 보기
              </span>
            </div>
            {/* 영상 목록 */}
            <ul style={{ margin: 0, padding: `${T.spacing.xs}px 0`, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
              {videos.map(v => (
                <VideoRow key={v.videoId} diag={v} titleMap={titleMap} onSelectVideo={onSelectVideo} />
              ))}
            </ul>
          </div>
        );
      })()}

    </div>
  );
}

// ─── ChannelStatusPanel ───────────────────────────────────────────────────────

export default function ChannelStatusPanel({
  topicMomentum: _,
  onSelectVideo,
  onFocusDiagnosis,
}: {
  topicMomentum?: unknown[];
  onSelectVideo?: (params: { videoId: string; diagnosis: string }) => void;
  onFocusDiagnosis?: (diagnosis: string) => void;
} = {}) {
  const { videoDiagnostics, loadingAnalytics } = useAnalyticsContext();
  if (loadingAnalytics && !videoDiagnostics.length) return null;
  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      boxShadow:     T.shadow.card,
    }}>
      <ChannelStatusSection
        diagnostics={videoDiagnostics}
        onSelectVideo={onSelectVideo}
        onFocusDiagnosis={onFocusDiagnosis}
      />
    </div>
  );
}
