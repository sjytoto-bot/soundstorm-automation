#!/usr/bin/env python3
"""
YouTube 데이터 패턴 분석 스크립트

수집된 YouTube 데이터에서 패턴을 추출:
- 제목 패턴 (길이, 키워드, 구조)
- 설명 패턴
- 태그 분석
- 고성과 콘텐츠 특징
"""

import json
import pickle
import pandas as pd
import webbrowser
from pathlib import Path
from collections import Counter
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import re
from datetime import datetime

# 출력 폴더 설정
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / 'output'


def upload_to_google_sheets(excel_file_path, folder_name='YouTube Analytics'):
    """엑셀 파일을 Google Sheets로 업로드하고 URL 반환"""
    try:
        credentials = None
        token_file = SCRIPT_DIR / 'token.pickle'
        
        if token_file.exists():
            with open(token_file, 'rb') as token:
                credentials = pickle.load(token)
        
        drive_service = build('drive', 'v3', credentials=credentials)
        
        # 폴더 찾기 또는 생성
        folder_id = None
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = drive_service.files().list(q=query, fields='files(id, name)').execute()
        folders = results.get('files', [])
        
        if folders:
            folder_id = folders[0]['id']
        else:
            folder_metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder'
            }
            folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
            folder_id = folder['id']
        
        # 엑셀 파일 업로드 (Google Sheets로 변환)
        file_name = Path(excel_file_path).stem
        file_metadata = {
            'name': file_name,
            'mimeType': 'application/vnd.google-apps.spreadsheet',
            'parents': [folder_id]
        }
        
        media = MediaFileUpload(
            excel_file_path,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            resumable=True
        )
        
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()
        
        return file['webViewLink']
    except Exception as e:
        print(f"⚠️  Google Sheets 업로드 실패: {e}")
        return None


def analyze_titles(videos):
    """제목 패턴 분석"""
    titles = [v['title'] for v in videos]
    
    # 기본 통계
    lengths = [len(t) for t in titles]
    
    # 모든 단어 추출 (한글, 영어, 숫자)
    all_words = []
    for title in titles:
        # 특수문자 제거하고 단어 추출
        words = re.findall(r'[가-힣]+|[a-zA-Z]+|\d+', title)
        all_words.extend(words)
    
    # 자주 사용되는 단어
    word_counts = Counter(all_words)
    
    # 특수문자 사용 패턴
    special_chars = Counter()
    for title in titles:
        for char in title:
            if not char.isalnum() and not char.isspace():
                special_chars[char] += 1
    
    # 이모지 사용 여부
    emoji_count = sum(1 for t in titles if any(ord(c) > 127 for c in t))
    
    return {
        'total_count': len(titles),
        'avg_length': sum(lengths) / len(lengths),
        'min_length': min(lengths),
        'max_length': max(lengths),
        'top_words': word_counts.most_common(30),
        'top_special_chars': special_chars.most_common(10),
        'emoji_usage_rate': emoji_count / len(titles) * 100
    }


def analyze_descriptions(videos):
    """설명 패턴 분석"""
    descriptions = [v['description'] for v in videos if v['description']]
    
    if not descriptions:
        return {'total_count': 0}
    
    lengths = [len(d) for d in descriptions]
    
    # URL 패턴 추출
    urls = []
    for desc in descriptions:
        found_urls = re.findall(r'https?://[^\s]+', desc)
        urls.extend(found_urls)
    
    # 해시태그 추출
    hashtags = []
    for desc in descriptions:
        found_tags = re.findall(r'#[가-힣a-zA-Z0-9_]+', desc)
        hashtags.extend(found_tags)
    
    return {
        'total_count': len(descriptions),
        'avg_length': sum(lengths) / len(lengths) if lengths else 0,
        'url_count': len(urls),
        'unique_urls': len(set(urls)),
        'hashtag_count': len(hashtags),
        'top_hashtags': Counter(hashtags).most_common(20)
    }


def analyze_tags(videos):
    """태그 패턴 분석"""
    all_tags = []
    tag_counts_per_video = []
    
    for video in videos:
        tags = video.get('tags', [])
        tag_counts_per_video.append(len(tags))
        all_tags.extend(tags)
    
    if not all_tags:
        return {'total_count': 0}
    
    tag_counter = Counter(all_tags)
    
    return {
        'total_videos_with_tags': sum(1 for c in tag_counts_per_video if c > 0),
        'avg_tags_per_video': sum(tag_counts_per_video) / len(tag_counts_per_video),
        'total_unique_tags': len(set(all_tags)),
        'top_tags': tag_counter.most_common(50)
    }


def analyze_performance(videos):
    """성과 분석 (조회수, 좋아요 등)"""
    # 조회수 기준 정렬
    sorted_by_views = sorted(videos, key=lambda x: x['view_count'], reverse=True)
    
    # 좋아요율 계산
    for video in videos:
        if video['view_count'] > 0:
            video['like_rate'] = video['like_count'] / video['view_count'] * 100
            video['comment_rate'] = video['comment_count'] / video['view_count'] * 100
        else:
            video['like_rate'] = 0
            video['comment_rate'] = 0
    
    # 좋아요율 기준 정렬
    sorted_by_engagement = sorted(videos, key=lambda x: x['like_rate'], reverse=True)
    
    return {
        'total_views': sum(v['view_count'] for v in videos),
        'total_likes': sum(v['like_count'] for v in videos),
        'total_comments': sum(v['comment_count'] for v in videos),
        'avg_views': sum(v['view_count'] for v in videos) / len(videos),
        'avg_likes': sum(v['like_count'] for v in videos) / len(videos),
        'avg_comments': sum(v['comment_count'] for v in videos) / len(videos),
        'avg_like_rate': sum(v['like_rate'] for v in videos) / len(videos),
        'avg_comment_rate': sum(v['comment_rate'] for v in videos) / len(videos),
        'top_10_by_views': [
            {
                'title': v['title'],
                'views': v['view_count'],
                'likes': v['like_count'],
                'url': v['video_url']
            }
            for v in sorted_by_views[:10]
        ],
        'top_10_by_engagement': [
            {
                'title': v['title'],
                'views': v['view_count'],
                'like_rate': v['like_rate'],
                'url': v['video_url']
            }
            for v in sorted_by_engagement[:10]
        ]
    }


def generate_templates(title_analysis, tag_analysis):
    """제목 및 태그 템플릿 생성"""
    # 자주 사용되는 단어로 템플릿 생성
    top_words = [word for word, count in title_analysis['top_words'][:10]]
    top_tags = [tag for tag, count in tag_analysis.get('top_tags', [])[:20]]
    
    templates = {
        'title_templates': [
            f"[장르] [BPM]BPM | {top_words[0] if top_words else '용도'}",
            f"{top_words[0] if top_words else '무드'} [악기] Music | [특징]",
            f"[키] {top_words[1] if len(top_words) > 1 else '장르'} BGM | 로열티 프리"
        ],
        'recommended_tags': top_tags,
        'common_keywords': top_words
    }
    
    return templates


def main():
    """메인 실행 함수"""
    print("=" * 60)
    print("YouTube 데이터 패턴 분석 시작")
    print("=" * 60)
    
    # 최신 JSON 파일 찾기
    json_files = sorted(OUTPUT_DIR.glob('youtube_data_*.json'), reverse=True)
    if not json_files:
        print("❌ 먼저 youtube_analyzer.py를 실행하여 비디오 데이터를 수집하세요.")
        return
    
    latest_json = json_files[0]
    print(f"\n데이터 파일: {latest_json.name}")
    
    # 데이터 로드
    with open(latest_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    videos = data['videos']
    print(f"분석할 비디오: {len(videos)}개\n")
    
    # 각종 분석 실행
    print("[1/5] 제목 패턴 분석 중...")
    title_analysis = analyze_titles(videos)
    
    print("[2/5] 설명 패턴 분석 중...")
    description_analysis = analyze_descriptions(videos)
    
    print("[3/5] 태그 분석 중...")
    tag_analysis = analyze_tags(videos)
    
    print("[4/5] 성과 분석 중...")
    performance_analysis = analyze_performance(videos)
    
    print("[5/5] 템플릿 생성 중...")
    templates = generate_templates(title_analysis, tag_analysis)
    
    # 결과 저장
    print("\n결과 저장 중...")
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # JSON 저장
    analysis_result = {
        'title_analysis': title_analysis,
        'description_analysis': description_analysis,
        'tag_analysis': tag_analysis,
        'performance_analysis': performance_analysis,
        'templates': templates,
        'analyzed_at': datetime.now().isoformat()
    }
    
    json_file = OUTPUT_DIR / f'pattern_analysis_{timestamp}.json'
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(analysis_result, f, ensure_ascii=False, indent=2)
    print(f"✓ JSON 저장: {json_file}")
    
    # Excel 리포트 생성
    excel_file = OUTPUT_DIR / f'pattern_analysis_{timestamp}.xlsx'
    
    with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
        # 제목 분석 시트
        df_title = pd.DataFrame([{
            '평균 길이': f"{title_analysis['avg_length']:.1f}자",
            '최소 길이': f"{title_analysis['min_length']}자",
            '최대 길이': f"{title_analysis['max_length']}자",
            '이모지 사용률': f"{title_analysis['emoji_usage_rate']:.1f}%"
        }])
        df_title.to_excel(writer, sheet_name='제목 통계', index=False)
        
        # 자주 사용되는 단어
        df_words = pd.DataFrame(title_analysis['top_words'], columns=['단어', '사용 횟수'])
        df_words.to_excel(writer, sheet_name='자주 사용되는 단어', index=False)
        
        # 태그 분석
        if tag_analysis.get('top_tags'):
            df_tags = pd.DataFrame(tag_analysis['top_tags'], columns=['태그', '사용 횟수'])
            df_tags.to_excel(writer, sheet_name='인기 태그', index=False)
        
        # 성과 분석
        df_perf = pd.DataFrame([{
            '총 조회수': f"{performance_analysis['total_views']:,}",
            '평균 조회수': f"{performance_analysis['avg_views']:,.0f}",
            '평균 좋아요': f"{performance_analysis['avg_likes']:,.0f}",
            '평균 좋아요율': f"{performance_analysis['avg_like_rate']:.2f}%",
            '평균 댓글율': f"{performance_analysis['avg_comment_rate']:.2f}%"
        }])
        df_perf.to_excel(writer, sheet_name='성과 통계', index=False)
        
        # 조회수 상위 10개
        df_top_views = pd.DataFrame(performance_analysis['top_10_by_views'])
        df_top_views.to_excel(writer, sheet_name='조회수 TOP 10', index=False)
        
        # 템플릿
        df_templates = pd.DataFrame({
            '제목 템플릿': templates['title_templates'],
        })
        df_templates.to_excel(writer, sheet_name='템플릿', index=False)
        
        # 추천 태그
        df_rec_tags = pd.DataFrame({
            '추천 태그': templates['recommended_tags']
        })
        df_rec_tags.to_excel(writer, sheet_name='추천 태그', index=False)
    
    print(f"✓ Excel 저장: {excel_file}")
    
    # Google Sheets 업로드
    print("\n📤 Google Sheets 업로드 중...")
    sheets_url = upload_to_google_sheets(excel_file)
    if sheets_url:
        print(f"✓ Google Sheets 업로드 완료!")
        print(f"  URL: {sheets_url}")
        print("\n🌐 브라우저에서 열기...")
        webbrowser.open(sheets_url)
    
    # 요약 출력
    print("\n" + "=" * 60)
    print("분석 완료!")
    print("=" * 60)
    
    print("\n📊 제목 분석:")
    print(f"  평균 길이: {title_analysis['avg_length']:.1f}자")
    print(f"  자주 사용되는 단어 TOP 5:")
    for word, count in title_analysis['top_words'][:5]:
        print(f"    - {word}: {count}회")
    
    print("\n🏷️ 태그 분석:")
    print(f"  평균 태그 수: {tag_analysis.get('avg_tags_per_video', 0):.1f}개")
    if tag_analysis.get('top_tags'):
        print(f"  인기 태그 TOP 5:")
        for tag, count in tag_analysis['top_tags'][:5]:
            print(f"    - {tag}: {count}회")
    
    print("\n📈 성과 분석:")
    print(f"  평균 조회수: {performance_analysis['avg_views']:,.0f}회")
    print(f"  평균 좋아요율: {performance_analysis['avg_like_rate']:.2f}%")
    
    print(f"\n출력 폴더: {OUTPUT_DIR}")
    if sheets_url:
        print(f"Google Sheets: {sheets_url}")


if __name__ == '__main__':
    main()
