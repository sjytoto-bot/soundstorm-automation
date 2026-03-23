
import os
import pickle
import json
from datetime import datetime, timedelta
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# 설정
BASE_DIR = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화"
TOKEN_PICKLE = os.path.join(BASE_DIR, "credentials/token.pickle")
CHANNEL_ID = 'UCAvSo9RLq0rCy64IH2nm91w'

def get_services():
    with open(TOKEN_PICKLE, 'rb') as token:
        creds = pickle.load(token)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_PICKLE, 'wb') as token:
                pickle.dump(creds, token)
        else:
            raise Exception("Credentials invalid and cannot be refreshed.")
            
    youtube = build('youtube', 'v3', credentials=creds)
    analytics = build('youtubeAnalytics', 'v2', credentials=creds)
    return youtube, analytics

def run_test(analytics, name, params):
    print(f"\n--- Running {name} ---")
    print(f"Parameters: {json.dumps(params, indent=2)}")
    try:
        response = analytics.reports().query(**params).execute()
        print(f"Success!")
        rows = response.get('rows')
        print(f"Response Rows Count: {len(rows) if rows else 0}")
        if rows:
            print(f"First 3 rows: {rows[:3]}")
        return response
    except Exception as e:
        print(f"FAILED: {str(e)}")
        return {"error": str(e)}

def main():
    youtube, analytics = get_services()
    
    # 0. Get a real video ID for Test 5
    print("Fetching a real video ID for Test 5...")
    res = youtube.channels().list(part='contentDetails', id=CHANNEL_ID).execute()
    uploads_id = res['items'][0]['contentDetails']['relatedPlaylists']['uploads']
    vids_res = youtube.playlistItems().list(part='contentDetails', playlistId=uploads_id, maxResults=1).execute()
    real_video_id = vids_res['items'][0]['contentDetails']['videoId']
    print(f"Target Video ID: {real_video_id}")

    # dates
    start_date = (datetime.now() - timedelta(days=31)).strftime('%Y-%m-%d')
    end_date = (datetime.now() - timedelta(days=3)).strftime('%Y-%m-%d')

    tests = [
        {
            "name": "Test 1: Basic View Metric",
            "params": {
                "ids": "channel==MINE",
                "metrics": "views",
                "dimensions": "day",
                "startDate": start_date,
                "endDate": end_date
            }
        },
        {
            "name": "Test 2: Reach Metric - Impressions",
            "params": {
                "ids": "channel==MINE",
                "metrics": "videoThumbnailImpressions",
                "dimensions": "day",
                "startDate": start_date,
                "endDate": end_date
            }
        },
        {
            "name": "Test 3: CTR Metric",
            "params": {
                "ids": "channel==MINE",
                "metrics": "videoThumbnailImpressionsClickRate",
                "dimensions": "day",
                "startDate": start_date,
                "endDate": end_date
            }
        },
        {
            "name": "Test 4: Traffic Source Reach",
            "params": {
                "ids": "channel==MINE",
                "metrics": "videoThumbnailImpressions",
                "dimensions": "insightTrafficSourceType",
                "startDate": start_date,
                "endDate": end_date
            }
        },
        {
            "name": "Test 5: Video Filter Test",
            "params": {
                "ids": "channel==MINE",
                "metrics": "videoThumbnailImpressions",
                "filters": f"video=={real_video_id}",
                "startDate": start_date,
                "endDate": end_date
            }
        }
    ]

    results = []
    for test in tests:
        res = run_test(analytics, test["name"], test["params"])
        results.append({
            "test": test["name"],
            "params": test["params"],
            "response": res
        })

    # Save full results to json
    results_path = os.path.join(os.path.dirname(__file__), "reach_debug_results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to {results_path}")

if __name__ == "__main__":
    main()
