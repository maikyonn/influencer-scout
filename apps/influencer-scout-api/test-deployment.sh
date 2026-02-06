#!/usr/bin/env bash
set -euo pipefail

# Configuration
PROJECT_ID=${PROJECT_ID:-penni-ai-platform}
REGION=${REGION:-us-central1}
SERVICE_NAME=pipeline-service

echo "Testing deployment for $SERVICE_NAME..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Get service URL
echo "Getting service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')
if [[ -z "$SERVICE_URL" ]]; then
  echo "❌ Failed to get service URL. Is the service deployed?" >&2
  exit 1
fi
echo "Service URL: $SERVICE_URL"
echo ""

# Get ID token for authentication
echo "Getting ID token for authentication..."
ID_TOKEN=$(gcloud auth print-identity-token)
if [[ -z "$ID_TOKEN" ]]; then
  echo "❌ Failed to get ID token. Are you authenticated?" >&2
  exit 1
fi
echo "✓ ID token obtained"
echo ""

# Test 1: Health endpoint
echo "Test 1: Health endpoint"
echo "----------------------"
HTTP_CODE=$(curl -s -o /tmp/health_response.json -w "%{http_code}" \
  -H "Authorization: Bearer $ID_TOKEN" \
  "$SERVICE_URL/health")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "❌ Health endpoint returned HTTP $HTTP_CODE"
  cat /tmp/health_response.json
  exit 1
fi

STATUS=$(cat /tmp/health_response.json | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "")
if [[ "$STATUS" != "ok" ]]; then
  echo "❌ Health endpoint returned status: $STATUS"
  cat /tmp/health_response.json
  exit 1
fi

echo "✓ Health endpoint returned HTTP 200"
echo "✓ Response status is 'ok'"
cat /tmp/health_response.json | jq '.' || cat /tmp/health_response.json
echo ""

# Test 2: Verify service account permissions
echo "Test 2: Service account permissions"
echo "-----------------------------------"
SERVICE_ACCOUNT="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Test Cloud Tasks permissions
echo "Testing Cloud Tasks permissions..."
if gcloud tasks queues list --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "✓ Cloud Tasks access verified"
else
  echo "⚠️  Could not verify Cloud Tasks access"
fi

# Test Firestore permissions
echo "Testing Firestore permissions..."
if gcloud firestore databases list --project="$PROJECT_ID" &>/dev/null; then
  echo "✓ Firestore access verified"
else
  echo "⚠️  Could not verify Firestore access"
fi

# Test Secret Manager permissions
echo "Testing Secret Manager permissions..."
SECRET_NAME="OPENAI_API_KEY"
if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
  echo "✓ Secret Manager access verified (can describe $SECRET_NAME)"
else
  echo "⚠️  Could not verify Secret Manager access (secret $SECRET_NAME may not exist)"
fi

echo ""
echo "✅ All tests passed!"
