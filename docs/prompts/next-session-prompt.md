# Next Session Prompt — ELOC2

Copy-paste this to start the next Claude Code session efficiently.

---

## The Prompt

```
Continue building ELOC2 — EO C2 Air Defense Demonstrator.

## Context
Read these files first (in this order):
1. `CLAUDE.md` — Architecture, completion status, gap plan, knowledge base index
2. `HANDOVER.md` — Detailed state, remaining gaps with file references
3. `docs/plans/gap-completion-plan.md` — Full gap analysis with implementation steps

## Current State
- Branch: `claude/eloc2-development-ElpmM` (27 commits ahead of master)
- All 146+ unit tests passing. Build clean.
- Phases 0–7 complete and wired. Phase 8 ~85%. Phase 9 partial.
- Geometry triangulation and advanced fusion are integrated in live-engine.

## Knowledge Base
The `Knowledge_Base_and_Agents_instructions/` folder has 15 design docs that are the source of truth for all domain logic. Always consult the relevant doc before implementing. See the table in CLAUDE.md for which doc maps to which feature.

## Priority Tasks (pick based on goal)

### If goal is "fix map and deploy":
1. Fix MapLibre GL v5 symbol rendering (map shows data in header but symbols blank)
   - Investigate glyph/font loading failure in `apps/workstation/src/map/layers/track-layer.ts`
   - Consider switching to circle-only layers (no text/symbols) as reliable fallback
   - DebugOverlay HTML markers exist as bypass — verify they work
   - Ref: `Knowledge_Base_and_Agents_instructions/Map_simulation_and_workstation.md`
2. Deploy: merge dev→master, Cloud Build auto-triggers, or manual `gcloud builds submit`

### If goal is "complete remaining features":
Work through gaps in CLAUDE.md "Gap Completion Plan" section, priority order:
3. Replay/timeline scrubbing (wire scrubber to WS elapsed time)
4. Ambiguity markers on map (visualize unresolved groups)
5. Per-sensor degraded indicators (broadcast registration states)
6. Integration tests (full pipeline: scenario → live-engine → assertions)
7. Missing API endpoints (replay seek, EO cue details, unresolved groups)

### If goal is "polish for demo":
8. Add remaining named scenarios (6 of 8 missing)
9. TrackDetail panel enhancements (fusion mode, ID support, split history)
10. Playwright E2E smoke test

## Conventions
- Dev branch: `claude/eloc2-development-ElpmM`
- pnpm workspaces + Turbo. `pnpm build && pnpm test` to verify.
- Track colors: confirmed=#00cc44, tentative=#ffcc00, dropped=#ff3333
- Event-sourced architecture. Branded types. 3D geometry honesty.
```

---

## Alternative Short Prompt (if resuming quickly)

```
Resume ELOC2 development. Read CLAUDE.md for full context — it has architecture, completion status, knowledge base index, and the prioritized gap completion plan. Branch: claude/eloc2-development-ElpmM. All tests pass. Focus on [YOUR GOAL HERE: fix map rendering / deploy / complete features / polish].
```
