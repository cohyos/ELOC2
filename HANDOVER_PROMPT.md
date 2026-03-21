# ELOC2 — Next Session Handover Prompt

Copy-paste the following prompt to start the next Claude Code session on ELOC2.

---

## Handover Prompt

```
You are continuing development on ELOC2, an EO (Electro-Optical) C2 Air Defense Demonstrator.

## Project Summary
- Full-stack air defense C2 simulator: radar + EO + C4ISR sensor fusion → Recognized Air Picture (RAP)
- Live app: https://eloc2-820514480393.me-west1.run.app
- Monorepo: 17 packages + 3 apps (api, workstation, simulator)
- Tech: Node.js 22, TypeScript, Fastify 5, React 19, Leaflet, Zustand 5, Deck.gl, Vitest, pnpm workspaces

## Current State (as of 2026-03-21)
- All 9 build phases COMPLETE (fusion, registration, cueing, tasking, multi-target, triangulation, advanced fusion, workstation ~95%, scenarios partial)
- All 16 REQ items from Corrections & Upgrades Plan COMPLETE
- All 5 Enhancement Waves COMPLETE (foundation, UI+roles, detection, terrain+ASTERIX, environment+3D)
- All 7 Instructor/Operator UX requirements (REQ-17 through REQ-23) COMPLETE
- All System Updates COMPLETE (bug fixes, libraries, editor/planner, Leaflet migration)
- Map renderer: MapLibre replaced with Leaflet (Canvas 2D) — all rendering via native Leaflet layers
- 73 passing tests (integration, instructor-ux, report, performance)
- 28 knowledge base documents (10,000+ lines) in Knowledge_Base_and_Agents_instructions/

## Key Architecture Decisions
- Leaflet for all map rendering (MapLibre WebGL failed in Cloud Run production)
- DebugOverlay uses native Leaflet API (L.marker, L.polyline, L.circle, L.polygon)
- Deck.gl overlay for 3D altitude/trajectory visualization
- Event-sourced state via EventStore
- WebSocket broadcast for real-time RAP updates
- CARTO Dark Matter tiles (default)

## Important Files to Read First
1. CLAUDE.md — Full project instructions, architecture, conventions
2. HANDOVER.md — Current state, remaining gaps, architecture reference
3. Knowledge_Base_and_Agents_instructions/ELOC2_System_Updates_Plan.md — Latest updates status
4. Knowledge_Base_and_Agents_instructions/Chunk_index.md — Index of all design docs

## Remaining Work (priority order)
1. Playwright E2E browser smoke tests (tests/e2e/)
2. Integration tests (full pipeline: scenario → live-engine → validation)
3. Frontend React component unit tests
4. Cloud SQL auth enablement in production (currently AUTH_ENABLED=false)
5. Additional named scenarios (7 exist, plan called for 8+)

## Deployment
- Cloud Run service in me-west1, auto-deploys on merge to master
- Manual: gcloud builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) --project=eloc2demo
- AUTH_ENABLED=false in Cloud Run (no DB configured)
- Docker: 2-stage build, serves UI + API on port 3001

## Commands
- pnpm install && pnpm build — Install and build
- pnpm dev — Dev servers (workstation :3000, api :3001)
- pnpm test — Run all tests (73 passing)

## Branch
- Development branch: claude/review-knowledge-base-FTTzx
- Latest commit: 1858a10 (Refactor DebugOverlay to native Leaflet layers)
```

---

## Notes for the Next Agent

1. **Always read CLAUDE.md first** — it has comprehensive project instructions, architecture, conventions, and known issues.

2. **Knowledge Base is the source of truth** — 28 documents in `Knowledge_Base_and_Agents_instructions/` cover all domain logic. Consult the relevant doc before implementing anything.

3. **Map rendering**: All rendering goes through Leaflet native layers. Do NOT add MapLibre data layers — they were removed for a reason (WebGL failures in production).

4. **Testing**: Run `pnpm test` after any change. All 73 tests must pass.

5. **Deployment**: Never push to master without verifying locally. Use `docker build -t eloc2-test . && docker run -p 3001:3001 -e NODE_ENV=production eloc2-test` to test.

6. **GCP guardrails**: Enterprise Plus Cloud SQL edition — never use db-f1-micro/db-g1-small. Always set AUTH_ENABLED=false unless DB is configured.
