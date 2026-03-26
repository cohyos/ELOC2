# ELOC2 Comprehensive QA Review Report

**Date**: 2026-03-26
**Scope**: Full system review — backend, frontend, algorithms, security, physics, ICD, cross-module
**Method**: 6 parallel specialized QA agents + manual aggregation
**Policy**: Analysis and recommendations only — NO code changes

---

## Executive Summary

| Domain | CRIT | HIGH | MED | LOW | Total |
|--------|------|------|-----|-----|-------|
| Backend + Pipeline (QA1) | 3 | 7 | 12 | 8 | 30 |
| Frontend + UI (QA2) | 3 | 5 | 7 | 6 | 21 |
| Fusion + Algorithms (QA3) | 0 | 3 | 11 | 7 | 21 |
| Security (QA4) | 2 | 4 | 6 | 6 | 18 |
| Sensor Physics (QA5) | 0 | 1 | 6 | 9 | 16 |
| ICD + Messaging (QA6) | 0 | 1 | 5 | 8 | 14 |
| **TOTAL** | **8** | **21** | **47** | **44** | **120** |

**Overall Assessment**: The system is a high-quality demonstrator with genuine domain knowledge in fusion algorithms, IR physics, and EO sensor modeling. The critical issues are concentrated in two areas: (1) residual 1 Hz hardcoded assumptions not updated for the 15 Hz pipeline, and (2) security gaps when AUTH_ENABLED=false in production.

---

## CRITICAL Findings (8)

### C1. pushEvent() bypasses WS broadcast throttle [Backend]
**File**: `live-engine.ts:4674`
**Impact**: Each `pushEvent()` sends an individual WS message to all clients immediately. Called ~51 times across the codebase per tick cycle — 50-100+ unthrottled WS messages per tick at 15 Hz. This is the primary cause of frontend UI unresponsiveness.
**Fix**: Buffer events during tick, batch-send in finalizeTick or bundle with rap.update.

### C2. seek() uses step(1) instead of step(1/15) [Backend]
**File**: `live-engine.ts:1317`
**Impact**: Seek fast-forwards with 1-second steps while live play uses 1/15s steps. This produces fundamentally different track states — tracks confirmed during live play may not confirm during seek, and sensor observation counts differ by 15×.
**Fix**: Use step(1/15) in the seek loop.

### C3. eventEnvelopes array grows unboundedly [Backend]
**File**: `live-engine.ts:427`
**Impact**: ~150 envelopes/sec at 15 Hz. Over a 300s scenario: 45,000 entries. Never trimmed during running scenario. Memory leak for long/looped scenarios.
**Fix**: Cap at 2000 entries with slice in finalizeTick.

### C4. Unauthenticated ASTERIX listener endpoints [Security]
**File**: `asterix-routes.ts:70`
**Impact**: Any user can start a UDP listener and inject forged observations into the air defense picture. No auth guard on any of the 4 ASTERIX routes.
**Fix**: Add requireRole('instructor') to all ASTERIX routes.

### C5. Broken WebSocket authentication [Security]
**File**: `ws-events.ts:7-34`
**Impact**: WS handler reads `(request as any).session` which is never populated. All WS clients get full RAP picture regardless of auth state.
**Fix**: Validate session cookie/Bearer token from WS upgrade request headers.

### C6. ReplayController pause guard re-armed on every running=false [Frontend]
**File**: `ReplayController.ts:165`
**Impact**: `_pauseReceived = true` set on every `running=false` message, not just user-initiated pause. Can silently discard valid rap.snapshot messages arriving between pause and resume.
**Fix**: Only set `_pauseReceived` via `setPauseGuard(true)` from App, remove line 165.

### C7. GT trajectory reads stale data via imperative getState() [Frontend]
**File**: `DebugOverlay.tsx:1313`
**Impact**: `useGroundTruthStore.getState().trailHistory` called inside useEffect without subscribing to changes. GT trajectory polylines show stale data until another dependency triggers re-render.
**Fix**: Subscribe to trailHistory via hook selector and pass as dependency.

### C8. Auth disabled in production deployment [Security]
**File**: `cloudbuild.yaml:123`
**Impact**: `AUTH_ENABLED=false` hardcoded in Cloud Run deployment. Combined with C4 and C5, production has zero access control.
**Fix**: Enable auth with proper DATABASE_URL via Secret Manager.

---

## HIGH Findings (21)

### 15 Hz Compatibility (6 remaining hardcoded 1 Hz values)

| # | File | Issue | Impact |
|---|------|-------|--------|
| H1 | `live-engine.ts:1943` | `eoModule.tick(..., 1)` | EO module runs 15× too fast |
| H2 | `scenario-runner.ts:302-316` | `shouldSensorUpdate` modulo not scaled | Radar reports 15×/sec, EO 7.5×/sec |
| H3 | `radar-model.ts:290` | `tickIntervalSec ?? 1` | Radar noise 2.45× too low |
| H4 | `eo-model.ts:200` | `UPDATE_INTERVAL_SEC = 2` | Bearing noise 4× too low |
| H5 | `core-eo-detector.ts:256` | `predictDt = 2` | Prediction overshoots 15× |
| H6 | `live-engine.ts:2024` | Double-counting observations | Inflated system load metric |

### Algorithm Correctness (3)

| # | File | Issue | Impact |
|---|------|-------|--------|
| H7 | `fuser.ts:112` | Info-matrix fusion in lat/lon/alt, not ENU | ~15% east-west bias at 31°N |
| H8 | `kalman-filter.ts:113` | Log-determinant diagonal-only approximation | Corrupts IMM model selection |
| H9 | `bias-estimator.ts:46` | Bearing computed from origin (0,0) | Meaningless registration health |

### Security (4)

| # | File | Issue |
|---|------|-------|
| H10 | `docker-compose.yml:9` | Hardcoded DB credentials in version control |
| H11 | `auth-routes.ts:79` | Session ID in JSON response (defeats HttpOnly) |
| H12 | `auth-routes.ts:132` | No username input validation |
| H13 | `cloudbuild.yaml:123` | Auth disabled in production |

### Frontend (5)

| # | File | Issue |
|---|------|-------|
| H14 | `DebugOverlay.tsx` | Full layer rebuild on every WS update (clearLayers + re-add) |
| H15 | `DebugOverlay.tsx:377` | zoomingRef can get stuck true if zoomend doesn't fire |
| H16 | `App.tsx:534` | Polling active even when WS connected (redundant) |
| H17 | `MapView.tsx:242` | MapLibre fallback timer captures stale closure |
| H18 | `App.tsx:477` | Initial fetches lack cleanup on unmount |

### Other (3)

| # | File | Issue |
|---|------|-------|
| H19 | `mht-associator.ts:89` | MHT gating is placeholder — zeroes horizontal position |
| H20 | `operator-routes.ts` | Missing 'missile'/'rocket' in VALID_CLASSIFICATIONS |
| H21 | Sensor Physics | BM IR values ambiguous (boost vs reentry phase) |

---

## MEDIUM Findings (47) — Grouped by Theme

### Memory & Performance (8)
- injectionLog unbounded (live-engine.ts:780)
- decisionChains trimming may not execute (live-engine.ts:491)
- O(n²) target lookup in ScenarioRunner (scenario-runner.ts:139)
- WS ghost clients in wsClientInfos after send failure (live-engine.ts:6041)
- Trail history creates new Map + copies arrays every update (track-store.ts:89)
- DeckGlOverlay dead code adds ~200KB to bundle
- App component has 60+ hook calls causing frequent re-renders
- tickLatencies uses O(n) Array.shift() in hot path

### Algorithm Quality (11)
- Kalman covariance missing Joseph stabilization form
- CT model process noise simplified (no turn-rate uncertainty)
- Correlator gate (25.0) extremely permissive with 5000m² floor
- Correlator process noise (baseQ=500) fights fuser
- Covariance Intersection omega search coarse (11 points)
- SystemFuser tick-based miss count incompatible with radar scan periods
- EO CORE publishes hardcoded 100m² covariance
- EO track update uses 70/30 alpha-blend ignoring quality
- Multi-bearing weighting doesn't penalize parallel geometry
- Cross-sensor matching depends on simulator targetIds
- Slant path can produce unrealistic values at very low elevation

### Physics & Simulation (6)
- D* value (4×10¹⁰) is 10× lower than production InSb
- Night-time penalty INVERTED for MWIR (penalizes when should boost)
- Radar Pd double-counts RCS (rcsBoost after range scaling)
- Rain attenuation 2× too high for S-band
- Weather model incomplete (missing temperature, aerosol type, scintillation)
- Cloud ceiling defined but never used in detection

### Security (6)
- Rate limiter in-memory, bypassable across instances
- trustProxy not set (IP-based features use proxy IP)
- Cookies unsigned, no __Host- prefix
- CORS allows credentials with dynamic origin reflection
- GET deployment endpoints lack auth
- Session cleanup never runs (expired sessions accumulate)

### ICD & Messaging (5)
- scenarioId missing from rap.update (only in snapshot)
- scenarioDurationSec never synced to frontend (timeline scrubber wrong)
- beforeAfterComparison field name inconsistent between snapshot/update
- pipelineHealth broadcast but never consumed
- Scenario type definitions duplicated with drift

### Other (11)
- Cover-zone detection uses Math.random() instead of seeded RNG
- Injected targets mutate shared scenario definition directly
- Fault injection uses wall-clock setTimeout (breaks at speed changes)
- TrackManager meta accessed via `as any` cast
- sensorLibrary/targetLibrary loaded once, never refreshed
- formatTime recreated every render
- Keyboard handler recreated on every simElapsed change
- 120ms disambiguation debounce may feel slow
- Scenario select dropdown lacks aria-label
- Context menu lacks ARIA roles
- Header buttons lack ARIA labels

---

## Positive Findings

The review identified significant strengths:

### Algorithms
- IMM implementation correctly follows Blom & Bar-Shalom canonical formulation
- Bayesian existence calculator correctly implements IPDA
- Two-bearing CPA triangulation geometrically correct
- Johnson DRI correctly distinguishes point-source vs resolved modes
- Quality scorer thresholds well-calibrated against GDOP analysis

### Physics
- Beer-Lambert atmospheric model with proper MWIR extinction
- Slant-path integral analytically correct
- Frame integration gain (√N) properly applied
- Target library IR/RCS values consistent with published data
- Terrain SRTM loader and LOS ray-march correctly implemented

### Security (done well)
- SQL injection prevented via parameterized queries throughout
- bcryptjs 12 rounds password hashing
- Path traversal mitigation with resolve containment
- Non-root Docker container with HEALTHCHECK
- Source map stripping in production
- Log redaction for sensitive fields
- WS connection limit (50 clients)
- Body size limit (10MB)

### Architecture
- Clean monorepo structure with proper package boundaries
- Event-sourced state changes via EventStore
- Sensor Bus EventEmitter ready for Redis upgrade
- Distributed pipeline proves new architecture E2E

---

## Implementation Plan — Priority Order

### Phase 1: Critical Fixes (estimated 2-3 hours)
1. **C1**: Buffer pushEvent() calls, batch-send in finalizeTick
2. **C2**: Fix seek() to use step(1/15)
3. **C3**: Cap eventEnvelopes at 2000
4. **C6**: Remove pause guard re-arm on running=false
5. **C7**: Subscribe to GT trailHistory properly
6. **H1-H6**: Fix all 6 remaining 1 Hz hardcoded values

### Phase 2: Algorithm Fixes (estimated 3-4 hours)
7. **H7**: Convert fuseObservation() to ENU before information-matrix fusion
8. **H8**: Use Cholesky-based log-determinant for IMM
9. **H9**: Fix bias estimator to compute bearing from sensor position
10. EO CORE: Use actual triangulation covariance instead of hardcoded 100m²
11. Night-time MWIR modifier: change from 0.4× penalty to 1.0-1.2× boost
12. Remove radar Pd rcsBoost double-counting

### Phase 3: Security Hardening (estimated 2-3 hours)
13. **C4**: Auth guard on ASTERIX routes
14. **C5**: WS authentication on upgrade
15. **C8**: Enable auth in production cloudbuild.yaml
16. Remove session ID from login response body
17. Add username validation (alphanumeric, 3-64 chars)
18. Set trustProxy: true on Fastify

### Phase 4: Performance Optimization (estimated 4-6 hours)
19. **H14**: Differential layer updates in DebugOverlay (move markers, don't rebuild)
20. Remove DeckGlOverlay dead code (saves ~200KB bundle)
21. Extract App header into separate component (reduces re-renders)
22. Guard polling with wsConnected check
23. Add zoomingRef safety timeout

### Phase 5: ICD & Type Cleanup (estimated 2 hours)
24. Add missile/rocket to VALID_CLASSIFICATIONS
25. Sync scenarioDurationSec to frontend
26. Remove unconsumed WS broadcast fields (dwellStates, revisitSchedule, etc.)
27. Consolidate scenario type definitions (delete simulator duplicate)

### Phase 6: Documentation (estimated 3-4 hours)
28. Write System User Manual (timed out — needs dedicated session)
29. Update CLAUDE.md with QA findings and current status
30. Update Knowledge Base chunk index

---

## Appendix: Files Modified Since Last CLAUDE.md Update

| Category | Files Changed | Key Changes |
|----------|--------------|-------------|
| Pipeline | live-engine.ts | 15 Hz tick, WS 2 Hz throttle, search mode fix |
| Physics | ir-detection.ts | D*-based SNR, slant path atmosphere, sensor profiles |
| Scenarios | green-pine-defense.ts, eo-advantage.ts | Optimal sensor geometry, IR emission data, eoSpec |
| Frontend | DebugOverlay.tsx, ReplayController.ts, App.tsx | Click fixes, pause guard, zoom fix |
| Stores | track-store.ts, ground-truth-store.ts | Full trajectory accumulation |
| Types | scenario.ts (simulator + scenario-library) | eoSpec, irEmission fields |
| KB | EO_Staring_Sensor_Deployment_Geometry.md | Optimal 3×360° triangle analysis |
| Tests | hz10-evaluation.test.ts, ir-detection.test.ts, ws-broadcast-rate.test.ts | Frequency eval, IR physics, WS rate |
