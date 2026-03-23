"""
content_pack_api.py

Content Pack 자동 생성 Flask Blueprint

엔드포인트:
    POST /api/content-pack/generate-field  — 단일 필드 생성
    POST /api/content-pack/generate-all    — 전체 필드 생성
    GET  /api/content-pack/health          — 상태 확인
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from .title_generator          import generate_title
from .description_generator    import generate_description
from .tag_generator            import generate_hashtags, generate_keywords
from .thumbnail_text_generator import generate_thumbnail_text
from .suno_prompt_generator    import generate_suno_prompt

content_pack_bp = Blueprint("content_pack", __name__)

# ─── 유효 필드 목록 ───────────────────────────────────────────────────────────

VALID_FIELDS = {
    "title",
    "description",
    "hashtags",
    "keywords",
    "thumbnail_text",
    "suno_prompt",
}


def _generate_field(
    field: str,
    theme: str,
    context: dict,
) -> str | list[str]:
    """필드별 생성 함수 라우팅."""
    kw   = context.get("keywords",   [])
    tops = context.get("topVideos",  [])
    pls  = context.get("playlist",   "")

    if field == "title":
        return generate_title(theme, keywords=kw, top_videos=tops)

    if field == "description":
        return generate_description(theme, keywords=kw, playlist=pls)

    if field == "hashtags":
        return generate_hashtags(theme, opportunity_keywords=kw)

    if field == "keywords":
        return generate_keywords(theme, opportunity_keywords=kw)

    if field == "thumbnail_text":
        title = context.get("title", "")
        return generate_thumbnail_text(theme, title=title or None)

    if field == "suno_prompt":
        return generate_suno_prompt(theme, keywords=kw)

    return ""


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────

@content_pack_bp.route("/api/content-pack/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "module": "content_pack_engine",
        "fields": sorted(VALID_FIELDS),
    })


@content_pack_bp.route("/api/content-pack/generate-field", methods=["POST", "OPTIONS"])
def generate_field():
    """
    단일 필드 생성.

    Body:
        {
          "field":   "title",
          "theme":   "Samurai Battle",
          "context": { "keywords": [...], "topVideos": [...] }
        }

    Response:
        { "field": "title", "value": "SAMURAI BATTLE | Epic War Drums | ..." }
    """
    if request.method == "OPTIONS":
        return "", 204

    body    = request.get_json(silent=True) or {}
    field   = body.get("field",   "").strip()
    theme   = body.get("theme",   "").strip()
    context = body.get("context", {}) or {}

    if not field:
        return jsonify({"error": "field 필드 필수"}), 400
    if field not in VALID_FIELDS:
        return jsonify({"error": f"유효하지 않은 field: {field}"}), 400
    if not theme:
        return jsonify({"error": "theme 필드 필수"}), 400

    try:
        value = _generate_field(field, theme, context)
        return jsonify({"field": field, "value": value})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@content_pack_bp.route("/api/content-pack/generate-all", methods=["POST", "OPTIONS"])
def generate_all():
    """
    전체 필드 생성.

    Body:
        {
          "theme":   "Samurai Battle",
          "context": { "keywords": [...], "topVideos": [...] }
        }

    Response:
        {
          "title":          "...",
          "description":    "...",
          "hashtags":       [...],
          "keywords":       [...],
          "thumbnail_text": "...",
          "suno_prompt":    "..."
        }
    """
    if request.method == "OPTIONS":
        return "", 204

    body    = request.get_json(silent=True) or {}
    theme   = body.get("theme",   "").strip()
    context = body.get("context", {}) or {}

    if not theme:
        return jsonify({"error": "theme 필드 필수"}), 400

    try:
        # title 먼저 생성 → thumbnail_text의 context로 전달
        title = generate_title(theme, keywords=context.get("keywords"))
        context_with_title = {**context, "title": title}

        result = {
            "title":          title,
            "description":    _generate_field("description",    theme, context),
            "hashtags":       _generate_field("hashtags",       theme, context),
            "keywords":       _generate_field("keywords",       theme, context),
            "thumbnail_text": _generate_field("thumbnail_text", theme, context_with_title),
            "suno_prompt":    _generate_field("suno_prompt",    theme, context),
        }
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
