#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/studio.py

Thumbnail Studio — PHASE 2 메인 실행 파일

전체 흐름:
    1 Style Intelligence   — Phase 1 결과 로드
    2 Prompt Generator     — Midjourney 프롬프트 생성
    3 Copy Generator       — 카피 문구 생성
    4 Image Upload         — 배경 이미지 경로 입력
    5 Template Engine      — 텍스트 합성
    6 Thumbnail Preview    — 저장 경로 출력

실행 방법:
    # 대화형 모드
    python3 studio.py

    # 단일 실행 모드
    python3 studio.py --theme "Samurai Battle" --image /path/to/bg.jpg --copy "SAMURAI BATTLE"

    # 프롬프트만 생성 (이미지 없이)
    python3 studio.py --theme "Dark Assassin" --prompt-only
"""

import argparse
import json
import sys
from pathlib import Path

_THIS_DIR = Path(__file__).parent
sys.path.insert(0, str(_THIS_DIR))

from prompt_generator import generate_prompt
from copy_generator   import generate_copy_options
from template_engine  import apply_template

# Style Intelligence 캐시 경로
STYLE_CACHE = _THIS_DIR / "output" / "style_intelligence.json"


# ─── Style Intelligence 로드 ──────────────────────────────────────────────────
def load_style_intelligence():
    """
    캐시 파일 또는 라이브 실행으로 Style Intelligence 로드.
    캐시 없으면 Phase 1 기본값 사용.
    """
    if STYLE_CACHE.exists():
        with open(STYLE_CACHE, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"[studio] Style Intelligence 로드 완료 ({data.get('generated_at', '?')})")
        return data

    # Phase 1 캐시 없음 → 기본값 (phase 1 실행 권장 안내)
    print("[studio] ⚠ style_intelligence.json 없음 — 기본값 사용")
    print("         Phase 1 실행: python3 api.py --run-once")
    return {
        "best_style": ["high_contrast", "dark"],
        "recommended_prompt_keywords": [
            "high contrast", "dramatic shadows", "dark cinematic",
            "sharp definition", "dramatic lighting",
        ],
    }


def save_style_cache(style_data):
    """Style Intelligence 결과를 캐시 파일로 저장"""
    STYLE_CACHE.parent.mkdir(exist_ok=True)
    with open(STYLE_CACHE, "w", encoding="utf-8") as f:
        json.dump(style_data, f, ensure_ascii=False, indent=2)


# ─── 대화형 모드 ──────────────────────────────────────────────────────────────
def interactive_mode():
    print("\n" + "="*55)
    print("  SOUNDSTORM Thumbnail Studio")
    print("="*55)

    style = load_style_intelligence()
    best_style = style.get("best_style", [])
    style_kws  = style.get("recommended_prompt_keywords", [])

    print(f"\n[Style Intelligence]")
    print(f"  Best style:  {', '.join(best_style)}")
    print(f"  Keywords:    {', '.join(style_kws[:3])}\n")

    # Step 1 — 테마 입력
    theme = input("1. 콘텐츠 테마 입력 (예: Samurai Battle): ").strip()
    if not theme:
        print("테마를 입력해야 합니다.")
        return

    # Step 2 — 프롬프트 생성
    prompt_result = generate_prompt(theme, style_tags=best_style,
                                    extra_keywords=style_kws)
    print(f"\n[Midjourney 프롬프트]")
    print(f"  {prompt_result['mj_prompt']}")
    print(f"\n  키워드:")
    for kw in prompt_result["keywords"]:
        print(f"    • {kw}")

    # Step 3 — 카피 생성
    copy_options = generate_copy_options(theme, keywords=best_style)
    print(f"\n[카피 옵션]")
    for i, opt in enumerate(copy_options, 1):
        print(f"  {i}. {opt}")
    print(f"  0. 직접 입력")

    choice = input("\n카피 번호 선택 (1~{}): ".format(len(copy_options))).strip()
    if choice == "0":
        selected_copy = input("직접 입력: ").strip().upper()
    else:
        try:
            selected_copy = copy_options[int(choice) - 1]
        except (ValueError, IndexError):
            selected_copy = copy_options[0]
            print(f"  → 기본값 사용: {selected_copy}")

    print(f"\n  선택된 카피: {selected_copy}")

    # Step 4 — 이미지 경로 입력
    print(f"\n[배경 이미지]")
    print(f"  Midjourney에서 생성한 이미지 경로를 입력하세요.")
    print(f"  (URL 또는 로컬 파일 경로, 엔터 시 테스트 이미지 사용)")
    image_src = input("  경로: ").strip()

    if not image_src:
        # 테스트용: 실제 채널 썸네일 사용
        image_src = "https://i.ytimg.com/vi/LbvbdVN8te8/maxresdefault.jpg"
        print(f"  → 테스트 이미지 사용: {image_src[:60]}...")

    # Step 5 — 템플릿 적용
    print(f"\n[Template Engine] 합성 중...")
    try:
        output_path = apply_template(image_src, selected_copy)
        print(f"\n{'='*55}")
        print(f"✅ 썸네일 완성!")
        print(f"   카피:   {selected_copy}")
        print(f"   저장:   {output_path}")
        print(f"{'='*55}\n")
    except Exception as e:
        print(f"\n❌ 합성 실패: {e}")


# ─── 단일 실행 모드 ───────────────────────────────────────────────────────────
def single_mode(theme, image_src, copy_text=None, prompt_only=False):
    style = load_style_intelligence()
    best_style = style.get("best_style", [])
    style_kws  = style.get("recommended_prompt_keywords", [])

    # 프롬프트 생성
    prompt_result = generate_prompt(theme, style_tags=best_style,
                                    extra_keywords=style_kws)
    print(f"\n[Midjourney 프롬프트]")
    print(f"  {prompt_result['mj_prompt']}")

    if prompt_only:
        return

    # 카피 결정
    if not copy_text:
        opts = generate_copy_options(theme, keywords=best_style)
        copy_text = opts[0]
        print(f"\n[카피 자동 선택] {copy_text}")
        print(f"[카피 전체 옵션] {opts}")

    # 템플릿 적용
    print(f"\n[Template Engine] 합성 중...")
    output_path = apply_template(image_src, copy_text)
    print(f"\n✅ 완료: {output_path}")

    return output_path


# ─── CLI ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SOUNDSTORM Thumbnail Studio")
    parser.add_argument("--theme",       default=None, help="콘텐츠 테마")
    parser.add_argument("--image",       default=None, help="배경 이미지 경로 또는 URL")
    parser.add_argument("--copy",        default=None, help="카피 문구 (미입력 시 자동 생성)")
    parser.add_argument("--prompt-only", action="store_true", help="프롬프트만 생성")
    parser.add_argument("--save-style",  default=None,
                        help="Style Intelligence JSON 파일 경로 → 캐시로 저장")
    args = parser.parse_args()

    # Style JSON 캐시 저장
    if args.save_style:
        with open(args.save_style, "r", encoding="utf-8") as f:
            data = json.load(f)
        save_style_cache(data)
        print(f"[studio] Style Intelligence 캐시 저장 완료: {STYLE_CACHE}")

    if args.theme:
        single_mode(
            theme=args.theme,
            image_src=args.image or "",
            copy_text=args.copy,
            prompt_only=args.prompt_only,
        )
    else:
        interactive_mode()
