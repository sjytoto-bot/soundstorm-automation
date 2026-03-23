"""
analytics/alert_engine.py  —  PHASE 10-A: 자동 경보 발송 엔진

Video_Diagnostics 시트를 읽어 CRITICAL/HIGH severity 영상에 이메일 알림 발송.

발송 규칙:
  CRITICAL → 24시간 내 재발송 금지
  HIGH     → 당일(KST 날짜 기준) 1회
  MEDIUM / NONE / INSUFFICIENT_DATA → 무시

중복 방지 로그 키: {video_id}_{problem_type}_{severity}
  → 같은 영상이라도 문제 유형이 다르면 독립 추적 (CTR_WEAK vs IMPRESSION_DROP)

수신자: .env의 ALERT_EMAIL (기본: SMTP_USER 자기 자신)
"""

import json
import os
import smtplib
import sys
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

# ─── 경로 설정 ────────────────────────────────────────────────────────────────

ANALYTICS_DIR    = Path(__file__).resolve().parent
AUTOMATION_DIR   = ANALYTICS_DIR.parent
RUNTIME_DIR      = AUTOMATION_DIR / "03_RUNTIME"
ENV_PATH         = AUTOMATION_DIR / "license_engine" / ".env"
CREDENTIALS_PATH = AUTOMATION_DIR / "credentials" / "service_account.json"
ALERT_LOG_PATH     = RUNTIME_DIR / "alert_sent_log.json"
ALERT_HISTORY_PATH = RUNTIME_DIR / "alert_history.json"

# soundstorm-panel/logs/state.json — PHASE 10-E Task 자동 생성 대상
_PANEL_ROOT    = AUTOMATION_DIR.parent / "00_SOUNDSTORM_OS" / "soundstorm-panel"
STATE_JSON_PATH = _PANEL_ROOT / "logs" / "state.json"

load_dotenv(dotenv_path=ENV_PATH)

SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "")
SMTP_SERVER    = os.environ.get("SMTP_SERVER",   "smtp.gmail.com")
SMTP_PORT      = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER      = os.environ.get("SMTP_USER",     "")
SMTP_PASSWORD  = os.environ.get("SMTP_PASSWORD", "")
ALERT_TO       = os.environ.get("ALERT_EMAIL",   SMTP_USER)

DIAG_SHEET = "Video_Diagnostics"

# ─── 추천 액션 매핑 ────────────────────────────────────────────────────────────
# traffic_source_type 우선, 없으면 problem_type fallback

ACTIONS = {
    "BROWSE_DROP": [
        "홈피드 썸네일 A/B 테스트 즉시 시작",
        "최근 7일 CTR vs 채널 중앙값 비교",
        "커뮤니티/게시글로 외부 트래픽 유입 시도",
    ],
    "SUGGESTED_DROP": [
        "연관 영상 최적화: 제목·태그·엔드카드 검토",
        "시청유지율 이탈 구간 파악 (Analytics 확인)",
        "성과 높은 영상과 시리즈 연결 카드 추가",
    ],
    "EXTERNAL_DROP": [
        "링크 공유 채널(카카오·인스타·유튜브 커뮤니티) 재활성화",
        "최근 SNS 게시 일정 및 클릭률 점검",
        "Redirect Tracker 캠페인 CTR 재확인",
    ],
    "MIXED_DROP": [
        "썸네일 + 제목 동시 점검 (복합 원인 가능)",
        "업로드 주기 또는 시간대 조정 검토",
        "최근 30일 노출 소스별 추이 전체 점검",
    ],
    "IMPRESSION_DROP": [
        "노출 소스 분해 확인 (BROWSE/SUGGESTED/EXTERNAL)",
        "썸네일·제목 A/B 테스트",
        "최근 알고리즘 변화 및 경쟁 채널 동향 체크",
    ],
    "CTR_WEAK": [
        "썸네일 교체 우선 진행",
        "제목 첫 10자 키워드 강도 점검",
        "유사 채널 상위 영상 썸네일 벤치마킹",
    ],
    "RETENTION_WEAK": [
        "인트로 15초 리뷰 (이탈 지점 파악)",
        "재생목록 연결 강화",
        "영상 길이 vs 시청유지율 상관관계 분석",
    ],
}

SEV_EMOJI = {"CRITICAL": "🔴", "HIGH": "🟠"}


# ─── 유틸 ────────────────────────────────────────────────────────────────────

def _imp_change_float(row: dict) -> float:
    """impressions_change 를 float 으로 반환. 없으면 0."""
    try:
        v = row.get("impressions_change", "")
        return float(v) if v not in (None, "", "None") else 0.0
    except (ValueError, TypeError):
        return 0.0


def _studio_link(video_id: str) -> str:
    """YouTube Studio 영상별 Analytics 링크."""
    return f"https://studio.youtube.com/video/{video_id}/analytics"


# ─── 중복 방지 로그 ───────────────────────────────────────────────────────────
# 키: "{video_id}_{problem_type}_{severity}"
# → 같은 영상이라도 문제 유형이 다르면 독립 추적
# 예) abc123_CTR_WEAK_HIGH vs abc123_IMPRESSION_DROP_CRITICAL → 각자 발송

def _log_key(video_id: str, problem_type: str, severity: str) -> str:
    return f"{video_id}_{problem_type}_{severity}"


def _load_alert_log() -> dict:
    if not ALERT_LOG_PATH.exists():
        return {}
    try:
        with open(ALERT_LOG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_alert_log(log: dict) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(ALERT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


def _should_send(video_id: str, problem_type: str, severity: str, log: dict) -> bool:
    """
    CRITICAL → 24시간 이내 재발송 금지
    HIGH     → 당일(KST 날짜) 1회 제한
    키는 video_id + problem_type + severity 조합 → 다른 문제 유형은 독립 발송
    """
    key = _log_key(video_id, problem_type, severity)
    if key not in log:
        return True

    now_kst = datetime.now(timezone.utc) + timedelta(hours=9)
    try:
        sent_at = datetime.fromisoformat(log[key])
    except ValueError:
        return True

    if severity == "CRITICAL":
        return (now_kst - sent_at).total_seconds() > 86_400
    if severity == "HIGH":
        return sent_at.date() < now_kst.date()
    return False


def _mark_sent(video_id: str, problem_type: str, severity: str, log: dict) -> None:
    now_kst = datetime.now(timezone.utc) + timedelta(hours=9)
    log[_log_key(video_id, problem_type, severity)] = now_kst.isoformat()


# ─── alert_history.json — append-only 발송 히스토리 ──────────────────────────
# 구조: { "{video_id}_{problem_type}_{severity}": { 핵심 필드 } }
# 같은 키 재발생 시 덮어쓰기 (최신 기록 유지)
# → action_tracker.py 의 baseline 데이터로 활용

def _load_alert_history() -> dict:
    if not ALERT_HISTORY_PATH.exists():
        return {}
    try:
        with open(ALERT_HISTORY_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _append_alert_history(row: dict, history: dict) -> None:
    """발송된 경보 1건을 history 딕셔너리에 기록한다."""
    vid  = str(row.get("video_id",            "")).strip()
    prob = str(row.get("problem_type",         "")).upper()
    sev  = str(row.get("severity",             "")).upper()
    src  = str(row.get("traffic_source_type",  ""))
    key  = _log_key(vid, prob, sev)

    # impressions_change: float 변환 (문자열 허용)
    imp_change = None
    try:
        v = row.get("impressions_change", "")
        if v not in (None, "", "None"):
            imp_change = round(float(v), 4)
    except (ValueError, TypeError):
        pass

    # ctr: float 변환
    ctr = None
    try:
        v = row.get("ctr", "")
        if v not in (None, "", 0, "0"):
            ctr = round(float(v), 4)
    except (ValueError, TypeError):
        pass

    now_kst = (datetime.now(timezone.utc) + timedelta(hours=9)).isoformat()

    history[key] = {
        "video_id":            vid,
        "problem_type":        prob,
        "traffic_source_type": src,
        "severity":            sev,
        "impressions":         row.get("impressions",      0),
        "impressions_prev":    row.get("impressions_prev", 0),
        "impressions_change":  imp_change,
        "ctr":                 ctr,
        "timestamp":           now_kst,
    }


def _save_alert_history(history: dict) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    with open(ALERT_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


# ─── PHASE 10-E: CRITICAL → state.json Task 자동 생성 ────────────────────────
# 규칙:
#   ① CRITICAL 만 생성 (HIGH 제외 — Task 폭증 방지)
#   ② linked_alert_key 중복 방지 (같은 경보 키 존재 시 스킵)
#   ③ traffic_source_type 분기 → 문제별 액션 제목

_TASK_TITLE_MAP = {
    "BROWSE_DROP":    "[자동] 썸네일 A/B 테스트 — {title}",
    "SUGGESTED_DROP": "[자동] 연관 영상 최적화 — {title}",
    "EXTERNAL_DROP":  "[자동] 외부 유입 점검 — {title}",
    "MIXED_DROP":     "[자동] 채널 상태 점검 — {title}",
    "CTR_WEAK":       "[자동] CTR 개선 — {title}",
    "IMPRESSION_DROP":"[자동] 노출 이슈 점검 — {title}",
}


def _create_auto_tasks(rows: list[dict]) -> int:
    """
    CRITICAL severity 행에 대해 state.json tasks[] 에 자동 태스크 추가.
    - 이미 동일 linked_alert_key 가 존재하면 스킵 (중복 방지)
    - traffic_source_type 기준 제목 분기

    Returns:
        실제로 추가된 태스크 수
    """
    if not STATE_JSON_PATH.exists():
        print(f"  ⚠️  [10-E] state.json 없음 ({STATE_JSON_PATH}) — Task 생성 스킵")
        return 0

    # state.json 로드
    try:
        with open(STATE_JSON_PATH, encoding="utf-8") as f:
            state = json.load(f)
    except Exception as e:
        print(f"  ⚠️  [10-E] state.json 읽기 실패: {e}")
        return 0

    existing_tasks   = state.get("tasks", [])
    existing_keys    = {t.get("linked_alert_key") for t in existing_tasks if t.get("linked_alert_key")}
    now_kst          = datetime.now(timezone.utc) + timedelta(hours=9)
    date_str         = now_kst.strftime("%Y%m%d")
    added            = 0

    for row in rows:
        sev  = str(row.get("severity",             "")).upper()
        if sev != "CRITICAL":
            continue   # ① CRITICAL 만

        vid   = str(row.get("video_id",            "")).strip()
        prob  = str(row.get("problem_type",         "")).upper()
        src   = str(row.get("traffic_source_type",  ""))
        title = str(row.get("title") or row.get("video_id", "(제목 없음)"))
        alert_key = _log_key(vid, prob, sev)

        # ② 중복 방지
        if alert_key in existing_keys:
            print(f"  ⏭️  [10-E] 이미 존재하는 Task 스킵: {alert_key[:40]}")
            continue

        # ③ 문제 타입별 제목 분기 (src 우선, 없으면 prob fallback)
        template = _TASK_TITLE_MAP.get(src) or _TASK_TITLE_MAP.get(prob, "[자동] 긴급 점검 — {title}")
        task_title = template.format(title=title[:20])   # 제목 20자 제한

        task_id = f"task_{vid}_{date_str}_{prob.lower()}"

        new_task = {
            "id":                  task_id,
            "video_id":            vid,
            "title":               task_title,
            "priority":            "CRITICAL",
            "status":              "PENDING",
            "source":              "auto_alert",
            "problem_type":        prob,
            "traffic_source_type": src,
            "created_at":          now_kst.isoformat(),
            "updated_at":          now_kst.isoformat(),
            "linked_alert_key":    alert_key,
            "context_log":         [],
        }

        existing_tasks.append(new_task)
        existing_keys.add(alert_key)
        added += 1
        print(f"  ➕ [10-E] Task 생성: [{sev}] {task_title[:50]}")

    if added > 0:
        state["tasks"] = existing_tasks
        try:
            with open(STATE_JSON_PATH, "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            print(f"  💾 [10-E] state.json 업데이트 완료 ({added}건 추가)")
        except Exception as e:
            print(f"  ❌ [10-E] state.json 저장 실패: {e}")
            return 0

    return added


# ─── 메시지 생성 ──────────────────────────────────────────────────────────────

def _build_message(row: dict, is_top: bool = False) -> str:
    """단일 영상 행동 가능한 경보 메시지."""
    sev        = str(row.get("severity",            "")).upper()
    emoji      = SEV_EMOJI.get(sev, "⚪")
    title      = row.get("title") or row.get("video_id", "(제목 없음)")
    prob       = str(row.get("problem_type",        ""))
    src        = str(row.get("traffic_source_type", ""))
    vid        = str(row.get("video_id",            ""))
    ctr        = row.get("ctr",                     "")
    imp        = row.get("impressions",             "")
    imp_prev   = row.get("impressions_prev",        "")
    imp_change = row.get("impressions_change",      "")

    # ── 노출 변화율 ────────────────────────────────────────────────────────
    change_str = ""
    if imp_change not in (None, "", "None"):
        try:
            pct = round(float(imp_change) * 100, 1)
            change_str = f"노출 {pct:+.1f}%"
        except (ValueError, TypeError):
            pass

    # ── 수치 ──────────────────────────────────────────────────────────────
    reach_str = ""
    try:
        if imp and imp_prev:
            reach_str = f"  ({int(float(imp_prev)):,} → {int(float(imp)):,})"
    except (ValueError, TypeError):
        pass

    ctr_str = ""
    try:
        if ctr not in (None, "", 0, "0"):
            ctr_str = f"CTR {float(ctr)*100:.1f}%"
    except (ValueError, TypeError):
        pass

    # ── 소스 레이블 ───────────────────────────────────────────────────────
    src_label = {
        "BROWSE_DROP":    "홈피드 감소",
        "SUGGESTED_DROP": "추천 감소",
        "EXTERNAL_DROP":  "외부 유입 감소",
        "MIXED_DROP":     "복합 감소",
    }.get(src, "")

    # ── 추천 액션 ─────────────────────────────────────────────────────────
    action_key = src if (src and src not in ("NONE", "")) else prob
    actions    = ACTIONS.get(action_key, ACTIONS.get("IMPRESSION_DROP", []))

    # ── Dashboard 링크 ────────────────────────────────────────────────────
    studio_url = _studio_link(vid)

    # ── 조립 ──────────────────────────────────────────────────────────────
    stat_parts = [p for p in [change_str + reach_str, src_label, ctr_str] if p]
    stat_line  = "  " + "  ·  ".join(stat_parts) if stat_parts else ""

    actions_str = "\n".join(f"  {i+1}. {a}" for i, a in enumerate(actions[:3]))

    header = f"🔥 가장 위험:\n{emoji} [{sev}] {title}" if is_top else f"{emoji} [{sev}] {title}"

    lines = [header, f"  video_id: {vid}"]
    if stat_line:
        lines.append(stat_line)
    lines += [
        "",
        "  ▶ 추천 액션:",
        actions_str,
        "",
        f"  📊 지금 확인하기: {studio_url}",
        "",
        "  " + "─" * 48,
    ]
    return "\n".join(lines)


# ─── SMTP 발송 ────────────────────────────────────────────────────────────────

def _send_email(subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"]    = f"SOUNDSTORM Alert <{SMTP_USER}>"
    msg["To"]      = ALERT_TO
    msg.set_content(body)

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


# ─── 메인 ────────────────────────────────────────────────────────────────────

def run_alert_engine(spreadsheet=None):
    """
    Video_Diagnostics 시트를 읽어 CRITICAL/HIGH 영상에 이메일 경보 발송.

    Args:
        spreadsheet: 기존 gspread.Spreadsheet 인스턴스.
                     None 이면 SPREADSHEET_ID + service_account.json 으로 자체 연결.
    """
    print("\n🚨 [Alert Engine] PHASE 10-A 경보 엔진 시작...")

    if not SMTP_USER or not SMTP_PASSWORD:
        print("  ⚠️  SMTP 자격 증명 없음 — alert_engine 스킵")
        return

    # ── Sheets 연결 ──────────────────────────────────────────────────────────
    if spreadsheet is None:
        if not SPREADSHEET_ID:
            print("  ⚠️  SPREADSHEET_ID 없음 — 스킵")
            return
        try:
            creds = Credentials.from_service_account_file(
                str(CREDENTIALS_PATH),
                scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
            )
            gc          = gspread.authorize(creds)
            spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        except Exception as e:
            print(f"  ❌ Sheets 연결 실패: {e}")
            return

    # ── Video_Diagnostics 읽기 ────────────────────────────────────────────────
    try:
        ws      = spreadsheet.worksheet(DIAG_SHEET)
        records = ws.get_all_records()
    except Exception as e:
        print(f"  ⚠️  {DIAG_SHEET} 읽기 실패 (비치명적): {e}")
        return

    if not records:
        print(f"  ℹ️  {DIAG_SHEET} 데이터 없음 — 스킵")
        return

    print(f"  📥 {DIAG_SHEET} 로드: {len(records)}행")

    # ── CRITICAL / HIGH 필터 ──────────────────────────────────────────────────
    targets = [
        r for r in records
        if str(r.get("severity",     "")).upper() in ("CRITICAL", "HIGH")
        and str(r.get("problem_type","")).upper() not in ("INSUFFICIENT_DATA", "NORMAL", "NONE")
    ]

    if not targets:
        print("  ✅ 경보 대상 없음")
        return

    print(f"  🎯 경보 후보: {len(targets)}개 영상")

    # ── 중복 체크 (video_id + problem_type + severity 키) ──────────────────────
    log     = _load_alert_log()
    to_send = []

    for row in targets:
        vid  = str(row.get("video_id",     "")).strip()
        sev  = str(row.get("severity",     "")).upper()
        prob = str(row.get("problem_type", "")).upper()
        if not vid:
            continue
        if _should_send(vid, prob, sev, log):
            to_send.append(row)
        else:
            print(f"  ⏭️  [{sev}/{prob}] {row.get('title', vid)[:28]} — 중복 스킵")

    if not to_send:
        print("  ✅ 발송할 신규 경보 없음 (모두 중복)")
        return

    # ── 메일 구성 ─────────────────────────────────────────────────────────────
    now_kst  = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M KST")
    critical = [r for r in to_send if str(r.get("severity","")).upper() == "CRITICAL"]
    high     = [r for r in to_send if str(r.get("severity","")).upper() == "HIGH"]

    subject = (
        f"🔴 [SOUNDSTORM 긴급] CRITICAL {len(critical)}건  ·  HIGH {len(high)}건  —  {now_kst}"
        if critical else
        f"🟠 [SOUNDSTORM] HIGH 경보 {len(high)}건  —  {now_kst}"
    )

    # ── Top 1: 노출 감소율 절대값 기준 가장 위험한 영상 ─────────────────────────
    ordered   = sorted(to_send, key=lambda r: abs(_imp_change_float(r)), reverse=True)
    top_row   = ordered[0]
    rest_rows = ordered[1:]

    body_lines = [
        "SOUNDSTORM YouTube 자동 경보 시스템  (PHASE 10-A)",
        f"발송 시각: {now_kst}",
        f"경보 건수: CRITICAL {len(critical)}건  |  HIGH {len(high)}건",
        "=" * 52,
        "",
        # ── Top 1 강조 블록 ─────────────────────────────────────────────
        _build_message(top_row, is_top=True),
        "",
    ]

    # ── 나머지 영상 ───────────────────────────────────────────────────────────
    if rest_rows:
        body_lines.append(f"그 외 {len(rest_rows)}건:")
        body_lines.append("")
        for row in rest_rows:
            body_lines.append(_build_message(row, is_top=False))
            body_lines.append("")

    body_lines += [
        "=" * 52,
        "※ CRITICAL: 24시간 이내 재발송 없음",
        "※ HIGH: 당일(KST) 1회 발송",
        "※ 중복 추적 키: video_id + problem_type + severity",
        "※ 발송 로그: 03_RUNTIME/alert_sent_log.json",
        "※ 본 메일은 SOUNDSTORM Alert Engine (PHASE 10-A) 자동 발송입니다.",
    ]

    body = "\n".join(body_lines)

    # ── 발송 ─────────────────────────────────────────────────────────────────
    try:
        _send_email(subject, body)
        print(f"  📧 이메일 발송 완료 → {ALERT_TO}")
        print(f"     제목: {subject[:65]}...")

        # ── 발송 성공 → 중복 방지 로그 + 히스토리 + action_tracker 등록 ──────
        history = _load_alert_history()
        for row in to_send:
            vid  = str(row.get("video_id",     "")).strip()
            prob = str(row.get("problem_type", "")).upper()
            sev  = str(row.get("severity",     "")).upper()
            _mark_sent(vid, prob, sev, log)
            _append_alert_history(row, history)

        _save_alert_log(log)
        _save_alert_history(history)
        print(f"  💾 alert_sent_log.json + alert_history.json 업데이트 ({len(to_send)}건)")

        # ── action_tracker: pending_checks 이벤트 등록 (비치명적) ─────────────
        # alert_engine → action_tracker 직접 결합 제거.
        # write_pending_event() 만 호출 — consume는 api_data_shuttler 에서 처리.
        try:
            from analytics.action_tracker import write_pending_event
            write_pending_event(to_send)
            print(f"  📌 pending_checks: {len(to_send)}건 이벤트 등록 → action_tracker 분리 완료")
        except Exception as _at_err:
            print(f"  ⚠️  pending_checks 등록 실패 (비치명적): {_at_err}")

        # ── PHASE 10-E: CRITICAL → ExecutionPanel Task 자동 생성 ──────────────
        try:
            created = _create_auto_tasks(to_send)
            if created == 0:
                print(f"  ℹ️  [10-E] 신규 CRITICAL Task 없음 (모두 기존 Task 존재)")
        except Exception as _task_err:
            print(f"  ⚠️  [10-E] Task 자동 생성 실패 (비치명적): {_task_err}")

    except Exception as e:
        print(f"  ❌ 이메일 발송 실패: {e}")
        # 발송 실패 시 로그 미기록 → 다음 실행에서 재시도


if __name__ == "__main__":
    run_alert_engine()
