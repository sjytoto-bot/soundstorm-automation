// ─── ActiveUploadMonitor.jsx ──────────────────────────────────────────────────
// GoldenHour Level 3 — 업로드 후 6시간 실시간 모니터링
//
// 48시간 이내 업로드된 영상의 현재 지표를 보여준다.
// api_data_shuttler.py가 생성한 active_uploads.json 기반.
//
// 목표 지표 (벤치마크: 척살 초기 성과 기준):
//   조회수  6시간: 200+
//   CTR     6시간: 5%+
//   좋아요  6시간: 15+
//
// Props: 없음 (IPC 직접 호출)

import { useEffect, useState } from "react";
import { Zap, Clock, TrendingUp } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 벤치마크 목표 ─────────────────────────────────────────────────────────────

const TARGETS = {
  views:    200,   // 6시간 기준
  ctr:      0.05,  // 5%
  likes:    15,
};

// ─── ProgressBar ──────────────────────────────────────────────────────────────

// value === null → 데이터 미수집 상태 (0%와 구분)
function ProgressBar({ label, value, target, format }) {
  const missing = value === null || value === undefined;
  const pct     = missing ? 0 : Math.min(Math.round((value / target) * 100), 100);
  const done    = !missing && pct >= 100;
  const color   = missing ? T.muted : done ? T.success : pct >= 60 ? T.warn : T.danger;

  return (
    <div style={{ marginBottom: T.spacing.sm }}>
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   3,
      }}>
        <span style={{ fontSize: 11, color: T.sub, fontWeight: 600 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <span style={{
            fontSize:   11,
            fontFamily: "monospace",
            fontWeight: 700,
            color,
          }}>
            {missing ? "수집 중" : format(value)}
          </span>
          {!missing && (
            <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
              / {format(target)}
            </span>
          )}
          {done && (
            <span style={{
              fontSize:     9,
              fontWeight:   800,
              color:        T.success,
              background:   T.successBg,
              borderRadius: T.radius.badge,
              padding:      "1px 4px",
              border:       `1px solid ${T.successBorder}`,
            }}>
              달성
            </span>
          )}
        </div>
      </div>
      <div style={{
        height:       5,
        background:   T.bgSection,
        borderRadius: T.radius.pill,
        overflow:     "hidden",
      }}>
        <div style={{
          height:       "100%",
          width:        missing ? "100%" : `${pct}%`,
          background:   missing ? T.bgSection : color,
          borderRadius: T.radius.pill,
          transition:   "width 0.3s ease",
          backgroundImage: missing
            ? `repeating-linear-gradient(90deg, ${T.border} 0px, ${T.border} 4px, transparent 4px, transparent 8px)`
            : "none",
        }} />
      </div>
    </div>
  );
}

// ─── UploadCard ───────────────────────────────────────────────────────────────

const STATUS_META = {
  COLLECTING: { label: "수집 중",  color: T.warn,    bg: T.warnBg    },
  READY:      { label: "CTR 확보", color: T.success, bg: T.successBg },
  STALE:      { label: "안정화",   color: T.muted,   bg: T.bgSection },
};

function UploadCard({ upload }) {
  const h      = upload.elapsed_hours;
  const phase  = h <= 1 ? "초기 (1시간)" : h <= 3 ? "성장 (3시간)" : h <= 6 ? "확산 (6시간)" : "안정화";
  const isHot  = h <= 6;
  const status = upload.status ?? (h <= 6 ? "COLLECTING" : "STALE");
  const sm     = STATUS_META[status] ?? STATUS_META.STALE;

  // 경과 시간에 따른 비례 목표 (6시간 기준)
  const scale  = Math.min(h / 6, 1);
  const vTarget = Math.max(Math.round(TARGETS.views * scale), 10);
  const lTarget = Math.max(Math.round(TARGETS.likes * scale), 1);

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${isHot ? T.successBorder : T.borderSoft}`,
      borderRadius: T.radius.card,
      padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
      marginBottom: T.spacing.sm,
    }}>
      {/* 헤더 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   T.spacing.sm,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize:     13,
            fontWeight:   700,
            color:        T.text,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {upload.title || upload.video_id}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexShrink: 0, marginLeft: T.spacing.sm }}>
          <span style={{
            fontSize:     10,
            fontFamily:   "monospace",
            fontWeight:   700,
            color:        sm.color,
            background:   sm.bg,
            borderRadius: T.radius.badge,
            padding:      "2px 6px",
            border:       `1px solid ${sm.color}22`,
          }}>
            {sm.label}
          </span>
          <span style={{
            fontSize:     10,
            fontFamily:   "monospace",
            fontWeight:   700,
            color:        isHot ? T.success : T.muted,
            background:   isHot ? T.successBg : T.bgSection,
            borderRadius: T.radius.badge,
            padding:      "2px 6px",
            border:       `1px solid ${isHot ? T.successBorder : T.borderSoft}`,
          }}>
            {phase}
          </span>
          <span style={{
            fontSize:   10,
            color:      T.muted,
            fontFamily: "monospace",
          }}>
            +{h}시간
          </span>
        </div>
      </div>

      {/* 진행률 바 */}
      <ProgressBar
        label="조회수"
        value={upload.views}
        target={vTarget}
        format={v => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}
      />
      <ProgressBar
        label="CTR"
        value={upload.ctr}
        target={TARGETS.ctr}
        format={v => `${(v * 100).toFixed(1)}%`}
      />
      <ProgressBar
        label="좋아요"
        value={upload.likes}
        target={lTarget}
        format={v => String(v)}
      />

      {/* 노출수 + CTR 소스 보조 표시 */}
      <div style={{ display: "flex", gap: T.spacing.sm, marginTop: T.spacing.xs }}>
        {upload.impressions != null && upload.impressions > 0 && (
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            노출 {upload.impressions.toLocaleString("ko-KR")}
          </span>
        )}
        {upload.ctr_source && upload.ctr_source !== "missing" && (
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            CTR 출처: {upload.ctr_source === "csv" ? "Studio CSV" : "Sheets"}
          </span>
        )}
        {upload.ctr_source === "missing" && (
          <span style={{ fontSize: 10, color: T.warn, fontFamily: "monospace" }}>
            CTR 미수집 — 다음 CSV 다운로드 시 갱신
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ActiveUploadMonitor ─────────────────────────────────────────────────────

export default function ActiveUploadMonitor() {
  const [uploads, setUploads] = useState([]);

  useEffect(() => {
    const api = window.api;
    if (!api?.readActiveUploads) return;

    api.readActiveUploads().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        // 경과 시간 짧은 순 정렬 (가장 최신 업로드가 위)
        setUploads([...data].sort((a, b) => a.elapsed_hours - b.elapsed_hours));
      }
    }).catch(() => {});
  }, []);

  if (uploads.length === 0) return null;

  const hotUploads = uploads.filter(u => u.elapsed_hours <= 6);
  const allUploads = uploads;

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1.5px solid ${T.successBorder}`,
      borderRadius: T.radius.card,
      padding:      `${T.spacing.md}px ${T.spacing.lg}px`,
      boxShadow:    T.shadow.card,
      gridColumn:   "span 12",
    }}>

      {/* 헤더 */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   T.spacing.md,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
          <Zap size={14} color={T.success} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
            업로드 모니터링
          </span>
          {hotUploads.length > 0 && (
            <span style={{
              fontSize:     10,
              fontWeight:   800,
              color:        T.success,
              background:   T.successBg,
              borderRadius: T.radius.badge,
              padding:      "2px 8px",
              border:       `1px solid ${T.successBorder}`,
              fontFamily:   "monospace",
            }}>
              6시간 이내 {hotUploads.length}개 활성
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs }}>
          <Clock size={10} color={T.muted} />
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            목표: 조회 200+ · CTR 5%+ · 좋아요 15+
          </span>
        </div>
      </div>

      {/* 업로드 카드 목록 */}
      {allUploads.map(u => (
        <UploadCard key={u.video_id} upload={u} />
      ))}

      {/* 안내 */}
      <div style={{
        marginTop:    T.spacing.sm,
        padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
        background:   T.bgSection,
        borderRadius: T.radius.badge,
        fontSize:     10,
        color:        T.muted,
        display:      "flex",
        alignItems:   "center",
        gap:          T.spacing.xs,
      }}>
        <TrendingUp size={10} color={T.muted} />
        업로드 후 6시간이 알고리즘 초기 배포 규모를 결정합니다. 지표가 목표 미달 시 커뮤니티·SNS 공유를 통해 초기 반응을 높이세요.
      </div>
    </div>
  );
}
