#!/usr/bin/env bash
set -euo pipefail

# Script to set up Application Default Credentials for local development
# This handles the port conflict issue by temporarily stopping the Docker container

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔐 Setting up Application Default Credentials..."
echo ""

# Check if Docker container is running
if docker ps | grep -q pipeline-service; then
  echo "⚠️  Docker container is running on port 8085"
  echo "   Stopping container temporarily to free up port for OAuth callback..."
  docker-compose down
  CONTAINER_WAS_RUNNING=true
else
  CONTAINER_WAS_RUNNING=false
fi

echo ""
echo "📋 Please complete the OAuth flow in your browser..."
echo ""

# Run the login command
if gcloud auth application-default login; then
  echo ""
  echo "✅ Successfully authenticated!"
  
  # Verify credentials
  echo ""
  echo "🔍 Verifying credentials..."
  if gcloud auth application-default print-access-token > /dev/null 2>&1; then
    echo "✅ Credentials are valid"
  else
    echo "❌ Credentials verification failed"
    exit 1
  fi
  
  # Restart container if it was running
  if [ "$CONTAINER_WAS_RUNNING" = true ]; then
    echo ""
    echo "🔄 Restarting Docker container..."
    docker-compose up -d
    echo "✅ Container restarted"
  fi
  
  echo ""
  echo "🎉 Setup complete! You can now use the pipeline service."
else
  echo ""
  echo "❌ Authentication failed"
  
  # Restart container if it was running
  if [ "$CONTAINER_WAS_RUNNING" = true ]; then
    echo ""
    echo "🔄 Restarting Docker container..."
    docker-compose up -d
  fi
  
  exit 1
fi

