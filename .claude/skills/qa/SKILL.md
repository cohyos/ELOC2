---
name: qa
description: Run QA test suite — unit, integration, stress, store, or full
user_invocable: true
---

# QA Test Runner

## Usage
- `/qa` — Run core tests (unit + integration + store + simulator)
- `/qa unit` — Unit tests only (all packages)
- `/qa integration` — Integration tests only (API pipeline)
- `/qa stress` — Stress tests (Green Pine, EO staring, pipeline stages)
- `/qa store` — Zustand store tests
- `/qa simulator` — Simulator tests
- `/qa performance` — Performance benchmarks
- `/qa tuning` — Algorithm tuning/optimization tests
- `/qa e2e` — Playwright E2E tests (requires running server)
- `/qa full` — Everything: unit + integration + stress + store + simulator + performance + tuning + e2e
- `/qa report` — Summary report from last run (re-runs core if no cached results)

## Instructions

You are the QA test runner for the ELOC2 project. Follow these steps precisely.

### Step 1: Parse Arguments

Read the first argument passed to determine scope. Default to `core` if no argument.

| Argument | Scope |
|----------|-------|
| (none) | `core` — unit + integration + store + simulator |
| `unit` | Package-level unit tests only |
| `integration` | API integration tests only |
| `stress` | Stress/load tests only |
| `store` | Zustand store tests only |
| `simulator` | Simulator tests only |
| `performance` | Performance benchmark tests only |
| `tuning` | Algorithm tuning tests only |
| `e2e` | Playwright E2E browser tests only |
| `full` | All categories |
| `report` | Same as `core` but emphasize the summary |

### Step 2: Run Tests by Category

Run each applicable category using the Bash tool. Run independent categories **in parallel** when possible. Always run from the project root `/home/user/ELOC2`.

Use `--reporter=verbose` for detailed output. Set timeout to 300000ms (5 min) for stress/performance tests, 120000ms for others.

#### Test Commands by Category

**unit** — 47 test files across all packages:
```bash
npx vitest run --reporter=verbose packages/
```

**integration** — 6 API pipeline test files:
```bash
cd /home/user/ELOC2 && npx vitest run --reporter=verbose apps/api/src/__tests__/integration.test.ts apps/api/src/__tests__/all-scenarios-usecase.test.ts apps/api/src/__tests__/eo-cueing-usecase.test.ts apps/api/src/__tests__/gp-sortie2-eo-deep.test.ts apps/api/src/__tests__/instructor-ux.test.ts apps/api/src/__tests__/report-e2e.test.ts
```

**stress** — 3 stress/load test files:
```bash
cd /home/user/ELOC2 && npx vitest run --reporter=verbose apps/api/src/__tests__/green-pine-stress.test.ts apps/api/src/__tests__/eo-staring-stress.test.ts apps/api/src/__tests__/eo-pipeline-stages.test.ts
```

**performance** — 2 benchmark files:
```bash
cd /home/user/ELOC2 && npx vitest run --reporter=verbose apps/api/src/__tests__/performance.test.ts apps/api/src/__tests__/pipeline-latency.test.ts
```

**tuning** — 4 algorithm tuning files:
```bash
cd /home/user/ELOC2 && npx vitest run --reporter=verbose apps/api/src/__tests__/parameter-optimization.test.ts apps/api/src/__tests__/pipeline-validation-matrix.test.ts apps/api/src/__tests__/eo-test-matrix.test.ts apps/api/src/__tests__/single-fighter-continuity.test.ts
```

**store** — 1 Zustand store test file:
```bash
cd /home/user/ELOC2 && npx vitest run --reporter=verbose apps/workstation/src/__tests__/store-tests.test.ts
```

**simulator** — 4 simulator test files:
```bash
cd /home/user/ELOC2 && npx vitest run --reporter=verbose apps/simulator/tests/
```

**e2e** — 33 Playwright test files (requires server running on port 3001):
```bash
cd /home/user/ELOC2 && npx playwright test --config tests/e2e/playwright.config.ts
```

### Step 3: Parse Results

For each vitest run, extract from the output:
- **Total tests**: number of test cases executed
- **Passed**: tests that passed
- **Failed**: tests that failed (with file path and line number)
- **Skipped**: tests that were skipped
- **Duration**: wall-clock time

For failed tests, capture:
- File path (absolute)
- Test name
- Error message (first line)
- Line number if available

### Step 4: Generate Summary Report

Present results as a markdown table:

```
## QA Test Results — [scope] — [date]

| Category | Files | Tests | Passed | Failed | Skipped | Duration | Status |
|----------|-------|-------|--------|--------|---------|----------|--------|
| unit | 47 | ... | ... | ... | ... | ...s | PASS/FAIL |
| integration | 6 | ... | ... | ... | ... | ...s | PASS/FAIL |
| store | 1 | ... | ... | ... | ... | ...s | PASS/FAIL |
| simulator | 4 | ... | ... | ... | ... | ...s | PASS/FAIL |
| **Total** | **...** | **...** | **...** | **...** | **...** | **...s** | **...** |
```

### Step 5: Report Failures

If any tests failed, list them after the summary table:

```
### Failures

1. **packages/fusion-core/src/__tests__/correlation.test.ts:42** — `should correlate nearby observations`
   > Expected 3 but received 2

2. **apps/api/src/__tests__/integration.test.ts:118** — `tracks should reach confirmed status`
   > Timeout after 5000ms
```

### Step 6: Calculate Health Score

Compute: `score = (total_passed / total_tests) * 100` (excluding skipped from denominator).

Assign grade:
- **A**: score >= 95%
- **B**: score >= 85%
- **C**: score >= 70%
- **D**: score >= 50%
- **F**: score < 50%

Present at the end:

```
### Health Score: [grade] [score]% ([passed]/[total] passed)
```

### Step 7: Known Failures

Note: There are 2 pre-existing failures in `packages/sensor-instances` (radar-sensor and eo-sensor tests). These are known and should be flagged as "known issues" rather than regressions if they appear.

### Parallelization Strategy

When running `core` or `full` scope, launch independent categories in parallel:
- **Parallel group 1**: unit, store, simulator (no shared state)
- **Parallel group 2** (after group 1): integration (may need clean state)
- **Parallel group 3** (after group 2): stress, performance, tuning (heavy CPU)
- **Parallel group 4** (last, only in `full`): e2e (needs running server)

For single-category runs, just run that one category.

## Test Categories Reference

| Category | Command Pattern | Files | Description |
|----------|----------------|-------|-------------|
| unit | `npx vitest run packages/` | 47 | Package-level unit tests (fusion-core, geometry, registration, eo-*, sensor-*, etc.) |
| integration | `npx vitest run apps/api/src/__tests__/{integration,all-scenarios-usecase,eo-cueing-usecase,gp-sortie2-eo-deep,instructor-ux,report-e2e}.test.ts` | 6 | API pipeline integration tests |
| stress | `npx vitest run apps/api/src/__tests__/{green-pine-stress,eo-staring-stress,eo-pipeline-stages}.test.ts` | 3 | Load and stress tests |
| performance | `npx vitest run apps/api/src/__tests__/{performance,pipeline-latency}.test.ts` | 2 | Performance benchmarks |
| tuning | `npx vitest run apps/api/src/__tests__/{parameter-optimization,pipeline-validation-matrix,eo-test-matrix,single-fighter-continuity}.test.ts` | 4 | Algorithm parameter tuning |
| store | `npx vitest run apps/workstation/src/__tests__/` | 1 | Zustand store tests |
| simulator | `npx vitest run apps/simulator/tests/` | 4 | Simulator model tests |
| e2e | `npx playwright test --config tests/e2e/playwright.config.ts` | 33 | Playwright browser E2E (api, ui, scenarios, gcp) |

## Health Score Formula

```
score = (passed / (total - skipped)) * 100
```

| Grade | Threshold | Meaning |
|-------|-----------|---------|
| A | >= 95% | Excellent — ready for deploy |
| B | >= 85% | Good — minor issues, likely safe |
| C | >= 70% | Fair — investigate failures before deploy |
| D | >= 50% | Poor — significant issues, do not deploy |
| F | < 50% | Critical — major breakage |
