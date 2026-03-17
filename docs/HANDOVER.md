# ELOC2 Handover Document

## Project State (2026-03-17)

**Branch**: `claude/eloc2-development-U3sup`
**Version**: v0.3.0
**Tests**: 146+ unit tests passing, 33 E2E specs
**Build**: Succeeds with `pnpm build`

## What's Done

- Full domain model: fusion-core, registration, EO cueing, tasking, multi-target, triangulation, geometry
- Live simulation engine with 9 scenarios (8 simple + central-israel complex)
- React workstation with MapLibre GL map, dark mode, track trails, coverage layers
- Click-to-select tracks/sensors with detail panels and action buttons
- WebSocket real-time streaming with RAF batching for performance
- RESTful API with operator controls (approve/reject tasks, priority tracks)
- Docker multi-stage build, Cloud Build pipeline, Cloud Run deployment

## What's NOT Done

1. **Deployment**: Latest fixes on branch are NOT deployed. Need `git merge` to master + Cloud Build
2. **Integration tests**: `tests/integration/` is scaffolded but empty
3. **Playwright E2E tests**: Defined in `tests/e2e/` but may need updating after round 3 changes
4. **Mobile responsive**: Basic mobile layout exists but some panels may not fit well

## How to Deploy

```bash
# 1. Merge dev branch to master
git checkout master
git pull origin master
git merge claude/eloc2-development-U3sup

# 2. Deploy via Cloud Build
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$(git rev-parse --short HEAD) \
  --project=eloc2demo

# Or just push to master — Cloud Build trigger will auto-deploy
git push origin master
```

## How to Continue Development

### Handover Prompt for New Claude Code Session

Copy this prompt to start a new session:

---

You are continuing development on ELOC2, an air defense C2 demonstrator. Read CLAUDE.md for full project context.

**Current branch**: `claude/eloc2-development-U3sup`
**Build**: `pnpm build` (all pass)
**Test**: `pnpm test` (146+ pass)

Recent changes (v0.3.0):
- Dark mode map (CartoDB Dark Matter tiles)
- Track trails (fading breadcrumb dots, max 5)
- System health in Overview panel (fusion mode, registration, online sensors)
- Action buttons in TrackDetailPanel (Investigate, Mark Priority)
- RAF batching in ReplayController for performance
- Pause sends final broadcast with running=false
- Demo button properly toggles off

Remaining work:
1. Deploy to Cloud Run (merge to master)
2. Write integration tests (tests/integration/)
3. Verify E2E tests after round 3 changes
4. Mobile UX polish

---

## Key Architecture Decisions

- **Event-sourced**: All state changes go through EventStore
- **Branded types**: `SystemTrackId`, `SensorId`, `Timestamp` prevent type mixing
- **Zustand stores**: Flat, no nested selectors, direct state access
- **MapLibre GL layers**: Circle+symbol layers for tracks/sensors, GeoJSON for coverage/rays
- **RAF batching**: WebSocket messages coalesced to single render frame
- **Dark mode**: Tile source swap (not CSS filter invert)
- **Track trails**: Position history in track-store, circle layer with opacity per age
