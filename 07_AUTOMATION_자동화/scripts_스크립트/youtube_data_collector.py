"""
SOUNDSTORM 유튜브 채널 데이터 수집 스크립트
채널 ID: UCAvSo9RLq0rCy64IH2nm91w
"""

import requests
import json
import csv
from datetime import datetime
import time

# ========== 설정 ==========
CHANNEL_ID = "UCAvSo9RLq0rCy64IH2nm91w"
API_KEY = "YOUR_API_KEY_HERE"  # GCP에서 발급받은 API 키를 여기에 입력

# ========== API 엔드포인트 ==========
BASE_URL = "https://www.googleapis.com/youtube/v3"

class YouTubeDataCollector:
    def __init__(self, api_key, channel_id):
        self.api_key = api_key
        self.channel_id = channel_id
        self.videos = []
    
    def get_channel_videos(self):
        """채널의 모든 영상 목록 가져오기"""
        print("📡 채널 영상 목록 수집 중...")
        
        # 1단계: 채널의 uploads 플레이리스트 ID 찾기
        url = f"{BASE_URL}/channels"
        params = {
            'part': 'contentDetails',
            'id': self.channel_id,
            'key': self.api_key
        }
        
        response = requests.get(url, params=params)
        data = response.json()
        
        if 'items' not in data or len(data['items']) == 0:
            print("❌ 채널을 찾을 수 없습니다.")
            return []
        
        uploads_playlist_id = data['items'][0]['contentDetails']['relatedPlaylists']['uploads']
        print(f"✅ Uploads Playlist ID: {uploads_playlist_id}")
        
        # 2단계: 플레이리스트의 모든 영상 ID 수집
        video_ids = []
        next_page_token = None
        
        while True:
            url = f"{BASE_URL}/playlistItems"
            params = {
                'part': 'contentDetails',
                'playlistId': uploads_playlist_id,
                'maxResults': 50,
                'key': self.api_key
            }
            
            if next_page_token:
                params['pageToken'] = next_page_token
            
            response = requests.get(url, params=params)
            data = response.json()
            
            for item in data.get('items', []):
                video_ids.append(item['contentDetails']['videoId'])
            
            next_page_token = data.get('nextPageToken')
            
            print(f"📥 수집된 영상: {len(video_ids)}개")
            
            if not next_page_token:
                break
            
            time.sleep(0.5)  # API 호출 제한 고려
        
        return video_ids
    
    def get_video_details(self, video_ids):
        """영상 상세 정보 가져오기"""
        print(f"\n📊 {len(video_ids)}개 영상의 상세 정보 수집 중...")
        
        videos_data = []
        
        # API는 한 번에 50개까지만 조회 가능
        for i in range(0, len(video_ids), 50):
            batch_ids = video_ids[i:i+50]
            
            url = f"{BASE_URL}/videos"
            params = {
                'part': 'snippet,statistics,contentDetails',
                'id': ','.join(batch_ids),
                'key': self.api_key
            }
            
            response = requests.get(url, params=params)
            data = response.json()
            
            for item in data.get('items', []):
                video_info = {
                    'video_id': item['id'],
                    'title': item['snippet']['title'],
                    'published_at': item['snippet']['publishedAt'],
                    'thumbnail_url': item['snippet']['thumbnails']['maxres']['url'] if 'maxres' in item['snippet']['thumbnails'] else item['snippet']['thumbnails']['high']['url'],
                    'duration': item['contentDetails']['duration'],
                    'view_count': int(item['statistics'].get('viewCount', 0)),
                    'like_count': int(item['statistics'].get('likeCount', 0)),
                    'comment_count': int(item['statistics'].get('commentCount', 0)),
                    'description': item['snippet']['description'][:200]  # 처음 200자만
                }
                videos_data.append(video_info)
            
            print(f"✅ {min(i+50, len(video_ids))}/{len(video_ids)} 완료")
            time.sleep(0.5)
        
        return videos_data
    
    def get_top_comments(self, video_id, max_results=10):
        """영상의 상위 댓글 가져오기"""
        url = f"{BASE_URL}/commentThreads"
        params = {
            'part': 'snippet',
            'videoId': video_id,
            'maxResults': max_results,
            'order': 'relevance',  # 관련성 높은 순
            'key': self.api_key
        }
        
        try:
            response = requests.get(url, params=params)
            data = response.json()
            
            comments = []
            for item in data.get('items', []):
                comment = item['snippet']['topLevelComment']['snippet']
                comments.append({
                    'text': comment['textDisplay'],
                    'likes': comment['likeCount'],
                    'published_at': comment['publishedAt']
                })
            
            return comments
        except:
            return []
    
    def analyze_comments_for_keywords(self, video_id):
        """댓글에서 특정 키워드 분석"""
        keywords = ['대회', '시범', '사용', '라이선스', '품새', '겨루기', '태권도', '무술']
        
        comments = self.get_top_comments(video_id, max_results=100)
        
        keyword_count = 0
        relevant_comments = []
        
        for comment in comments:
            text = comment['text'].lower()
            if any(keyword in text for keyword in keywords):
                keyword_count += 1
                relevant_comments.append(comment)
        
        return {
            'total_checked': len(comments),
            'keyword_matches': keyword_count,
            'relevant_comments': relevant_comments[:5]  # 상위 5개만
        }
    
    def save_to_csv(self, videos_data, filename='soundstorm_youtube_data.csv'):
        """데이터를 CSV 파일로 저장"""
        print(f"\n💾 데이터를 {filename}에 저장 중...")
        
        with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['순위', '제목', '영상ID', '조회수', '좋아요', '댓글수', 
                         '게시일', '러닝타임', '썸네일URL', '설명']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            
            writer.writeheader()
            
            # 조회수 기준 정렬
            sorted_videos = sorted(videos_data, key=lambda x: x['view_count'], reverse=True)
            
            for idx, video in enumerate(sorted_videos, 1):
                writer.writerow({
                    '순위': idx,
                    '제목': video['title'],
                    '영상ID': video['video_id'],
                    '조회수': f"{video['view_count']:,}",
                    '좋아요': f"{video['like_count']:,}",
                    '댓글수': f"{video['comment_count']:,}",
                    '게시일': video['published_at'][:10],
                    '러닝타임': video['duration'],
                    '썸네일URL': video['thumbnail_url'],
                    '설명': video['description']
                })
        
        print(f"✅ 저장 완료!")
    
    def print_top_videos(self, videos_data, top_n=10):
        """상위 N개 영상 출력"""
        print(f"\n🏆 조회수 TOP {top_n}")
        print("=" * 80)
        
        sorted_videos = sorted(videos_data, key=lambda x: x['view_count'], reverse=True)
        
        for idx, video in enumerate(sorted_videos[:top_n], 1):
            print(f"\n{idx}위. {video['title']}")
            print(f"   조회수: {video['view_count']:,}회")
            print(f"   좋아요: {video['like_count']:,}개")
            print(f"   댓글: {video['comment_count']:,}개")
            print(f"   URL: https://youtube.com/watch?v={video['video_id']}")

def main():
    # API 키 확인
    if API_KEY == "YOUR_API_KEY_HERE":
        print("❌ API_KEY를 먼저 설정해주세요!")
        print("\n📝 API 키 발급 방법:")
        print("1. https://console.cloud.google.com/ 접속")
        print("2. 프로젝트 선택 (프로젝트 번호: 7478031217)")
        print("3. 'API 및 서비스' > '사용자 인증 정보' 클릭")
        print("4. '+ 사용자 인증 정보 만들기' > 'API 키' 선택")
        print("5. 생성된 API 키를 이 스크립트의 API_KEY 변수에 입력")
        return
    
    collector = YouTubeDataCollector(API_KEY, CHANNEL_ID)
    
    # 1. 영상 ID 목록 수집
    video_ids = collector.get_channel_videos()
    
    if not video_ids:
        print("❌ 영상을 찾을 수 없습니다.")
        return
    
    # 2. 영상 상세 정보 수집
    videos_data = collector.get_video_details(video_ids)
    
    # 3. 상위 영상 출력
    collector.print_top_videos(videos_data, top_n=10)
    
    # 4. CSV 저장
    collector.save_to_csv(videos_data)
    
    print("\n" + "=" * 80)
    print(f"✅ 총 {len(videos_data)}개 영상 데이터 수집 완료!")
    print("💡 다음 단계: soundstorm_youtube_data.csv 파일을 확인하세요.")

if __name__ == "__main__":
    main()
