#!/usr/bin/env npx tsx
/**
 * Cloud Build Log Analyzer
 *
 * Fetches failed Cloud Build logs from GCP and sends them to Claude
 * for structured diagnosis with actionable fix suggestions.
 *
 * Usage:
 *   npx tsx scripts/analyze-build.ts                    # Analyze latest failed build
 *   npx tsx scripts/analyze-build.ts <build-id>         # Analyze specific build
 *   npx tsx scripts/analyze-build.ts --last 3           # Analyze last 3 builds
 *
 * Requires:
 *   - ANTHROPIC_API_KEY env var
 *   - gcloud CLI authenticated with access to eloc2demo project
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "eloc2demo";
const REGION = "me-west1";
const SERVICE = "eloc2";

// ── Types ────────────────────────────────────────────────────────────────────

interface BuildInfo {
  id: string;
  status: string;
  startTime: string;
  duration: string;
  trigger: string;
  branch: string;
  commit: string;
}

interface Diagnosis {
  build_id: string;
  status: string;
  root_cause: string;
  failed_step: string;
  error_category: string;
  fixes: Fix[];
  prevention: string;
}

interface Fix {
  file: string;
  description: string;
  action: "edit" | "create" | "delete" | "config";
  priority: "critical" | "high" | "medium" | "low";
}

// ── GCloud helpers ───────────────────────────────────────────────────────────

function gcloud(args: string): string {
  try {
    return execSync(`gcloud ${args} --project=${PROJECT_ID}`, {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);
    throw new Error(`gcloud command failed: ${msg}`);
  }
}

function fetchBuildList(limit: number = 5): BuildInfo[] {
  const raw = gcloud(
    `builds list --limit=${limit} --region=global --format=json`
  );
  const builds = JSON.parse(raw) as Record<string, unknown>[];
  return builds.map((b) => ({
    id: (b.id as string) || "unknown",
    status: (b.status as string) || "UNKNOWN",
    startTime: (b.startTime as string) || "",
    duration: (b.duration as string) || "",
    trigger: ((b.buildTriggerId as string) || "manual").slice(0, 12),
    branch:
      ((b.substitutions as Record<string, string>)?.BRANCH_NAME as string) ||
      "unknown",
    commit:
      ((b.substitutions as Record<string, string>)?.SHORT_SHA as string) ||
      "unknown",
  }));
}

function fetchBuildLog(buildId: string): string {
  try {
    return gcloud(`builds log ${buildId} --region=global`);
  } catch {
    return `[Could not fetch log for build ${buildId}]`;
  }
}

function fetchBuildDetails(buildId: string): string {
  try {
    return gcloud(
      `builds describe ${buildId} --region=global --format=yaml`
    );
  } catch {
    return `[Could not fetch details for build ${buildId}]`;
  }
}

// ── Project context ──────────────────────────────────────────────────────────

function loadProjectContext(): string {
  const files = [
    { path: resolve(__dirname, "../Dockerfile"), label: "Dockerfile" },
    { path: resolve(__dirname, "../cloudbuild.yaml"), label: "cloudbuild.yaml" },
  ];

  let context = "";
  for (const { path, label } of files) {
    if (existsSync(path)) {
      context += `\n--- ${label} ---\n${readFileSync(path, "utf-8")}\n`;
    }
  }
  return context;
}

// ── Claude analysis ──────────────────────────────────────────────────────────

async function analyzeBuild(
  client: Anthropic,
  buildInfo: BuildInfo,
  log: string,
  details: string,
  projectContext: string
): Promise<Diagnosis> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: `You are an expert DevOps engineer specializing in Google Cloud Build, Cloud Run, Docker, and Node.js/TypeScript deployments.

You are analyzing a failed Cloud Build for the ELOC2 project — an air defense C2 demonstrator. Key facts:
- Monorepo with pnpm workspaces (20 packages)
- 2-stage Dockerfile: build with pnpm, production with node:22-slim
- Deploys to Cloud Run on port 3001
- Cloud SQL PostgreSQL (Enterprise Plus edition — no db-f1-micro/db-g1-small)
- Auth can be disabled via AUTH_ENABLED=false env var
- Known issue: AUTH_ENABLED=true without DATABASE_URL crashes the container

Here is the project's Dockerfile and cloudbuild.yaml for reference:
${projectContext}`,
    messages: [
      {
        role: "user",
        content: `Analyze this failed Cloud Build and provide a structured diagnosis.

## Build Info
- Build ID: ${buildInfo.id}
- Status: ${buildInfo.status}
- Started: ${buildInfo.startTime}
- Duration: ${buildInfo.duration}
- Branch: ${buildInfo.branch}
- Commit: ${buildInfo.commit}

## Build Details (YAML)
\`\`\`yaml
${details.slice(0, 3000)}
\`\`\`

## Build Log (last 200 lines)
\`\`\`
${log.split("\n").slice(-200).join("\n")}
\`\`\`

Respond with a JSON object matching this schema exactly (no markdown, just JSON):
{
  "build_id": "string",
  "status": "string",
  "root_cause": "One sentence explaining the root cause",
  "failed_step": "Which build step failed (e.g., 'Step 0: docker build', 'Step 2: gcloud run deploy')",
  "error_category": "One of: dockerfile | dependency | auth | network | permissions | config | runtime | unknown",
  "fixes": [
    {
      "file": "path/to/file",
      "description": "What to change and why",
      "action": "edit | create | delete | config",
      "priority": "critical | high | medium | low"
    }
  ],
  "prevention": "How to prevent this in the future"
}`,
      },
    ],
  });

  // Extract JSON from response
  let jsonText = "";
  for (const block of response.content) {
    if (block.type === "text") {
      jsonText += block.text;
    }
  }

  // Strip markdown code fences if present
  jsonText = jsonText.replace(/^```json?\s*/m, "").replace(/\s*```$/m, "").trim();

  try {
    return JSON.parse(jsonText) as Diagnosis;
  } catch {
    return {
      build_id: buildInfo.id,
      status: buildInfo.status,
      root_cause: jsonText.slice(0, 500),
      failed_step: "unknown",
      error_category: "unknown",
      fixes: [],
      prevention: "Could not parse structured response",
    };
  }
}

// ── Output formatting ────────────────────────────────────────────────────────

function formatDiagnosis(d: Diagnosis): string {
  const lines: string[] = [
    "",
    `${"=".repeat(70)}`,
    `BUILD ANALYSIS: ${d.build_id}`,
    `${"=".repeat(70)}`,
    "",
    `Status:         ${d.status}`,
    `Failed Step:    ${d.failed_step}`,
    `Category:       ${d.error_category}`,
    `Root Cause:     ${d.root_cause}`,
    "",
  ];

  if (d.fixes.length > 0) {
    lines.push(`FIXES (${d.fixes.length}):`);
    lines.push(`${"-".repeat(40)}`);
    for (const fix of d.fixes) {
      const icon =
        fix.priority === "critical"
          ? "[!!]"
          : fix.priority === "high"
            ? "[! ]"
            : fix.priority === "medium"
              ? "[  ]"
              : "[  ]";
      lines.push(`${icon} ${fix.file}`);
      lines.push(`    Action: ${fix.action}`);
      lines.push(`    ${fix.description}`);
      lines.push("");
    }
  }

  lines.push(`PREVENTION: ${d.prevention}`);
  lines.push("");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY environment variable is required.\n" +
        "Set it with: export ANTHROPIC_API_KEY=sk-ant-..."
    );
    process.exit(1);
  }

  const client = new Anthropic();

  // Parse arguments
  let buildIds: string[] = [];

  if (args.includes("--last")) {
    const countIdx = args.indexOf("--last") + 1;
    const count = parseInt(args[countIdx] || "3", 10);
    console.log(`Fetching last ${count} builds from Cloud Build...`);
    const builds = fetchBuildList(count);
    const failed = builds.filter((b) => b.status === "FAILURE");
    if (failed.length === 0) {
      console.log("No failed builds found in the last", count, "builds.");
      console.log(
        "Build statuses:",
        builds.map((b) => `${b.id.slice(0, 8)}=${b.status}`).join(", ")
      );
      return;
    }
    buildIds = failed.map((b) => b.id);
    console.log(`Found ${failed.length} failed build(s)\n`);
  } else if (args.length > 0 && !args[0].startsWith("-")) {
    buildIds = [args[0]];
  } else {
    // Default: fetch latest failed build
    console.log("Fetching recent builds from Cloud Build...");
    const builds = fetchBuildList(10);
    const failed = builds.filter((b) => b.status === "FAILURE");
    if (failed.length === 0) {
      console.log("No failed builds found in the last 10 builds.");
      console.log("\nRecent builds:");
      for (const b of builds.slice(0, 5)) {
        console.log(
          `  ${b.id.slice(0, 8)}  ${b.status.padEnd(10)}  ${b.branch}  ${b.startTime}`
        );
      }
      return;
    }
    buildIds = [failed[0].id];
    console.log(`Analyzing latest failed build: ${buildIds[0].slice(0, 8)}...\n`);
  }

  // Load project context once
  const projectContext = loadProjectContext();

  // Analyze each build
  for (const buildId of buildIds) {
    console.log(`Fetching log for ${buildId.slice(0, 8)}...`);

    const builds = fetchBuildList(20);
    const buildInfo = builds.find((b) => b.id === buildId) || {
      id: buildId,
      status: "FAILURE",
      startTime: "",
      duration: "",
      trigger: "unknown",
      branch: "unknown",
      commit: "unknown",
    };

    const log = fetchBuildLog(buildId);
    const details = fetchBuildDetails(buildId);

    console.log(`Sending to Claude for analysis...`);
    const diagnosis = await analyzeBuild(
      client,
      buildInfo,
      log,
      details,
      projectContext
    );

    console.log(formatDiagnosis(diagnosis));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
