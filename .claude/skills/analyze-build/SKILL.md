# Analyze Build — Cloud Build Failure Diagnosis

Uses Claude API to analyze failed Cloud Build logs and provide structured diagnosis with fix suggestions.

## Prerequisites
- `ANTHROPIC_API_KEY` environment variable must be set
- `gcloud` CLI must be authenticated with access to `eloc2demo` project

## Usage

Run the analyzer script:

```bash
# Analyze the latest failed build
npx tsx scripts/analyze-build.ts

# Analyze a specific build by ID
npx tsx scripts/analyze-build.ts <build-id>

# Analyze the last N failed builds
npx tsx scripts/analyze-build.ts --last 3
```

## What It Does

1. Fetches build logs and details from Cloud Build via `gcloud`
2. Loads the project's Dockerfile and cloudbuild.yaml for context
3. Sends everything to Claude Opus 4.6 with adaptive thinking
4. Returns a structured diagnosis:
   - **Root cause**: One-sentence explanation
   - **Failed step**: Which build step broke
   - **Error category**: dockerfile | dependency | auth | network | permissions | config | runtime
   - **Fixes**: Ordered list with file paths, descriptions, and priority
   - **Prevention**: How to avoid this in the future

## After Analysis

If the analyzer identifies fixes:
1. Review the suggested changes
2. Apply fixes to the identified files
3. Commit and re-trigger the build
4. Run `/auto-deploy` for autonomous fix-and-redeploy

## Integrating with Other Skills

- Run `/preflight` first to catch issues before they reach Cloud Build
- Run `/analyze-build` when a build fails to get diagnosis
- Run `/auto-deploy` to let Claude fix and redeploy automatically
