# ELOC2 Agent Workflow Protocol

## Version
1.0.0 — 2026-03-25

## Purpose
Standardized protocol for all Claude Code agents working on the ELOC2 project. Ensures consistent quality, parallel execution, and maintained context across sessions.

## 1. Pre-Implementation Protocol

### 1.1 Clarification Phase (DEFAULT — can be skipped)
Before performing tasks, agents MUST:
1. Ask clarifying questions for anything unclear or ambiguous
2. Identify double-meaning terms and confirm intent
3. Verify scope boundaries (which packages/files are affected)

**Skip condition**: User explicitly says "start coding immediately" or "skip planning" or "implement now"

### 1.2 Planning Phase (DEFAULT — can be skipped)
Prepare an implementation plan that:
1. Can be executed by multiple agents simultaneously
2. Defines independent work units (no agent blocks another)
3. Specifies test strategy per work unit (each testable independently)
4. Identifies integration points and merge order

**Skip condition**: Same as 1.1 — user says to skip

### 1.3 Plan Integration
The approved plan MUST be:
1. Added to the Knowledge Base (`Knowledge_Base_and_Agents_instructions/`)
2. Referenced in CLAUDE.md under the appropriate section
3. Tracked in the implementation trace log

## 2. Implementation Protocol

### 2.1 Per-Step Tracking
After each implementation step:
1. Mark the step as complete in the todo list
2. Record what was changed (files, lines, rationale) in the implementation trace
3. Run relevant tests for the changed component
4. Update CLAUDE.md if the step affects project structure or capabilities

### 2.2 Agent Independence
Each agent's work unit must:
1. Be testable in isolation (own test file or test section)
2. Not require another agent's output to verify correctness
3. Have clear integration criteria (what must pass before merging)

### 2.3 Quality Gates
Before declaring a step complete:
1. All existing tests still pass (no regressions)
2. New code has tests (unit or integration as appropriate)
3. No TypeScript compilation errors in affected packages
4. CLAUDE.md updated if project capabilities changed

## 3. Context Management

### 3.1 Token Efficiency
To minimize token consumption across sessions:
1. Use CLAUDE.md as the primary context source (always loaded)
2. Reference Knowledge Base documents by name — don't re-read unless needed
3. Use `qa-test-manifest.json` for test inventory instead of scanning files
4. Use Chunk_index.md to locate specific KB topics quickly

### 3.2 Session Continuity
To maintain context between sessions:
1. All implementation decisions go in CLAUDE.md (it persists)
2. Active work items tracked in a `## Current Work` section
3. Implementation traces stored in `Knowledge_Base_and_Agents_instructions/Implementation_Traces/`
4. Each trace file: `trace-YYYY-MM-DD-description.md`

### 3.3 Parallel Agent Coordination
When launching multiple agents:
1. Each agent gets a specific, non-overlapping file scope
2. Shared data structures documented before agents launch
3. Integration order specified (which agent's output feeds another)
4. Test commands provided so each agent can self-validate

## 4. QA Integration

### 4.1 Pre-Flight (before deployment)
Run `/preflight` — checks GCP, Dockerfile, Auth, Routes

### 4.2 QA Suite (after implementation)
Run `/qa` — runs unit + integration + store tests
Run `/qa full` — includes stress + performance + E2E

### 4.3 Test Categories
See `tests/qa-test-manifest.json` for the complete test inventory.

| Level | When to Run | Command |
|-------|------------|---------|
| Unit | After any package change | `/qa unit` |
| Integration | After API/pipeline change | `/qa integration` |
| Store | After frontend store change | `/qa store` |
| Stress | After algorithm/tuning change | `/qa stress` |
| Full | Before deployment | `/qa full` |

## 5. Memory Architecture

### 5.1 CLAUDE.md (Primary Memory)
- Always loaded at session start
- Contains: architecture, key files, completion status, conventions
- Updated after every significant change
- Points to KB documents for deep context

### 5.2 Knowledge Base (Deep Memory)
- 30+ documents in `Knowledge_Base_and_Agents_instructions/`
- Indexed via `Chunk_index.md`
- Read on-demand when deep context needed
- New documents added for major features/plans

### 5.3 Test Manifest (QA Memory)
- `tests/qa-test-manifest.json` — complete test inventory
- Updated when tests are added/removed
- Used by `/qa` skill for test orchestration

### 5.4 Implementation Traces (Session Memory)
- `Knowledge_Base_and_Agents_instructions/Implementation_Traces/`
- One file per implementation session
- Records: what was planned, what was done, what tests passed
- Enables continuity across disconnected sessions

## 6. File Structure for Memory

```
CLAUDE.md                                    <- Primary memory (always loaded)
Knowledge_Base_and_Agents_instructions/
  ├── Chunk_index.md                         <- KB navigator
  ├── Agent_Workflow_Protocol.md             <- This document
  ├── Implementation_Traces/                 <- Session history
  │   └── trace-2026-03-25-qa-reorganization.md
  ├── [28 existing KB documents]
  └── ...
tests/
  ├── qa-test-manifest.json                  <- Test inventory
  └── ...
.claude/
  └── skills/
      ├── qa/SKILL.md                        <- Test runner skill
      ├── preflight/SKILL.md                 <- Deployment checks
      ├── deploy/SKILL.md                    <- Deployment skill
      ├── auto-deploy/SKILL.md               <- Auto-fix deploy
      └── analyze-build/SKILL.md             <- Build diagnosis
```
