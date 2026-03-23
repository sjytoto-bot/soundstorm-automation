const _VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function _safeTitle(title, videoId) {
  if (!title || !title.trim() || _VIDEO_ID_RE.test(title.trim())) {
    return "제목 없음";
  }
  return title.trim();
}

function _medianVideoViews(videoDiagnostics) {
  const vals = videoDiagnostics
    .map(v => v.views ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  return vals[Math.floor(vals.length / 2)];
}

function _channelAvgCTR(eligible) {
  const withCTR = eligible.filter(v => (v.ctr ?? 0) > 0);
  return withCTR.length > 0
    ? withCTR.reduce((s, v) => s + v.ctr, 0) / withCTR.length
    : null;
}

function _buildVideo(v, medianViews, channelAvgCTR, reasons) {
  const viewsDeltaPercent = medianViews
    ? Math.round((((v.views ?? 0) - medianViews) / medianViews) * 100)
    : null;
  const ctrDelta = channelAvgCTR && (v.ctr ?? 0) > 0
    ? Math.round(((v.ctr - channelAvgCTR) / channelAvgCTR) * 100)
    : null;
  return {
    videoId: v.videoId,
    title: _safeTitle(v.trackName || v.title, v.videoId),
    views: v.views,
    viewsDeltaPercent,
    ctr: (v.ctr ?? 0) > 0 ? v.ctr : null,
    ctrDelta,
    channelAvgCTR,
    reasons,
  };
}

function getDecliningVideos(videoDiagnostics = []) {
  if (!videoDiagnostics.length) return [];

  const eligible = videoDiagnostics.filter(v => (v.impressions ?? 0) >= 500);
  if (!eligible.length) return [];

  const avgCTR = _channelAvgCTR(eligible);
  const medianViews = _medianVideoViews(eligible);

  const declining = eligible.filter(v =>
    (v.impressionsChange != null && v.impressionsChange < -0.3) ||
    v.problemType === "IMPRESSION_DROP",
  );

  declining.sort((a, b) => (a.impressionsChange ?? 0) - (b.impressionsChange ?? 0));

  return declining.map(v => {
    const reasons = ["추천 노출 감소"];
    if (avgCTR && (v.ctr ?? 0) > 0 && v.ctr < avgCTR * 0.7) reasons.push("클릭률 저조");
    return _buildVideo(v, medianViews, avgCTR, reasons);
  });
}

function getConsistentlyLowVideos(videoDiagnostics = []) {
  if (!videoDiagnostics.length) return [];

  const eligible = videoDiagnostics.filter(v => (v.impressions ?? 0) >= 500);
  if (!eligible.length) return [];

  const avgCTR = _channelAvgCTR(eligible);
  const medianViews = _medianVideoViews(eligible);

  const low = eligible.filter(v => {
    if (v.impressionsChange != null && v.impressionsChange < -0.3) return false;
    if (v.problemType === "IMPRESSION_DROP") return false;

    const ctrLow = avgCTR && (v.ctr ?? 0) > 0 ? v.ctr < avgCTR * 0.7 : false;
    const viewsLow = medianViews ? (v.views ?? 0) < medianViews * 0.8 : false;
    return ctrLow || viewsLow;
  });

  low.sort((a, b) => {
    const ctrA = (a.ctr ?? 0) > 0 ? a.ctr : Infinity;
    const ctrB = (b.ctr ?? 0) > 0 ? b.ctr : Infinity;
    if (ctrA !== ctrB) return ctrA - ctrB;
    return (a.views ?? 0) - (b.views ?? 0);
  });

  return low.map(v => {
    const reasons = [];
    if (avgCTR && (v.ctr ?? 0) > 0 && v.ctr < avgCTR * 0.7) reasons.push("클릭률 저조");
    if (medianViews && (v.views ?? 0) < medianViews * 0.8) reasons.push("조회수 하락");
    if (reasons.length === 0) reasons.push("조회수 하락");
    return _buildVideo(v, medianViews, avgCTR, reasons);
  });
}

export function computeChannelHealth(diagnostics, kpiHistory, videoDiagnostics = []) {
  if (!kpiHistory || kpiHistory.length < 3) {
    return {
      score: null,
      grade: null,
      label: "데이터 부족",
      breakdown: [],
      pillarScores: { P1: 0, P2: 0, P3: 0, P4: 0 },
      base: 50,
      trend: "stable",
      insufficient: true,
    };
  }

  const breakdown = [];
  const pillarDelta = { P1: 0, P2: 0, P3: 0, P4: 0 };

  function push(pillar, reason, delta, interpretation, action, severity) {
    pillarDelta[pillar] += delta;
    breakdown.push({ pillar, reason, delta, interpretation, action, severity });
  }

  let score = 50;
  let trend = "stable";

  const sorted = [...kpiHistory].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const channelAvgViews = sorted.reduce((s, r) => s + r.views30d, 0) / sorted.length;
  const channelAvgSubChg = sorted.reduce((s, r) => s + r.subscriberChange, 0) / sorted.length;

  if (channelAvgViews > 0) {
    const ratio = (latest.views30d - channelAvgViews) / channelAvgViews;
    const pct = Math.round(ratio * 100);
    const delta = ratio > 0.20 ? 10 : ratio > 0.05 ? 5
      : ratio < -0.20 ? -10 : ratio < -0.05 ? -5 : 0;
    if (delta !== 0) {
      score += delta;
      const sev = delta > 0 ? "ok" : delta <= -8 ? "danger" : "warn";
      const structural = delta < 0 ? getConsistentlyLowVideos(videoDiagnostics).slice(0, 3) : [];
      push(
        "P1",
        `조회수 채널 평균 대비 ${pct > 0 ? "+" : ""}${pct}%`,
        delta,
        delta > 0 ? "채널 역대 평균보다 높은 성과" : null,
        delta > 0 ? null : {
          label: "성과 저조 영상 보기",
          type: "low_performance_videos",
          data: structural,
        },
        sev,
      );
    }
  }

  const absAvgSub = Math.abs(channelAvgSubChg);
  if (absAvgSub > 0) {
    const ratio = (latest.subscriberChange - channelAvgSubChg) / absAvgSub;
    const delta = ratio > 0.30 ? 8 : ratio > 0.10 ? 4
      : ratio < -0.30 ? -8 : ratio < -0.10 ? -4 : 0;
    if (delta !== 0) {
      score += delta;
      push(
        "P1",
        `구독자 증감 채널 평균 대비 ${delta > 0 ? "개선" : "악화"}`,
        delta,
        delta > 0 ? "구독 전환율이 채널 평균보다 높음" : "구독 전환율 하락 중",
        delta > 0 ? null : { label: "구독 전략 검토", type: "cta_strategy" },
        delta > 0 ? "ok" : "warn",
      );
    }
  } else if (latest.subscriberChange < 0) {
    score -= 8;
    push(
      "P1",
      "구독자 감소 (기준선 없음)",
      -8,
      "비교 기준 없으나 구독자 순감소 중",
      { label: "구독 전략 검토", type: "cta_strategy" },
      "danger",
    );
  }

  const algoScore = latest.algorithmScore ?? 0;
  const algoD = algoScore >= 80 ? 7 : algoScore >= 70 ? 4
    : algoScore >= 50 ? -4 : algoScore > 0 ? -7 : 0;
  if (algoD !== 0) {
    score += algoD;
    push(
      "P1",
      `알고리즘 점수 ${algoScore}점`,
      algoD,
      algoD > 0 ? "YouTube 알고리즘 최적화 상태" : "알고리즘 추천 노출 감소 상태",
      algoD > 0 ? null : { label: "A/B 테스트 시작", type: "thumbnail_ab" },
      algoD > 0 ? "ok" : algoD <= -7 ? "danger" : "warn",
    );
  }

  const recent = sorted.slice(-4);

  if (recent.length < 3) {
    push("P2", "데이터 부족", 0, "최근 3주 이상 데이터 필요 — 누적 후 자동 표시", null, "info");
  } else {
    const deltas = recent.slice(1).map((r, i) => r.views30d - recent[i].views30d);
    const rising = deltas.filter(d => d > 0).length;
    const falling = deltas.filter(d => d < 0).length;
    const trendD = rising === deltas.length ? 10 : rising >= deltas.length - 1 ? 5
      : falling === deltas.length ? -10 : falling >= deltas.length - 1 ? -5 : 0;

    score += trendD;
    if (trendD > 0) trend = "up";
    else if (trendD < 0) trend = "down";

    const decliningTrend = getDecliningVideos(videoDiagnostics).slice(0, 3);

    if (decliningTrend.length > 0) {
      push(
        "P2",
        "최근 하락 발생",
        trendD !== 0 ? trendD : -3,
        `노출 -30% 이상 영상 ${decliningTrend.length}개 감지`,
        { label: "최근 하락 영상 보기", type: "declining_videos", data: decliningTrend },
        "warn",
      );
    } else if (trendD > 0) {
      push("P2", `최근 ${deltas.length}주 연속 조회수 상승`, trendD, `최근 ${deltas.length}주 연속 조회수 증가`, null, "ok");
    } else if (trendD < 0) {
      push(
        "P2",
        `최근 ${deltas.length}주 연속 조회수 하락`,
        trendD,
        `최근 ${deltas.length}주 연속 조회수 감소`,
        { label: "업로드 패턴 보기", type: "upload_pattern", data: recent.map(r => ({ date: r.date, views: r.views30d })) },
        trendD <= -8 ? "danger" : "warn",
      );
    } else {
      push("P2", "조회수 변동 있음", 0, "성과 편차 증가 · 알고리즘 신호 불안정", null, "info");
    }
  }

  {
    const subD = recent.length >= 2
      ? recent.slice(1).map((r, i) => r.subscriberChange - recent[i].subscriberChange)
      : [];
    if (subD.length && subD.every(d => d > 0)) {
      score += 5;
      push("P2", "구독자 증가 추세", 5, "구독 전환율이 꾸준히 개선 중", null, "ok");
    } else if (subD.length && subD.every(d => d < 0)) {
      score -= 5;
      push("P2", "구독자 감소 추세", -5, "구독 전환율이 연속 하락 중", { label: "구독 CTA 검토", type: "cta_strategy" }, "warn");
    } else {
      push("P2", "구독자 변동 없음", 0, "의미 있는 증감 추세 없음", null, "info");
    }
  }

  {
    const prevAlgo = sorted.length >= 2 ? (sorted[sorted.length - 2].algorithmScore ?? 0) : null;
    const diff = prevAlgo != null ? algoScore - prevAlgo : null;
    if (diff != null && diff >= 5) {
      score += 5;
      push("P2", `알고리즘 점수 +${diff}pt 개선`, 5, "추천 노출 확대 중 — 현재 방향 유지", null, "ok");
    } else if (diff != null && diff <= -5) {
      score -= 5;
      push("P2", `알고리즘 점수 ${diff}pt 악화`, -5, "추천 노출 감소 상태 — 알고리즘 신호 약화", { label: "콘텐츠 포맷 검토", type: "format_strategy" }, "warn");
    } else {
      push("P2", "알고리즘 변화 없음", 0, diff != null ? "이전 주 대비 유의미한 변화 없음" : "비교 데이터 부족", null, "info");
    }
  }

  const eligibleCTR = (videoDiagnostics ?? []).filter(v => v.impressions >= 500 && v.ctr != null && v.ctr > 0);
  if (eligibleCTR.length > 0) {
    const ctrs = eligibleCTR.map(v => v.ctr).sort((a, b) => a - b);
    const medianCTR = ctrs[Math.floor(ctrs.length / 2)];
    const channelAvgCTR = ctrs.reduce((s, c) => s + c, 0) / ctrs.length;
    const platform = { danger: 0.015, warn: 0.025, caution: 0.040 };
    const channel = { danger: medianCTR * 0.50, warn: medianCTR * 0.70, caution: medianCTR * 0.90 };
    const thresh = {
      danger: Math.min(platform.danger, channel.danger),
      warn: Math.min(platform.warn, channel.warn),
      caution: Math.min(platform.caution, channel.caution),
    };
    const ctrD = channelAvgCTR < thresh.danger ? -20
      : channelAvgCTR < thresh.warn ? -10
      : channelAvgCTR < thresh.caution ? -3 : 0;
    if (ctrD !== 0) {
      score += ctrD;
      const disp = `${(channelAvgCTR * 100).toFixed(1)}%`;
      const sev = ctrD <= -20 ? "danger" : ctrD <= -10 ? "warn" : "info";
      const lowCtrVideos = [...eligibleCTR]
        .sort((a, b) => (a.ctr ?? 0) - (b.ctr ?? 0))
        .slice(0, 3)
        .map(v => ({
          videoId: v.videoId,
          title: _safeTitle(v.trackName || v.title, v.videoId),
          ctr: v.ctr,
          views: v.views,
          channelAvgCTR,
          reasons: ["클릭률 저조"],
        }));
      push(
        "P3",
        `채널 평균 CTR ${disp}`,
        ctrD,
        ctrD <= -20 ? "클릭률이 기준치를 크게 하회 — 썸네일 전면 재검토 필요" : "썸네일·제목 매력도 개선 여지 있음",
        {
          label: lowCtrVideos.length > 0
            ? `CTR ${(channelAvgCTR * 100).toFixed(1)}% 이하 영상 ${lowCtrVideos.length}개 확인`
            : "CTR 낮은 영상 확인",
          type: "low_ctr_videos",
          data: lowCtrVideos,
        },
        sev,
      );
    }
  }

  const retRows = (videoDiagnostics ?? []).filter(v => v.retentionRate != null);
  if (retRows.length > 0) {
    const avgRet = retRows.reduce((s, v) => s + (v.retentionRate ?? 0), 0) / retRows.length;
    const retD = avgRet < 0.20 ? -10 : avgRet < 0.35 ? -5 : avgRet < 0.50 ? -2 : 0;
    if (retD !== 0) {
      score += retD;
      const disp = `${Math.round(avgRet * 100)}%`;
      const sev = retD <= -10 ? "danger" : retD <= -5 ? "warn" : "info";
      const lowRetVideos = [...retRows]
        .sort((a, b) => (a.retentionRate ?? 0) - (b.retentionRate ?? 0))
        .slice(0, 3)
        .map(v => ({
          videoId: v.videoId,
          title: _safeTitle(v.trackName || v.title, v.videoId),
          retentionRate: v.retentionRate,
          reasons: ["초반 몰입도 문제"],
        }));
      push(
        "P3",
        `평균 시청유지율 ${disp}`,
        retD,
        retD <= -10 ? "콘텐츠 초반 이탈이 심각 — 인트로 즉시 점검" : "시청자 유지율이 평균 이하 — 구성 개선 필요",
        { label: "시청유지율 낮은 영상 보기", type: "low_retention_videos", data: lowRetVideos },
        sev,
      );
    }
  }

  const actionable = (diagnostics ?? []).filter(d =>
    d.problemType && d.problemType !== "NORMAL" && d.problemType !== "OK",
  );

  const ONE_DAY = 86400000;
  const todayMs = Date.now();
  const maxRow = actionable.reduce((m, d) => Math.max(m, d.rowIndex ?? 0), 0);

  function getWeight(d) {
    if (d.date) {
      const daysAgo = (todayMs - new Date(d.date).getTime()) / ONE_DAY;
      return Math.exp(-Math.max(0, daysAgo) / 7);
    }
    return Math.exp(-(maxRow - (d.rowIndex ?? 0)) / 7);
  }

  let wCritical = 0;
  let wHigh = 0;
  let wMedium = 0;

  for (const d of actionable) {
    const w = getWeight(d);
    if (d.severity === "CRITICAL") wCritical += w;
    else if (d.severity === "HIGH") wHigh += w;
    else if (d.severity === "MEDIUM") wMedium += w;
  }

  const _mapIssueVideo = d => ({
    videoId: d.videoId,
    title: _safeTitle(d.trackName || d.title, d.videoId),
    problemType: d.problemType,
    severity: d.severity,
    ctr: d.ctr,
    views: d.views,
    retentionRate: d.retentionRate,
  });
  const criticalVideos = actionable.filter(d => d.severity === "CRITICAL").slice(0, 3).map(_mapIssueVideo);
  const highVideos = actionable.filter(d => d.severity === "HIGH").slice(0, 3).map(_mapIssueVideo);
  const mediumVideos = actionable.filter(d => d.severity === "MEDIUM").slice(0, 3).map(_mapIssueVideo);

  if (wCritical > 0) {
    const delta = -Math.min(20, Math.round(wCritical * 12));
    score += delta;
    push("P4", `CRITICAL 이슈 ${wCritical.toFixed(1)}건`, delta, "즉각 대응이 필요한 이슈가 감지됨", { label: "문제 영상 리스트", type: "issue_videos", data: criticalVideos }, "danger");
  }
  if (wHigh > 0) {
    const delta = -Math.min(12, Math.round(wHigh * 6));
    score += delta;
    push("P4", `HIGH 이슈 ${wHigh.toFixed(1)}건`, delta, "이번 주 내 대응이 필요한 이슈", { label: "HIGH 영상 확인", type: "issue_videos", data: highVideos }, "warn");
  }
  if (wMedium > 0) {
    const delta = -Math.min(6, Math.round(wMedium * 2));
    score += delta;
    push("P4", `MEDIUM 이슈 ${wMedium.toFixed(1)}건`, delta, "모니터링 필요 — 당장 긴급하지 않음", { label: "모니터링 영상 보기", type: "issue_videos", data: mediumVideos }, "info");
  }
  if (actionable.length === 0) {
    score += 10;
    push("P4", "진단 이슈 없음", 10, "현재 감지된 문제 영상 없음 — 채널 정상 운영 중", null, "ok");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  const label = score >= 85 ? "우수" : score >= 70 ? "양호" : score >= 55 ? "주의" : "위험";
  const topIssue = breakdown
    .filter(b => b.delta < 0)
    .sort((a, b) => a.delta - b.delta)[0] ?? null;

  return {
    score,
    grade,
    label,
    breakdown,
    trend,
    insufficient: false,
    pillarScores: pillarDelta,
    base: 50,
    topIssue,
  };
}
