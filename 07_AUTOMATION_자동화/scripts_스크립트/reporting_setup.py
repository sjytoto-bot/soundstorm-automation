
import os
import pickle
import json
from datetime import datetime
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io
from google_auth_oauthlib.flow import InstalledAppFlow

# 설정
BASE_DIR = "/Users/sinjiyong/Library/CloudStorage/GoogleDrive-sjytoto@gmail.com/내 드라이브/SOUNDSTORM/07_AUTOMATION_자동화"
TOKEN_PICKLE = os.path.join(BASE_DIR, "credentials/token.pickle")
CLIENT_SECRET = os.path.join(BASE_DIR, "credentials/client_secret.json")

SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
    'https://www.googleapis.com/auth/youtubereporting.readonly'
]

def get_reporting_service():
    creds = None
    if os.path.exists(TOKEN_PICKLE):
        with open(TOKEN_PICKLE, 'rb') as token:
            creds = pickle.load(token)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
                creds = flow.run_local_server(port=0, prompt='select_account')
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
            creds = flow.run_local_server(port=0, prompt='select_account')
            
        with open(TOKEN_PICKLE, 'wb') as token:
            pickle.dump(creds, token)
            
    # Reporting API v1
    reporting = build('youtubereporting', 'v1', credentials=creds)
    return reporting

def list_report_types(service):
    print("\n--- Available Report Types ---")
    results = service.reportTypes().list().execute()
    report_types = results.get('reportTypes', [])
    for rt in report_types:
        print(f"ID: {rt['id']}, Name: {rt['name']}")
    return report_types

def list_jobs(service):
    print("\n--- Current Reporting Jobs ---")
    results = service.jobs().list().execute()
    jobs = results.get('jobs', [])
    for job in jobs:
        print(f"Job ID: {job['id']}, Type: {job['reportTypeId']}, Name: {job['name']}")
    return jobs

def create_job(service, report_type_id, job_name):
    print(f"\n--- Creating Job for {report_type_id} ---")
    job_body = {
        "reportTypeId": report_type_id,
        "name": job_name
    }
    try:
        job = service.jobs().create(body=job_body).execute()
        print(f"Created Job ID: {job['id']}")
        return job
    except Exception as e:
        print(f"Error creating job: {e}")
        return None

def download_latest_report(service, job_id):
    print(f"\n--- Checking for Reports in Job {job_id} ---")
    results = service.jobs().reports().list(jobId=job_id).execute()
    reports = results.get('reports', [])
    
    if not reports:
        print("No reports found for this job yet. (It might take 24-48 hours for new jobs)")
        return None
    
    # Get the most recent report
    latest_report = sorted(reports, key=lambda x: x['startTime'], reverse=True)[0]
    print(f"Latest Report ID: {latest_report['id']}, Date: {latest_report['startTime']}")
    
    download_url = latest_report.get('downloadUrl')
    if not download_url:
        print("No download URL available.")
        return None
    
    print("Downloading report content...")
    request = service.media().download(resourceName=latest_report['downloadUrl'])
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while done is False:
        status, done = downloader.next_chunk()
        print(f"Download {int(status.progress() * 100)}%.")
    
    return fh.getvalue().decode('utf-8')

def main():
    service = get_reporting_service()
    
    # 1. Available Types
    types = list_report_types(service)
    
    # 2. Existing Jobs
    jobs = list_jobs(service)
    
    target_job_id = None
    report_type = "channel_basic_a2"
    
    for job in jobs:
        if job['reportTypeId'] == report_type:
            target_job_id = job['id']
            print(f"Found existing job for {report_type}: {target_job_id}")
            break
            
    if not target_job_id:
        new_job = create_job(service, report_type, f"Soundstorm_{report_type}")
        if new_job:
            target_job_id = new_job['id']
    
    if target_job_id:
        csv_content = download_latest_report(service, target_job_id)
        if csv_content:
            # Save a sample to check structure
            sample_path = os.path.join(BASE_DIR, "scripts_스크립트/report_sample.csv")
            with open(sample_path, "w") as f:
                f.write(csv_content)
            print(f"\nReport downloaded and saved to {sample_path}")
            
            # Print first few lines
            lines = csv_content.splitlines()
            print("\nPreview of CSV:")
            for line in lines[:5]:
                print(line)

if __name__ == "__main__":
    main()
