# Pre-flight Check — Parallel Validation Agents

Run a comprehensive pre-deployment validation using 4 parallel agents before deploying to Cloud Run. This catches all common failure modes upfront instead of discovering them one-by-one through failed builds.

## Instructions

Launch ALL 4 agents in parallel using the Agent tool in a single message. After all complete, aggregate results into a checklist and fix any issues found.

## Agent 1: GCP API Validation
**Prompt**: Check that all required GCP APIs are enabled for project eloc2demo:
```bash
gcloud services list --enabled --project=eloc2demo
```
Verify these are active:
- `sqladmin.googleapis.com`
- `run.googleapis.com`
- `cloudbuild.googleapis.com`
- `artifactregistry.googleapis.com`

If any are missing, enable them:
```bash
gcloud services enable <missing-api> --project=eloc2demo
```

## Agent 2: Database Validation
**Prompt**: Validate Cloud SQL configuration for project eloc2demo:
```bash
gcloud sql instances list --project=eloc2demo
gcloud sql instances describe eloc2-db --project=eloc2demo 2>/dev/null
gcloud sql databases list --instance=eloc2-db --project=eloc2demo 2>/dev/null
```
- Check instance tier is compatible with Enterprise Plus (NOT db-f1-micro or db-g1-small)
- Verify the `eloc2` database exists
- Check if the instance is RUNNING
- Read `cloudbuild.yaml` and verify `_DB_PASSWORD` handling (should use substitution or Secret Manager, never hardcoded)

## Agent 3: Dockerfile & Build Validation
**Prompt**: Validate Dockerfile and build configuration:
1. Read `Dockerfile` and extract all COPY steps for package.json files
2. Read `pnpm-workspace.yaml` to get all workspace packages
3. Compare: every workspace package must have a COPY step in the Dockerfile
4. Verify the CMD entrypoint path matches the actual build output
5. Read `cloudbuild.yaml` and verify:
   - Image tag format is correct
   - Deploy step references the right region and service
   - Environment variables are properly set
6. Run `pnpm build` to verify compilation succeeds
7. Check that `apps/workstation/dist/index.html` and `apps/api/dist/server.js` exist after build

## Agent 4: Auth & Routes Validation
**Prompt**: Validate auth configuration and route registration:
1. Read `apps/api/src/server.ts` and verify:
   - `/api/auth/status` endpoint is ALWAYS registered (not gated behind AUTH_ENABLED)
   - `/api/health` endpoint exists and returns useful data
   - All route modules are registered
2. Read `cloudbuild.yaml` and check:
   - If `AUTH_ENABLED=true`: verify `--add-cloudsql-instances` flag is present and `DATABASE_URL` is configured
   - If `AUTH_ENABLED=false`: verify no unnecessary Cloud SQL binding
3. Read `apps/api/src/auth/auth-plugin.ts` and verify it handles connection failures gracefully (no hanging)

## After All Agents Complete

Aggregate findings into a checklist:

```
Pre-flight Results:
[PASS/FAIL] GCP APIs: <details>
[PASS/FAIL] Database: <details>
[PASS/FAIL] Dockerfile & Build: <details>
[PASS/FAIL] Auth & Routes: <details>
```

If all pass: proceed with deployment.
If any fail: fix the issues first, then re-run the failing checks.
