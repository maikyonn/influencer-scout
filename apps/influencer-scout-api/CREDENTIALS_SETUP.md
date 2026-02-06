# Credential Setup Summary

## Current Configuration

The service is configured to use **Application Default Credentials (ADC)** which works automatically in both local Docker and production Cloud Run environments.

## How It Works

### Production (Cloud Run)
- ✅ **Automatic**: Cloud Run provides Application Default Credentials via the service account
- ✅ **No configuration needed**: The service account attached to Cloud Run has all required permissions

### Local Docker
- ✅ **Mounted credentials**: `docker-compose.yml` mounts `~/.config/gcloud` into the container
- ✅ **Environment variable**: `GOOGLE_APPLICATION_CREDENTIALS` points to the ADC file
- ✅ **Automatic detection**: Firebase Admin SDK uses `applicationDefault()` which reads from the mounted file

## Setup Instructions

### 1. Refresh Application Default Credentials

If you see "invalid_rapt" or "invalid_grant" errors, refresh your credentials:

**Option A: Use the setup script (recommended - handles port conflicts automatically):**
```bash
cd services/pipeline-service
./setup-credentials.sh
```

**Option B: Manual setup (stop Docker container first):**
```bash
# Stop the Docker container to free up port 8085
cd services/pipeline-service
docker-compose down

# Run the login command
gcloud auth application-default login

# Restart the container
docker-compose up -d
```

### 2. Verify Credentials

```bash
# Check if ADC file exists
ls -la ~/.config/gcloud/application_default_credentials.json

# Test credentials work
gcloud auth application-default print-access-token
```

### 3. Restart Docker Container

After refreshing credentials, restart the container to pick up the new credentials:

```bash
cd services/pipeline-service
docker-compose restart
```

## Testing

```bash
# Health check
curl http://localhost:8085/health

# Test pipeline endpoint
curl -X POST http://localhost:8085/pipeline/start \
  -H "Content-Type: application/json" \
  -d '{
    "business_description": "coffee shop in San Francisco",
    "top_n": 30,
    "uid": "test-user-123"
  }'
```

## Troubleshooting

### Error: "invalid_rapt" or "invalid_grant"
**Solution**: Refresh Application Default Credentials:
```bash
gcloud auth application-default login
docker-compose restart
```

### Error: "Could not load the default credentials"
**Solution**: Set up Application Default Credentials:
```bash
gcloud auth application-default login
```

### Error: "Permission denied" accessing Firestore
**Solution**: Ensure your user has the required IAM roles:
```bash
gcloud projects add-iam-policy-binding penni-ai-platform \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/datastore.user"
```

## Code Implementation

The credential handling is implemented in `src/utils/firebase-admin.ts`:

1. **Checks for emulator** → No credentials needed
2. **Checks for service account JSON** → Uses `cert()` if `FIREBASE_SERVICE_ACCOUNT` env var is set
3. **Falls back to Application Default Credentials** → Uses `applicationDefault()` which:
   - Reads from `GOOGLE_APPLICATION_CREDENTIALS` file path (local Docker)
   - Uses service account attached to Cloud Run (production)
   - Auto-discovers credentials from environment

This approach ensures:
- ✅ Same credential method in local and production
- ✅ No code changes needed between environments
- ✅ Secure credential handling (no keys in code)

