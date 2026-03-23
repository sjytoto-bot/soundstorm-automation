"""
youtube_to_mp3.py
YouTube URL → MP3 변환 다운로더

사용법:
    python3 youtube_to_mp3.py <YouTube URL>
    python3 youtube_to_mp3.py <YouTube URL> --output /원하는/경로
    python3 youtube_to_mp3.py <YouTube URL> --quality 320

의존성:
    pip install yt-dlp
    brew install ffmpeg
"""

import sys
import os
import argparse
import yt_dlp

# 기본 저장 경로: 07_AUTOMATION_자동화/03_RUNTIME/mp3_downloads/
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
AUTOMATION_DIR = os.path.dirname(SCRIPT_DIR)
DEFAULT_OUTPUT_DIR = os.path.join(AUTOMATION_DIR, "03_RUNTIME", "mp3_downloads")


def download_mp3(url: str, output_dir: str = DEFAULT_OUTPUT_DIR, quality: str = "192"):
    os.makedirs(output_dir, exist_ok=True)

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": quality,
            }
        ],
        "quiet": False,
        "no_warnings": False,
    }

    print(f"[youtube_to_mp3] URL: {url}")
    print(f"[youtube_to_mp3] 저장 경로: {output_dir}")
    print(f"[youtube_to_mp3] 음질: {quality}kbps")

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "unknown")
        print(f"[youtube_to_mp3] 완료: {title}.mp3")
        return os.path.join(output_dir, f"{title}.mp3")


def main():
    parser = argparse.ArgumentParser(description="YouTube URL을 MP3로 다운로드")
    parser.add_argument("url", help="YouTube URL")
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT_DIR, help="저장 경로 (기본: 03_RUNTIME/mp3_downloads/)")
    parser.add_argument("--quality", "-q", default="192", choices=["128", "192", "256", "320"], help="MP3 음질 (kbps, 기본: 192)")
    args = parser.parse_args()

    try:
        result = download_mp3(args.url, args.output, args.quality)
        print(f"[youtube_to_mp3] 파일 위치: {result}")
    except Exception as e:
        print(f"[youtube_to_mp3] 오류: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
