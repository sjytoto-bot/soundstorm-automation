"""
analytics/action_tracker.py  —  Action → Result 추적 레이어 (보완 1)

경보 발생 시점의 baseline 지표를 저장하고,
3일 후 재진단 시 개선 여부를 자동 비교하여 SUCCESS / FAILED / ONGOING 판정.

추적 파일: 03_RUNTIME/action_tracking.json
결과 흐름:
  alert_engine.py → register_alerts()    : 알림 발생 시 baseline 등록
  api_data_shuttler.py → check_results() : 매 실행마다 3일 경과 항목 결과 확인

판정 기준:
  SUCCESS : impressions ≥ baseline × 0.85  (15% 이내 회복)
  FAILED  : impressions < baseline × 0.85  AND 3일 초과
  ONGOING : 3일 미경과
"""

import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ─── 경로 ────────────────────────────────────────────────────────────────────

ANALYTICS_DIR      = Path(__file__).resolve().parent
AUTOMATION_DIR     = ANALYTICS_DIR.parent
RUNTIME_DIR        = AUTOMATION_DIR / "03_RUNTIME"
TRACKING_PATH      = RUNTIME_DIR / "action_tracking.json"
ARCHIVE_PATH       = RUNTIME_DIR / "action_tracking_archive.json"
PENDING_CHECKS_PATH = RUNTIME_DIR / "pending_checks.json"   # P2-A: 이벤트 파일

ARCHIVE_AFTER_DAYS = 30   # 결과 확정 후 30일 이상 경과 시 archive로 이동

# ─── 판정 상수 ────────────────────────────────────────────────────────────────

CHECK_AFTER_DAYS   = 3       # 몇 일 후 결과 체크
SUCCESS_THRESHOLD  = 0.85    # baseline 대비 85% 이상 회복 → SUCCESS
CTR_SUCCESS_GAIN   = 0.005   # CTR +0.5%p 이상 상승 → CTR_WEAK SUCCESS 보조 기준


# ─── 저장/로드 ────────────────────────────────────────────────────────────────

def _load() -> dict:
    if not TRACKING_PATH.exists():
        return {}
    try:
        with open(TRACKING_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(data: dict) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    active, archived = _split_for_archive(data)

    # 아카이브 대상이 있으면 archive 파일에 병합
    if archived:
        existing_archive: dict = {}
        if ARCHIVE_PATH.exists():
            try:
                with open(ARCHIVE_PATH, encoding="utf-8") as f:
                    existing_archive = json.load(f)
            except Exception:
                existing_archive = {}
        existing_archive.update(archived)
        with open(ARCHIVE_PATH, "w", encoding="utf-8") as f:
            json.dump(existing_archive, f, ensure_ascii=False, indent=2)
        print(f"  📦 [ActionTracker] {len(archived)}건 archive 이동 → action_tracking_archive.json")

    with open(TRACKING_PATH, "w", encoding="utf-8") as f:
        json.dump(active, f, ensure_ascii=False, indent=2)


def _split_for_archive(data: dict) -> tuple[dict, dict]:
    """
    result 확정 후 ARCHIVE_AFTER_DAYS 이상 경과한 항목을 분리한다.
    ONGOING 항목은 항상 active에 유지.
    """
    cutoff    = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_AFTER_DAYS)
    active:   dict = {}
    archived: dict = {}

    for key, entry in data.items():
        if entry.get("status") == "ONGOING":
            active[key] = entry
            continue

        result_str = entry.get("result")
        if not result_str:
            active[key] = entry
            continue

        try:
            result_dt = datetime.fromisoformat(result_str)
            if result_dt.tzinfo is None:
                result_dt = result_dt.replace(tzinfo=timezone.utc)
            if result_dt < cutoff:
                archived[key] = entry
            else:
                active[key] = entry
        except (ValueError, TypeError):
            active[key] = entry

    return active, archived


def _tracking_key(video_id: str, problem_type: str, severity: str) -> str:
    return f"{video_id}_{problem_type}_{severity}"


# ─── P2-A: 이벤트 파일 (pending_checks.json) ─────────────────────────────────
# alert_engine → write_pending_event() → pending_checks.json (PENDING)
# api_data_shuttler → consume_pending_events() → register_alerts() → PROCESSED
# 목적: alert_engine이 action_tracker를 직접 import하지 않음 (강결합 해소)

def _load_pending() -> list:
    if not PENDING_CHECKS_PATH.exists():
        return []
    try:
        with open(PENDING_CHECKS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_pending(events: list) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    tmp = PENDING_CHECKS_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)
    tmp.rename(PENDING_CHECKS_PATH)


def write_pending_event(rows: list[dict]) -> int:
    """
    alert_engine이 경보 발송 후 호출.
    각 row를 PENDING 이벤트로 pending_checks.json에 append.

    alert_engine은 이 함수만 호출 — action_tracker 내부 로직에 무관.
    Returns: 추가된 이벤트 수
    """
    events  = _load_pending()
    now_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).isoformat()
    added   = 0

    for row in rows:
        events.append({
            "event_id":   str(uuid.uuid4()),
            "event_type": "ALERT_ISSUED",
            "timestamp":  now_kst,
            "status":     "PENDING",
            "payload":    dict(row),
        })
        added += 1

    if added > 0:
        _save_pending(events)

    return added


def consume_pending_events() -> int:
    """
    api_data_shuttler가 실행 초반에 호출.
    PENDING 이벤트를 읽어 register_alerts()에 전달 후 PROCESSED로 마킹.

    Returns: 처리된 이벤트 수
    """
    events  = _load_pending()
    pending = [e for e in events if e.get("status") == "PENDING"]

    if not pending:
        return 0

    payloads = [e["payload"] for e in pending]
    register_alerts(payloads)   # 기존 등록 로직 재사용

    # PROCESSED 마킹
    processed_ids = {e["event_id"] for e in pending}
    now_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).isoformat()
    for e in events:
        if e.get("event_id") in processed_ids:
            e["status"]       = "PROCESSED"
            e["processed_at"] = now_kst

    _save_pending(events)
    print(f"  📬 [ActionTracker] pending_checks: {len(pending)}건 처리 완료 → PROCESSED")
    return len(pending)


# ─── 등록 ────────────────────────────────────────────────────────────────────

def register_alerts(rows: list[dict]) -> None:
    """
    alert_engine.py 에서 발송된 경보 목록을 추적 대상으로 등록한다.

    이미 추적 중인 항목(ONGOING)은 baseline 을 덮어쓰지 않는다.
    재발 항목(FAILED/SUCCESS)은 재등록하여 다시 추적 시작.
    """
    data    = _load()
    now_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).isoformat()
    added   = 0

    for row in rows:
        vid  = str(row.get("video_id",            "")).strip()
        prob = str(row.get("problem_type",         "")).upper()
        sev  = str(row.get("severity",             "")).upper()
        src  = str(row.get("traffic_source_type",  ""))
        key  = _tracking_key(vid, prob, sev)

        # 이미 ONGOING 상태면 재등록 스킵 (baseline 보존)
        if key in data and data[key].get("status") == "ONGOING":
            continue

        # baseline 지표 파싱
        def _safe_float(v, default=None):
            try:
                return float(v) if v not in (None, "", "None") else default
            except (ValueError, TypeError):
                return default

        baseline_imp  = _safe_float(row.get("impressions",      0), 0)
        baseline_prev = _safe_float(row.get("impressions_prev", 0), 0)
        baseline_ctr  = _safe_float(row.get("ctr",              0), 0)
        imp_change    = _safe_float(row.get("impressions_change"), None)

        # check_after: 알림 시각 + 3일
        check_after_dt = (
            datetime.now(timezone.utc) + timedelta(hours=9) + timedelta(days=CHECK_AFTER_DAYS)
        ).isoformat()

        data[key] = {
            "video_id":            vid,
            "problem_type":        prob,
            "traffic_source_type": src,
            "severity":            sev,
            "alert_time":          now_kst,
            "check_after":         check_after_dt,
            "status":              "ONGOING",
            "baseline": {
                "impressions":      baseline_imp,
                "impressions_prev": baseline_prev,
                "impressions_change": imp_change,
                "ctr":              baseline_ctr,
            },
            "result": None,
        }
        added += 1

    if added > 0:
        _save(data)

    print(f"  📌 [ActionTracker] {added}건 신규 등록 / {len(rows) - added}건 스킵(기존 ONGOING)")


# ─── 결과 체크 ────────────────────────────────────────────────────────────────

def check_results(diag_records: list[dict]) -> list[dict]:
    """
    추적 중인 항목 중 check_after 경과된 것에 대해 현재 진단과 비교.

    Args:
        diag_records: Video_Diagnostics 시트의 현재 레코드 목록

    Returns:
        결과가 갱신된 추적 항목 리스트 (SUCCESS/FAILED로 변경된 것만)
    """
    data = _load()
    if not data:
        return []

    now_kst = datetime.now(timezone.utc) + timedelta(hours=9)

    # 현재 진단을 video_id + problem_type 키로 인덱스
    diag_map: dict = {}
    for r in diag_records:
        vid  = str(r.get("video_id",     "")).strip()
        prob = str(r.get("problem_type", "")).upper()
        diag_map[f"{vid}_{prob}"] = r

    resolved = []

    for key, entry in data.items():
        if entry.get("status") != "ONGOING":
            continue

        # check_after 경과 여부
        try:
            check_dt = datetime.fromisoformat(entry["check_after"])
        except (KeyError, ValueError):
            continue

        # TODO: [Phase LATER] ActionTracker timezone mismatch — now_kst(aware) vs check_dt(naive)
        # 근본 수정: check_after 저장 시 timezone 포함 ISO 형식으로 통일 필요
        try:
            if now_kst < check_dt:
                # 아직 3일 미경과 — 스킵
                continue
        except TypeError:
            import warnings
            print(f"  ⚠ [ActionTracker] Timezone mismatch: now_kst={now_kst!r}, check_dt={check_dt!r}")
            continue

        vid  = entry.get("video_id",     "")
        prob = entry.get("problem_type", "")
        sev  = entry.get("severity",     "")
        diag_key = f"{vid}_{prob}"
        current  = diag_map.get(diag_key)

        # ── 판정 로직 ────────────────────────────────────────────────────────
        status     = _judge(entry, current)
        confidence = _confidence(entry, current, status)
        result_time = now_kst.isoformat()

        current_metrics = None
        if current:
            def _sf(v):
                try: return float(v) if v not in (None, "", "None") else None
                except: return None

            current_metrics = {
                "impressions":      _sf(current.get("impressions")),
                "impressions_prev": _sf(current.get("impressions_prev")),
                "impressions_change": _sf(current.get("impressions_change")),
                "ctr":              _sf(current.get("ctr")),
                "problem_type":     str(current.get("problem_type", "")),
                "severity":         str(current.get("severity",     "")),
            }

        entry["status"]          = status
        entry["confidence"]      = confidence
        entry["result"]          = result_time
        entry["current_metrics"] = current_metrics

        print(f"  {'✅' if status == 'SUCCESS' else '❌'} [{status}] [{sev}/{prob}] {vid[:20]}")
        resolved.append(entry)

    if resolved:
        _save(data)
        print(f"  📊 [ActionTracker] {len(resolved)}건 결과 확정 (SUCCESS/FAILED)")

    return resolved


def _judge(entry: dict, current: dict | None) -> str:
    """
    baseline vs current 비교 → SUCCESS / FAILED 판정.

    판정 기준:
      IMPRESSION_DROP:
        impressions ≥ baseline.impressions × SUCCESS_THRESHOLD  → SUCCESS
        else                                                     → FAILED
      CTR_WEAK:
        current.ctr ≥ baseline.ctr + CTR_SUCCESS_GAIN           → SUCCESS
        else                                                     → FAILED
      그 외:
        current.problem_type == "NORMAL"                         → SUCCESS
        else                                                     → FAILED
    """
    if current is None:
        # 현재 진단 데이터 없음 → 영상이 사라지거나 조회 못함 → 판정 불가 → FAILED 보수적 처리
        return "FAILED"

    prob      = entry.get("problem_type", "")
    baseline  = entry.get("baseline", {})

    def _sf(v):
        try: return float(v) if v not in (None, "", "None") else 0.0
        except: return 0.0

    if prob == "IMPRESSION_DROP":
        base_imp    = _sf(baseline.get("impressions", 0))
        current_imp = _sf(current.get("impressions",  0))
        if base_imp > 0:
            return "SUCCESS" if current_imp >= base_imp * SUCCESS_THRESHOLD else "FAILED"
        # baseline 0이면 현재가 NORMAL이면 SUCCESS
        return "SUCCESS" if str(current.get("problem_type","")).upper() == "NORMAL" else "FAILED"

    if prob == "CTR_WEAK":
        base_ctr    = _sf(baseline.get("ctr", 0))
        current_ctr = _sf(current.get("ctr", 0))
        return "SUCCESS" if current_ctr >= base_ctr + CTR_SUCCESS_GAIN else "FAILED"

    # 기본: 현재 problem_type 이 NORMAL 이면 SUCCESS
    return "SUCCESS" if str(current.get("problem_type","")).upper() == "NORMAL" else "FAILED"


def _confidence(entry: dict, current: dict | None, status: str) -> str:
    """
    SUCCESS/FAILED 판정의 신뢰도를 계산한다.

    HIGH   : 타깃 지표만 개선, 외부 지표 유지 → 액션 효과 가능성 높음
    MEDIUM : 일부 지표 함께 개선 → 복합 원인 가능
    LOW    : 전체 지표 동반 상승 → 알고리즘 추천 등 외부 요인 가능성 높음

    외부 영향 판단 기준 (absolute + relative 동시 평가):
      CTR delta를 절대값(+%p)과 상대비율(÷ baseline_ctr) 양쪽으로 평가.
      이유: baseline 3% → +0.5%p = +16% (의미 있음)
            baseline 6% → +0.5%p = +8%  (상대적으로 약함)
      두 기준 중 하나라도 임계치 초과 시 해당 레벨 적용 (보수적 판단).
    """
    if current is None:
        return "LOW"

    prob     = entry.get("problem_type", "")
    baseline = entry.get("baseline", {})

    def _sf(v):
        try: return float(v) if v not in (None, "", "None") else 0.0
        except: return 0.0

    base_imp    = _sf(baseline.get("impressions", 0))
    base_ctr    = _sf(baseline.get("ctr",         0))
    current_imp = _sf(current.get("impressions",  0))
    current_ctr = _sf(current.get("ctr",          0))

    imp_change_ratio = (current_imp - base_imp) / base_imp if base_imp > 0 else 0.0
    ctr_abs          = current_ctr - base_ctr
    ctr_rel          = ctr_abs / base_ctr if base_ctr > 0 else 0.0

    # CTR 변화가 "유의미"한지: 절대 +1%p 초과 OR 상대 +20% 초과
    def _ctr_high_change() -> bool:
        return ctr_abs > 0.01 or ctr_rel > 0.20

    def _ctr_mid_change() -> bool:
        return ctr_abs > 0.005 or ctr_rel > 0.10

    if prob == "IMPRESSION_DROP":
        # 타깃: 노출 회복 — CTR 동반 급등이면 외부 요인 의심
        if _ctr_high_change():
            return "LOW"
        elif _ctr_mid_change():
            return "MEDIUM"
        else:
            return "HIGH"       # 노출만 회복, CTR 유지 → 썸네일/제목 효과

    elif prob == "CTR_WEAK":
        # 타깃: CTR 개선 — 노출 동반 급등이면 외부 요인 의심
        if imp_change_ratio > 0.30:
            return "LOW"
        elif imp_change_ratio > 0.15:
            return "MEDIUM"
        else:
            return "HIGH"       # CTR만 상승, 노출 유지 → 썸네일/제목 효과

    else:
        return "MEDIUM"


# ─── 요약 조회 ────────────────────────────────────────────────────────────────

def get_summary() -> dict:
    """
    추적 현황 요약.
    Returns: {
      "total": N, "ongoing": N, "success": N, "failed": N,
      "items": [...],
      "by_action_type": {
        "IMPRESSION_DROP": { "success": N, "failed": N, "rate": 0.75 },
        ...
      }
    }
    """
    data = _load()
    summary: dict = {"total": 0, "ongoing": 0, "success": 0, "failed": 0, "items": [], "by_action_type": {}}

    for key, entry in data.items():
        summary["total"] += 1
        status      = entry.get("status", "ONGOING").upper()
        action_type = entry.get("action_type") or entry.get("problem_type") or "UNKNOWN"

        if status == "ONGOING":
            summary["ongoing"] += 1
        else:
            # action_type별 성과 집계 (SUCCESS / FAILED 항목만)
            bucket = summary["by_action_type"].setdefault(action_type, {"success": 0, "failed": 0, "rate": 0.0})
            if status == "SUCCESS":
                summary["success"] += 1
                bucket["success"] += 1
            elif status == "FAILED":
                summary["failed"] += 1
                bucket["failed"] += 1
            total_resolved = bucket["success"] + bucket["failed"]
            bucket["rate"] = round(bucket["success"] / total_resolved, 2) if total_resolved > 0 else 0.0

        summary["items"].append({
            "key":           key,
            "video_id":      entry.get("video_id"),
            "problem_type":  entry.get("problem_type"),
            "action_type":   action_type,
            "severity":      entry.get("severity"),
            "status":        status,
            "confidence":    entry.get("confidence", "MEDIUM"),
            "alert_time":    entry.get("alert_time"),
            "check_after":   entry.get("check_after"),
        })

    return summary


# ─── 패턴 성공률 ──────────────────────────────────────────────────────────────

def get_pattern_success_rates() -> dict:
    """
    action_tracking.json의 SUCCESS/FAILED 항목에서 pattern_tags별 성공률을 집계한다.

    반환 형식:
      {
        "THUMBNAIL_REPLACE": { "success": 3, "failed": 1, "rate": 0.75 },
        "CTR_WEAK":          { "success": 2, "failed": 2, "rate": 0.50 },
        ...
      }

    - ONGOING 항목은 제외 (결과 미확정)
    - pattern_tags가 비어있으면 action_type을 단일 태그로 fallback
    - rate: 0.0 ~ 1.0 (소수점 2자리)
    """
    data   = _load()
    counts: dict = {}

    for entry in data.values():
        status = entry.get("status", "ONGOING").upper()
        if status == "ONGOING":
            continue

        tags = entry.get("pattern_tags") or []
        if not tags:
            tags = [entry.get("action_type", "UNKNOWN")]

        for tag in tags:
            if tag not in counts:
                counts[tag] = {"success": 0, "failed": 0, "rate": 0.0}
            if status == "SUCCESS":
                counts[tag]["success"] += 1
            elif status == "FAILED":
                counts[tag]["failed"] += 1

    for tag, c in counts.items():
        total   = c["success"] + c["failed"]
        c["rate"] = round(c["success"] / total, 2) if total > 0 else 0.0

    return counts


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    summary = get_summary()
    print(f"\n📊 [ActionTracker] 현황")
    print(f"  전체: {summary['total']}건")
    print(f"  ONGOING: {summary['ongoing']}건")
    print(f"  SUCCESS: {summary['success']}건")
    print(f"  FAILED:  {summary['failed']}건")

    if summary["items"]:
        print("\n  상세:")
        for item in sorted(summary["items"], key=lambda x: x.get("alert_time",""), reverse=True)[:10]:
            status_icon = {"SUCCESS": "✅", "FAILED": "❌", "ONGOING": "🔄"}.get(item["status"], "?")
            print(f"  {status_icon} [{item['severity']}/{item['problem_type']}] {item['video_id']}")
