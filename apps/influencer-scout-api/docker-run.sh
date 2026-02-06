#!/usr/bin/env bash
set -euo pipefail

# Helper script to run the pipeline service in Docker

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building Docker image..."
docker build -t pipeline-service:local .

echo ""
echo "Starting container..."
docker run -d \
  --name pipeline-service \
  --rm \
  -p 8085:8080 \
  --env-file .env \
  pipeline-service:local

echo ""
echo "Waiting for service to start..."
sleep 3

echo ""
echo "Testing health endpoint..."
curl -s http://localhost:8085/health | jq '.' || echo "Health check failed"

echo ""
echo "Service is running!"
echo "View logs: docker logs -f pipeline-service"
echo "Stop service: docker stop pipeline-service"
echo "Health check: curl http://localhost:8085/health"

