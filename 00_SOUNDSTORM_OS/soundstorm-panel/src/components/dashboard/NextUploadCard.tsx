// ─── NextUploadCard ────────────────────────────────────────────────────────────
// "다음 업로드" + "골든아워" 통합 카드
//
// 기존 분리:
//   ExecutionStatus 우측 "다음 업로드" (주기 기반 단순 날짜)
//   TodayBriefCard (골든아워 최적 시간)
//
// 통합 의사결정 로직:
//   max_delay = avgIntervalDays * 0.5
//   golden_delay = (bestDay 다음 날짜 - expectedUploadDate) in days
//   golden_delay <= max_delay → "최적 타이밍 선택" (골든아워 우선)
//   else                     → "리듬 유지 우선" (가장 가까운 골든 슬롯)
//   isOverdue                → "즉시 업로드 필요"
//
// UI 섹션:
//   Header     — 추천 날짜/시간, 신뢰도
//   Decision   — 전략 레이블, 효율 delta, 주기 기준, 지연 정보
//   Alternatives — 옵션 선택 (리듬 vs 골든)
//   PeakChart  — 요일별 바차트 + 시청 피크

import { useState } from "react";
import { Clock, ChevronDown, ChevronRight } from "lucide-react";
import { T } from "../../styles/tokens";

// ─── 유틸 ──────────────────────────────────────────────────────────────────────

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const WEEKDAY_MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

function getNextDateForDay(dayName: string): Date {
  const now       = new Date();
  const targetIdx = WEEKDAY_KO.indexOf(dayName);
  if (targetIdx === -1) return now;
  const daysAhead = ((targetIdx - now.getDay() + 7) % 7) || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getNextDateForDayFrom(dayName: string, fromDate: Date): Date {
  const targetIdx = WEEKDAY_KO.indexOf(dayName);
  if (targetIdx === -1) return fromDate;
  const base = new Date(fromDate);
  base.setHours(0, 0, 0, 0);
  const daysAhead = (targetIdx - base.getDay() + 7) % 7;
  const d = new Date(base);
  d.setDate(base.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getNextDateLabel(dayName: string): string {
  const date     = getNextDateForDay(dayName);
  const dayShort = dayName.replace("요일", "");
  return `${dayShort} (${date.getMonth() + 1}/${date.getDate()})`;
}

function formatSlotDateLabel(date: Date): string {
  return `${DAY_SHORT[date.getDay()]} (${date.getMonth() + 1}/${date.getDate()})`;
}

// "18:00~20:00" → "19:00"  /  "19:00" → "19:00"
function parseSingleHour(s: string | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):00~(\d{1,2}):00/);
  if (!m) return s;
  return `${Math.floor((parseInt(m[1]) + parseInt(m[2])) / 2)}:00`;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function parseHourNum(s: string | undefined): number | null {
  const m = (s ?? "").match(/(\d{1,2}):/);
  return m ? parseInt(m[1]) : null;
}

// ─── 타입 ──────────────────────────────────────────────────────────────────────

interface DaySlot {
  day:        string;
  dayIdx?:    number;   // BASE_DAY_SCORES에서 오는 요일 인덱스 (0=일~6=토)
  adjusted:   number;
  uploadHour: string;
  isBest?:    boolean;
}

interface VideoItem {
  video_id?: string;
  title?:    string;
  views:     number;
  ctr:       number;
}

interface GoldenHour {
  bestDay?:     string;
  bestHour?:    string;
  confidence?:  number;
  basis?:       string;
  level?:       number;
  peakHour?:    string;
  days?:        DaySlot[];
  bestCount?:   number;
  bestVideos?:  VideoItem[];
  videosByDay?: Record<number, VideoItem[]>;
}

interface RecentUpload {
  videoId:     string;
  title:       string;
  publishedAt: string;
}

interface Props {
  nextUploadDate:  Date | null;
  avgIntervalDays: number | null;
  isOverdue:       boolean;
  overdueDays:     number;
  goldenHour:      GoldenHour | null;
  recentUploads?:  RecentUpload[];
  weeklyTarget?:   number;
  noCard?:         boolean;
}

// ─── 이번 주 월요일 00:00 ────────────────────────────────────────────────────
function getThisWeekMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=일, 1=월 … 6=토
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

const DAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

// ─── CompactDayBar ─────────────────────────────────────────────────────────────

function CompactDayBar({
  day, adjusted, uploadHour, isBest, isSelected, hasVideos, isExpanded, onClick, isToday,
}: DaySlot & {
  isSelected?: boolean;
  hasVideos?:  boolean;
  isExpanded?: boolean;
  onClick?:    () => void;
  isToday?:    boolean;
}) {
  const pct   = Math.round(adjusted * 100);
  const color = isBest      ? T.primary
              : isSelected  ? T.warn
              : isToday     ? T.primary
              : adjusted >= 0.75 ? T.success
              : adjusted >= 0.55 ? T.warn
              : T.muted;

  return (
    <div
      onClick={hasVideos ? onClick : undefined}
      style={{
        display:             "grid",
        gridTemplateColumns: "44px 1fr 52px",
        alignItems:          "center",
        gap:                 T.spacing.sm,
        padding:             `${T.spacing.xs}px 0`,
        opacity:             (isBest || isSelected || isToday) ? 1 : 0.6,
        cursor:              hasVideos ? "pointer" : "default",
        borderRadius:        T.radius.btn,
        background:          isExpanded ? T.bgSection : isToday ? T.primarySoft : "transparent",
        transition:          `background ${T.motion.default}`,
      }}
    >
      <span style={{
        fontSize:   T.font.size.xs,
        fontWeight: (isBest || isSelected || isToday) ? T.font.weight.bold : T.font.weight.medium,
        color:      isBest ? T.primary : isSelected ? T.warn : isToday ? T.primary : T.sub,
      }}>
        {day.replace("요일", "")}
        {hasVideos && (
          <span style={{ fontSize: T.font.size.xxs, color: T.muted, marginLeft: 2 }}>
            {isExpanded ? "▲" : "▼"}
          </span>
        )}
      </span>
      <div style={{ height: T.component.size.progressSm, background: T.bgSection, borderRadius: T.radius.pill, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: T.radius.pill, transition: `width ${T.motion.base}`,
        }} />
      </div>
      <span style={{
        fontSize:   T.font.size.xs,
        fontFamily: T.font.familyMono,
        color:      (isBest || isSelected) ? color : T.muted,
        textAlign:  "right",
      }}>
        {parseSingleHour(uploadHour)}
      </span>
    </div>
  );
}

// ─── FallbackCard — 골든아워 없을 때 기존 단순 표시 ────────────────────────────

function FallbackCard({ nextUploadDate, avgIntervalDays, isOverdue, overdueDays }: Omit<Props, "goldenHour">) {
  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      display:       "flex",
      flexDirection: "column",
      alignItems:    "center",
      gap:           T.spacing.sm,
      textAlign:     "center",
      boxShadow:     T.shadow.card,
    }}>
      <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em" }}>
        다음 업로드
      </span>
      {nextUploadDate ? (
        isOverdue ? (
          <>
            <span style={{ fontSize: T.font.size.xxl, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.warn, lineHeight: 1 }}>지연</span>
            <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.warn }}>+{overdueDays}일</span>
          </>
        ) : (
          <span style={{ fontSize: T.font.size.display, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.primary, lineHeight: 1 }}>
            {`${nextUploadDate.getMonth() + 1}/${nextUploadDate.getDate()}`}
          </span>
        )
      ) : (
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>예측 데이터 없음</span>
      )}
      {avgIntervalDays !== null && (
        <span style={{ fontSize: T.font.size.xs, color: T.muted }}>평균 {avgIntervalDays.toFixed(1)}일 주기</span>
      )}
    </div>
  );
}

// ─── NextUploadCard (메인) ─────────────────────────────────────────────────────

export default function NextUploadCard({
  nextUploadDate,
  avgIntervalDays,
  isOverdue,
  overdueDays,
  goldenHour,
  recentUploads = [],
  weeklyTarget  = 3,
  noCard = false,
}: Props) {
  const [showVideos,      setShowVideos]      = useState(false);
  const [selectedOption,  setSelectedOption]  = useState<0 | 1>(0);
  const [expandedDay,     setExpandedDay]     = useState<number | null>(null);

  if (!goldenHour?.bestDay) {
    return <FallbackCard {...{ nextUploadDate, avgIntervalDays, isOverdue, overdueDays }} />;
  }

  // ── 의사결정 계산 ─────────────────────────────────────────────────────────
  const avgInterval = avgIntervalDays ?? 4;
  const maxDelay    = avgInterval * 0.5;
  const days        = goldenHour.days ?? [];
  const latestUploadAt = recentUploads.length > 0
    ? [...recentUploads]
        .map(u => new Date(u.publishedAt))
        .filter(d => !isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    : null;
  const expectedDate = latestUploadAt
    ? new Date(latestUploadAt.getFullYear(), latestUploadAt.getMonth(), latestUploadAt.getDate() + 2)
    : nextUploadDate ?? new Date();

  // 각 요일 슬롯에 다음 날짜 계산
  const slotsWithDate = days.map(d => ({
    ...d,
    date: getNextDateForDayFrom(d.day, expectedDate),
  }));

  // 골든 최적 슬롯 (bestDay 기준)
  const bestSlot = slotsWithDate.find(d => d.day === goldenHour.bestDay) ?? slotsWithDate[0];
  const cadenceSlot = slotsWithDate.find(d => d.date.getDay() === expectedDate.getDay()) ?? null;

  // 주기 기준 날짜에서 golden delay (양수 = 지연)
  const goldenDelay = bestSlot ? diffDays(bestSlot.date, expectedDate) : 0;

  // 리듬 허용 범위 내에서 최고 adjusted 슬롯
  const rhythmSlot = slotsWithDate
    .filter(d => diffDays(d.date, expectedDate) <= maxDelay)
    .sort((a, b) => b.adjusted - a.adjusted)[0] ?? null;

  // 주 추천 슬롯 결정
  const useGolden   = goldenDelay <= maxDelay;
  const fallbackSlot = useGolden ? bestSlot : (rhythmSlot ?? bestSlot);
  const primarySlot = cadenceSlot ?? fallbackSlot;
  const altSlot     = bestSlot && bestSlot !== primarySlot ? bestSlot : null;

  // 전략 레이블
  let decisionLabel: string;
  let decisionColor: string;
  if (isOverdue) {
    decisionLabel = "즉시 업로드 필요";
    decisionColor = T.danger;
  } else if (cadenceSlot) {
    decisionLabel = "2일 리듬 기준 추천";
    decisionColor = T.primary;
  } else if (useGolden) {
    decisionLabel = "최적 타이밍 선택됨";
    decisionColor = T.success;
  } else {
    decisionLabel = "리듬 유지 우선 선택됨";
    decisionColor = T.warn;
  }

  // 효율 delta (리듬 슬롯 vs 골든 슬롯 성과 차이)
  const effDelta =
    !useGolden && primarySlot && bestSlot && primarySlot !== bestSlot
      ? Math.round((primarySlot.adjusted - bestSlot.adjusted) * 100)
      : null;

  // 현재 선택 슬롯 (대안 클릭 시 전환)
  const currentSlot = selectedOption === 1 && altSlot ? altSlot : primarySlot;
  const confidence   = Math.round((goldenHour.confidence ?? 0) * 100);
  const reliabilityTone =
    (goldenHour.level ?? 1) >= 3 ? (confidence >= 80 ? "high" : "mid") : "low";
  const reliabilityColor = reliabilityTone === "high"
    ? T.success
    : reliabilityTone === "mid"
    ? T.warn
    : T.danger;
  const reliabilityBg = reliabilityTone === "high"
    ? T.successBg
    : reliabilityTone === "mid"
    ? T.warnBg
    : T.dangerBg;
  const reliabilityLabel =
    (goldenHour.level ?? 1) >= 4 ? "실업로드 + 시청 피크 결합"
    : (goldenHour.level ?? 1) === 3 ? "실업로드 heatmap 기반"
    : (goldenHour.level ?? 1) === 2 ? "채널 스냅샷 기반 추정"
    : "휴리스틱 추정";

  // 대안 옵션 목록
  type OptionItem = { slot: typeof bestSlot; label: string; tradeoff: string };
  const options: OptionItem[] = [];
  if (primarySlot) {
    options.push({
      slot:     primarySlot,
      label:    `${formatSlotDateLabel(primarySlot.date)} ${parseSingleHour(primarySlot.uploadHour)}`,
      tradeoff: cadenceSlot ? "최근 업로드 +2일 기준" : useGolden ? "최고 성과 + 리듬 유지" : "리듬 유지 + 준수한 성과",
    });
  }
  if (altSlot) {
    const altDelay = diffDays(altSlot.date, expectedDate);
    options.push({
      slot:     altSlot,
      label:    `${formatSlotDateLabel(altSlot.date)} ${parseSingleHour(altSlot.uploadHour)}`,
      tradeoff: `최고 성과 · 리듬 붕괴 (+${altDelay}일)`,
    });
  }

  // 피크 오프셋 레이블
  const bestH = parseHourNum(currentSlot?.uploadHour);
  const peakH = parseHourNum(goldenHour.peakHour);
  const peakOffsetLabel =
    bestH != null && peakH != null
      ? bestH === peakH ? "피크 시간 일치"
      : bestH > peakH  ? `피크 대비 +${bestH - peakH}h`
      :                  `피크 ${peakH - bestH}h 전`
      : null;

  // 지연 표시 (overdue 아닐 때)
  const delayDays =
    !isOverdue && nextUploadDate && currentSlot
      ? Math.max(0, diffDays(currentSlot.date, nextUploadDate))
      : null;

  // ── 이번 주 업로드 현황 계산 ─────────────────────────────────────────────
  const thisWeekMonday = getThisWeekMonday();
  const thisWeekUploads = recentUploads.filter(u => {
    const d = new Date(u.publishedAt);
    return !isNaN(d.getTime()) && d >= thisWeekMonday;
  });
  const thisWeekCount   = thisWeekUploads.length;
  const remaining       = Math.max(0, weeklyTarget - thisWeekCount);

  // 이번 주 날짜 계산 (dayIdx 기준, 월요일부터 계산)
  // dayIdx 없는 슬롯은 WEEKDAY_KO로 fallback
  function getThisWeekDate(dayIdx: number | undefined, dayName?: string): Date {
    const idx = dayIdx ?? WEEKDAY_KO.indexOf(dayName ?? "");
    if (idx === -1) return thisWeekMonday;
    const offset = idx === 0 ? 6 : idx - 1; // Sun=0→+6, Mon=1→+0, …
    const d = new Date(thisWeekMonday);
    d.setDate(thisWeekMonday.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // 완료 날짜 오름차순 정렬 후 레이블 생성
  const doneLabels = [...thisWeekUploads]
    .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
    .map(u => {
      const d = new Date(u.publishedAt);
      return `${DAY_SHORT[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
    });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeekSunday = new Date(thisWeekMonday);
  thisWeekSunday.setDate(thisWeekMonday.getDate() + 6);

  // 이미 업로드한 요일 set (중복 추천 방지)
  const doneWeekdaySet = new Set(thisWeekUploads.map(u => new Date(u.publishedAt).getDay()));

  // 남은 슬롯 → 이번 주 내 오늘 이후, 미업로드 요일 중 adjusted 상위순
  const recommendedSlots = [...days]
    .sort((a, b) => b.adjusted - a.adjusted)
    .filter(d => {
      const idx = d.dayIdx ?? WEEKDAY_KO.indexOf(d.day);
      const slotDate = getThisWeekDate(d.dayIdx, d.day);
      return slotDate >= today && slotDate <= thisWeekSunday && !doneWeekdaySet.has(idx);
    })
    .slice(0, remaining);

  // 큰 헤더는 항상 "최근 업로드 +2일" 기준으로 계산된 currentSlot을 따른다.
  const displayLabel = currentSlot ? formatSlotDateLabel(currentSlot.date) : "—";
  const displayHour  = currentSlot ? parseSingleHour(currentSlot.uploadHour) : "—";

  const inner = (
    <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.lg }}>

      {/* ── 헤더 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm }}>
        <Clock size={13} color={T.success} />
        <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, color: T.sub, letterSpacing: "0.06em", flex: 1 }}>
          다음 업로드 추천
        </span>
        <span style={{
          fontSize:   T.font.size.xs,
          fontFamily: T.font.familyMono,
          fontWeight: T.font.weight.bold,
          color:      reliabilityColor,
        }}>
          신뢰도 {confidence}%
        </span>
      </div>

      {/* ── 추천 날짜 + 신뢰 근거 ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(220px, 0.88fr) minmax(0, 1.12fr)",
        gap: T.spacing.md,
        alignItems: "stretch",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: T.spacing.md,
          padding: `${T.spacing.lg}px ${T.spacing.lg}px`,
          background: T.semantic.surface.insetTint,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: T.component.radius.cardMd,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
            <span style={{
              fontSize: T.font.size.xs,
              fontFamily: T.font.familyMono,
              color: T.muted,
              fontWeight: T.font.weight.bold,
              letterSpacing: "0.06em",
            }}>
              PRIMARY SLOT
            </span>
            <span style={{
              fontSize: T.font.size.xxl,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
              color: T.text,
              lineHeight: 1,
              letterSpacing: "-0.04em",
            }}>
              {displayLabel}
            </span>
            <span style={{
              fontSize: T.font.size.xl,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
              color: T.primary,
              lineHeight: 1,
            }}>
              {displayHour}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{
              fontSize: T.font.size.xs,
              color: decisionColor,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
            }}>
              {decisionLabel}
            </span>
            {delayDays != null && delayDays > 0 && (
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
                기준일 대비 +{delayDays}일
              </span>
            )}
          </div>
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: T.spacing.sm,
          padding: `${T.spacing.lg}px ${T.spacing.lg}px`,
          background: reliabilityBg,
          border: `1px solid ${reliabilityColor}30`,
          borderRadius: T.component.radius.cardMd,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
            <span style={{ fontSize: T.font.size.xs, color: reliabilityColor, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold }}>
              {reliabilityLabel}
            </span>
            {goldenHour.bestCount != null && (
              <button
                onClick={() => setShowVideos(v => !v)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  fontSize: T.font.size.xxs,
                  fontFamily: T.font.familyMono,
                  fontWeight: T.font.weight.bold,
                  color: reliabilityColor,
                  background: T.component.surface.softOverlay,
                  borderRadius: T.radius.badge,
                  padding: `${T.spacing.xs}px ${T.spacing.sm}px`,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {showVideos ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                이 시간대 영상 {goldenHour.bestCount}개
              </button>
            )}
          </div>
          <span style={{ fontSize: T.font.size.xs, color: T.sub, lineHeight: T.font.lineHeight.normal }}>
            {goldenHour.basis ?? "근거 데이터 설명 없음"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.sm, flexWrap: "wrap" }}>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
              신뢰도
            </span>
            <span style={{ fontSize: T.font.size.xs, color: reliabilityColor, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold }}>
              {confidence}%
            </span>
          </div>
        </div>
      </div>

      {/* ── 이번 주 주3회 현황 ── */}
      <div style={{
        background:    T.semantic.surface.insetTint,
        border:        `1px solid ${T.borderSoft}`,
        borderRadius:  T.component.radius.cardMd,
        padding:       `${T.spacing.lg}px ${T.spacing.lg}px`,
        display:       "flex",
        flexDirection: "column",
        gap:           T.spacing.xs,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
          <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.muted, fontWeight: T.font.weight.bold, letterSpacing: "0.06em" }}>
            RHYTHM STATUS
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: T.spacing.sm, flexWrap: "wrap" }}>
            <span style={{ fontSize: T.font.size.xs, fontFamily: T.font.familyMono, color: T.sub }}>
              주{weeklyTarget}회 목표
            </span>
            <span style={{
              fontSize:   T.font.size.lg,
              fontFamily: T.font.familyMono,
              fontWeight: T.font.weight.bold,
              color:      thisWeekCount >= weeklyTarget ? T.success : T.primary,
            }}>
              {thisWeekCount}/{weeklyTarget}
            </span>
          </div>
          <span style={{ fontSize: T.font.size.sm, fontFamily: T.font.familyMono, color: isOverdue ? T.danger : T.success, fontWeight: T.font.weight.bold }}>
            {isOverdue ? `+${overdueDays}일 지연` : "리듬 정상 유지"}
          </span>
          {doneLabels.length > 0 && (
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono }}>
              업로드: {doneLabels.join("  ·  ")}
            </span>
          )}
          {remaining === 0 && (
            <span style={{ fontSize: T.font.size.xs, color: T.success, fontFamily: T.font.familyMono }}>
              이번 주 목표 달성 완료
            </span>
          )}
        </div>
      </div>

      {/* ── 기반 영상 목록 (배지 클릭 토글) ── */}
      {showVideos && (goldenHour.bestVideos?.length ?? 0) > 0 && (
        <div style={{
          background:   T.bgSection,
          borderRadius: T.radius.btn,
          overflow:     "hidden",
        }}>
          {goldenHour.bestVideos!.map((v, i) => (
            <div key={v.video_id ?? i} style={{
              display:             "grid",
              gridTemplateColumns: "1fr 48px 44px",
              alignItems:          "center",
              gap:                 T.spacing.sm,
              padding:             `${T.spacing.sm}px ${T.spacing.md}px`,
              borderBottom:        i < goldenHour.bestVideos!.length - 1 ? `1px solid ${T.borderSoft}` : "none",
            }}>
              <span style={{ fontSize: T.font.size.xs, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.title ?? v.video_id ?? "—"}
              </span>
              <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, textAlign: "right" }}>
                {v.views >= 1000 ? `${(v.views / 1000).toFixed(1)}K` : v.views}
              </span>
              <span style={{
                fontSize:   T.font.size.xs,
                fontFamily: T.font.familyMono,
                color:      v.ctr >= 0.05 ? T.success : v.ctr >= 0.03 ? T.primary : T.muted,
                textAlign:  "right",
              }}>
                {v.ctr > 0 ? `${(v.ctr * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── 대안 옵션 (2개일 때만 표시) ── */}
      {options.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: T.spacing.xs }}>
          <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, letterSpacing: "0.06em" }}>
            대안
          </span>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => setSelectedOption(i as 0 | 1)}
              style={{
                display:       "flex",
                alignItems:    "center",
                gap:           T.spacing.sm,
                background:    selectedOption === i ? T.semantic.surface.insetTint : T.bgCard,
                border:        `1px solid ${selectedOption === i ? T.primaryBorder : T.borderSoft}`,
                borderRadius:  T.component.radius.control,
                padding:       `${T.spacing.sm}px ${T.spacing.md}px`,
                cursor:        "pointer",
                textAlign:     "left",
                transition:    `border-color ${T.motion.duration}`,
              }}
            >
              <span style={{
                fontSize:   T.font.size.xxs,
                fontFamily: T.font.familyMono,
                fontWeight: T.font.weight.bold,
                color:      selectedOption === i ? T.primary : T.muted,
                minWidth:   14,
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: T.font.size.sm, fontFamily: T.font.familyMono, color: T.text, fontWeight: T.font.weight.bold, flex: 1 }}>
                {opt.label}
              </span>
              <span style={{ fontSize: T.font.size.xs, color: i === 0 ? T.success : T.muted, fontFamily: T.font.familyMono }}>
                {i === 0 ? "← 추천" : opt.tradeoff}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── 시청 피크 + 요일 바차트 ── */}
      <div>
        {goldenHour.peakHour && (
          <div style={{ display: "flex", alignItems: "center", gap: T.spacing.xs, marginBottom: T.spacing.sm }}>
            <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, fontWeight: T.font.weight.bold, letterSpacing: "0.06em" }}>시청 피크</span>
            <span style={{ fontSize: T.font.size.xs, fontWeight: T.font.weight.bold, color: T.success, fontFamily: T.font.familyMono }}>
              {parseSingleHour(goldenHour.peakHour)}
            </span>
            {peakOffsetLabel && (
              <span style={{
                fontSize:     T.font.size.xs,
                fontFamily:   T.font.familyMono,
                color:        T.muted,
                background:   T.bgSection,
                borderRadius: T.radius.badge,
                padding:      `1px ${T.spacing.xs}px`,
                marginLeft:   "auto",
              }}>
                {peakOffsetLabel}
              </span>
            )}
          </div>
        )}
        {[...days].sort((a, b) => {
          const aIdx = a.dayIdx ?? WEEKDAY_KO.indexOf(a.day);
          const bIdx = b.dayIdx ?? WEEKDAY_KO.indexOf(b.day);
          return WEEKDAY_MON_FIRST.indexOf(aIdx) - WEEKDAY_MON_FIRST.indexOf(bIdx);
        }).map(d => {
          const idx      = d.dayIdx ?? WEEKDAY_KO.indexOf(d.day);
          const videos   = goldenHour.videosByDay?.[idx] ?? [];
          const expanded = expandedDay === idx;
          const isToday  = idx === today.getDay();
          return (
            <div key={d.day}>
              <CompactDayBar
                {...d}
                isBest={d.day === goldenHour.bestDay && useGolden}
                isSelected={!useGolden && d.day === primarySlot?.day}
                isToday={isToday}
                hasVideos={videos.length > 0}
                isExpanded={expanded}
                onClick={() => setExpandedDay(expanded ? null : idx)}
              />
              {expanded && videos.length > 0 && (
                <div style={{
                  margin:       `${T.spacing.xs}px 0 ${T.spacing.sm}px 44px`,
                  background:   T.bgSection,
                  borderRadius: T.radius.btn,
                  overflow:     "hidden",
                }}>
                  {videos.map((v, i) => (
                    <div key={v.video_id ?? i} style={{
                      display:             "grid",
                      gridTemplateColumns: "1fr 44px 44px",
                      alignItems:          "center",
                      gap:                 T.spacing.sm,
                      padding:             `${T.spacing.xs}px ${T.spacing.sm}px`,
                      borderBottom:        i < videos.length - 1 ? `1px solid ${T.borderSoft}` : "none",
                    }}>
                      <span style={{
                        fontSize: T.font.size.xs, color: T.sub,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {v.title ?? v.video_id ?? "—"}
                      </span>
                      <span style={{ fontSize: T.font.size.xs, color: T.muted, fontFamily: T.font.familyMono, textAlign: "right" }}>
                        {v.views >= 10000 ? `${(v.views / 10000).toFixed(1)}만` : v.views >= 1000 ? `${(v.views / 1000).toFixed(1)}K` : v.views}
                      </span>
                      <span style={{
                        fontSize:   T.font.size.xs,
                        fontFamily: T.font.familyMono,
                        textAlign:  "right",
                        color:      v.ctr >= 0.05 ? T.success : v.ctr >= 0.03 ? T.primary : T.muted,
                      }}>
                        {v.ctr > 0 ? `${(v.ctr * 100).toFixed(1)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );

  if (noCard) return inner;

  return (
    <div style={{
      background:    T.bgCard,
      border:        `1px solid ${T.border}`,
      borderRadius:  T.radius.card,
      padding:       T.spacing.xl,
      boxShadow:     T.shadow.card,
      borderLeft:    `3px solid ${T.success}`,
    }}>
      {inner}
    </div>
  );
}
