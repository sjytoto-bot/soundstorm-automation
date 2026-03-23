#!/usr/bin/env python3
"""
SOUNDSTORM Redirect Tracker Server
PHASE 8B — External Traffic Campaign Tracking

엔드포인트:
  GET /r/<slug>       — redirect + click 로그 기록
  GET /api/logs       — 전체 클릭 로그 JSON
  GET /api/stats      — 캠페인별 집계 통계 JSON
  GET /api/links      — 링크 매핑 목록 JSON
  POST /api/links     — 링크 추가/수정

저장:
  redirect_logs.csv   — 클릭 로그 (CSV append)
  redirectLinks.json  — slug → target 매핑

실행:
  python3 redirect_server.py
  python3 redirect_server.py --port 8080

환경변수:
  REDIRECT_PORT=5050 (기본값)
  REDIRECT_LOG_PATH=./redirect_logs.csv
"""

import os
import csv
import json
import hashlib
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, request, redirect, jsonify, abort

# ─── 설정 ────────────────────────────────────────────────────────────────────

BASE_DIR   = Path(__file__).parent
LINKS_FILE = BASE_DIR / "redirectLinks.json"
LOG_FILE   = BASE_DIR / os.getenv("REDIRECT_LOG_PATH", "redirect_logs.csv")
PORT       = int(os.getenv("REDIRECT_PORT", "5050"))

LOG_FIELDS = [
    "timestamp", "platform", "campaign", "link_slug",
    "target_video", "target_playlist", "user_agent", "ip_hash",
]

# ─── 로깅 설정 ────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("redirect_tracker")

# ─── Flask 앱 ─────────────────────────────────────────────────────────────────

app = Flask(__name__)

# ─── 유틸 ────────────────────────────────────────────────────────────────────

def load_links() -> dict:
    """redirectLinks.json 로드"""
    try:
        with open(LINKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("redirectLinks.json 없음 — 빈 링크 테이블 사용")
        return {}
    except json.JSONDecodeError as e:
        logger.error(f"redirectLinks.json 파싱 오류: {e}")
        return {}


def save_links(links: dict) -> None:
    """redirectLinks.json 저장"""
    with open(LINKS_FILE, "w", encoding="utf-8") as f:
        json.dump(links, f, ensure_ascii=False, indent=2)


def hash_ip(ip: str) -> str:
    """IP → SHA256 앞 8자리 (개인정보 보호)"""
    return hashlib.sha256(ip.encode()).hexdigest()[:8]


def detect_platform(referrer: str, user_agent: str) -> str:
    """referrer / user_agent 기반 플랫폼 자동 감지"""
    referrer_lower = (referrer or "").lower()
    ua_lower       = (user_agent or "").lower()

    platform_map = {
        "discord":    "DISCORD",
        "instagram":  "INSTAGRAM",
        "facebook":   "FACEBOOK",
        "twitter":    "TWITTER",
        "reddit":     "REDDIT",
        "naver":      "NAVER",
        "kakao":      "KAKAOTALK",
        "notion":     "NOTION",
        "tistory":    "TISTORY",
        "perplexity": "PERPLEXITY",
        "chatgpt":    "CHATGPT",
        "openai":     "CHATGPT",
        "copilot":    "COPILOT",
        "whatsapp":   "WHATSAPP",
        "telegram":   "TELEGRAM",
        "arca":       "ARCA",
    }

    for keyword, platform in platform_map.items():
        if keyword in referrer_lower or keyword in ua_lower:
            return platform

    return "DIRECT"


def ensure_log_file() -> None:
    """서버 시작 시 redirect_logs.csv 없으면 헤더만 있는 파일 생성"""
    if not LOG_FILE.exists():
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=LOG_FIELDS)
            writer.writeheader()
        logger.info(f"로그 파일 생성: {LOG_FILE}")


def append_log(entry: dict) -> None:
    """redirect_logs.csv에 행 추가"""
    file_exists = LOG_FILE.exists()
    with open(LOG_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow({field: entry.get(field, "") for field in LOG_FIELDS})


def read_all_logs() -> list[dict]:
    """redirect_logs.csv 전체 읽기"""
    if not LOG_FILE.exists():
        return []
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return list(reader)
    except Exception as e:
        logger.error(f"로그 읽기 오류: {e}")
        return []


def aggregate_stats(logs: list[dict]) -> list[dict]:
    """캠페인별 클릭 집계"""
    stats: dict[str, dict] = {}

    for row in logs:
        key = row.get("campaign") or row.get("link_slug", "unknown")
        if key not in stats:
            stats[key] = {
                "campaign":        key,
                "platform":        row.get("platform", ""),
                "link_slug":       row.get("link_slug", ""),
                "target_video":    row.get("target_video", ""),
                "target_playlist": row.get("target_playlist", ""),
                "clicks":          0,
                "first_seen":      row.get("timestamp", ""),
                "last_seen":       row.get("timestamp", ""),
            }
        stats[key]["clicks"] += 1
        ts = row.get("timestamp", "")
        if ts > stats[key]["last_seen"]:
            stats[key]["last_seen"] = ts

    return sorted(stats.values(), key=lambda x: x["clicks"], reverse=True)

# ─── 라우트 ───────────────────────────────────────────────────────────────────

@app.route("/r/<slug>")
def redirect_link(slug: str):
    """
    메인 리다이렉트 엔드포인트
    GET /r/<slug> → 302 → YouTube URL
    """
    links = load_links()

    if slug not in links:
        logger.warning(f"알 수 없는 slug: {slug}")
        abort(404)

    link    = links[slug]
    video   = link.get("video", "")
    playlist = link.get("playlist", "")
    campaign = link.get("campaign", slug)

    # 클릭 로그 기록
    referrer   = request.headers.get("Referer", "")
    user_agent = request.headers.get("User-Agent", "")
    raw_ip     = request.headers.get("X-Forwarded-For", request.remote_addr or "")
    client_ip  = raw_ip.split(",")[0].strip()

    platform = detect_platform(referrer, user_agent)

    entry = {
        "timestamp":       datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "platform":        platform,
        "campaign":        campaign,
        "link_slug":       slug,
        "target_video":    video,
        "target_playlist": playlist,
        "user_agent":      user_agent[:120],  # 길이 제한
        "ip_hash":         hash_ip(client_ip),
    }

    try:
        append_log(entry)
        logger.info(f"클릭 기록: [{campaign}] {platform} → {video or playlist}")
    except Exception as e:
        logger.error(f"로그 기록 실패: {e}")

    # YouTube 타겟 URL 결정
    if playlist:
        target_url = f"https://www.youtube.com/playlist?list={playlist}"
        if video:
            target_url = f"https://www.youtube.com/watch?v={video}&list={playlist}"
    elif video:
        target_url = f"https://www.youtube.com/watch?v={video}"
    else:
        abort(404)

    return redirect(target_url, code=302)


@app.route("/api/logs")
def api_logs():
    """전체 클릭 로그 JSON 반환"""
    logs = read_all_logs()
    return jsonify(logs)


@app.route("/api/stats")
def api_stats():
    """캠페인별 집계 통계 JSON 반환"""
    logs  = read_all_logs()
    stats = aggregate_stats(logs)
    return jsonify(stats)


@app.route("/api/links", methods=["GET"])
def api_links_get():
    """링크 매핑 목록 JSON 반환"""
    return jsonify(load_links())


@app.route("/api/links", methods=["POST"])
def api_links_post():
    """링크 추가/수정 (JSON body: { slug, video, playlist, campaign })"""
    data = request.get_json(silent=True)
    if not data or "slug" not in data:
        return jsonify({"error": "slug 필드 필수"}), 400

    slug = data["slug"]
    links = load_links()
    links[slug] = {
        "video":    data.get("video",    ""),
        "playlist": data.get("playlist", ""),
        "campaign": data.get("campaign", slug),
    }
    save_links(links)
    logger.info(f"링크 추가/수정: {slug}")
    return jsonify({"ok": True, "slug": slug})


@app.route("/api/stats/video/<video_id>")
def api_stats_video(video_id: str):
    """
    특정 video_id에 연결된 클릭 로그를 플랫폼별로 집계하여 반환한다.
    redirectLinks.json의 target_video 기준으로 필터링.

    반환 예:
      [{"platform": "DISCORD", "clicks": 14},
       {"platform": "REDDIT",  "clicks": 8}]
    """
    logs = read_all_logs()
    platform_counts: dict[str, int] = {}
    for row in logs:
        if row.get("target_video", "").strip() == video_id:
            p = row.get("platform", "DIRECT")
            platform_counts[p] = platform_counts.get(p, 0) + 1

    result = sorted(
        [{"platform": p, "clicks": c} for p, c in platform_counts.items()],
        key=lambda x: x["clicks"], reverse=True,
    )
    return jsonify(result)


@app.route("/api/video/<video_id>")
def api_video(video_id: str):
    """
    특정 video_id와 연결된 slug/campaign 정보를 반환한다.
    redirectLinks.json 기준으로 조회 (Phase 2-B onVideoPublished 연동용).

    반환 예:
      {
        "video_id": "abc123",
        "slugs": [
          { "slug": "assassin", "campaign": "discord_dnd", "clicks": 14 }
        ]
      }
    """
    links = load_links()
    logs  = read_all_logs()

    # 이 video_id에 연결된 slug 목록
    matched_slugs = [
        slug for slug, info in links.items()
        if info.get("video", "").strip() == video_id
    ]

    # slug별 클릭 수 집계
    click_counts: dict[str, int] = {}
    for row in logs:
        if row.get("link_slug", "") in matched_slugs:
            slug = row["link_slug"]
            click_counts[slug] = click_counts.get(slug, 0) + 1

    result = [
        {
            "slug":     slug,
            "campaign": links[slug].get("campaign", slug),
            "clicks":   click_counts.get(slug, 0),
        }
        for slug in matched_slugs
    ]

    return jsonify({"video_id": video_id, "slugs": result})


@app.route("/health")
def health():
    return jsonify({"status": "ok", "log_count": len(read_all_logs())})

# ─── 진입점 ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SOUNDSTORM Redirect Tracker")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    logger.info(f"Redirect Tracker 시작 — http://{args.host}:{args.port}")
    logger.info(f"링크 파일: {LINKS_FILE}")
    logger.info(f"로그 파일: {LOG_FILE}")

    ensure_log_file()
    app.run(host=args.host, port=args.port, debug=args.debug)
