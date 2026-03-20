# Auto Deploy — Autonomous Build-Fix-Redeploy Loop

Autonomously fix and deploy the ELOC2 Cloud Run service. Iterates up to 5 times until the service is healthy.

## Workflow

For each iteration (max 5):

### Step 1: Submit Build
```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --project=eloc2demo 2>&1 | tee /tmp/build-output.log
```

### Step 2: Check Build Result
- If build succeeded, go to Step 4
- If build failed, go to Step 3

### Step 3: Diagnose and Fix
Read the build log and identify the failure:

| Error Pattern | Action |
|---------------|--------|
| `COPY failed` or `file not found` | Add missing COPY step to Dockerfile |
| `container failed to start` | Check AUTH_ENABLED, DATABASE_URL, missing env vars |
| `health check timeout` | Server isn't starting — check for hanging imports or DB connections |
| `permission denied` | Check IAM bindings, service account roles |
| `image not found` | Check Artifact Registry repo exists and push step succeeded |
| `npm ERR` or `pnpm ERR` | Fix package dependency issue |

After applying the fix:
1. Explain what went wrong
2. Commit the fix with a descriptive message
3. Go back to Step 1

### Step 4: Verify Deployment
```bash
SERVICE_URL=$(gcloud run services describe eloc2 --region=me-west1 --format='value(status.url)' --project=eloc2demo)
echo "Service URL: $SERVICE_URL"

# Health check
curl -sf "$SERVICE_URL/api/health" | jq .

# Frontend check (should return 200, not blank)
HTTP_CODE=$(curl -sf -o /tmp/frontend.html -w "%{http_code}" "$SERVICE_URL/")
echo "Frontend HTTP: $HTTP_CODE"
BODY_SIZE=$(wc -c < /tmp/frontend.html)
echo "Body size: $BODY_SIZE bytes"
```

### Step 5: Validate
- If health returns 200 AND frontend returns 200 with body > 100 bytes: **SUCCESS**
- If health fails: check Cloud Run logs, fix, go back to Step 1
- If frontend is blank (body < 100 bytes): check static file serving, go back to Step 1

```bash
# Cloud Run logs for debugging
gcloud run services logs read eloc2 --region=me-west1 --limit=50 --project=eloc2demo
```

## On Success
Summarize all changes made across all iterations, including:
- Number of iterations needed
- What broke and how it was fixed at each step
- Final service URL and health check response
