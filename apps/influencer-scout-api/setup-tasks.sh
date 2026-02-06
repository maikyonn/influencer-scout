#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=${PROJECT_ID:-penni-ai-platform}
REGION=${REGION:-us-central1}
SERVICE_NAME=${SERVICE_NAME:-pipeline-service}
SERVICE_ACCOUNT=${SERVICE_ACCOUNT:-${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}

QUEUE_STAGE=${QUEUE_STAGE:-pipeline-stage}
QUEUE_BATCH=${QUEUE_BATCH:-pipeline-batch}
QUEUE_POLL=${QUEUE_POLL:-pipeline-poll}

echo "Setting active project to $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
TASKS_SERVICE_ACCOUNT="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"

echo "Cloud Tasks service account: $TASKS_SERVICE_ACCOUNT"
echo "Target service account: $SERVICE_ACCOUNT"

create_queue() {
  local queue_name=$1
  local max_dispatches=${2:-10}
  local max_concurrent=${3:-5}

  if gcloud tasks queues describe "$queue_name" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
    echo "✓ Queue '$queue_name' already exists"
  else
    gcloud tasks queues create "$queue_name" \
      --location="$REGION" \
      --max-dispatches-per-second="$max_dispatches" \
      --max-concurrent-dispatches="$max_concurrent" \
      --project="$PROJECT_ID"
    echo "✓ Queue '$queue_name' created"
  fi
}

echo ""
echo "Creating Cloud Tasks queues..."
create_queue "$QUEUE_STAGE" 2 1
create_queue "$QUEUE_BATCH" 50 50
create_queue "$QUEUE_POLL" 50 50

echo ""
echo "Granting Cloud Tasks service agent token creator on $SERVICE_ACCOUNT..."
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --member="serviceAccount:${TASKS_SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT_ID"

echo ""
echo "Granting Cloud Tasks enqueuer role to $SERVICE_ACCOUNT..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/cloudtasks.enqueuer" \
  --condition=None

echo ""
echo "Granting service account user role to $SERVICE_ACCOUNT (self-act-as)..."
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountUser" \
  --project="$PROJECT_ID"

echo ""
echo "Granting Cloud Run invoker role to $SERVICE_ACCOUNT..."
gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --region="$REGION" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.invoker"

echo ""
echo "=========================================="
echo "Cloud Tasks Setup Complete"
echo "=========================================="
echo ""
echo "Queues:"
echo "  • $QUEUE_STAGE"
echo "  • $QUEUE_BATCH"
echo "  • $QUEUE_POLL"
echo ""
echo "Env to set in Cloud Run:"
echo "  CLOUD_TASKS_LOCATION=$REGION"
echo "  CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL=$SERVICE_ACCOUNT"
echo "  PIPELINE_TASKS_QUEUE_STAGE=$QUEUE_STAGE"
echo "  PIPELINE_TASKS_QUEUE_BATCH=$QUEUE_BATCH"
echo "  PIPELINE_TASKS_QUEUE_POLL=$QUEUE_POLL"
echo ""
