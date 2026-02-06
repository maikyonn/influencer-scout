# Pipeline Service

Cloud Run service for the Penny Platform influencer search pipeline. This service handles HTTP orchestration (fast job creation) and Cloud Tasks-driven background processing (full pipeline execution).

## Overview

The pipeline service provides a complete influencer search and analysis pipeline:

- **Query Expansion**: Generates 12 optimized search queries from business descriptions using OpenAI
- **Parallel Hybrid Search**: Performs vector searches on Weaviate with multiple alpha values for comprehensive coverage
- **Profile Collection**: Collects detailed profile data from BrightData (Instagram and TikTok)
- **LLM Analysis**: Analyzes each profile for fit with business requirements using OpenAI
- **Result Storage**: Stores final results in Cloud Storage with metadata in Firestore

## Architecture

```
SvelteKit App → Cloud Run (HTTP) → Cloud Tasks → Cloud Run (Tasks) → Firestore/Storage
```

### Request Flow

1. **App calls POST /pipeline/start** with business description and parameters
2. **Service creates Firestore job**, enqueues a stage task, returns 202 Accepted immediately
3. **Cloud Tasks invokes stage worker** via POST /tasks/pipeline-stage
4. **Stage worker executes pipeline stages**:
   - Query expansion (OpenAI)
   - Parallel hybrid search (Weaviate)
   - Candidate pool + preliminary preview (Storage)
   - Cache-first BrightData + LLM fit (early-stop when enough 10/10 matches found)
5. **Results stored** in Firestore (metadata) and Cloud Storage (profiles)
6. **App listens** to Firestore for status/progress updates and loads candidates/progressive/final results from Storage (typically via an app API to avoid direct bucket access)

## Pipeline Stages

### 1. Query Expansion
- **Input**: Business description
- **Output**: 12 search queries (4 broad + 2 specific + 6 adjacent)
- **Service**: OpenAI (gpt-4o-mini)
- **Duration**: ~2-5 seconds

### 2. Parallel Hybrid Search
- **Input**: 12 queries × 2 alpha values (0.2, 0.8) = 24 searches
- **Output**: Deduplicated profile URLs sorted by relevance
- **Service**: Weaviate (vector search)
- **Duration**: ~10-30 seconds (with batch embedding generation)

### 3. Candidate Pool (Weaviate)
- **Sizing**: `weaviate_top_n = max(500, top_n * 4)`
- **Output**: Candidate profiles saved to Storage for preliminary UI preview

### 4. Cache-first BrightData + LLM Fit (Adaptive Stop)
- **Cache hits first**: Bulk lookup in Firestore `brightdata_cache`, then immediate LLM fit analysis
- **BrightData only for cache misses**: 20 urls per batch, keep 5 batches in-flight when possible (≈100 urls)
- **Stop condition**: End early once `top_n` profiles with `fit_score >= 100` (10/10) are found, or stop after exhausting the Weaviate pool
- **LLM concurrency**: `MAX_CONCURRENT_LLM_REQUESTS` (worker clamps to ≤100)

### 5. Result Storage (Progressive + Final)
- **Candidates**: `pipeline_jobs/{job_id}/candidates.json`
- **Progressive** (updated per-batch): `pipeline_jobs/{job_id}/profiles_progressive.json`
- **Final**: `pipeline_jobs/{job_id}/profiles.json`
- **Remaining** (non-top-n): `pipeline_jobs/{job_id}/profiles_remaining.json`

## Prerequisites

- GCP project with Cloud Run, Cloud Tasks, Firestore, Storage enabled
- Service account with required IAM roles (see deploy.sh)
- Secrets created in Secret Manager:
  - `openai-api-key` - OpenAI API key
  - `weaviate-api-key` - Weaviate API key
  - `weaviate-url` - Weaviate cluster URL
  - `deepinfra-api-key` - DeepInfra API key for embeddings
  - `brightdata-api-key` - BrightData API key
- Cloud Tasks queues (`pipeline-stage`, `pipeline-batch`, `pipeline-poll`)
- Node.js 20+ for local development
- Docker for container builds
- gcloud CLI installed and authenticated

## Cloud Tasks Setup

The pipeline service uses Cloud Tasks for asynchronous job processing. The orchestrator enqueues a stage task, which creates batch and poll tasks for BrightData and LLM processing.

### Queue Setup

Create the required queues (one-time setup):

```bash
gcloud tasks queues create pipeline-stage --location us-central1
gcloud tasks queues create pipeline-batch --location us-central1
gcloud tasks queues create pipeline-poll --location us-central1
```

## Environment Variables

See `.env.example` for all required variables. Key variables:

### Firebase/GCP
- `GOOGLE_CLOUD_PROJECT` - GCP project ID
- `FIREBASE_PROJECT_ID` - Firebase project ID (same as above)
- `STORAGE_BUCKET` - Cloud Storage bucket name

### API Keys (use Secret Manager in production)
- `OPENAI_API_KEY` - OpenAI API key for query generation and LLM analysis
- `WEAVIATE_API_KEY` - Weaviate API key for vector search
- `WEAVIATE_URL` - Weaviate cluster URL
- `DEEPINFRA_API_KEY` - DeepInfra API key for embeddings
- `BRIGHTDATA_API_KEY` - BrightData API key for profile collection

### Service Configuration
- `PIPELINE_TASKS_BASE_URL` - Base URL for Cloud Tasks to call (Cloud Run service URL)
- `CLOUD_TASKS_LOCATION` - Cloud Tasks queue location (default: `us-central1`)
- `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL` - Service account used to sign task OIDC tokens
- `CLOUD_TASKS_OIDC_AUDIENCE` - Audience for task OIDC tokens (Cloud Run service URL)
- `WEAVIATE_COLLECTION_NAME` - Weaviate collection name (default: `influencer_profiles`)
- `DEEPINFRA_EMBEDDING_MODEL` - Embedding model (default: `Qwen/Qwen3-Embedding-8B`)
- `OPENAI_MODEL` - OpenAI model (default: `gpt-4o-mini`)
- `PIPELINE_TASKS_QUEUE_STAGE` - Queue name for stage tasks (default: `pipeline-stage`)
- `PIPELINE_TASKS_QUEUE_BATCH` - Queue name for batch tasks (default: `pipeline-batch`)
- `PIPELINE_TASKS_QUEUE_POLL` - Queue name for poll tasks (default: `pipeline-poll`)
- `PIPELINE_TASKS_DIRECT` - If true, bypass Cloud Tasks and call the task endpoints directly (local dev)

### Performance Tuning
- `MAX_CONCURRENT_WEAVIATE_SEARCHES` - Max concurrent Weaviate searches (default: 12)
- `MAX_CONCURRENT_LLM_REQUESTS` - Max concurrent OpenAI requests (default: 5)
- `WEAVIATE_REQUEST_TIMEOUT_MS` - Weaviate request timeout (default: 120000)

### BrightData Configuration
- `BRIGHTDATA_BASE_URL` - BrightData API base URL
- `BRIGHTDATA_INSTAGRAM_DATASET_ID` - Instagram dataset ID
- `BRIGHTDATA_TIKTOK_DATASET_ID` - TikTok dataset ID

## Local Development

1. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Fill in API keys** in `.env` (for local testing only)

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Start development server**:
   ```bash
   npm run dev
   # or with watch mode:
   npm run dev:watch
   ```

5. **Test HTTP endpoint**:
   ```bash
   curl -X POST http://localhost:8080/pipeline/start \
     -H "Content-Type: application/json" \
     -d '{
       "business_description": "coffee shop in San Francisco",
       "top_n": 30,
       "uid": "test-user-id"
     }'
   ```

6. **Optional: bypass Cloud Tasks locally**:
   ```bash
   export PIPELINE_TASKS_DIRECT=true
   ```

## Deployment

1. **Ensure secrets exist** in Secret Manager (deploy.sh will warn if missing)

2. **Run deployment script**:
   ```bash
   ./deploy.sh
   ```

   The script will:
   - Create service account if needed
   - Grant IAM roles (Cloud Tasks, Firestore, Storage, Secret Manager)
   - Check for required secrets
   - Trigger Cloud Build
   - Deploy to Cloud Run
   - Test health endpoint

3. **Verify deployment**:
   ```bash
   # Get service URL
   SERVICE_URL=$(gcloud run services describe pipeline-service --region=us-central1 --format='value(status.url)')
   
   # Test health endpoint
   ID_TOKEN=$(gcloud auth print-identity-token)
   curl -H "Authorization: Bearer $ID_TOKEN" "$SERVICE_URL/health"
   ```

## Testing

### Test HTTP Orchestrator
```bash
curl -X POST "$SERVICE_URL/pipeline/start" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "business_description": "coffee shop in San Francisco looking for local influencers",
    "top_n": 30,
    "uid": "test-user-id",
    "min_followers": 10000,
    "max_followers": 1000000,
    "platform": "instagram"
  }'
```

Response (202 Accepted):
```json
{
  "job_id": "job_123...",
  "status": "accepted",
  "message": "Pipeline job accepted and processing in background",
  "request_id": "..."
}
```

### Monitor Pipeline Progress
```bash
# Query Firestore for job status
gcloud firestore documents get pipeline_jobs/test-job-123
```

## Monitoring

### Cloud Run Metrics
- Request count, latency, errors
- Memory and CPU utilization
- Instance count and concurrency

### Cloud Tasks Metrics
- Queue depth and dispatch rate
- Oldest task age (backlog)

### Cloud Logging
Structured logs include:
- `request_id` - Request tracking ID
- `job_id` - Pipeline job ID
- `user_id` - User ID
- Stage progress and timing

### Firestore
- `pipeline_jobs/{job_id}` - Job status, progress, stage data
- Poll for status updates: `status`, `overall_progress`, `current_stage`

### Cloud Storage
- `pipeline_jobs/{job_id}/profiles.json` - Final results (large datasets)

## Troubleshooting

### Common Errors

**"Missing API key"**
- Ensure secrets exist in Secret Manager
- Check service account has `roles/secretmanager.secretAccessor`
- Verify secret names match cloudbuild.yaml

**"Pipeline job cancelled"**
- Job was cancelled via Firestore (`cancel_requested: true`)
- Check cancellation reason in job document

**"Weaviate connection failed"**
- Verify `WEAVIATE_URL` and `WEAVIATE_API_KEY` are correct
- Check network connectivity from Cloud Run
- Review Weaviate cluster status

**"BrightData timeout"**
- Increase `maxWaitTime` in streaming config
- Check BrightData API status
- Verify `BRIGHTDATA_API_KEY` is valid

**"Cloud Tasks queue not found"**
- Create queues: `gcloud tasks queues create pipeline-stage --location us-central1`
- Verify queue exists: `gcloud tasks queues describe pipeline-stage --location us-central1`

**"Tasks not being delivered to Cloud Run"**
- Check if task OIDC audience matches service URL
- Verify service account has `roles/run.invoker` on the service
- Look for errors in Cloud Logging: `gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=pipeline-service' --limit=50`

### How to Check Logs
```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=pipeline-service" --limit=50

# Filter by job_id
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.job_id=job_123" --limit=50
```

### How to Cancel a Running Pipeline
```bash
# Update Firestore document
gcloud firestore documents update pipeline_jobs/job_123 --data='{"cancel_requested":true}'
```

### How to Retry Failed Jobs
Failed jobs are not automatically retried. To retry:
1. Create a new job with the same parameters
2. Or re-enqueue the stage task with the same payload

## Performance Tuning

### Adjust Concurrency
- `MAX_CONCURRENT_WEAVIATE_SEARCHES` - Increase for faster searches (default: 12)
- `MAX_CONCURRENT_LLM_REQUESTS` - Increase for faster analysis (default: 5, max recommended: 10)

### Adjust Batch Sizes
- BrightData batch size: Modify `batchSize` in streaming config (default: 20)
- LLM batch size: Modify `maxConcurrent` in `analyzeProfileFitBatch` (default: 5)

### Adjust Timeouts
- `WEAVIATE_REQUEST_TIMEOUT_MS` - Increase for slow Weaviate clusters (default: 120000)
- BrightData `maxWaitTime` - Increase for large batches (default: 3600 seconds)

### Scale Cloud Run
- `--max-instances` - Increase for higher throughput (default: 10)
- `--concurrency` - Keep at 1 for long-running pipelines (one pipeline per instance)

## Cost Optimization

### Service Scales to Zero
- No fixed costs when idle
- Scales up automatically when requests arrive
- Scales down after requests complete

### Typical Pipeline Cost Breakdown
- **Cloud Run**: ~$0.40 per pipeline (2Gi, 2 CPU, 30 min average)
- **OpenAI**: ~$0.10 per pipeline (query generation + fit analysis for 30 profiles)
- **Weaviate**: ~$0.05 per pipeline (24 vector searches)
- **BrightData**: ~$0.50 per pipeline (profile collection, varies by batch size)
- **Total**: ~$1.05 per pipeline (30 profiles)

### Cost Reduction Tips
- Reduce `top_n` to decrease BrightData costs
- Increase batch sizes to reduce API call overhead
- Use caching for repeated queries (future enhancement)
- Optimize Weaviate searches (reduce alpha values or queries)

## Service Account Permissions

The service account (`pipeline-service@<PROJECT_ID>.iam.gserviceaccount.com`) has the following IAM roles:

- **Cloud Tasks Enqueuer** (`roles/cloudtasks.enqueuer`) - Create tasks in queues
- **Cloud Run Invoker** (`roles/run.invoker`) - Allow Cloud Tasks OIDC calls
- **Datastore User** (`roles/datastore.user`) - Read/write Firestore documents
- **Storage Object Admin** (`roles/storage.objectAdmin`) - Store pipeline results in Cloud Storage
- **Secret Manager Secret Accessor** (`roles/secretmanager.secretAccessor`) - Access API keys from Secret Manager

## Architecture Notes

- **Single codebase** - All logic in one service for easier maintenance
- **Shared utilities** - HTTP and task handlers share the same utility functions
- **Scale to zero** - No min instances, only pay for actual usage
- **Simple deployment** - One service, one Docker image, one Cloud Run deployment
- **Streaming processing** - BrightData batches processed incrementally for better UX
- **Concurrent analysis** - LLM analysis overlaps with BrightData collection for efficiency
