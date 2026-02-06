# Pipeline Service Testing Guide

## Quick Start

### Prerequisites
1. **Docker Desktop** must be running
2. **GCP credentials** configured at `~/.config/gcloud`
3. **Environment variables** set in `.env` file

### Step 1: Start Docker Container

```bash
cd services/pipeline-service
./test-docker-local.sh
```

This will:
- Build the Docker image
- Start the container with environment variables and GCP credentials
- Run health checks
- Keep the container running for testing

### Step 2: Run Full Pipeline Test

```bash
./test-pipeline-full.sh
```

This will:
1. Verify health checks pass
2. Start a pipeline job via HTTP orchestrator
3. Show instructions for monitoring progress

## Manual Testing

### Test Health Endpoint

```bash
curl http://localhost:8080/health | jq '.'
```

Expected response:
```json
{
  "status": "ok",
  "health": {
    "allHealthy": true,
    "checks": [
      {"service": "Storage Bucket", "status": "ok", ...},
      {"service": "OpenAI", "status": "ok", ...},
      {"service": "Weaviate", "status": "ok", ...},
      {"service": "DeepInfra", "status": "ok", ...},
      {"service": "BrightData", "status": "ok", ...},
      {"service": "Firestore", "status": "ok", ...}
    ]
  }
}
```

### Test Pipeline Start (Orchestrator)

```bash
curl -X POST http://localhost:8080/pipeline/start \
  -H "Content-Type: application/json" \
  -d '{
    "business_description": "A sustainable coffee shop in San Francisco",
    "top_n": 30,
    "uid": "test-user-1234567890",
    "platform": "instagram",
    "min_followers": 10000,
    "max_followers": 1000000
  }' | jq '.'
```

Expected response (202 Accepted):
```json
{
  "job_id": "job_1234567890_abc123",
  "status": "accepted",
  "message": "Pipeline job accepted and processing in background",
  "request_id": "req_..."
}
```

### Optional: Bypass Cloud Tasks locally

If you are not running a Cloud Tasks emulator, you can bypass the queue and call task endpoints directly:

```bash
export PIPELINE_TASKS_DIRECT=true
```

## Monitoring Pipeline Progress

### View Container Logs

```bash
docker logs -f pipeline-service-test
```

### Check Firestore Job Status

```bash
gcloud firestore documents get pipeline_jobs/{job_id}
```

Or use the Firestore console:
- Go to Firebase Console → Firestore
- Navigate to `pipeline_jobs` collection
- Find document with your `job_id`

### Job Status Values

- **pending**: Job created, waiting for tasks
- **running**: Pipeline execution in progress
- **completed**: All stages finished, results available
- **error**: Pipeline failed at some stage
- **cancelled**: Job was cancelled by user

### Pipeline Stages

1. **query_expansion** (5%): Generate 12 search queries
2. **weaviate_search** (25%): Perform 24 parallel hybrid searches
3. **brightdata_collection** (50%): Collect profiles in streaming batches
4. **llm_analysis** (60%): Analyze profiles for fit (concurrent with BrightData)
5. **completed** (100%): Store results in Firestore and Cloud Storage

## Expected Timeline

- **Orchestrator Response**: < 500ms
- **Query Expansion**: ~2-5 seconds
- **Hybrid Search**: ~10-30 seconds
- **BrightData Collection**: ~5-30 minutes (depends on batch size)
- **LLM Analysis**: Overlaps with BrightData collection
- **Total Pipeline**: ~5-30 minutes

## Troubleshooting

### Container Not Starting

```bash
# Check Docker is running
docker ps

# Check logs
docker logs pipeline-service-test

# Restart container
docker stop pipeline-service-test
docker rm pipeline-service-test
./test-docker-local.sh
```

### Health Checks Failing

Check that:
1. `.env` file exists and has all required API keys
2. GCP credentials are available at `~/.config/gcloud`
3. All external services are accessible (OpenAI, Weaviate, etc.)

### Pipeline Stuck

Check container logs:
```bash
docker logs -f pipeline-service-test | grep -i error
```

Check Firestore for error messages:
```bash
gcloud firestore documents get pipeline_jobs/{job_id} | jq '.status, .error_message'
```

### Cancel a Running Job

Update Firestore document:
```bash
gcloud firestore documents update pipeline_jobs/{job_id} \
  --data='{"cancel_requested":true}'
```

## Architecture Diagram

See `ARCHITECTURE_DIAGRAM.md` for a complete visual representation of the pipeline flow.

## Next Steps

After testing locally:
1. Deploy to Cloud Run: `./deploy.sh`
2. Ensure Cloud Tasks queues exist (pipeline-stage, pipeline-batch, pipeline-poll)
3. Test deployed service with production endpoints
