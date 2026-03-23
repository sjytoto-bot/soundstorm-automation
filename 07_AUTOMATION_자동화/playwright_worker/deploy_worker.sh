#!/bin/bash

echo "-------------------------------------"
echo "SOUNDSTORM Playwright Worker Deploy"
echo "-------------------------------------"

PROJECT_ID=$(gcloud config get-value project)

echo "Current project: $PROJECT_ID"

if [ "$PROJECT_ID" != "soundstorm-automation" ]; then
  echo "Setting project to soundstorm-automation"
  gcloud config set project soundstorm-automation
fi

echo ""
echo "Checking secrets..."

gcloud secrets describe naver-id >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Creating secret: naver-id"
  read -p "Enter NAVER ID: " NAVER_ID
  echo -n "$NAVER_ID" | gcloud secrets create naver-id --data-file=-
else
  echo "Secret naver-id exists"
fi

gcloud secrets describe naver-pw >/dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Creating secret: naver-pw"
  read -s -p "Enter NAVER PASSWORD: " NAVER_PW
  echo ""
  echo -n "$NAVER_PW" | gcloud secrets create naver-pw --data-file=-
else
  echo "Secret naver-pw exists"
fi

echo ""
echo "Deploying Cloud Run service..."

gcloud run deploy playwright-worker \
  --source . \
  --region=asia-northeast3 \
  --allow-unauthenticated \
  --memory=1Gi \
  --max-instances=1 \
  --set-env-vars="LICENSE_ENGINE_URL=https://license-engine-774503242418.asia-northeast3.run.app" \
  --set-secrets="NAVER_ID=naver-id:latest,NAVER_PW=naver-pw:latest"

echo ""
echo "Deployment finished."
echo "-------------------------------------"
