#!/usr/bin/env python3
"""
YouTube 댓글 분석 스크립트

이 스크립트는 수집된 비디오의 댓글을 분석하여:
- 특정 키워드가 포함된 댓글 필터링 (대회, 시범, 사용, 라이센스 등)
- 댓글 좋아요 수 기준 상위 댓글 추출
- 네이버 스토어 상품 페이지용 증거 데이터 생성
"""

import os
import pickle
import json
from datetime import datetime
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pandas as pd
from pathlib import Path
from collections import Counter

# YouTube API 설정
SCOPES = ['https://www.googleapis.com/auth/youtube.readonly']
API_SERVICE_NAME = 'youtube'
API_VERSION = 'v3'

# 분석할 키워드
KEYWORDS = [
    '대회', '시범', '품새', '태권도', '경연', '공연',
    '사용', '라이센스', '라이선스', '구매', '음원',
    '금메달', '은메달', '동메달', '우승', '입상'
]

# 출력 폴더 설정
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / 'output'
OUTPUT_DIR.mkdir(exist_ok=True)


def get_authenticated_service():
    """YouTube API 인증 및 서비스 객체 반환"""
    credentials = None
    token_file = SCRIPT_DIR / 'token.pickle'
    
    if token_file.exists():
        with open(token_file, 'rb') as token:
            credentials = pickle.load(token)
    
    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            credentials.refresh(Request())
        else:
            client_secret_file = SCRIPT_DIR / 'client_secret.json'
            if not client_secret_file.exists():
                raise FileNotFoundError(
                    f"client_secret.json 파일을 찾을 수 없습니다.\n"
                    f"먼저 youtube_analyzer.py를 실행하여 인증을 완료하세요."
                )
            
            flow = InstalledAppFlow.from_client_secrets_file(
                str(client_secret_file), SCOPES)
            credentials = flow.run_local_server(port=0)
        
        with open(token_file, 'wb') as token:
            pickle.dump(credentials, token)
    
    return build(API_SERVICE_NAME, API_VERSION, credentials=credentials)


def get_video_comments(youtube, video_id, max_results=100):
    """비디오의 댓글 가져오기"""
    comments = []
    
    try:
        request = youtube.commentThreads().list(
            part='snippet',
            videoId=video_id,
            maxResults=min(max_results, 100),
            order='relevance',  # 관련성 높은 순 (좋아요 많은 댓글 우선)
            textFormat='plainText'
        )
        
        while request and len(comments) < max_results:
            response = request.execute()
            
            for item in response['items']:
                comment = item['snippet']['topLevelComment']['snippet']
                comments.append({
                    'comment_id': item['snippet']['topLevelComment']['id'],
                    'author': comment['authorDisplayName'],
                    'text': comment['textDisplay'],
                    'like_count': comment['likeCount'],
                    'published_at': comment['publishedAt'],
                    'reply_count': item['snippet']['totalReplyCount']
                })
            
            # 다음 페이지가 있고 아직 max_results에 도달하지 않았으면 계속
            if 'nextPageToken' in response and len(comments) < max_results:
                request = youtube.commentThreads().list(
                    part='snippet',
                    videoId=video_id,
                    maxResults=min(max_results - len(comments), 100),
                    pageToken=response['nextPageToken'],
                    order='relevance',
                    textFormat='plainText'
                )
            else:
                break
                
    except Exception as e:
        print(f"  ⚠ 댓글 가져오기 실패: {e}")
    
    return comments


def analyze_comments(comments, keywords):
    """댓글에서 키워드 분석"""
    keyword_comments = []
    
    for comment in comments:
        text = comment['text'].lower()
        matched_keywords = [kw for kw in keywords if kw in text]
        
        if matched_keywords:
            comment['matched_keywords'] = matched_keywords
            keyword_comments.append(comment)
    
    return keyword_comments


def main():
    """메인 실행 함수"""
    print("=" * 60)
    print("YouTube 댓글 분석 시작")
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
    print(f"분석할 비디오: {len(videos)}개")
    
    # YouTube API 인증
    print("\nYouTube API 인증 중...")
    youtube = get_authenticated_service()
    print("✓ 인증 완료")
    
    # 각 비디오의 댓글 분석
    print(f"\n댓글 수집 및 분석 중 (키워드: {', '.join(KEYWORDS[:5])} 등)...")
    
    all_results = []
    
    for i, video in enumerate(videos, 1):
        video_id = video['video_id']
        title = video['title']
        
        print(f"\n[{i}/{len(videos)}] {title[:50]}...")
        print(f"  조회수: {video['view_count']:,} | 댓글: {video['comment_count']:,}")
        
        # 댓글이 없으면 스킵
        if video['comment_count'] == 0:
            print("  → 댓글 없음, 스킵")
            continue
        
        # 댓글 가져오기 (최대 100개)
        comments = get_video_comments(youtube, video_id, max_results=100)
        print(f"  → {len(comments)}개 댓글 수집")
        
        # 키워드 분석
        keyword_comments = analyze_comments(comments, KEYWORDS)
        
        if keyword_comments:
            print(f"  ✓ 키워드 매칭: {len(keyword_comments)}개")
            
            # 좋아요 순으로 정렬
            keyword_comments.sort(key=lambda x: x['like_count'], reverse=True)
            
            # 상위 5개만 저장
            top_comments = keyword_comments[:5]
            
            for comment in top_comments:
                all_results.append({
                    'video_id': video_id,
                    'video_title': title,
                    'video_url': video['video_url'],
                    'video_views': video['view_count'],
                    'video_likes': video['like_count'],
                    'comment_author': comment['author'],
                    'comment_text': comment['text'],
                    'comment_likes': comment['like_count'],
                    'matched_keywords': ', '.join(comment['matched_keywords']),
                    'published_at': comment['published_at']
                })
    
    # 결과 저장
    print("\n" + "=" * 60)
    print("결과 저장 중...")
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # JSON 저장
    json_file = OUTPUT_DIR / f'comment_analysis_{timestamp}.json'
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"✓ JSON 저장: {json_file}")
    
    # Excel 저장
    if all_results:
        excel_file = OUTPUT_DIR / f'comment_analysis_{timestamp}.xlsx'
        df = pd.DataFrame(all_results)
        
        with pd.ExcelWriter(excel_file, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='키워드 댓글', index=False)
            
            # 열 너비 자동 조정
            worksheet = writer.sheets['키워드 댓글']
            for column in df:
                column_length = max(df[column].astype(str).map(len).max(), len(column))
                col_idx = df.columns.get_loc(column)
                worksheet.column_dimensions[chr(65 + col_idx)].width = min(column_length + 2, 50)
        
        print(f"✓ Excel 저장: {excel_file}")
    
    # 통계 출력
    print("\n" + "=" * 60)
    print("분석 완료!")
    print("=" * 60)
    print(f"키워드 매칭 댓글: {len(all_results)}개")
    
    if all_results:
        # 가장 많이 매칭된 키워드
        all_keywords = []
        for result in all_results:
            all_keywords.extend(result['matched_keywords'].split(', '))
        
        keyword_counts = Counter(all_keywords)
        print("\n가장 많이 언급된 키워드:")
        for keyword, count in keyword_counts.most_common(10):
            print(f"  - {keyword}: {count}회")
        
        # 좋아요 가장 많은 댓글
        top_comment = max(all_results, key=lambda x: x['comment_likes'])
        print(f"\n가장 인기 있는 댓글 (좋아요 {top_comment['comment_likes']}개):")
        print(f"  비디오: {top_comment['video_title'][:50]}...")
        print(f"  댓글: {top_comment['comment_text'][:100]}...")
    
    print(f"\n출력 폴더: {OUTPUT_DIR}")


if __name__ == '__main__':
    main()
