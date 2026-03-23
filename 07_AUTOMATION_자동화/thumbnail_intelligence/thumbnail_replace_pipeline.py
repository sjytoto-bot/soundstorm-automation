#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thumbnail_intelligence/thumbnail_replace_pipeline.py

썸네일 문제 교정 파이프라인 (문제 진단 → 전략 도출 → A/B 변형 생성)

핵심 설계 원칙:
    '스타일 생성'이 아니라 '문제 교정 시스템'
    스타일 + 구도 + 피사체 명확성 + 텍스트 전략 → 4축 통합 전략

실행 흐름:
    1. detect_problems(video_id)    — 현재 썸네일의 진단 문제 감지
    2. derive_strategy(problems)    — 문제 → thumbnail_strategy dict 도출
    3. build_mj_prompt(strategy)    — 4축 기반 Midjourney 프롬프트 생성
    4. wait_for_upload(video_id)    — uploads/ 폴더 감시 (반자동 단계)
    5. render_variant(A/B)          — A(미니멀 텍스트) / B(볼드 텍스트) 두 변형 합성
    6. log_ab_test(video_id, ...)   — thumbnail_ab_logs.json 기록 (CTR 학습용)

사용법:
    python3 thumbnail_replace_pipeline.py --video_id NcsJhlp91fI --title 흑검
    python3 thumbnail_replace_pipeline.py --all       # THUMBNAIL_WEAK 전체 처리
    python3 thumbnail_replace_pipeline.py --video_id NcsJhlp91fI --variant A  # A만 합성
"""

import argparse
import json  # noqa: F401 (analyze-only stdout + ab log)
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ─── 경로 설정 ────────────────────────────────────────────────────────────────

_THIS_DIR  = Path(__file__).parent
UPLOADS_DIR = _THIS_DIR / "uploads"
OUTPUT_DIR  = _THIS_DIR / "output"
AB_LOG_FILE = _THIS_DIR / "thumbnail_ab_logs.json"

UPLOADS_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(_THIS_DIR))

# ─── 진단 대상 영상 정의 ──────────────────────────────────────────────────────
# diagnosis: Video_Diagnostics 시트의 diagnosis 필드값 (THUMBNAIL_WEAK 등)
# known_problems: 썸네일 분석에서 추가로 확인된 구체적 문제들
# ref_video: 참조 기준 영상 (CTR 최고 영상)

ALERT_VIDEOS = [
    {
        "video_id":      "NcsJhlp91fI",
        "title":         "흑검",
        "diagnosis":     "THUMBNAIL_WEAK",
        "known_problems": ["text_overload", "background_bright"],
        "ref_video_id":  "mJBZFTyrZ1I",   # 척살II CTR 9.66%
    },
    {
        "video_id":      "fLYSURHdRww",
        "title":         "잠행",
        "diagnosis":     "THUMBNAIL_WEAK",
        "known_problems": ["unclear_silhouette"],
        "ref_video_id":  "SvapyxF8oqQ",   # 군주 CTR 9.05%
    },
    {
        "video_id":      "1oSFDssWnzg",
        "title":         "혈서",
        "diagnosis":     "THUMBNAIL_WEAK",
        "known_problems": ["text_overload"],
        "ref_video_id":  "mJBZFTyrZ1I",   # 척살II CTR 9.66%
    },
]

# ─── 문제 → 교정 전략 매핑 ───────────────────────────────────────────────────
# 각 문제 코드가 thumbnail_strategy의 어느 축을 어떻게 수정하는지 정의

PROBLEM_FIX_MAP = {
    # 텍스트 관련
    "text_overload": {
        "text_mode": "minimal",                   # 텍스트 최소화
        "extra_keywords": ["clean negative space", "uncluttered"],
    },
    # 배경 관련
    "background_bright": {
        "style":         ["dark", "red_dominant"],  # 어두운 배경
        "extra_keywords": ["deep shadow", "dark void background", "cinematic darkness"],
    },
    # 피사체 관련
    "unclear_silhouette": {
        "composition":   "single_subject_center",   # 중앙 단일 피사체
        "subject_type":  "warrior_silhouette",       # 실루엣 강조
        "extra_keywords": ["clear silhouette", "sharp contrast", "defined outline"],
    },
    "low_contrast_subject": {
        "composition":   "high_contrast_subject",
        "subject_type":  "weapon_silhouette",
        "extra_keywords": ["high contrast", "bold silhouette", "dramatic lighting"],
    },
    # 일반 THUMBNAIL_WEAK (구체적 문제 없을 때 기본 교정)
    "generic_thumbnail_weak": {
        "style":         ["dark", "high_contrast"],
        "composition":   "single_subject_center",
        "text_mode":     "minimal",
        "extra_keywords": ["cinematic quality", "dramatic", "high contrast"],
    },
}

# ─── 참조 영상 기본 전략 (CTR 최고 영상 기준) ────────────────────────────────

REFERENCE_STRATEGIES = {
    "mJBZFTyrZ1I": {  # 척살II CTR 9.66%
        "style":        ["dark", "red_dominant", "minimal"],
        "composition":  "single_subject_center",
        "subject_type": "weapon_silhouette",
        "text_mode":    "minimal",
    },
    "SvapyxF8oqQ": {  # 군주 CTR 9.05%
        "style":        ["dark", "high_contrast"],
        "composition":  "single_subject_center",
        "subject_type": "royal_power_symbol",
        "text_mode":    "bold_white",
    },
}

# ─── A/B 변형 텍스트 설정 ─────────────────────────────────────────────────────
# A: 척살II 스타일 — 텍스트 최소, 이미지가 말하게 함
# B: 군주 스타일 — 굵은 흰 텍스트 + 강한 stroke

VARIANT_CONFIGS = {
    "A": {
        "label":        "minimal_text",
        "description":  "척살II 기준 — 텍스트 최소화, 이미지 임팩트",
        "size":          80,
        "position":     "bottom_center",
        "color":        "#ffffff",
        "stroke_width":  4,
        "stroke_color": "#000000",
        "padding_bottom": 40,
    },
    "B": {
        "label":        "bold_text",
        "description":  "군주 기준 — 굵은 흰 텍스트 + 강한 stroke",
        "size":          140,
        "position":     "center",
        "color":        "#ffffff",
        "stroke_width":  8,
        "stroke_color": "#000000",
        "padding_bottom": 60,
    },
}

# ─── 구도 → Midjourney 키워드 변환 ───────────────────────────────────────────

COMPOSITION_KEYWORDS = {
    "single_subject_center": ["centered composition", "subject in center frame"],
    "high_contrast_subject":  ["extreme high contrast", "subject isolated on dark background"],
    "darken_background":      ["dark void background", "deep shadow environment"],
}

SUBJECT_TYPE_KEYWORDS = {
    "weapon_silhouette":    ["sword silhouette", "black blade", "weapon closeup"],
    "warrior_silhouette":   ["warrior silhouette", "armored figure", "battle stance"],
    "royal_power_symbol":   ["crown", "royal symbol", "power throne", "imperial motif"],
}


# ─── Step 1: 문제 감지 ────────────────────────────────────────────────────────

def detect_problems(video_entry):
    """
    video_entry (ALERT_VIDEOS 항목) → 문제 코드 리스트

    1차: known_problems 활용 (이미 진단된 문제)
    2차: thumbnail_analyzer로 현재 썸네일 실측 (선택 실행)

    Returns:
        list[str] — 감지된 문제 코드들
    """
    problems = list(video_entry.get("known_problems", []))

    # diagnosis가 THUMBNAIL_WEAK이고 구체적 문제 없으면 generic 추가
    if video_entry.get("diagnosis") == "THUMBNAIL_WEAK" and not problems:
        problems.append("generic_thumbnail_weak")

    return problems


def detect_problems_live(video_id):
    """
    썸네일 실측 분석으로 문제 코드 추가 감지 (선택 사용)

    thumbnail_analyzer.analyze_thumbnail() 결과로
    brightness / edge_density를 실측해 문제 코드 반환
    """
    try:
        from thumbnail_analyzer import analyze_thumbnail
        url    = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
        result = analyze_thumbnail(video_id, url)

        problems = []
        if result.get("error"):
            return problems

        brightness   = result.get("brightness", 128)
        edge_density = result.get("edge_density", 0.05)
        style_tags   = result.get("style_tags", [])

        if brightness > 100:               # 배경 밝음
            problems.append("background_bright")
        if edge_density > 0.12:            # 텍스트 과부하 (고주파 엣지 과다)
            problems.append("text_overload")
        if "text_overlay" in style_tags:
            problems.append("text_overload")
        if brightness < 80 and "high_contrast" not in style_tags:
            problems.append("unclear_silhouette")

        return problems

    except Exception as e:
        print(f"  ⚠ 실측 분석 실패 ({video_id}): {e}")
        return []


# ─── Step 2: 전략 도출 ────────────────────────────────────────────────────────

def derive_strategy(problems, ref_video_id=None):
    """
    문제 코드 리스트 → thumbnail_strategy dict

    참조 영상 기본 전략 위에 문제별 교정을 덮어씌움

    Returns:
        thumbnail_strategy = {
            "style":        list[str],
            "composition":  str,
            "subject_type": str,
            "text_mode":    str,
            "extra_keywords": list[str],
        }
    """
    # 참조 영상 기본 전략으로 시작
    base = REFERENCE_STRATEGIES.get(ref_video_id, {
        "style":        ["dark", "high_contrast"],
        "composition":  "single_subject_center",
        "subject_type": "warrior_silhouette",
        "text_mode":    "minimal",
    }).copy()

    strategy = {
        "style":          list(base.get("style", [])),
        "composition":    base.get("composition", "single_subject_center"),
        "subject_type":   base.get("subject_type", "warrior_silhouette"),
        "text_mode":      base.get("text_mode", "minimal"),
        "extra_keywords": [],
    }

    # 각 문제에 대응하는 교정값 병합
    for problem in problems:
        fix = PROBLEM_FIX_MAP.get(problem, {})

        if "style" in fix:
            # 기존 스타일에 교정 스타일 병합 (중복 제거)
            for s in fix["style"]:
                if s not in strategy["style"]:
                    strategy["style"].append(s)

        if "composition" in fix:
            strategy["composition"] = fix["composition"]

        if "subject_type" in fix:
            strategy["subject_type"] = fix["subject_type"]

        if "text_mode" in fix:
            strategy["text_mode"] = fix["text_mode"]

        if "extra_keywords" in fix:
            for kw in fix["extra_keywords"]:
                if kw not in strategy["extra_keywords"]:
                    strategy["extra_keywords"].append(kw)

    return strategy


# ─── Step 3: Midjourney 프롬프트 생성 ─────────────────────────────────────────

def build_mj_prompt(title, strategy):
    """
    thumbnail_strategy 4축 기반 Midjourney 프롬프트 생성

    기존 prompt_generator.generate_prompt()를 활용하되
    composition + subject_type을 extra_keywords로 통합

    Returns:
        str — MJ 프롬프트 (--ar 16:9 포함)
    """
    from prompt_generator import generate_prompt

    # 구도 키워드 추출
    comp_kws = COMPOSITION_KEYWORDS.get(strategy["composition"], [])
    subj_kws = SUBJECT_TYPE_KEYWORDS.get(strategy["subject_type"], [])
    extra    = comp_kws + subj_kws + strategy.get("extra_keywords", [])

    result = generate_prompt(
        theme=title,
        style_tags=strategy["style"],
        extra_keywords=extra[:6],   # 키워드 과부하 방지
    )

    return result["mj_prompt"]


# ─── Step 4: 이미지 대기 ──────────────────────────────────────────────────────

def wait_for_upload(video_id, timeout=600):
    """
    uploads/{video_id}.png 파일 생성 대기 (최대 10분)

    Returns:
        Path — 업로드된 파일 경로
    Raises:
        TimeoutError — 타임아웃 시
    """
    path  = UPLOADS_DIR / f"{video_id}.png"
    start = time.time()

    if path.exists():
        print(f"  ✅ 기존 파일 감지: {path.name}")
        return path

    print(f"\n  📂 대기 위치: {path}")
    print(f"  Midjourney에서 이미지 생성 후 위 경로에 저장하세요.")
    print(f"  파일명 규칙: {video_id}.png")

    while not path.exists():
        if time.time() - start > timeout:
            raise TimeoutError(f"파일 대기 시간 초과 ({timeout}초): {path}")
        elapsed = int(time.time() - start)
        print(f"  ⏳ 대기 중... {elapsed}s / {timeout}s  ({path.name})", end="\r")
        time.sleep(3)

    print(f"\n  ✅ 파일 감지됨: {path.name}")
    return path


# ─── Step 5: A/B 변형 합성 ───────────────────────────────────────────────────

def render_variant(video_id, title, bg_path, variant, strategy):
    """
    단일 변형(A 또는 B) 썸네일 합성

    text_mode에 따라 variant config 추가 조정:
        text_mode="minimal" → A 설정 사용 (variant 무관)
        text_mode="bold_white" → B 설정 사용

    Returns:
        str — 출력 파일 경로
    """
    from template_engine import apply_template

    cfg = VARIANT_CONFIGS[variant].copy()

    # text_mode 전략 반영 (strategy가 minimal 강제 시 A 설정 강제)
    if strategy.get("text_mode") == "minimal" and variant == "B":
        # B 변형이더라도 minimal이면 텍스트 크기 상한 적용
        cfg["size"]         = min(cfg["size"], 100)
        cfg["stroke_width"] = min(cfg["stroke_width"], 5)

    output_name = OUTPUT_DIR / f"thumb_{video_id}_v{variant}.jpg"

    # template_engine의 apply_template 호출
    # template_config 포맷에 맞게 변환
    template_config = {
        "output_size":      [1280, 720],
        "size":             cfg["size"],
        "position":         cfg["position"],
        "color":            cfg["color"],
        "stroke_color":     cfg["stroke_color"],
        "stroke_width":     cfg["stroke_width"],
        "padding_bottom":   cfg["padding_bottom"],
        "padding_side":     40,
        "max_width_ratio":  0.80,
        "output_quality":   95,
    }

    result_path = apply_template(
        image_source=str(bg_path),
        copy_text=title,
        template_config=template_config,
        output_path=str(output_name),
    )

    return result_path


# ─── Step 6: A/B 로그 기록 ────────────────────────────────────────────────────

def log_ab_test(video_id, title, strategy, variants_output):
    """
    A/B 테스트 기록 → thumbnail_ab_logs.json

    기록 구조:
    {
        "video_id": "...",
        "title": "...",
        "created_at": "...",
        "strategy": { style, composition, subject_type, text_mode },
        "variants": {
            "A": { "path": "...", "label": "minimal_text", "uploaded": false, "ctr": null },
            "B": { "path": "...", "label": "bold_text",    "uploaded": false, "ctr": null }
        }
    }
    """
    logs = []
    if AB_LOG_FILE.exists():
        try:
            logs = json.loads(AB_LOG_FILE.read_text(encoding="utf-8"))
        except Exception:
            logs = []

    # 기존 항목 제거 (동일 video_id 중복 방지)
    logs = [l for l in logs if l.get("video_id") != video_id]

    entry = {
        "video_id":   video_id,
        "title":      title,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "strategy": {
            "style":        strategy["style"],
            "composition":  strategy["composition"],
            "subject_type": strategy["subject_type"],
            "text_mode":    strategy["text_mode"],
        },
        "variants": {},
    }

    for variant, path in variants_output.items():
        entry["variants"][variant] = {
            "path":     str(path),
            "label":    VARIANT_CONFIGS[variant]["label"],
            "description": VARIANT_CONFIGS[variant]["description"],
            "uploaded": False,     # YouTube 업로드 완료 시 수동으로 true
            "ctr":      None,      # 교체 후 CTR 기록 (수동 업데이트)
            "studio_url": f"https://studio.youtube.com/video/{video_id}/edit",
        }

    logs.append(entry)
    AB_LOG_FILE.write_text(
        json.dumps(logs, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\n  📊 A/B 로그 기록 완료: {AB_LOG_FILE.name}")


# ─── 단일 영상 파이프라인 ─────────────────────────────────────────────────────

def run_pipeline(video_entry, skip_wait=False, variant_only=None):
    """
    단일 영상 썸네일 교체 파이프라인 실행

    Args:
        video_entry:  ALERT_VIDEOS 항목 dict
        skip_wait:    True이면 uploads/ 파일 대기 없이 기존 파일 사용
        variant_only: "A" 또는 "B"이면 해당 변형만 합성 (None이면 A+B 모두)
    """
    video_id = video_entry["video_id"]
    title    = video_entry["title"]
    ref_vid  = video_entry.get("ref_video_id")

    print(f"\n{'='*60}")
    print(f"  🎯 대상 영상: [{title}]  video_id={video_id}")
    print(f"{'='*60}")

    # Step 1: 문제 감지
    print(f"\n[1/5] 문제 감지 중...")
    problems = detect_problems(video_entry)
    print(f"  감지된 문제: {problems}")

    # Step 2: 전략 도출
    print(f"\n[2/5] thumbnail_strategy 도출 중...")
    strategy = derive_strategy(problems, ref_video_id=ref_vid)
    print(f"  style:        {strategy['style']}")
    print(f"  composition:  {strategy['composition']}")
    print(f"  subject_type: {strategy['subject_type']}")
    print(f"  text_mode:    {strategy['text_mode']}")

    # Step 3: 프롬프트 생성
    print(f"\n[3/5] Midjourney 프롬프트 생성 중...")
    prompt = build_mj_prompt(title, strategy)
    # 클립보드 복사 (macOS)
    try:
        subprocess.run(["pbcopy"], input=prompt.encode(), check=True)
        print(f"\n  ✅ 프롬프트 클립보드 복사 완료:")
    except Exception:
        print(f"\n  ℹ 프롬프트 (클립보드 복사 실패 시 수동 복사):")
    print(f"  {prompt}\n")

    # Step 4: 이미지 대기
    print(f"[4/5] 배경 이미지 준비 중...")
    if skip_wait:
        bg_path = UPLOADS_DIR / f"{video_id}.png"
        if not bg_path.exists():
            print(f"  ❌ 파일 없음: {bg_path}")
            print(f"  uploads/{video_id}.png 를 먼저 저장하세요.")
            return None
        print(f"  ✅ 기존 파일 사용: {bg_path.name}")
    else:
        bg_path = wait_for_upload(video_id)

    # Step 5: A/B 변형 합성
    print(f"\n[5/5] A/B 변형 합성 중...")
    variants_to_run = ["A", "B"] if variant_only is None else [variant_only]
    variants_output = {}

    for variant in variants_to_run:
        cfg = VARIANT_CONFIGS[variant]
        print(f"\n  ── Variant {variant}: {cfg['description']}")
        out_path = render_variant(video_id, title, bg_path, variant, strategy)
        variants_output[variant] = out_path
        print(f"  ✅ 저장: {out_path}")

    # Step 6: A/B 로그
    log_ab_test(video_id, title, strategy, variants_output)

    # 완료 안내
    print(f"\n{'─'*60}")
    print(f"  🎬 [{title}] 썸네일 생성 완료")
    for variant, path in variants_output.items():
        cfg = VARIANT_CONFIGS[variant]
        print(f"\n  Variant {variant} ({cfg['label']}):")
        print(f"    파일: {path}")
        print(f"    Studio: https://studio.youtube.com/video/{video_id}/edit")
    print(f"\n  ⚠ A/B 테스트 방법:")
    print(f"    1. Variant A 업로드 → 1주일 CTR 기록")
    print(f"    2. Variant B 업로드 → 1주일 CTR 기록")
    print(f"    3. thumbnail_ab_logs.json에 ctr 값 업데이트")
    print(f"{'─'*60}")

    return variants_output


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="썸네일 문제 교정 파이프라인 — 진단 → 전략 → A/B 생성",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  # 흑검 — A/B 두 변형 모두 생성 (Midjourney 이미지 대기)
  python3 thumbnail_replace_pipeline.py --video_id NcsJhlp91fI --title 흑검

  # uploads/ 에 파일이 이미 있으면 바로 합성 (대기 스킵)
  python3 thumbnail_replace_pipeline.py --video_id NcsJhlp91fI --title 흑검 --skip_wait

  # B 변형만 다시 합성
  python3 thumbnail_replace_pipeline.py --video_id NcsJhlp91fI --title 흑검 --variant B --skip_wait

  # THUMBNAIL_WEAK 전체 처리
  python3 thumbnail_replace_pipeline.py --all
        """
    )

    parser.add_argument("--video_id",  help="대상 video_id")
    parser.add_argument("--title",     help="영상 제목 (텍스트 오버레이용)")
    parser.add_argument("--all",          action="store_true", help="ALERT_VIDEOS 전체 처리")
    parser.add_argument("--skip_wait",    action="store_true",
                        help="uploads/ 파일 대기 없이 기존 파일 사용")
    parser.add_argument("--variant",      choices=["A", "B"], default=None,
                        help="A 또는 B만 생성 (기본: 둘 다)")
    parser.add_argument("--live",         action="store_true",
                        help="thumbnail_analyzer로 현재 썸네일 실측 분석 추가")
    parser.add_argument("--analyze-only", action="store_true",
                        help="진단 + 전략 + 프롬프트만 출력 (합성 없음) → JSON stdout")

    args = parser.parse_args()

    # ── analyze-only 모드: 진단 + 전략 + 프롬프트 JSON 출력 ──────────────────
    if getattr(args, "analyze_only", False):
        if not args.video_id:
            print('{"error": "--video_id 필수"}')
            sys.exit(1)

        entry = next(
            (v for v in ALERT_VIDEOS if v["video_id"] == args.video_id),
            {
                "video_id":       args.video_id,
                "title":          args.title or args.video_id,
                "diagnosis":      "THUMBNAIL_WEAK",
                "known_problems": [],
                "ref_video_id":   "mJBZFTyrZ1I",
            }
        )
        if args.title:
            entry = {**entry, "title": args.title}

        problems = detect_problems(entry)
        strategy = derive_strategy(problems, ref_video_id=entry.get("ref_video_id"))
        prompt   = build_mj_prompt(entry["title"], strategy)

        # 클립보드 복사 (macOS)
        try:
            subprocess.run(["pbcopy"], input=prompt.encode(), check=True)
        except Exception:
            pass

        result = {
            "video_id":  args.video_id,
            "title":     entry["title"],
            "problems":  problems,
            "strategy":  strategy,
            "prompt":    prompt,
        }
        # 파싱 마커 포함 출력 (main.js에서 파싱)
        print(f"ANALYZE_RESULT:{json.dumps(result, ensure_ascii=False)}")
        return

    if args.all:
        # 전체 처리
        print(f"\n[ALL MODE] {len(ALERT_VIDEOS)}개 영상 순차 처리")
        for entry in ALERT_VIDEOS:
            if args.live:
                live_problems = detect_problems_live(entry["video_id"])
                # 기존 known_problems에 실측 결과 병합
                combined = list(set(entry["known_problems"] + live_problems))
                entry = {**entry, "known_problems": combined}
            run_pipeline(
                entry,
                skip_wait=args.skip_wait,
                variant_only=args.variant,
            )
        print(f"\n✅ 전체 처리 완료 — A/B 로그: {AB_LOG_FILE}")

    elif args.video_id:
        # 단일 처리
        # ALERT_VIDEOS에서 찾거나, CLI 인자로 임시 항목 생성
        entry = next(
            (v for v in ALERT_VIDEOS if v["video_id"] == args.video_id),
            None
        )
        if entry is None:
            if not args.title:
                print(f"❌ ALERT_VIDEOS에 없는 video_id입니다. --title을 함께 지정하세요.")
                sys.exit(1)
            # 임시 항목 생성 (known_problems 없음 → generic_thumbnail_weak으로 처리)
            entry = {
                "video_id":       args.video_id,
                "title":          args.title,
                "diagnosis":      "THUMBNAIL_WEAK",
                "known_problems": [],
                "ref_video_id":   "mJBZFTyrZ1I",
            }
        elif args.title:
            entry = {**entry, "title": args.title}

        if args.live:
            live_problems = detect_problems_live(args.video_id)
            combined      = list(set(entry.get("known_problems", []) + live_problems))
            entry         = {**entry, "known_problems": combined}
            print(f"  실측 문제 ({args.video_id}): {combined}")

        run_pipeline(entry, skip_wait=args.skip_wait, variant_only=args.variant)

    else:
        parser.print_help()
        print("\n사용 예시:")
        print("  python3 thumbnail_replace_pipeline.py --video_id NcsJhlp91fI --title 흑검")
        print("  python3 thumbnail_replace_pipeline.py --all --skip_wait")


if __name__ == "__main__":
    main()
