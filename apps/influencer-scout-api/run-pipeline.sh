#!/usr/bin/env bash
set -euo pipefail

# Configuration
PROJECT_ID=${PROJECT_ID:-penni-ai-platform}
SERVICE_URL=${SERVICE_URL:-https://pipeline-service-szs2cmou6q-uc.a.run.app}
POLL_INTERVAL=${POLL_INTERVAL:-5}  # seconds between status checks
MAX_WAIT_TIME=${MAX_WAIT_TIME:-3600}  # maximum time to wait (1 hour)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper function to print colored output
print_status() {
  local status=$1
  local message=$2
  case $status in
    "success") echo -e "${GREEN}✅ $message${NC}" ;;
    "error") echo -e "${RED}❌ $message${NC}" ;;
    "info") echo -e "${BLUE}ℹ️  $message${NC}" ;;
    "warning") echo -e "${YELLOW}⚠️  $message${NC}" ;;
    "stage") echo -e "${CYAN}📋 $message${NC}" ;;
  esac
}

# Helper function to format duration
format_duration() {
  local seconds=$1
  if [[ -z "$seconds" || "$seconds" == "null" ]]; then
    echo "N/A"
    return
  fi
  
  # Convert to integer
  seconds=$(printf "%.0f" "$seconds" 2>/dev/null || echo "0")
  
  if [[ $seconds -lt 60 ]]; then
    echo "${seconds}s"
  elif [[ $seconds -lt 3600 ]]; then
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    echo "${mins}m ${secs}s"
  else
    local hrs=$((seconds / 3600))
    local mins=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    echo "${hrs}h ${mins}m ${secs}s"
  fi
}

# Get Firestore document using helper script
get_job_document() {
  local job_id=$1
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local helper_script="$script_dir/scripts/get-job.cjs"
  
  if [[ -f "$helper_script" ]]; then
    node "$helper_script" "$job_id" 2>/dev/null || echo "{}"
  else
    # Fallback: try inline Node.js
    node -e "
      const admin = require('firebase-admin');
      const { getFirestore } = require('firebase-admin/firestore');
      try {
        admin.initializeApp({ projectId: '$PROJECT_ID' });
      } catch (e) {}
      const db = getFirestore();
      db.collection('pipeline_jobs').doc('$job_id').get()
        .then(doc => {
          if (doc.exists) {
            const data = doc.data();
            console.log(JSON.stringify(data, (k, v) => 
              v && typeof v === 'object' && v.seconds ? {seconds: v.seconds} : v
            ));
          } else {
            console.log('{}');
          }
          process.exit(0);
        })
        .catch(err => {
          console.log('{}');
          process.exit(0);
        });
    " 2>/dev/null || echo "{}"
  fi
}

# Start pipeline job
start_pipeline() {
  local business_description="$1"
  local top_n=${2:-30}
  local uid=${3:-"test-user-$(date +%s)"}
  local platform=${4:-"instagram"}
  local min_followers=${5:-""}
  local max_followers=${6:-""}
  local request_id=$(uuidgen 2>/dev/null || echo "req_$(date +%s)_$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 7)")
  
  print_status "info" "Starting pipeline job..."
  print_status "info" "Business Description: $business_description"
  print_status "info" "Top N: $top_n (weaviate_top_n: $((top_n * 4)), llm_top_n: $top_n)"
  print_status "info" "Platform: $platform"
  print_status "info" "User ID: $uid"
  echo ""
  
  # Get authentication token
  local id_token=$(gcloud auth print-identity-token 2>/dev/null)
  if [[ -z "$id_token" ]]; then
    print_status "error" "Failed to get authentication token. Please run: gcloud auth login"
    exit 1
  fi
  
  # Build request payload
  local payload="{\"business_description\": \"$business_description\", \"top_n\": $top_n, \"uid\": \"$uid\", \"platform\": \"$platform\""
  
  if [[ -n "$min_followers" ]]; then
    payload="${payload}, \"min_followers\": $min_followers"
  fi
  
  if [[ -n "$max_followers" ]]; then
    payload="${payload}, \"max_followers\": $max_followers"
  fi
  
  payload="${payload}, \"request_id\": \"$request_id\"}"
  
  # Send request
  local response=$(curl -s -X POST "$SERVICE_URL/pipeline/start" \
    -H "Authorization: Bearer $id_token" \
    -H "Content-Type: application/json" \
    -d "$payload")
  
  local job_id=$(echo "$response" | jq -r '.job_id // empty' 2>/dev/null)
  local status=$(echo "$response" | jq -r '.status // empty' 2>/dev/null)
  
  if [[ -z "$job_id" || "$status" != "accepted" ]]; then
    print_status "error" "Failed to start pipeline job"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
    exit 1
  fi
  
  print_status "success" "Pipeline job started successfully!"
  echo "  Job ID: $job_id"
  echo "  Status: $status"
  echo ""
  
  echo "$job_id"
}

# Monitor pipeline job and collect timing
monitor_pipeline() {
  local job_id=$1
  local start_time=$(date +%s)
  local last_status=""
  local last_progress=0
  
  print_status "info" "Monitoring pipeline job: $job_id"
  print_status "info" "Polling every ${POLL_INTERVAL}s (max wait: ${MAX_WAIT_TIME}s)"
  echo ""
  
  while true; do
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    
    if [[ $elapsed -gt $MAX_WAIT_TIME ]]; then
      print_status "warning" "Maximum wait time exceeded ($MAX_WAIT_TIME seconds)"
      break
    fi
    
    # Get job document
    local job_data=$(get_job_document "$job_id")
    
    if [[ -z "$job_data" || "$job_data" == "{}" ]]; then
      print_status "warning" "Job document not found yet, waiting..."
      sleep $POLL_INTERVAL
      continue
    fi
    
    local status=$(echo "$job_data" | jq -r '.status // "unknown"' 2>/dev/null)
    local current_stage=$(echo "$job_data" | jq -r '.current_stage // "null"' 2>/dev/null)
    local progress=$(echo "$job_data" | jq -r '.overall_progress // 0' 2>/dev/null)
    local error_message=$(echo "$job_data" | jq -r '.error_message // null' 2>/dev/null)
    
    # Print status update if changed
    if [[ "$status" != "$last_status" || "$progress" != "$last_progress" ]]; then
      if [[ "$current_stage" != "null" && -n "$current_stage" ]]; then
        print_status "stage" "Current Stage: $current_stage | Progress: ${progress}% | Status: $status"
      else
        print_status "info" "Status: $status | Progress: ${progress}%"
      fi
      last_status="$status"
      last_progress="$progress"
    fi
    
    # Check if completed or errored
    if [[ "$status" == "completed" ]]; then
      echo ""
      print_status "success" "Pipeline completed successfully!"
      break
    elif [[ "$status" == "error" ]]; then
      echo ""
      print_status "error" "Pipeline failed with error"
      if [[ "$error_message" != "null" && -n "$error_message" ]]; then
        echo "  Error: $error_message"
      fi
      break
    fi
    
    sleep $POLL_INTERVAL
  done
  
  # Get final job data
  local final_data=$(get_job_document "$job_id")
  echo "$final_data"
}

# Display timing summary
display_timing_summary() {
  local job_data="$1"
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "                    PIPELINE TIMING SUMMARY"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
  
  # Overall timing
  local start_time=$(echo "$job_data" | jq -r '.start_time.seconds // .start_time // null' 2>/dev/null)
  local end_time=$(echo "$job_data" | jq -r '.end_time.seconds // .end_time // null' 2>/dev/null)
  local status=$(echo "$job_data" | jq -r '.status // "unknown"' 2>/dev/null)
  
  if [[ "$start_time" != "null" && -n "$start_time" ]]; then
    local start_ts=$(date -r "$start_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d "@$start_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "N/A")
    echo "📅 Start Time: $start_ts"
  fi
  
  if [[ "$end_time" != "null" && -n "$end_time" && "$status" == "completed" ]]; then
    local end_ts=$(date -r "$end_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -d "@$end_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "N/A")
    echo "📅 End Time: $end_ts"
    
    if [[ "$start_time" != "null" && -n "$start_time" ]]; then
      local total_duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
      echo "⏱️  Total Duration: $(format_duration "$total_duration")"
    fi
  fi
  
  echo ""
  echo "───────────────────────────────────────────────────────────────"
  echo "                    STAGE TIMING BREAKDOWN"
  echo "───────────────────────────────────────────────────────────────"
  echo ""
  
  # Query Expansion
  local qe_status=$(echo "$job_data" | jq -r '.query_expansion.status // "not_started"' 2>/dev/null)
  local qe_duration=$(echo "$job_data" | jq -r '.query_expansion.duration_seconds // null' 2>/dev/null)
  local qe_queries=$(echo "$job_data" | jq -r '.query_expansion.queries | length // 0' 2>/dev/null)
  
  echo "1️⃣  Query Expansion"
  echo "   Status: $qe_status"
  if [[ "$qe_queries" != "0" && -n "$qe_queries" ]]; then
    echo "   Queries Generated: $qe_queries"
  fi
  echo "   Duration: $(format_duration "$qe_duration")"
  echo ""
  
  # Weaviate Search
  local ws_status=$(echo "$job_data" | jq -r '.weaviate_search.status // "not_started"' 2>/dev/null)
  local ws_duration=$(echo "$job_data" | jq -r '.weaviate_search.duration_seconds // null' 2>/dev/null)
  local ws_total=$(echo "$job_data" | jq -r '.weaviate_search.total_results // 0' 2>/dev/null)
  local ws_dedup=$(echo "$job_data" | jq -r '.weaviate_search.deduplicated_results // 0' 2>/dev/null)
  local ws_candidates=$(echo "$job_data" | jq -r '.weaviate_search.candidates_count // 0' 2>/dev/null)
  
  echo "2️⃣  Weaviate Search"
  echo "   Status: $ws_status"
  if [[ "$ws_total" != "0" ]]; then
    echo "   Total Results: $ws_total"
  fi
  if [[ "$ws_dedup" != "0" ]]; then
    echo "   Deduplicated: $ws_dedup"
  fi
  if [[ "$ws_candidates" != "0" ]]; then
    echo "   Candidates Saved: $ws_candidates"
  fi
  echo "   Duration: $(format_duration "$ws_duration")"
  echo ""
  
  # BrightData Collection
  local bd_status=$(echo "$job_data" | jq -r '.brightdata_collection.status // "not_started"' 2>/dev/null)
  local bd_duration=$(echo "$job_data" | jq -r '.brightdata_collection.duration_seconds // null' 2>/dev/null)
  local bd_requested=$(echo "$job_data" | jq -r '.brightdata_collection.profiles_requested // 0' 2>/dev/null)
  local bd_collected=$(echo "$job_data" | jq -r '.brightdata_collection.profiles_collected // 0' 2>/dev/null)
  
  echo "3️⃣  BrightData Collection"
  echo "   Status: $bd_status"
  if [[ "$bd_requested" != "0" ]]; then
    echo "   Profiles Requested: $bd_requested"
  fi
  if [[ "$bd_collected" != "0" ]]; then
    echo "   Profiles Collected: $bd_collected"
  fi
  echo "   Duration: $(format_duration "$bd_duration")"
  echo ""
  
  # LLM Analysis
  local llm_status=$(echo "$job_data" | jq -r '.llm_analysis.status // "not_started"' 2>/dev/null)
  local llm_duration=$(echo "$job_data" | jq -r '.llm_analysis.duration_seconds // null' 2>/dev/null)
  local llm_analyzed=$(echo "$job_data" | jq -r '.llm_analysis.profiles_analyzed // 0' 2>/dev/null)
  
  echo "4️⃣  LLM Analysis"
  echo "   Status: $llm_status"
  if [[ "$llm_analyzed" != "0" ]]; then
    echo "   Profiles Analyzed: $llm_analyzed"
  fi
  echo "   Duration: $(format_duration "$llm_duration")"
  echo ""
  
  # Results
  local profiles_path=$(echo "$job_data" | jq -r '.profiles_storage_path // null' 2>/dev/null)
  local candidates_path=$(echo "$job_data" | jq -r '.candidates_storage_path // null' 2>/dev/null)
  # Backwards-compatible fallbacks (older jobs stored URLs)
  local profiles_url=$(echo "$job_data" | jq -r '.profiles_storage_url // null' 2>/dev/null)
  local candidates_url=$(echo "$job_data" | jq -r '.candidates_storage_url // null' 2>/dev/null)
  local final_count=$(echo "$job_data" | jq -r '.pipeline_stats.profiles_collected // 0' 2>/dev/null)
  
  echo "───────────────────────────────────────────────────────────────"
  echo "                         RESULTS"
  echo "───────────────────────────────────────────────────────────────"
  echo ""
  
  if [[ "$final_count" != "0" ]]; then
    echo "📊 Final Profiles: $final_count"
  fi
  
  if [[ "$candidates_path" != "null" && -n "$candidates_path" ]]; then
    echo "📁 Candidates Path: $candidates_path"
  elif [[ "$candidates_url" != "null" && -n "$candidates_url" ]]; then
    echo "🔗 Candidates URL: $candidates_url"
  fi
  
  if [[ "$profiles_path" != "null" && -n "$profiles_path" ]]; then
    echo "📁 Profiles Path: $profiles_path"
  elif [[ "$profiles_url" != "null" && -n "$profiles_url" ]]; then
    echo "🔗 Profiles URL: $profiles_url"
  fi
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
}

# Main function
main() {
  if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <business_description> [top_n] [uid] [platform] [min_followers] [max_followers]"
    echo ""
    echo "Examples:"
    echo "  $0 \"coffee shop in San Francisco\""
    echo "  $0 \"sustainable fashion brand\" 30 test-user-123 instagram 10000 100000"
    exit 1
  fi
  
  local business_description="$1"
  local top_n=${2:-30}
  local uid=${3:-"test-user-$(date +%s)"}
  local platform=${4:-"instagram"}
  local min_followers=${5:-""}
  local max_followers=${6:-""}
  
  echo "🚀 Pipeline Runner"
  echo "=================="
  echo ""
  
  # Start pipeline
  local job_id=$(start_pipeline "$business_description" "$top_n" "$uid" "$platform" "$min_followers" "$max_followers")
  
  if [[ -z "$job_id" ]]; then
    print_status "error" "Failed to get job ID"
    exit 1
  fi
  
  # Monitor pipeline
  local job_data=$(monitor_pipeline "$job_id")
  
  # Display timing summary
  display_timing_summary "$job_data"
  
  echo ""
  print_status "info" "Job ID: $job_id"
  print_status "info" "View full details: Check Firestore collection 'pipeline_jobs' document '$job_id'"
}

# Run main function
main "$@"
