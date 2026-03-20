# Deploy to Cloud Run

Pre-flight validation and deployment workflow for ELOC2 on GCP Cloud Run.

## Pre-flight Checks

Run these validations BEFORE attempting any deployment:

### 1. GCP API Verification
```bash
gcloud services list --enabled --project=eloc2demo --filter="name:(sqladmin.googleapis.com OR run.googleapis.com OR cloudbuild.googleapis.com OR artifactregistry.googleapis.com)" --format="table(name)"
```
- Required: `sqladmin.googleapis.com`, `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`
- If any are missing, enable them: `gcloud services enable <api> --project=eloc2demo`

### 2. Dockerfile Validation
- Read the Dockerfile and verify ALL directories under `packages/` and `apps/` have corresponding COPY steps for their `package.json` files
- Cross-reference with `pnpm-workspace.yaml` to ensure no workspace package is missing
- Verify the entrypoint matches the actual built output path

### 3. Auth Configuration Check
- Read `cloudbuild.yaml` and check the `AUTH_ENABLED` env var
- If `AUTH_ENABLED=true`: verify `_DB_PASSWORD` substitution is non-empty and Cloud SQL instance exists
- If `AUTH_ENABLED=false`: verify `--add-cloudsql-instances` flag is NOT present (unnecessary cost)
- Check that `/api/auth/status` endpoint is always registered regardless of auth state

### 4. Build Validation
- Run `pnpm build` to verify the project compiles
- Verify `apps/workstation/dist/index.html` exists after build
- Verify `apps/api/dist/server.js` exists after build

### 5. Local Container Test (if Docker available)
```bash
docker build -t eloc2-test . && \
docker run --rm -d -p 3001:3001 -e NODE_ENV=production --name eloc2-test-run eloc2-test && \
sleep 3 && \
curl -sf http://localhost:3001/api/health && \
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3001/ && \
docker stop eloc2-test-run
```

## Deployment

After all checks pass:

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --project=eloc2demo
```

## Post-deploy Verification
- Check service URL: `gcloud run services describe eloc2 --region=me-west1 --format='value(status.url)'`
- Health check: `curl -sf <SERVICE_URL>/api/health`
- Frontend check: `curl -sf -o /dev/null -w "%{http_code}" <SERVICE_URL>/`
- If blank page: check Cloud Run logs with `gcloud run services logs read eloc2 --region=me-west1 --limit=50`

## Common Failure Modes
| Symptom | Cause | Fix |
|---------|-------|-----|
| Container won't start | AUTH_ENABLED=true without DB | Set AUTH_ENABLED=false in cloudbuild.yaml |
| Build fails on COPY | New package missing from Dockerfile | Add COPY line for the package.json |
| Blank page in browser | Frontend dist not built or not served | Check Dockerfile builds workstation, check static file serving in server.ts |
| Wrong SQL tier error | Enterprise Plus doesn't support micro/small | Use db-custom-* or db-n1-* tiers |
