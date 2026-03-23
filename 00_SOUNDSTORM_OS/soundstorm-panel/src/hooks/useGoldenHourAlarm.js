// ─── useGoldenHourAlarm.js ────────────────────────────────────────────────────
// 골든아워 1시간 전 알림 스케줄링
//
// 동작:
//   1. goldenHour.bestDay + bestHour 기반으로 "오늘 업로드 추천 시각" 계산 (KST)
//   2. 추천 시각 - leadTimeHours - 1h 에 native Notification 발송
//   3. Electron 컨텍스트: window.api.scheduleGoldenAlarm (메인 프로세스, OS 알림)
//      브라우저 fallback: window.Notification + setTimeout (렌더러)
//   4. 알림 클릭 → registerActionViewed({ source: "notification" }) 자동 기록
//
// 반환: { armed, nextAlarmAt, permission, arm, disarm, requestPermission }

import { useState, useEffect, useRef } from "react";

const WEEKDAY_KO = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

// "18:00~20:00" → 18  (시작 시각 hour)
function parseStartHour(rangeStr) {
  const m = (rangeStr ?? "").match(/^(\d{1,2}):/);
  return m ? parseInt(m[1], 10) : null;
}

// 오늘 KST 기준으로 dayName이 오늘인지, 내일인지 계산 → Date 반환
// KST = UTC+9
function getTargetDate(dayName, hour) {
  const nowUtc     = Date.now();
  const kstOffset  = 9 * 60 * 60 * 1000;
  const nowKstMs   = nowUtc + kstOffset;
  const nowKst     = new Date(nowKstMs);

  const todayIdx   = nowKst.getUTCDay();           // 0=Sun in KST
  const targetIdx  = WEEKDAY_KO.indexOf(dayName);
  if (targetIdx === -1 || hour == null) return null;

  let daysAhead = (targetIdx - todayIdx + 7) % 7;

  // 오늘이 해당 요일이지만 이미 시각이 지났으면 → 다음 주
  if (daysAhead === 0) {
    const kstHour = nowKst.getUTCHours();
    if (kstHour >= hour) daysAhead = 7;
  }

  // target UTC ms = 오늘 KST 자정 + daysAhead days + hour*h (KST) → UTC
  const kstMidnightToday = nowKstMs - (nowKst.getUTCHours() * 3600000)
    - (nowKst.getUTCMinutes() * 60000) - (nowKst.getUTCSeconds() * 1000)
    - nowKst.getUTCMilliseconds();

  const targetUtcMs = kstMidnightToday
    + daysAhead * 86400000
    + hour * 3600000
    - kstOffset;   // convert back to UTC

  return new Date(targetUtcMs);
}

// Electron 컨텍스트 여부 — window.api.scheduleGoldenAlarm 존재 시 IPC 경로 사용
const isElectron = () => typeof window !== "undefined" && typeof window.api?.scheduleGoldenAlarm === "function";

export function useGoldenHourAlarm(goldenHour, { onNavigate } = {}) {
  const [armed,        setArmed]        = useState(false);
  const [nextAlarmAt,  setNextAlarmAt]  = useState(null);
  const [permission,   setPermission]   = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const timerRef = useRef(null); // 브라우저 fallback용

  function disarm() {
    // 렌더러 타이머 해제
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    // Electron 메인 프로세스 타이머 해제
    window.api?.cancelGoldenAlarm?.().catch?.(() => {});
    setArmed(false);
    setNextAlarmAt(null);
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }

  async function arm() {
    if (!goldenHour) return;

    let perm = permission;
    if (perm === "default") perm = await requestPermission();
    if (perm !== "granted") return;

    const startHour  = parseStartHour(goldenHour.bestHour);
    const leadH      = goldenHour.leadTimeHours ?? 3;
    // 알림 시각 = 업로드 추천 시각 - leadTimeHours - 1h
    const notifyHour = startHour != null ? startHour - leadH - 1 : null;
    if (notifyHour == null || notifyHour < 0) return;

    const targetDate = getTargetDate(goldenHour.bestDay, notifyHour);
    if (!targetDate) return;

    const msUntil = targetDate.getTime() - Date.now();
    if (msUntil <= 0) return;

    disarm(); // 기존 타이머 제거

    if (isElectron()) {
      // ── Electron: 메인 프로세스 OS 알림 (윈도우 최소화에도 동작) ──────────
      const result = await window.api.scheduleGoldenAlarm({
        notifyAtMs:    targetDate.getTime(),
        bestDay:       goldenHour.bestDay,
        bestHour:      goldenHour.bestHour,
        leadTimeHours: leadH,
      });
      if (!result?.ok) return;
    } else {
      // ── 브라우저 fallback: 렌더러 setTimeout ─────────────────────────────
      timerRef.current = setTimeout(() => {
        new Notification("SOUNDSTORM — 업로드 준비 시간", {
          body:   `${goldenHour.bestDay} ${goldenHour.bestHour} 골든아워까지 ${leadH + 1}시간 전\n지금 콘텐츠를 준비하세요`,
          silent: false,
        });
        setArmed(false);
        setNextAlarmAt(null);
      }, msUntil);
    }

    setArmed(true);
    setNextAlarmAt(targetDate);
  }

  // Fix 4: shown 이벤트 → registerActionViewed (source: "notification_shown")
  // main이 log에 직접 쓰지 않으므로 renderer가 유일한 source of truth (Fix 1)
  useEffect(() => {
    function handleGoldenShown(data) {
      window.api?.registerActionViewed?.({
        recommendationId: `golden_shown_${Date.now()}`,
        actionId:         "upload-timing",
        source:           "notification_shown",
        shownAt:          Date.now(),
        context:          { bestDay: data?.bestDay, bestHour: data?.bestHour },
      }).catch?.(() => {});
    }
    window.api?.on?.("golden:shown", handleGoldenShown);
    return () => window.api?.off?.("golden:shown");
  }, []);

  // Fix 1: main은 log 기록 안 함 — renderer만 기록 (source of truth)
  // Fix 5: navigate:true → onNavigate 콜백 호출
  useEffect(() => {
    function handleGoldenClicked(data) {
      window.api?.registerActionViewed?.({
        recommendationId: `golden_clicked_${Date.now()}`,
        actionId:         "upload-timing",
        source:           "notification_clicked",
        shownAt:          Date.now(),
        context:          { bestDay: data?.bestDay, bestHour: data?.bestHour },
      }).catch?.(() => {});
      // Fix 5: 알림 클릭 → 관련 패널로 자동 이동
      if (data?.navigate && typeof onNavigate === "function") onNavigate();
    }
    window.api?.on?.("golden:clicked", handleGoldenClicked);
    return () => window.api?.off?.("golden:clicked");
  }, [onNavigate]);

  // 컴포넌트 언마운트 시 렌더러 타이머 정리
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { armed, nextAlarmAt, permission, arm, disarm, requestPermission };
}
