from __future__ import annotations

import argparse
import hashlib
import json
import os
import pickle
import re
import urllib.request
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import gspread
from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials as ServiceAccountCredentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from discord_notifier import DiscordConfigError, send_discord_message


_KST = timezone(timedelta(hours=9))
AUTOMATION_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIR = AUTOMATION_ROOT / "03_RUNTIME"
ROLLBACK_DIR = RUNTIME_DIR / "rollback"
PROPOSAL_PATH = RUNTIME_DIR / "latest_video_watchdog_proposal.json"
APPLY_LOG_PATH = RUNTIME_DIR / "latest_video_apply_log.json"
SCAN_LOG_PATH = RUNTIME_DIR / "latest_video_scan_log.json"
ACTIVE_UPLOADS_PATH = RUNTIME_DIR / "active_uploads.json"
CREDENTIALS_PATH = AUTOMATION_ROOT / "credentials" / "service_account.json"
CLIENT_SECRET_PATH = AUTOMATION_ROOT / "credentials" / "client_secret.json"
TOKEN_PICKLE_PATH = AUTOMATION_ROOT / "credentials" / "token.pickle"
THUMBNAIL_UPLOADS_DIR = AUTOMATION_ROOT / "thumbnail_intelligence" / "uploads"
SPREADSHEET_ID = os.environ.get("GOOGLE_SHEETS_ID", "12gKS-y-qiMzDNCMpDC-cpfKA1UFa2yPZpD4np3LTR4Y")
CHANNEL_ID = "UCAvSo9RLq0rCy64IH2nm91w"

SHEET_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
YOUTUBE_UPDATE_SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.upload",
]

DEFAULT_POLICY = {
    "min_hours_since_publish": 12,
    "max_hours_since_publish": 96,
    "min_impressions": 500,
    "min_confidence": 0.25,
    "ctr_drop_ratio": 0.75,
    "min_avg_watch_time_ratio": 0.9,
    "auto_apply_cooldown_hours": 24,
}

ACTION_LABELS = {
    "observe": "관찰 유지",
    "title_test": "제목 수정 추천",
    "thumbnail_test": "썸네일 수정 추천",
    "repackage_both": "제목+썸네일 동시 수정 추천",
    "content_issue": "콘텐츠 자체 문제",
}

AUTO_ACTIONS = {"title_test", "thumbnail_test", "repackage_both"}


@dataclass
class VideoContext:
    video_id: str
    title: str
    upload_date: str
    elapsed_hours: float
    views: int
    likes: int
    ctr: float | None
    ctr_source: str
    impressions: int | None
    status: str
    description: str
    tags: list[str]
    category_id: str | None
    diagnosis: str
    diagnosis_recommendation: str
    confidence: float
    avg_watch_time_sec: float | None
    channel_avg_watch_time_sec: float | None
    channel_median_ctr: float | None
    channel_median_impressions: float | None


def now_kst() -> datetime:
    return datetime.now(_KST)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def get_sheets_client() -> gspread.Client:
    creds = ServiceAccountCredentials.from_service_account_file(
        str(CREDENTIALS_PATH),
        scopes=SHEET_SCOPES,
    )
    return gspread.authorize(creds)


def load_active_uploads() -> list[dict[str, Any]]:
    return load_json(ACTIVE_UPLOADS_PATH, [])


def choose_latest_upload(active_uploads: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = [row for row in active_uploads if row.get("video_id")]
    if not candidates:
        raise RuntimeError("active_uploads.json 에 최신 업로드 데이터가 없습니다.")
    candidates.sort(
        key=lambda row: (
            str(row.get("upload_date", "")),
            -float(row.get("elapsed_hours", 0) or 0),
        ),
        reverse=True,
    )
    return candidates[0]


def get_sheet_records(gc: gspread.Client, sheet_name: str) -> list[dict[str, Any]]:
    ss = gc.open_by_key(SPREADSHEET_ID)
    ws = ss.worksheet(sheet_name)
    return ws.get_all_records()


def get_row_by_video_id(records: list[dict[str, Any]], video_id: str) -> dict[str, Any]:
    for row in records:
        if str(row.get("video_id", "")).strip() == video_id:
            return row
    return {}


def load_channel_kpi(gc: gspread.Client) -> dict[str, float]:
    ss = gc.open_by_key(SPREADSHEET_ID)
    ws = ss.worksheet("Channel_CTR_KPI")
    rows = ws.get_all_values()
    result: dict[str, float] = {}
    for row in rows[1:]:
        key = str(row[0] if row else "").strip()
        if not key:
            continue
        if len(row) < 2:
            continue
        try:
            result[key] = float(row[1])
        except (TypeError, ValueError):
            continue
    return result


def parse_float(value: Any) -> float | None:
    if value in (None, "", "None"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_int(value: Any) -> int | None:
    if value in (None, "", "None"):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def load_video_context(video_id: str) -> VideoContext:
    gc = get_sheets_client()
    raw_rows = get_sheet_records(gc, "_RawData_Master")
    diag_rows = get_sheet_records(gc, "Video_Diagnostics")
    kpi = load_channel_kpi(gc)

    active_rows = load_active_uploads()
    latest_row = get_row_by_video_id(active_rows, video_id) or choose_latest_upload(active_rows)
    raw_row = get_row_by_video_id(raw_rows, video_id)
    diag_row = get_row_by_video_id(diag_rows, video_id)
    avg_watch_values = [
        value for value in (
            parse_float(row.get("avg_watch_time_sec") or row.get("avg_watch_time"))
            for row in raw_rows
        )
        if value is not None and value > 0
    ]
    channel_avg_watch_time = (
        sum(avg_watch_values) / len(avg_watch_values) if avg_watch_values else None
    )

    title = str(raw_row.get("title") or latest_row.get("title") or video_id).strip()
    return VideoContext(
        video_id=video_id,
        title=title,
        upload_date=str(raw_row.get("upload_date") or latest_row.get("upload_date") or "").strip(),
        elapsed_hours=float(latest_row.get("elapsed_hours", 0) or 0),
        views=int(latest_row.get("views", 0) or raw_row.get("views", 0) or 0),
        likes=int(latest_row.get("likes", 0) or raw_row.get("likes", 0) or 0),
        ctr=parse_float(latest_row.get("ctr") or raw_row.get("ctr")),
        ctr_source=str(latest_row.get("ctr_source") or raw_row.get("ctr_source") or "missing").strip(),
        impressions=parse_int(latest_row.get("impressions") or raw_row.get("impressions")),
        status=str(latest_row.get("status") or "").strip(),
        description=str(raw_row.get("description") or "").strip(),
        tags=[str(tag).strip() for tag in (raw_row.get("tags") or "").split(",") if str(tag).strip()],
        category_id=str(raw_row.get("categoryId") or raw_row.get("category_id") or "").strip() or None,
        diagnosis=str(diag_row.get("diagnosis") or "UNKNOWN").strip(),
        diagnosis_recommendation=str(diag_row.get("recommendation") or "").strip(),
        confidence=float(parse_float(diag_row.get("confidence")) or 0.0),
        avg_watch_time_sec=parse_float(raw_row.get("avg_watch_time_sec") or raw_row.get("avg_watch_time")),
        channel_avg_watch_time_sec=channel_avg_watch_time,
        channel_median_ctr=parse_float(kpi.get("channel_median_ctr")),
        channel_median_impressions=parse_float(kpi.get("median_impressions")),
    )


def extract_theme_from_title(title: str) -> str:
    parts = [part.strip() for part in re.split(r"[|,]", title) if part.strip()]
    if parts:
        return parts[0]
    return title.strip()


def normalize_theme(theme: str) -> str:
    return re.sub(r"\s+", " ", theme).strip()


def generate_title_candidates(ctx: VideoContext) -> list[dict[str, str]]:
    theme = normalize_theme(extract_theme_from_title(ctx.title))
    theme_upper = theme.upper()
    base_candidates = [
        (f"{theme_upper} | Epic Korean Cinematic | Battle Music", "검색형 키워드 강화"),
        (f"{theme_upper} | War Drums | Cinematic Action Music", "장르/무드 명시"),
        (f"{theme_upper} | Thunder Drums | Korean Battle Music", "사운드 훅 강조"),
    ]
    seen = {ctx.title.strip().lower()}
    output = []
    for title, reason in base_candidates:
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append({"title": title, "reason": reason})
    return output


def find_thumbnail_upload_path(video_id: str) -> str | None:
    if not THUMBNAIL_UPLOADS_DIR.exists():
        return None
    patterns = [
        f"{video_id}.png",
        f"{video_id}.jpg",
        f"{video_id}.jpeg",
        f"{video_id}_A.png",
        f"{video_id}_A.jpg",
        f"{video_id}_B.png",
        f"{video_id}_B.jpg",
    ]
    for pattern in patterns:
        candidate = THUMBNAIL_UPLOADS_DIR / pattern
        if candidate.exists():
            return str(candidate.resolve())
    return None


def generate_thumbnail_candidates(ctx: VideoContext) -> list[dict[str, str]]:
    theme = normalize_theme(extract_theme_from_title(ctx.title))
    words = [word for word in re.split(r"[^A-Za-z가-힣0-9]+", theme) if word]
    overlay = " ".join(words[:2]).upper() if words else theme.upper()
    return [
        {"overlay_text": overlay, "direction": "텍스트 최소 + 중심 피사체 강조"},
        {"overlay_text": overlay, "direction": "배경 어둡게 + 실루엣 대비 강화"},
    ]


def build_apply_key(proposal_id: str, video_id: str) -> str:
    raw = f"{proposal_id}:{video_id}:soundstorm-watchdog"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]


def format_seconds(seconds: float | None) -> str:
    if seconds is None:
        return "미수집"
    total = int(round(seconds))
    minutes, sec = divmod(total, 60)
    return f"{minutes}m {sec:02d}s"


def get_latest_apply_entry(video_id: str) -> dict[str, Any] | None:
    logs = load_json(APPLY_LOG_PATH, [])
    for entry in reversed(logs):
        if not isinstance(entry, dict):
            continue
        if entry.get("rollback"):
            continue
        if entry.get("video_id") == video_id:
            return entry
    return None


def can_auto_apply(ctx: VideoContext, policy: dict[str, Any], action: str) -> tuple[bool, list[str]]:
    reasons: list[str] = []

    if action not in AUTO_ACTIONS:
        reasons.append("추천 액션이 자동 반영 대상이 아닙니다.")
        return False, reasons

    if ctx.elapsed_hours < policy["min_hours_since_publish"]:
        reasons.append(f"업로드 후 {ctx.elapsed_hours:.1f}시간으로 auto 최소 구간 전입니다.")
        return False, reasons

    if ctx.impressions is None or ctx.impressions < policy["min_impressions"]:
        reasons.append("노출 샘플이 auto 기준에 못 미칩니다.")
        return False, reasons

    if ctx.confidence < policy["min_confidence"]:
        reasons.append(f"confidence {ctx.confidence:.3f}가 auto 기준 미만입니다.")
        return False, reasons

    if ctx.channel_median_ctr and ctx.ctr is not None:
        if ctx.ctr >= ctx.channel_median_ctr * policy["ctr_drop_ratio"]:
            reasons.append("CTR 하락 폭이 auto 개입 기준보다 약합니다.")
            return False, reasons

    if (
        ctx.avg_watch_time_sec is not None
        and ctx.channel_avg_watch_time_sec is not None
        and ctx.channel_avg_watch_time_sec > 0
    ):
        if ctx.avg_watch_time_sec < ctx.channel_avg_watch_time_sec * policy["min_avg_watch_time_ratio"]:
            reasons.append("평균 시청지속시간이 채널 평균 대비 낮아 패키징보다 콘텐츠 이슈 가능성이 큽니다.")
            return False, reasons

    latest_apply = get_latest_apply_entry(ctx.video_id)
    if latest_apply:
        applied_at_raw = str(latest_apply.get("applied_at", "")).strip()
        if applied_at_raw:
            try:
                applied_at = datetime.fromisoformat(applied_at_raw)
                hours_since_apply = (now_kst() - applied_at).total_seconds() / 3600
                if hours_since_apply < policy["auto_apply_cooldown_hours"]:
                    reasons.append(
                        f"최근 {hours_since_apply:.1f}시간 내 동일 영상 apply 이력이 있어 auto 쿨다운 중입니다."
                    )
                    return False, reasons
            except ValueError:
                pass

    reasons.append("auto 조건 통과")
    return True, reasons


def assess_action(ctx: VideoContext, policy: dict[str, Any]) -> tuple[str, list[str], list[str], bool]:
    reasons: list[str] = []

    if ctx.ctr is None or ctx.impressions is None:
        reasons.append("CTR 또는 노출수가 아직 수집되지 않아 패키징 판단 신뢰도가 낮습니다.")
        return "observe", reasons, ["데이터 재수집 대기"], False

    if ctx.elapsed_hours < policy["min_hours_since_publish"]:
        reasons.append(f"업로드 후 {ctx.elapsed_hours:.1f}시간으로 아직 초기 배포 구간입니다.")
        return "observe", reasons, ["2시간~8시간 후 재스캔"], False

    if ctx.elapsed_hours > policy["max_hours_since_publish"]:
        reasons.append(f"업로드 후 {ctx.elapsed_hours:.1f}시간 경과로 최신 영상 자동개입 구간을 지났습니다.")
        return "observe", reasons, ["후속 롱테일 분석으로 전환"], False

    if ctx.impressions < policy["min_impressions"]:
        reasons.append(f"노출수 {ctx.impressions:,}회로 샘플이 아직 작습니다.")
        return "observe", reasons, ["노출수 확보 후 재평가"], False

    if ctx.diagnosis == "CONTENT_RETENTION_WEAK":
        reasons.append("CTR보다 유지율 문제가 우선이라 패키징 자동수정보다 콘텐츠 점검이 필요합니다.")
        return "content_issue", reasons, ["인트로/구성 점검", "패키징 자동 수정 보류"], False

    if ctx.diagnosis == "THUMBNAIL_WEAK":
        reasons.append("Video_Diagnostics가 썸네일 약세로 분류했습니다.")
        auto_eligible, _ = can_auto_apply(ctx, policy, "thumbnail_test")
        return "thumbnail_test", reasons, ["썸네일 후보 확인", "필요 시 apply 실행"], auto_eligible

    if ctx.diagnosis == "TITLE_DISCOVERY_WEAK":
        reasons.append("Video_Diagnostics가 제목/검색 약세로 분류했습니다.")
        auto_eligible, _ = can_auto_apply(ctx, policy, "title_test")
        return "title_test", reasons, ["제목 후보 확인", "필요 시 apply 실행"], auto_eligible

    if (
        ctx.channel_median_ctr
        and ctx.channel_median_impressions
        and ctx.ctr < ctx.channel_median_ctr * policy["ctr_drop_ratio"]
        and ctx.impressions >= ctx.channel_median_impressions
    ):
        reasons.append("채널 중앙 CTR 대비 낮고 노출은 충분해 패키징 이슈 가능성이 큽니다.")
        auto_eligible, _ = can_auto_apply(ctx, policy, "repackage_both")
        return "repackage_both", reasons, ["제목+썸네일 동시 검토", "필요 시 apply 실행"], auto_eligible

    reasons.append("현재 기준으로는 즉시 수정보다 관찰이 더 적절합니다.")
    return "observe", reasons, ["다음 스캔까지 관찰 유지"], False


def build_proposal(ctx: VideoContext, *, mode: str) -> dict[str, Any]:
    action, reasons, recommendations, auto_eligible = assess_action(ctx, DEFAULT_POLICY)
    auto_ok, auto_reasons = can_auto_apply(ctx, DEFAULT_POLICY, action)
    title_candidates = generate_title_candidates(ctx)
    thumbnail_path = find_thumbnail_upload_path(ctx.video_id)
    thumbnail_candidates = generate_thumbnail_candidates(ctx)
    proposal_id = f"{ctx.video_id}_{now_kst().strftime('%Y%m%d_%H%M%S')}"
    apply_key = build_apply_key(proposal_id, ctx.video_id)

    primary_title = title_candidates[0]["title"] if title_candidates else ctx.title
    proposal = {
        "proposal_id": proposal_id,
        "created_at": now_kst().isoformat(),
        "mode": mode,
        "video_id": ctx.video_id,
        "current_title": ctx.title,
        "upload_date": ctx.upload_date,
        "elapsed_hours": ctx.elapsed_hours,
        "views": ctx.views,
        "likes": ctx.likes,
        "ctr": ctx.ctr,
        "ctr_source": ctx.ctr_source,
        "impressions": ctx.impressions,
        "status": ctx.status,
        "diagnosis": ctx.diagnosis,
        "diagnosis_recommendation": ctx.diagnosis_recommendation,
        "confidence": ctx.confidence,
        "avg_watch_time_sec": ctx.avg_watch_time_sec,
        "channel_avg_watch_time_sec": ctx.channel_avg_watch_time_sec,
        "channel_median_ctr": ctx.channel_median_ctr,
        "channel_median_impressions": ctx.channel_median_impressions,
        "policy": deepcopy(DEFAULT_POLICY),
        "action": action,
        "action_label": ACTION_LABELS.get(action, action),
        "apply_key": apply_key,
        "reasons": reasons,
        "recommendations": recommendations,
        "auto_eligible": bool(auto_eligible and auto_ok),
        "auto_reasons": auto_reasons,
        "title_candidates": title_candidates,
        "thumbnail_candidates": thumbnail_candidates,
        "selected_changes": {
            "title": primary_title if action in {"title_test", "repackage_both"} else None,
            "description": None,
            "thumbnail_upload_path": thumbnail_path if action in {"thumbnail_test", "repackage_both"} else None,
            "thumbnail_file_name": Path(thumbnail_path).name if thumbnail_path else None,
        },
    }
    return proposal


def format_ctr(ctr: float | None) -> str:
    if ctr is None:
        return "미수집"
    return f"{ctr * 100:.2f}%"


def format_proposal_text(proposal: dict[str, Any]) -> str:
    lines = [
        f"[Latest Watchdog] {proposal['action_label']}",
        f"video_id: {proposal['video_id']}",
        f"title: {proposal['current_title']}",
        f"elapsed: {proposal['elapsed_hours']:.1f}h | views: {proposal['views']} | likes: {proposal['likes']}",
        f"CTR: {format_ctr(proposal['ctr'])} ({proposal['ctr_source']}) | impressions: {proposal['impressions']}",
        f"AVD: {format_seconds(proposal.get('avg_watch_time_sec'))} | channel AVD: {format_seconds(proposal.get('channel_avg_watch_time_sec'))}",
        f"diagnosis: {proposal['diagnosis']} | confidence: {proposal['confidence']:.3f}",
        "reasons:",
    ]
    lines.extend([f"  - {reason}" for reason in proposal["reasons"]])
    if proposal.get("recommendations"):
        lines.append("recommended next actions:")
        lines.extend([f"  - {item}" for item in proposal["recommendations"]])
    if proposal["title_candidates"]:
        lines.append("title candidates:")
        for idx, candidate in enumerate(proposal["title_candidates"], start=1):
            lines.append(f"  {idx}. {candidate['title']} [{candidate['reason']}]")
    if proposal["selected_changes"].get("thumbnail_upload_path"):
        lines.append(f"thumbnail asset: {proposal['selected_changes']['thumbnail_upload_path']}")
    else:
        lines.append("thumbnail asset: 없음 (자동 업로드는 준비된 파일이 있을 때만 가능)")
    lines.append(f"proposal id: {proposal['proposal_id']}")
    lines.append(f"apply key: {proposal['apply_key']}")
    lines.append(f"auto eligible: {proposal['auto_eligible']}")
    lines.append("apply cmd: python3 latest_video_watchdog.py apply")
    return "\n".join(lines)


def notify_discord(proposal: dict[str, Any]) -> None:
    color = 0xE67E22 if proposal["action"] in AUTO_ACTIONS else 0x3498DB
    recommendation_text = "\n".join(f"- {item}" for item in proposal.get("recommendations", [])) or "- 관찰 유지"
    thumb_key = proposal["selected_changes"].get("thumbnail_file_name") or "없음"
    apply_cmd = "python3 latest_video_watchdog.py apply"
    embed = {
        "title": f"Latest Watchdog: {proposal['action_label']}",
        "color": color,
        "description": proposal["current_title"][:4096],
        "fields": [
            {
                "name": "핵심 지표",
                "value": (
                    f"CTR `{format_ctr(proposal['ctr'])}`\n"
                    f"노출 `{proposal['impressions']}`\n"
                    f"조회수 `{proposal['views']}`\n"
                    f"평균시청 `{format_seconds(proposal.get('avg_watch_time_sec'))}`\n"
                    f"경과 `{proposal['elapsed_hours']:.1f}h`"
                ),
                "inline": True,
            },
            {
                "name": "상태 / 판정",
                "value": (
                    f"상태 `{proposal['status']}`\n"
                    f"diagnosis `{proposal['diagnosis']}`\n"
                    f"confidence `{proposal['confidence']:.3f}`\n"
                    f"auto `{proposal['auto_eligible']}`"
                ),
                "inline": True,
            },
            {
                "name": "근거",
                "value": "\n".join(f"- {reason}" for reason in proposal["reasons"])[:1024],
                "inline": False,
            },
            {
                "name": "추천 액션",
                "value": recommendation_text[:1024],
                "inline": False,
            },
            {
                "name": "실행 키",
                "value": (
                    f"proposal `{proposal['proposal_id']}`\n"
                    f"apply_key `{proposal['apply_key']}`\n"
                    f"title `{proposal['selected_changes'].get('title') or '없음'}`\n"
                    f"thumb `{thumb_key}`\n"
                    f"apply `{apply_cmd}`"
                )[:1024],
                "inline": False,
            },
        ],
        "footer": {"text": f"proposal_id={proposal['proposal_id']}"},
        "timestamp": proposal["created_at"],
    }
    content = f"`{proposal['video_id']}` {proposal['action_label']}"
    send_discord_message(content, embeds=[embed])


def get_youtube_service():
    if not TOKEN_PICKLE_PATH.exists():
        raise RuntimeError(
            "credentials/token.pickle 이 없습니다. YouTube 수정 자동화 전용 OAuth 인증이 먼저 필요합니다."
        )
    with open(TOKEN_PICKLE_PATH, "rb") as fh:
        creds = pickle.load(fh)

    missing_scopes = [
        scope for scope in YOUTUBE_UPDATE_SCOPES
        if scope not in set((getattr(creds, "scopes", None) or []))
    ]
    if missing_scopes:
        raise RuntimeError(
            "현재 token.pickle 에 수정 권한 스코프가 부족합니다. "
            f"누락 스코프: {', '.join(missing_scopes)}"
        )

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_PICKLE_PATH, "wb") as fh:
                pickle.dump(creds, fh)
        else:
            raise RuntimeError("YouTube OAuth 토큰이 유효하지 않습니다. 재인증이 필요합니다.")

    return build("youtube", "v3", credentials=creds)


def fetch_video_snippet(youtube: Any, video_id: str) -> dict[str, Any]:
    response = youtube.videos().list(part="snippet,status", id=video_id).execute()
    items = response.get("items", [])
    if not items:
        raise RuntimeError(f"YouTube API 에서 video_id={video_id} 를 찾지 못했습니다.")
    return items[0]


def download_current_thumbnail(video_id: str, backup_dir: Path) -> str | None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    for filename in ("maxresdefault.jpg", "hqdefault.jpg", "sddefault.jpg"):
        url = f"https://i.ytimg.com/vi/{video_id}/{filename}"
        target = backup_dir / filename
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                data = response.read()
            if not data:
                continue
            target.write_bytes(data)
            return str(target.resolve())
        except Exception:
            continue
    return None


def append_apply_log(entry: dict[str, Any]) -> None:
    logs = load_json(APPLY_LOG_PATH, [])
    logs.append(entry)
    save_json(APPLY_LOG_PATH, logs)


def append_scan_log(entry: dict[str, Any]) -> None:
    logs = load_json(SCAN_LOG_PATH, [])
    logs.append(entry)
    save_json(SCAN_LOG_PATH, logs)


def apply_proposal(proposal: dict[str, Any], *, source: str) -> dict[str, Any]:
    youtube = get_youtube_service()
    video_id = proposal["video_id"]
    current = fetch_video_snippet(youtube, video_id)
    snippet = deepcopy(current["snippet"])
    backup_dir = ROLLBACK_DIR / proposal["proposal_id"]
    backup_dir.mkdir(parents=True, exist_ok=True)

    thumbnail_backup_path = download_current_thumbnail(video_id, backup_dir)
    backup_payload = {
        "proposal_id": proposal["proposal_id"],
        "video_id": video_id,
        "backed_up_at": now_kst().isoformat(),
        "source": source,
        "youtube_item": current,
        "thumbnail_backup_path": thumbnail_backup_path,
    }
    backup_path = backup_dir / "backup.json"
    save_json(backup_path, backup_payload)

    selected = proposal.get("selected_changes", {})
    applied_changes: dict[str, Any] = {
        "title": None,
        "thumbnail_upload_path": None,
    }

    selected_title = selected.get("title")
    if selected_title and selected_title != snippet.get("title"):
        snippet["title"] = selected_title
        request_body = {
            "id": video_id,
            "snippet": snippet,
        }
        if current.get("status"):
            request_body["status"] = current["status"]
        youtube.videos().update(part="snippet,status", body=request_body).execute()
        applied_changes["title"] = selected_title

    thumbnail_upload_path = selected.get("thumbnail_upload_path")
    if thumbnail_upload_path:
        upload_path = Path(thumbnail_upload_path)
        if not upload_path.exists():
            raise RuntimeError(f"썸네일 업로드 파일이 없습니다: {upload_path}")
        youtube.thumbnails().set(
            videoId=video_id,
            media_body=MediaFileUpload(str(upload_path)),
        ).execute()
        applied_changes["thumbnail_upload_path"] = str(upload_path.resolve())

    result = {
        "proposal_id": proposal["proposal_id"],
        "video_id": video_id,
        "applied_at": now_kst().isoformat(),
        "source": source,
        "action": proposal["action"],
        "backup_path": str(backup_path.resolve()),
        "proposal_snapshot": {
            "action_label": proposal["action_label"],
            "reasons": proposal.get("reasons", []),
            "recommendations": proposal.get("recommendations", []),
        },
        "applied_changes": applied_changes,
    }
    append_apply_log(result)
    return result


def rollback_latest(video_id: str | None = None) -> dict[str, Any]:
    logs = load_json(APPLY_LOG_PATH, [])
    if not logs:
        raise RuntimeError("복구할 적용 로그가 없습니다.")

    candidates = list(reversed(logs))
    target = None
    for entry in candidates:
        if video_id and entry.get("video_id") != video_id:
            continue
        target = entry
        break
    if target is None:
        raise RuntimeError("조건에 맞는 적용 로그를 찾지 못했습니다.")

    backup_path = Path(target["backup_path"])
    backup = load_json(backup_path, {})
    youtube_item = backup.get("youtube_item")
    if not youtube_item:
        raise RuntimeError("백업 스냅샷이 손상되었습니다.")

    youtube = get_youtube_service()
    youtube.videos().update(
        part="snippet,status",
        body={
            "id": backup["video_id"],
            "snippet": youtube_item["snippet"],
            "status": youtube_item.get("status", {}),
        },
    ).execute()

    thumbnail_backup_path = backup.get("thumbnail_backup_path")
    if thumbnail_backup_path and Path(thumbnail_backup_path).exists():
        youtube.thumbnails().set(
            videoId=backup["video_id"],
            media_body=MediaFileUpload(thumbnail_backup_path),
        ).execute()

    result = {
        "video_id": backup["video_id"],
        "rolled_back_at": now_kst().isoformat(),
        "backup_path": str(backup_path.resolve()),
        "thumbnail_restored": bool(thumbnail_backup_path and Path(thumbnail_backup_path).exists()),
    }
    append_apply_log({"rollback": result})
    return result


def run_scan(mode: str, notify: bool) -> int:
    latest = choose_latest_upload(load_active_uploads())
    ctx = load_video_context(str(latest["video_id"]))
    proposal = build_proposal(ctx, mode=mode)
    save_json(PROPOSAL_PATH, proposal)
    append_scan_log(
        {
            "scanned_at": proposal["created_at"],
            "proposal_id": proposal["proposal_id"],
            "video_id": proposal["video_id"],
            "action": proposal["action"],
            "action_label": proposal["action_label"],
            "ctr": proposal["ctr"],
            "impressions": proposal["impressions"],
            "avg_watch_time_sec": proposal.get("avg_watch_time_sec"),
            "reasons": proposal["reasons"],
            "recommendations": proposal.get("recommendations", []),
            "selected_changes": proposal.get("selected_changes", {}),
            "auto_eligible": proposal["auto_eligible"],
        }
    )
    print(format_proposal_text(proposal))

    if notify and proposal["action"] != "observe":
        try:
            notify_discord(proposal)
            print("\n[discord] 알림 전송 완료")
        except DiscordConfigError as exc:
            print(f"\n[discord] 설정 없음: {exc}")
        except Exception as exc:
            print(f"\n[discord] 알림 실패: {exc}")

    if mode == "auto" and proposal["auto_eligible"] and proposal["action"] in AUTO_ACTIONS:
        result = apply_proposal(proposal, source="auto")
        print("\n[auto apply]")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def run_apply(proposal_path: Path | None) -> int:
    proposal = load_json(proposal_path or PROPOSAL_PATH, {})
    if not proposal:
        raise RuntimeError("적용할 proposal 파일이 없습니다.")
    result = apply_proposal(proposal, source="manual")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def run_rollback(video_id: str | None) -> int:
    result = rollback_latest(video_id)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Latest upload watchdog for SOUNDSTORM")
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan_parser = subparsers.add_parser("scan", help="최신 영상 상태를 분석하고 proposal 생성")
    scan_parser.add_argument("--mode", choices=["safe", "auto"], default="safe")
    scan_parser.add_argument("--notify", action="store_true", help="문제 발견 시 Discord 웹훅 알림 전송")

    apply_parser = subparsers.add_parser("apply", help="가장 최근 proposal을 적용")
    apply_parser.add_argument("--proposal-path", default=None)

    rollback_parser = subparsers.add_parser("rollback", help="가장 최근 적용을 롤백")
    rollback_parser.add_argument("--video-id", default=None)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    ROLLBACK_DIR.mkdir(parents=True, exist_ok=True)

    if args.command == "scan":
        return run_scan(mode=args.mode, notify=args.notify)
    if args.command == "apply":
        proposal_path = Path(args.proposal_path).expanduser() if args.proposal_path else None
        return run_apply(proposal_path)
    if args.command == "rollback":
        return run_rollback(args.video_id)
    raise RuntimeError(f"지원하지 않는 명령입니다: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
