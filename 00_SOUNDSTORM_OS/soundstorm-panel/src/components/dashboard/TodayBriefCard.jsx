// ─── TodayBriefCard.jsx ──────────────────────────────────────────────────────
// 골든아워 카드 (full-width)
//
// 변경 이력:
//   - "오늘의 전략" 좌측 섹션 제거 (정보 중복, 액션 불명확)
//   - 골든아워 full-width 확장
//   - GoldenCountdown: next 상태(시간 이미 지남) → null (의미 없는 카운트다운 제거)
//   - bestDay → "금 (3/27)" 형태 — 다음 날짜 명시
//   - bestHour → 단일 시간 "19:00" (범위 "18:00~20:00" 중간값)
//   - 리드타임 텍스트, 알람 버튼 제거
//
// Props:
//   goldenHour  — computeGoldenHour() 반환값

import { useState, useEffect } from "react";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 유틸 ────────────────────────────────────────────────────────────────────

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

// "금요일" → "금 (3/27)" — 다음 해당 요일의 실제 날짜 표시
function getNextDateLabel(dayName) {
  const now      = new Date();
  const todayIdx = now.getDay();
  const targetIdx = WEEKDAY_KO.indexOf(dayName);
  if (targetIdx === -1) return dayName;

  const daysAhead = (targetIdx - todayIdx + 7) % 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  const dayShort = dayName.replace("요일", "");
  return `${dayShort} (${next.getMonth() + 1}/${next.getDate()})`;
}

// "18:00~20:00" → "19:00"  /  "19:00" → "19:00" (이미 단일 시간)
function parseSingleHour(rangeStr) {
  if (!rangeStr) return rangeStr;
  const m = rangeStr.match(/^(\d{1,2}):00~(\d{1,2}):00/);
  if (!m) return rangeStr;
  const mid = Math.floor((parseInt(m[1]) + parseInt(m[2])) / 2);
  return `${mid}:00`;
}

// ─── 골든아워 요일 바 ─────────────────────────────────────────────────────────

function CompactDayBar({ day, adjusted, uploadHour, isBest }) {
  const pct   = Math.round(adjusted * 100);
  const color = isBest ? T.primary : adjusted >= 0.75 ? T.success : adjusted >= 0.55 ? T.warn : T.muted;
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "40px 1fr 56px",
      alignItems:          "center",
      gap:                 T.spacing.sm,
      padding:             `${T.spacing.xs}px 0`,
      opacity:             isBest ? 1 : 0.7,
    }}>
      <span style={{ fontSize: T.font.size.xxs, fontWeight: isBest ? T.font.weight.bold : T.font.weight.medium, color: isBest ? T.primary : T.sub }}>
        {day}
      </span>
      <div style={{ height: 4, background: T.bgSection, borderRadius: T.radius.pill, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: T.radius.pill, transition: "width 0.5s ease",
        }} />
      </div>
      <span style={{ fontSize: T.font.size.xxs, fontFamily: T.font.familyMono, color: isBest ? T.primary : T.muted, textAlign: "right" }}>
        {parseSingleHour(uploadHour)}
      </span>
    </div>
  );
}

// ─── GoldenCountdown ──────────────────────────────────────────────────────────
// next 상태(추천 시간 이미 지남) → null 반환 (의미 없는 카운트다운 제거)

const _parseHour = s => { const m = (s ?? "").match(/(\d{1,2}):/); return m ? parseInt(m[1]) : null; };

const GOLDEN_STATES = {
  relaxed:  { label: "여유 있음",         color: T.muted,    bg: T.bgSection,   prefix: "최적 업로드까지", Icon: Clock },
  prepare:  { label: "준비 시작",         color: T.sub,      bg: T.bgSection,   prefix: "최적 업로드까지", Icon: Clock },
  ready:    { label: "업로드 준비",       color: T.warn,     bg: T.warnBg,      prefix: "업로드 준비까지", Icon: Clock },
  imminent: { label: "지금이 타이밍",     color: T.primary,  bg: T.primarySoft, prefix: "골든타임까지",    Icon: Clock },
  now:      { label: "지금 업로드하세요", color: T.success,  bg: T.successBg,   prefix: "",               Icon: Clock },
};

function getGoldenState(diffH) {
  if (diffH > 6)   return "relaxed";
  if (diffH > 3)   return "prepare";
  if (diffH > 1)   return "ready";
  if (diffH >= 0)  return "imminent";
  if (diffH >= -2) return "now";
  return null; // 시간이 지남 → 표시 안 함
}

function GoldenCountdown({ bestHour }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const bestH = _parseHour(bestHour);
  if (bestH == null) return null;

  const rawDiffMin = bestH * 60 - (now.getHours() * 60 + now.getMinutes());
  const state      = getGoldenState(rawDiffMin / 60);
  if (!state) return null; // 추천 시간 이미 지남

  const cfg  = GOLDEN_STATES[state];
  const dH   = Math.floor(rawDiffMin / 60);
  const dM   = rawDiffMin % 60;
  const timeStr = state === "now" ? ""
    : dH > 0 ? `${dH}시간${dM > 0 ? ` ${dM}분` : ""}`
    : dM > 0 ? `${dM}분` : "";
  const Icon = cfg.Icon;

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          T.spacing.sm,
      background:   cfg.bg,
      border:       `1px solid ${cfg.color}30`,
      borderRadius: T.radius.badge,
      padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
      marginBottom: T.spacing.sm,
    }}>
      <Icon size={11} color={cfg.color} />
      <span style={{
        fontSize:      T.font.size.xxs,
        fontWeight:    T.font.weight.bold,
        color:         cfg.color,
        fontFamily:    T.font.familyMono,
        letterSpacing: "0.04em",
      }}>
        {cfg.label}
      </span>
      {timeStr && (
        <>
          <span style={{ fontSize: T.font.size.xxs, color: T.muted, marginLeft: "auto" }}>
            {cfg.prefix}
          </span>
          <span style={{
            fontSize:   T.font.size.xs,
            fontWeight: T.font.weight.bold,
            color:      cfg.color,
            fontFamily: T.font.familyMono,
          }}>
            {timeStr}
          </span>
        </>
      )}
    </div>
  );
}

// ─── TodayBriefCard ───────────────────────────────────────────────────────────

export default function TodayBriefCard({ goldenHour }) {
  const [showVideos, setShowVideos] = useState(false);

  if (!goldenHour) return null;

  const _parseH = s => { const m = (s ?? "").match(/(\d{1,2}):/); return m ? parseInt(m[1]) : null; };
  const _bestH  = _parseH(goldenHour.bestHour);
  const _peakH  = _parseH(goldenHour.peakHour);
  const peakOffsetLabel = (_bestH != null && _peakH != null)
    ? (_bestH === _peakH ? "피크 시간 일치"
      : _bestH > _peakH  ? `피크 대비 +${_bestH - _peakH}시간`
      :                    `피크 ${_peakH - _bestH}시간 전`)
    : null;

  const displayDay  = getNextDateLabel(goldenHour.bestDay);
  const displayHour = parseSingleHour(goldenHour.bestHour);

  return (
    <div style={{
      background:   T.bgCard,
      border:       `1px solid ${T.border}`,
      borderRadius: T.radius.card,
      boxShadow:    T.shadow.card,
      overflow:     "hidden",
      borderLeft:   `3px solid ${T.success}`,
    }}>
      <div style={{ padding: T.spacing.xl }}>

        {/* ── 헤더 ── */}
        <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, marginBottom: T.spacing.md }}>
          <Clock size={14} color={T.success} />
          <span style={{ fontSize: T.font.size.md, fontWeight: T.font.weight.bold, color: T.text }}>골든아워</span>
          <span style={{
            fontSize:   T.font.size.xxs,
            fontFamily: T.font.familyMono,
            fontWeight: T.font.weight.bold,
            color:      goldenHour.confidence >= 0.8 ? T.success : T.warn,
            marginLeft: "auto",
          }}>
            신뢰도 {Math.round((goldenHour.confidence ?? 0) * 100)}%
          </span>
        </div>

        {/* ── 날짜 + 시간 ── */}
        <div style={{
          display:      "flex",
          alignItems:   "baseline",
          gap:          T.spacing.md,
          marginBottom: T.spacing.xs,
          flexWrap:     "wrap",
        }}>
          <span style={{
            fontSize:      T.font.size.title,
            fontWeight:    T.font.weight.bold,
            color:         T.text,
            fontFamily:    T.font.familyMono,
            letterSpacing: "-0.02em",
          }}>
            {displayDay}
          </span>
          <span style={{
            fontSize:   T.font.size.lg,
            fontWeight: T.font.weight.bold,
            color:      T.primary,
            fontFamily: T.font.familyMono,
          }}>
            {displayHour}
          </span>
          {goldenHour.bestCount != null && (
            <button
              onClick={() => setShowVideos(v => !v)}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          2,
                fontSize:     T.font.size.xxs,
                fontFamily:   T.font.familyMono,
                fontWeight:   T.font.weight.bold,
                color:        goldenHour.bestCount >= 3 ? T.success : T.warn,
                background:   goldenHour.bestCount >= 3 ? T.successBg : T.warnBg,
                borderRadius: T.radius.badge,
                padding:      `${T.spacing.xs}px ${T.spacing.xs}px`,
                border:       "none",
                cursor:       "pointer",
              }}
            >
              {showVideos ? <ChevronDown size={8} /> : <ChevronRight size={8} />}
              이 시간대 영상 {goldenHour.bestCount}개 기반
            </button>
          )}
        </div>

        {/* ── 카운트다운 (next 상태 제외) ── */}
        <GoldenCountdown bestHour={goldenHour.bestHour} />

        {/* ── 시청 피크 시간 ── */}
        {goldenHour.peakHour && (
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          T.spacing.xs,
            marginBottom: T.spacing.sm,
          }}>
            <span style={{ fontSize: T.font.size.xxs, color: T.muted }}>시청 피크</span>
            <span style={{
              fontSize:   T.font.size.xs,
              fontWeight: T.font.weight.bold,
              color:      T.success,
              fontFamily: T.font.familyMono,
            }}>
              {parseSingleHour(goldenHour.peakHour)}
            </span>
            {peakOffsetLabel && (
              <span style={{
                fontSize:     T.font.size.xxs,
                fontFamily:   T.font.familyMono,
                color:        T.muted,
                background:   T.bgCard,
                border:       `1px solid ${T.borderSoft}`,
                borderRadius: T.radius.badge,
                padding:      `${T.spacing.xs}px ${T.spacing.sm}px`,
                marginLeft:   "auto",
              }}>
                {peakOffsetLabel}
              </span>
            )}
          </div>
        )}

        {/* ── 기반 영상 목록 (배지 클릭 시 펼침) ── */}
        {showVideos && goldenHour.bestVideos?.length > 0 && (
          <div style={{
            marginBottom: T.spacing.sm,
            background:   T.bgCard,
            border:       `1px solid ${T.borderSoft}`,
            borderRadius: T.radius.badge,
            overflow:     "hidden",
          }}>
            {goldenHour.bestVideos.map((v, i) => (
              <div key={v.video_id ?? i} style={{
                display:             "grid",
                gridTemplateColumns: "1fr 52px 44px",
                alignItems:          "center",
                gap:                 T.spacing.sm,
                padding:             `${T.spacing.sm}px ${T.spacing.sm}px`,
                borderBottom:        i < goldenHour.bestVideos.length - 1
                  ? `1px solid ${T.borderSoft}` : "none",
              }}>
                <span style={{
                  fontSize:     T.font.size.xxs,
                  color:        T.text,
                  overflow:     "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace:   "nowrap",
                }}>
                  {v.title ?? v.video_id ?? "—"}
                </span>
                <span style={{
                  fontSize:   T.font.size.xxs,
                  color:      T.muted,
                  fontFamily: T.font.familyMono,
                  textAlign:  "right",
                }}>
                  {v.views >= 1000 ? `${(v.views / 1000).toFixed(1)}K` : v.views}
                </span>
                <span style={{
                  fontSize:   T.font.size.xxs,
                  fontFamily: T.font.familyMono,
                  color:      v.ctr >= 0.05 ? T.success : v.ctr >= 0.03 ? T.primary : T.muted,
                  textAlign:  "right",
                }}>
                  {v.ctr > 0 ? `CTR ${(v.ctr * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── 요일 히트맵 ── */}
        <div style={{ marginTop: T.spacing.sm }}>
          {(goldenHour.days ?? []).slice(0, 5).map(d => (
            <CompactDayBar
              key={d.day}
              day={d.day}
              adjusted={d.adjusted}
              uploadHour={d.uploadHour}
              isBest={d.day === goldenHour.bestDay}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
