# Credential Configuration Guide

This document explains how to configure Firebase Admin SDK credentials for local development vs production deployment.

## Overview

The Firebase Admin SDK uses different credential methods depending on the environment:

- **Production (Cloud Run)**: Application Default Credentials (automatically available)
- **Local Docker**: Application Default Credentials (mounted from host)
- **Local with Service Account**: Service account key file (optional)
- **Local with Emulator**: No credentials needed (emulator handles auth)

## Production (Cloud Run)

In Cloud Run, credentials are automatically provided via the service account attached to the service. No additional configuration is needed.

The service account (`pipeline-service@<PROJECT_ID>.iam.gserviceaccount.com`) must have:
- `roles/datastore.user` - For Firestore access
- `roles/storage.objectAdmin` - For Cloud Storage access
- `roles/cloudtasks.enqueuer` - For Cloud Tasks creation
- `roles/secretmanager.secretAccessor` - For Secret Manager access
- `roles/run.invoker` on the Cloud Run service (for Cloud Tasks OIDC calls)

## Local Development (Docker)

### Option 1: Application Default Credentials (Recommended)

This is the recommended approach for local development as it matches the production environment.

1. **Set up Application Default Credentials on your host machine**:
   ```bash
   gcloud auth application-default login
   ```
   
   **Note**: If you see "invalid_rapt" errors, refresh your credentials:
   ```bash
   gcloud auth application-default login --no-launch-browser
   ```

2. **Docker Compose automatically mounts credentials**:
   The `docker-compose.yml` file mounts `~/.config/gcloud` into the container, making Application Default Credentials available.

3. **Verify credentials are available**:
   ```bash
   # Check if ADC file exists
   ls -la ~/.config/gcloud/application_default_credentials.json
   
   # Test credentials work
   gcloud auth application-default print-access-token
   ```

4. **Run the service**:
   ```bash
   docker-compose up -d
   ```
   
5. **If credentials expire** (you'll see "invalid_grant" or "invalid_rapt" errors):
   ```bash
   # Refresh credentials
   gcloud auth application-default login
   
   # Restart Docker container to pick up new credentials
   docker-compose restart
   ```

### Option 2: Service Account Key File

If you prefer to use a service account key file:

1. **Download service account key**:
   ```bash
   gcloud iam service-accounts keys create pipeline-service-key.json \
     --iam-account=pipeline-service@penni-ai-platform.iam.gserviceaccount.com
   ```

2. **Update docker-compose.yml**:
   ```yaml
   volumes:
     - ./pipeline-service-key.json:/app/pipeline-service-key.json:ro
   environment:
     - GOOGLE_APPLICATION_CREDENTIALS=/app/pipeline-service-key.json
   ```

3. **Add to .gitignore**:
   ```
   pipeline-service-key.json
   ```

### Option 3: Firebase Emulator

For local testing without real Firebase services:

1. **Start Firebase emulators**:
   ```bash
   firebase emulators:start --only firestore,storage
   ```

2. **Set emulator environment variables**:
   ```bash
   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   export FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
   ```

3. **Update docker-compose.yml** to pass emulator hosts:
   ```yaml
   environment:
     - FIRESTORE_EMULATOR_HOST=host.docker.internal:8080
     - FIREBASE_STORAGE_EMULATOR_HOST=host.docker.internal:9199
   ```

## How It Works

The `firebase-admin.ts` utility automatically detects the environment and uses the appropriate credential method:

1. **Checks for emulator** - If emulator environment variables are set, no credentials are needed
2. **Checks for service account key** - If `GOOGLE_APPLICATION_CREDENTIALS` points to a file, uses `cert()`
3. **Falls back to Application Default Credentials** - Uses `applicationDefault()` which works in:
   - Cloud Run (automatic)
   - Local Docker (with mounted credentials)
   - Local Node.js (with `gcloud auth application-default login`)

## Troubleshooting

### Error: "Could not load the default credentials"

**Solution**: Set up Application Default Credentials:
```bash
gcloud auth application-default login
```

### Error: "Permission denied" when accessing Firestore

**Solution**: Ensure your user account or service account has the required IAM roles:
```bash
gcloud projects add-iam-policy-binding penni-ai-platform \
  --member="user:your-email@example.com" \
  --role="roles/datastore.user"
```

### Error: "Service account key file not found"

**Solution**: 
- Verify the path in `GOOGLE_APPLICATION_CREDENTIALS` is correct
- Ensure the file is mounted in Docker (check `docker-compose.yml` volumes)
- Check file permissions (should be readable)

### Testing Credentials

```bash
# Test Application Default Credentials
gcloud auth application-default print-access-token

# Test Firestore access
gcloud firestore databases list --project=penni-ai-platform

# Test from Docker container
docker exec pipeline-service gcloud auth application-default print-access-token
```

## Security Notes

- **Never commit service account keys** to version control
- **Use Application Default Credentials** when possible (more secure)
- **Rotate service account keys** regularly if using key files
- **Limit IAM roles** to only what's needed (principle of least privilege)
- **Use Secret Manager** for API keys in production (not environment variables)

## References

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Service Account Keys](https://cloud.google.com/iam/docs/creating-managing-service-account-keys)
