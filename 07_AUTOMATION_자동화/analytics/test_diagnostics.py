#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analytics/test_diagnostics.py

video_diagnostics_engine 진단 로직 정확도 검증.

테스트 케이스:
  Case 1 — 조회수 급락 (IMPRESSION_DROP 잡혀야 함)
  Case 2 — CTR 낮은 영상 (CTR_WEAK만 잡혀야 함)
  Case 3 — 외부 유입 끊긴 영상 (EXTERNAL_DROP 잡혀야 함)
  Case 4 — MIXED_DROP (모든 소스가 임계값 미만으로 균일 감소)
  Case 5 — CRITICAL severity (-65% 감소)
  Case 6 — 정상 영상 (NORMAL)

실행:
    python3 07_AUTOMATION_자동화/analytics/test_diagnostics.py
"""

import sys
from pathlib import Path

# 모듈 경로 추가
sys.path.insert(0, str(Path(__file__).parent.parent))

from analytics.video_diagnostics_engine import (
    _diagnose,
    _classify_impression_drop,
    _calc_severity,
    RECOMMENDATIONS,
)

# ─── 테스트 헬퍼 ──────────────────────────────────────────────────────────────

PASS = "✅ PASS"
FAIL = "❌ FAIL"

def check(label, got, expected):
    ok = got == expected
    icon = PASS if ok else FAIL
    print(f"  {icon}  {label}")
    if not ok:
        print(f"       got:      {got!r}")
        print(f"       expected: {expected!r}")
    return ok

# ─── 공통 기준선 ──────────────────────────────────────────────────────────────

MEDIAN_CTR = 0.055   # 5.5%
MEDIAN_IMP = 5000
AVG_WATCH  = 120.0   # 2분
AVG_VIEWS  = 3000

# ─── Case 1: 조회수 급락 (IMPRESSION_DROP 잡혀야 함) ─────────────────────────

def test_case1():
    print("\n[Case 1] 조회수 급락 영상 → IMPRESSION_DROP 기대")
    # 노출이 전월 대비 -45% 감소. CTR은 정상 범위.
    row = {
        "video_id":        "VIDEO_CASE1",
        "impressions":     2750,
        "impressions_prev": 5000,   # -45% drop
        "ctr":             0.058,   # CTR 정상
        "avg_watch_time":  125.0,
        "views":           160,
    }
    traffic_map = {
        "VIDEO_CASE1": {
            "impressions_browse":    1200,  "browse_prev":    2500,  # -52%
            "impressions_suggested": 1200,  "suggested_prev": 1800,  # -33%
            "impressions_external":   350,  "external_prev":   700,  # -50%
        }
    }

    pt, tst, d, r, sev = _diagnose(row, MEDIAN_CTR, MEDIAN_IMP, AVG_WATCH, AVG_VIEWS, traffic_map)
    passed = True
    passed &= check("problem_type == IMPRESSION_DROP", pt, "IMPRESSION_DROP")
    passed &= check("diagnosis == BROWSE_DROP (가장 큰 drop = BROWSE -52%)", d, "BROWSE_DROP")
    passed &= check("severity == HIGH (-45% → HIGH 기준 -40%)", sev, "HIGH")
    return passed

# ─── Case 2: CTR 낮은 영상 (CTR_WEAK만 잡혀야 함) ────────────────────────────

def test_case2():
    print("\n[Case 2] CTR 낮은 영상 → CTR_WEAK (IMPRESSION_DROP 아님)")
    # impressions_prev 없음 → IMPRESSION_DROP 감지 불가. CTR만 낮음.
    row = {
        "video_id":        "VIDEO_CASE2",
        "impressions":     8000,    # median 이상 (5000)
        "impressions_prev": 0,       # prev 없음 → IMPRESSION_DROP 스킵
        "ctr":             0.031,   # < median*0.7 (0.055*0.7=0.0385) → CTR_WEAK
        "avg_watch_time":  130.0,
        "views":           248,
    }
    traffic_map = {}  # traffic data 없음

    pt, tst, d, r, sev = _diagnose(row, MEDIAN_CTR, MEDIAN_IMP, AVG_WATCH, AVG_VIEWS, traffic_map)
    passed = True
    passed &= check("problem_type == CTR_WEAK", pt, "CTR_WEAK")
    passed &= check("diagnosis == THUMBNAIL_WEAK", d, "THUMBNAIL_WEAK")
    passed &= check("severity == NONE (CTR_WEAK는 severity 없음)", sev, "NONE")
    return passed

# ─── Case 3: 외부 유입 끊긴 영상 (EXTERNAL_DROP 잡혀야 함) ───────────────────

def test_case3():
    print("\n[Case 3] 외부 유입 끊긴 영상 → EXTERNAL_DROP 기대")
    row = {
        "video_id":        "VIDEO_CASE3",
        "impressions":     3500,
        "impressions_prev": 5000,   # -30% drop → IMPRESSION_DROP 트리거
        "ctr":             0.057,
        "avg_watch_time":  118.0,
        "views":           200,
    }
    traffic_map = {
        "VIDEO_CASE3": {
            "impressions_browse":    1800,  "browse_prev":    2000,  # -10% (임계값 미만)
            "impressions_suggested": 1500,  "suggested_prev": 1700,  # -12% (임계값 미만)
            "impressions_external":   200,  "external_prev":  1300,  # -85% → EXTERNAL -50% 초과!
        }
    }

    pt, tst, d, r, sev = _diagnose(row, MEDIAN_CTR, MEDIAN_IMP, AVG_WATCH, AVG_VIEWS, traffic_map)
    passed = True
    passed &= check("problem_type == IMPRESSION_DROP", pt, "IMPRESSION_DROP")
    passed &= check("diagnosis == EXTERNAL_DROP (external -85%)", d, "EXTERNAL_DROP")
    passed &= check("trafficSourceType == EXTERNAL", tst, "EXTERNAL")
    return passed

# ─── Case 4: MIXED_DROP (모든 소스 임계값 미만 균일 감소) ─────────────────────

def test_case4():
    print("\n[Case 4] 균일 감소 → MIXED_DROP 기대")
    row = {
        "video_id":        "VIDEO_CASE4",
        "impressions":     4000,
        "impressions_prev": 5200,   # -23% → IMPRESSION_DROP 트리거
        "ctr":             0.053,
        "avg_watch_time":  115.0,
        "views":           212,
    }
    traffic_map = {
        "VIDEO_CASE4": {
            "impressions_browse":    1600,  "browse_prev":    1800,  # -11%
            "impressions_suggested": 1800,  "suggested_prev": 2000,  # -10%
            "impressions_external":   600,  "external_prev":   650,  # -8%
        }
    }
    # 최대 drop = BROWSE -11% (< -30% 임계값 미만) → MIXED_DROP

    pt, tst, d, r, sev = _diagnose(row, MEDIAN_CTR, MEDIAN_IMP, AVG_WATCH, AVG_VIEWS, traffic_map)
    passed = True
    passed &= check("problem_type == IMPRESSION_DROP", pt, "IMPRESSION_DROP")
    passed &= check("diagnosis == MIXED_DROP", d, "MIXED_DROP")
    passed &= check("severity == MEDIUM (-23%)", sev, "MEDIUM")
    return passed

# ─── Case 5: CRITICAL severity (-65% 감소) ───────────────────────────────────

def test_case5():
    print("\n[Case 5] -65% 급락 → CRITICAL severity 기대")
    row = {
        "video_id":        "VIDEO_CASE5",
        "impressions":     1750,
        "impressions_prev": 5000,   # -65%
        "ctr":             0.06,
        "avg_watch_time":  130.0,
        "views":           105,
    }
    traffic_map = {
        "VIDEO_CASE5": {
            "impressions_browse":     900,  "browse_prev":    3000,  # -70%
            "impressions_suggested":  600,  "suggested_prev": 1400,  # -57%
            "impressions_external":   250,  "external_prev":   600,  # -58%
        }
    }

    pt, tst, d, r, sev = _diagnose(row, MEDIAN_CTR, MEDIAN_IMP, AVG_WATCH, AVG_VIEWS, traffic_map)
    passed = True
    passed &= check("problem_type == IMPRESSION_DROP", pt, "IMPRESSION_DROP")
    passed &= check("severity == CRITICAL (-65%)", sev, "CRITICAL")
    passed &= check("diagnosis == BROWSE_DROP (가장 큰 drop -70%)", d, "BROWSE_DROP")
    return passed

# ─── Case 6: 정상 영상 (NORMAL) ───────────────────────────────────────────────

def test_case6():
    print("\n[Case 6] 정상 영상 → NORMAL 기대")
    # CTR이 median*1.2 이하이고, 노출·시청시간 모두 정상 범위
    # ctr=0.060 < median(0.055)*1.2(0.066) → ALGORITHM_DISTRIBUTION_LOW 미해당
    row = {
        "video_id":        "VIDEO_CASE6",
        "impressions":     5500,
        "impressions_prev": 5200,   # +6% 소폭 상승 → IMPRESSION_DROP 아님
        "ctr":             0.060,   # median*1.2=0.066 미만 → ALGORITHM_LOW 스킵
        "avg_watch_time":  145.0,   # watch time 정상 (채널 평균 120s 이상)
        "views":           3300,    # avg_views*0.6=1800 이상 → ALGORITHM_LOW 스킵
    }
    traffic_map = {}

    pt, tst, d, r, sev = _diagnose(row, MEDIAN_CTR, MEDIAN_IMP, AVG_WATCH, AVG_VIEWS, traffic_map)
    passed = True
    passed &= check("problem_type == NORMAL", pt, "NORMAL")
    passed &= check("diagnosis == NORMAL", d, "NORMAL")
    return passed

# ─── _calc_severity 단위 테스트 ───────────────────────────────────────────────

def test_severity_thresholds():
    print("\n[Severity Thresholds] _calc_severity 단위 테스트")
    # 경계값 포함 기준 (<=): -0.20 이하 → MEDIUM, -0.40 이하 → HIGH, -0.60 이하 → CRITICAL
    cases = [
        (None,   "NONE"),
        (-0.10,  "NONE"),
        (-0.19,  "NONE"),
        (-0.20,  "MEDIUM"),    # -20% 경계 포함 → MEDIUM
        (-0.21,  "MEDIUM"),
        (-0.39,  "MEDIUM"),
        (-0.40,  "HIGH"),      # -40% 경계 포함 → HIGH
        (-0.41,  "HIGH"),
        (-0.59,  "HIGH"),
        (-0.60,  "CRITICAL"),  # -60% 경계 포함 → CRITICAL
        (-0.61,  "CRITICAL"),
        (-1.00,  "CRITICAL"),
    ]
    passed = True
    for change, expected in cases:
        got = _calc_severity(change)
        ok  = got == expected
        icon = PASS if ok else FAIL
        label = f"change={change} → {expected}"
        print(f"  {icon}  {label}")
        if not ok:
            print(f"       got: {got!r}")
        passed &= ok
    return passed

# ─── 메인 실행 ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  video_diagnostics_engine 진단 정확도 검증")
    print("=" * 60)

    results = [
        test_case1(),
        test_case2(),
        test_case3(),
        test_case4(),
        test_case5(),
        test_case6(),
        test_severity_thresholds(),
    ]

    total  = len(results)
    passed = sum(results)
    failed = total - passed

    print("\n" + "=" * 60)
    print(f"  결과: {passed}/{total} PASS  |  {failed} FAIL")
    if failed == 0:
        print("  🎉 모든 진단 케이스 통과 — 로직 정상")
    else:
        print("  ⚠️  실패한 케이스 있음 — 진단 로직 재검토 필요")
    print("=" * 60)

    sys.exit(0 if failed == 0 else 1)
