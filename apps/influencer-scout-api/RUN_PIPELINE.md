# Pipeline Runner Script

A script to run the pipeline and collect detailed timing information for each stage.

## Prerequisites

1. **gcloud CLI** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **jq** installed (for JSON parsing):
   ```bash
   # macOS
   brew install jq
   
   # Linux
   sudo apt-get install jq
   ```

3. **Node.js** and npm dependencies:
   ```bash
   cd services/pipeline-service
   npm install
   ```

## Usage

### Basic Usage

```bash
./run-pipeline.sh "business description here"
```

### Full Usage

```bash
./run-pipeline.sh <business_description> [top_n] [uid] [platform] [min_followers] [max_followers]
```

### Parameters

- `business_description` (required): Description of the business/campaign
- `top_n` (optional, default: 30): Number of final results (sets weaviate_top_n = top_n * 4, llm_top_n = top_n)
- `uid` (optional, default: auto-generated): User ID for the pipeline job
- `platform` (optional, default: instagram): Platform filter (instagram or tiktok)
- `min_followers` (optional): Minimum follower count filter
- `max_followers` (optional): Maximum follower count filter

### Examples

```bash
# Simple example
./run-pipeline.sh "coffee shop in San Francisco looking for local influencers"

# With custom top_n
./run-pipeline.sh "sustainable fashion brand" 50

# Full example with all parameters
./run-pipeline.sh "tech startup in NYC" 30 "user-123" "instagram" 10000 100000
```

## Environment Variables

You can customize the script behavior with environment variables:

```bash
# Set custom service URL
export SERVICE_URL="https://your-service-url.run.app"

# Set custom polling interval (seconds)
export POLL_INTERVAL=10

# Set maximum wait time (seconds)
export MAX_WAIT_TIME=7200  # 2 hours

# Set project ID
export PROJECT_ID="your-project-id"
```

## Output

The script will:

1. **Start the pipeline job** and display the job ID
2. **Monitor progress** with real-time status updates showing:
   - Current stage
   - Overall progress percentage
   - Job status
3. **Display timing summary** including:
   - Overall pipeline duration
   - Individual stage timings:
     - Query Expansion
     - Weaviate Search
     - BrightData Collection
     - LLM Analysis
   - Results summary with storage URLs

### Example Output

```
🚀 Pipeline Runner
==================

ℹ️  Starting pipeline job...
ℹ️  Business Description: coffee shop in San Francisco
ℹ️  Top N: 30 (weaviate_top_n: 120, llm_top_n: 30)
ℹ️  Platform: instagram
ℹ️  User ID: test-user-1234567890

✅ Pipeline job started successfully!
  Job ID: job_1234567890_abc123
  Status: accepted

ℹ️  Monitoring pipeline job: job_1234567890_abc123
ℹ️  Polling every 5s (max wait: 3600s)

📋 Current Stage: query_expansion | Progress: 5% | Status: running
📋 Current Stage: weaviate_search | Progress: 25% | Status: running
📋 Current Stage: brightdata_collection | Progress: 50% | Status: running
📋 Current Stage: llm_analysis | Progress: 75% | Status: running

✅ Pipeline completed successfully!

═══════════════════════════════════════════════════════════════
                    PIPELINE TIMING SUMMARY
═══════════════════════════════════════════════════════════════

📅 Start Time: 2025-11-20 00:40:56
📅 End Time: 2025-11-20 00:45:23
⏱️  Total Duration: 4m 27s

───────────────────────────────────────────────────────────────
                    STAGE TIMING BREAKDOWN
───────────────────────────────────────────────────────────────

1️⃣  Query Expansion
   Status: completed
   Queries Generated: 12
   Duration: 3s

2️⃣  Weaviate Search
   Status: completed
   Total Results: 2400
   Deduplicated: 850
   Candidates Saved: 120
   Duration: 15s

3️⃣  BrightData Collection
   Status: completed
   Profiles Requested: 120
   Profiles Collected: 118
   Duration: 8m 32s

4️⃣  LLM Analysis
   Status: completed
   Profiles Analyzed: 118
   Duration: 2m 15s

───────────────────────────────────────────────────────────────
                         RESULTS
───────────────────────────────────────────────────────────────

📊 Final Profiles: 30
📁 Candidates Path: pipeline_jobs/<jobId>/candidates.json
📁 Profiles Path: pipeline_jobs/<jobId>/profiles.json

═══════════════════════════════════════════════════════════════
```

## Troubleshooting

### Authentication Issues

If you see authentication errors:

```bash
gcloud auth login
gcloud auth application-default login
```

### Firestore Access Issues

Make sure your gcloud user has Firestore read permissions:

```bash
gcloud projects get-iam-policy penni-ai-platform --flatten="bindings[].members" --filter="bindings.members:user:$(gcloud config get-value account)"
```

### Service URL Issues

If the service URL is incorrect, set it explicitly:

```bash
export SERVICE_URL="https://pipeline-service-xxxxx.run.app"
```

You can find your service URL with:

```bash
gcloud run services describe pipeline-service --region=us-central1 --format='value(status.url)'
```

## Notes

- The script polls Firestore every 5 seconds by default
- Maximum wait time is 1 hour by default (configurable)
- Timing information is collected from Firestore stage metadata
- The script will exit if the pipeline fails or times out
