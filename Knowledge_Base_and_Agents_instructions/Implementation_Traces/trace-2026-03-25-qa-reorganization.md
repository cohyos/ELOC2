# Implementation Trace: QA Reorganization & Test Infrastructure

**Date**: 2026-03-25
**Branch**: `claude/eloc2-development-QxD7P`
**Status**: Complete

## Objectives
1. Organize all 120 test files into categories
2. Fix EO cue toggle bug (context menu)
3. Fix good/bad-triangulation scenario misconfiguration
4. Add 286 new automated tests (Phase A + B)
5. Create QA infrastructure (manifest, skill, protocol)
6. Update project memory for efficient agent context

## Implementation Steps

### Step 1: EO Cue Toggle Fix
**Files changed**:
- `apps/api/src/simulation/live-engine.ts` — Added `operatorPriorityTrackIds` to `broadcastRap()` and `getFullSnapshot()`
- `apps/workstation/src/stores/ui-store.ts` — Added `operatorPriorityTrackIds: Set<string>` + setter
- `apps/workstation/src/replay/ReplayController.ts` — Added WS sync for priority track IDs
- `apps/workstation/src/map/DebugOverlay.tsx` — Replaced dual "Cue EO"/"Stop Cue EO" with single toggle button

**Root cause**: Backend never broadcast priority tracks to frontend. Context menu had two separate buttons with no state awareness.

### Step 2: Phase A — Use-Case Integration Tests (227 tests)
**Files created**:
- `apps/api/src/__tests__/all-scenarios-usecase.test.ts` — 154 tests, all 20 scenarios
- `apps/api/src/__tests__/eo-cueing-usecase.test.ts` — 44 tests, full EO pipeline
- `apps/api/src/__tests__/gp-sortie2-eo-deep.test.ts` — 29 tests, GP Sortie 2 deep analysis

### Step 3: Phase B — Zustand Store Tests (59 tests)
**Files created**:
- `apps/workstation/src/__tests__/store-tests.test.ts` — 59 tests across 8 stores

### Step 4: Scenario Bug Fix
**Files changed**:
- `packages/scenario-library/src/scenarios/simple-scenarios.ts` — Fixed `slewRateDegPerSec: 60` → `0` for good/bad-triangulation EO sensors

**Root cause**: Gimbal sensors (slewRate=60) route bearings to cue-matching pipeline which requires radar. EO-only scenarios have no radar → bearings silently dropped. Staring sensors (slewRate=0) route to CoreEoTargetDetector for triangulation.

### Step 5: QA Infrastructure
**Files created**:
- `tests/qa-test-manifest.json` — Complete test inventory (120 files, 813+ tests)
- `.claude/skills/qa/SKILL.md` — `/qa` test runner skill
- `Knowledge_Base_and_Agents_instructions/Agent_Workflow_Protocol.md` — Agent workflow standard
- `Knowledge_Base_and_Agents_instructions/Implementation_Traces/` — Session history directory

### Step 6: Memory Updates
**Files updated**:
- `CLAUDE.md` — QA section, agent protocol reference, memory architecture
- `Knowledge_Base_and_Agents_instructions/Chunk_index.md` — New entries

## Test Results
- **286 new tests**: All passing
- **33 existing integration tests**: All passing
- **GP Sortie 2 quality**: 100/100 (A grade)
- **Good triangulation**: Now produces geometry estimates (was 0, now >0)

## Commits
1. `b182302` — feat: fix EO cue toggle + add 286 automated use-case and store tests
2. `4aa81a5` — fix: good/bad-triangulation scenarios — staring sensors were misconfigured as gimbal
3. (pending) — feat: QA infrastructure — manifest, skill, protocol, memory updates
