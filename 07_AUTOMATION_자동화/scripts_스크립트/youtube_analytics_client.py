from datetime import datetime, timedelta
from googleapiclient.discovery import build

class YouTubeAnalyticsClient:
    def __init__(self, credentials):
        self.analytics = build('youtubeAnalytics', 'v2', credentials=credentials)
        self.channel_id = "UCAvSo9RLq0rCy64IH2nm91w"  # SOUNDSTORM Channel ID

    def get_video_stats(self, video_id, published_at):
        """특정 비디오의 심화 통계 조회 (평균시청시간, 구독자유입 등)"""
        try:
            # 조회 기간 설정 (게시일 ~ 어제)
            # Analytics API는 당일 데이터 조회가 불가능할 수 있음 (최소 24~48시간 지연)
            start_date = published_at[:10]
            end_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
            
            if start_date > end_date:
                # 갓 업로드된 영상은 0으로 리턴
                return {}

            response = self.analytics.reports().query(
                ids=f'channel==mine',
                startDate=start_date,
                endDate=end_date,
                metrics='averageViewDuration,subscribersGained,estimatedMinutesWatched',
                filters=f'video=={video_id}'
            ).execute()

            rows = response.get('rows', [])
            if not rows:
                return {}
            
            # [avgViewDuration_sec, subscribersGained, estMinWatched]
            return {
                'avg_watch_time_sec': rows[0][0],
                'subscribers_gained': rows[0][1],
                'total_watch_time_min': rows[0][2]
            }
        except Exception as e:
            # print(f"⚠️ Analytics Error ({video_id}): {str(e)}")
            return {}

    def get_demographics(self):
        """채널 전체 인구통계 조회 (최근 90일)"""
        try:
            end_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
            
            # 성별
            gender_resp = self.analytics.reports().query(
                ids='channel==mine',
                startDate=start_date,
                endDate=end_date,
                metrics='viewerPercentage',
                dimensions='gender',
                sort='-viewerPercentage'
            ).execute()
            
            # 연령대
            age_resp = self.analytics.reports().query(
                ids='channel==mine',
                startDate=start_date,
                endDate=end_date,
                metrics='viewerPercentage',
                dimensions='ageGroup',
                sort='-viewerPercentage'
            ).execute()

            return {
                'gender': gender_resp.get('rows', []),
                'age': age_resp.get('rows', [])
            }
        except Exception as e:
            print(f"⚠️ Demographics Error: {str(e)}")
            return {}

    def get_traffic_sources(self):
        """주요 유입 경로 조회 (최근 30일)"""
        try:
            end_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
            
            response = self.analytics.reports().query(
                ids='channel==mine',
                startDate=start_date,
                endDate=end_date,
                metrics='views',
                dimensions='trafficSourceType',
                sort='-views',
                maxResults=10
            ).execute()
            
            return response.get('rows', [])
        except Exception as e:
            print(f"⚠️ Traffic Source Error: {str(e)}")
            return []
