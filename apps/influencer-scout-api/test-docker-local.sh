#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="pipeline-service:local"
CONTAINER_NAME="pipeline-service-test"
PORT=8080

echo "Building Docker image..."
docker build -t "$IMAGE_NAME" .

echo ""
echo "Stopping and removing existing container (if any)..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo ""
if [[ -f .env ]]; then
  echo "Loading environment variables from .env file..."
  ENV_FILE_ARG="--env-file .env"
else
  echo "⚠️  Warning: .env file not found. Container will run without environment variables."
  ENV_FILE_ARG=""
fi

# Mount GCP credentials if available (for Firestore access)
VOLUME_ARGS=""
GCLOUD_CONFIG_DIR="$HOME/.config/gcloud"
if [[ -d "$GCLOUD_CONFIG_DIR" ]]; then
  echo "Mounting GCP credentials from $GCLOUD_CONFIG_DIR..."
  VOLUME_ARGS="-v $GCLOUD_CONFIG_DIR:/app/.config/gcloud:ro"
  # Set GOOGLE_APPLICATION_CREDENTIALS if not already in .env
  if [[ -f .env ]] && ! grep -q "GOOGLE_APPLICATION_CREDENTIALS" .env; then
    VOLUME_ARGS="$VOLUME_ARGS -e GOOGLE_APPLICATION_CREDENTIALS=/app/.config/gcloud/application_default_credentials.json"
  fi
else
  echo "⚠️  Warning: $GCLOUD_CONFIG_DIR not found. Firestore may not work without credentials."
fi

echo ""
echo "Starting container..."
docker run -d -p "$PORT:8080" $ENV_FILE_ARG $VOLUME_ARGS --name "$CONTAINER_NAME" "$IMAGE_NAME"

echo ""
echo "Waiting for service to start..."
sleep 2

echo ""
echo "Testing health endpoint..."
HTTP_CODE=$(curl -s -o /tmp/docker_health.json -w "%{http_code}" "http://localhost:$PORT/health")

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ Health check passed!"
  echo ""
  echo "Response:"
  cat /tmp/docker_health.json | jq '.' || cat /tmp/docker_health.json
  echo ""
  echo "Container logs:"
  docker logs "$CONTAINER_NAME"
  echo ""
  echo "Container is running. To stop it, run:"
  echo "  docker stop $CONTAINER_NAME"
  echo "  docker rm $CONTAINER_NAME"
else
  echo "❌ Health check failed with HTTP $HTTP_CODE"
  echo ""
  echo "Response:"
  cat /tmp/docker_health.json
  echo ""
  echo "Container logs:"
  docker logs "$CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true
  exit 1
fi

