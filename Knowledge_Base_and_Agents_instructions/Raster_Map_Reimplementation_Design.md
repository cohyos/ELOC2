# Raster Map Reimplementation Design Document

**Status**: DESIGN ONLY — No code changes until all other phases are complete and explicit approval is given.
**Date**: 2026-03-20
**Prerequisite**: Completion of all bug fixes, UI enhancements, library work, and editor/planner upgrades.

---

## 1. Problem Statement

MapLibre GL JS v5 WebGL data layers (circles, lines, fills, symbols) are **completely non-functional** in the Cloud Run production Docker environment. The root cause is a WebGL context failure specific to containerized environments — not just a glyph/font issue.

**Current workaround**: DebugOverlay renders all data visualization via HTML divs (z-index 15) and SVG elements (z-index 14) positioned with `map.project()`. MapLibre is used **only** for raster tile display.

**Goal**: Restore full WebGL-accelerated data layer rendering (or a reliable alternative) while maintaining a safe rollback path.

---

## 2. Current Architecture

```
┌──────────────────────────────────────────────────┐
│ Browser Viewport                                  │
├──────────────────────────────────────────────────┤
│ Layer 0: MapLibre GL JS 5                         │
│   └── Raster tiles only (CARTO Dark / OSM)       │
├──────────────────────────────────────────────────┤
│ Layer 1: SVG Overlay (z-index: 14)               │
│   └── Coverage arcs, bearing rays, FOV,          │
│       triangulation, ballistic, zones             │
├──────────────────────────────────────────────────┤
│ Layer 2: HTML Overlay (z-index: 15)              │
│   └── Track/sensor markers, labels, trails,      │
│       ground truth, EO video popup               │
├──────────────────────────────────────────────────┤
│ Layer 3: Deck.gl Overlay (optional)              │
│   └── 3D altitude paths via separate WebGL ctx   │
└──────────────────────────────────────────────────┘
```

### Key files (1,271 lines of inactive MapLibre layer code):
- `track-layer.ts` (391 lines) — circles, trails, selection pulse
- `sensor-layer.ts` (205 lines) — sensor markers
- `coverage-layer.ts` (193 lines) — radar/EO arcs
- `triangulation-layer.ts` (119 lines) — bearing-to-track lines
- `investigation-ring-layer.ts` (79 lines) — zone rings
- `bearing-line-layer.ts` (62 lines) — active bearing lines
- `ambiguity-marker-layer.ts` (92 lines) — unresolved markers
- `selection-ray-layer.ts` (71 lines) — selection highlights
- `eo-ray-layer.ts` (59 lines) — gimbal rays

### Active rendering (DebugOverlay): ~1,008 lines
- `DebugOverlay.tsx` — Full HTML/SVG renderer for all visual elements

---

## 3. Candidate Rendering Approaches

### Option A: Fix MapLibre WebGL in Cloud Run

**Approach**: Investigate and resolve the root WebGL context failure.

| Aspect | Assessment |
|--------|-----------|
| **Root cause** | Unknown — could be GPU driver, Chrome headless, Docker GPU access |
| **Effort** | High uncertainty (1-5 days investigative, may not be fixable) |
| **Risk** | May be an upstream MapLibre/Chrome/Docker issue beyond our control |
| **Pros** | Restores GPU-accelerated rendering, existing layer code unchanged |
| **Cons** | May require GPU-enabled Cloud Run instances ($$$), fragile dependency |

**Recommendation**: Low priority. WebGL in headless containers is inherently unreliable.

### Option B: Leaflet + Canvas 2D Rendering

**Approach**: Replace MapLibre with Leaflet for tile management; render data layers via Canvas 2D.

| Aspect | Assessment |
|--------|-----------|
| **Effort** | 3-5 days |
| **Compatibility** | Works in ALL environments (no WebGL dependency for data layers) |
| **Performance** | Good up to ~1,000 entities; degrades beyond 5,000 |
| **Bundle** | Leaflet ~140KB (smaller than MapLibre ~750KB) |
| **Pros** | Proven reliable, huge ecosystem, Canvas 2D works everywhere |
| **Cons** | No 3D, no vector tiles, less smooth zoom transitions |

**Migration steps**:
1. Replace MapLibre init with Leaflet init
2. Port `map.project()` calls to `leaflet.latLngToContainerPoint()`
3. DebugOverlay continues working (just different projection API)
4. Optional: Convert SVG overlay to Leaflet's Canvas layer for better perf

### Option C: OpenLayers + Canvas 2D

**Approach**: Replace MapLibre with OpenLayers for both tiles and data layers.

| Aspect | Assessment |
|--------|-----------|
| **Effort** | 5-8 days (steeper API learning curve) |
| **Performance** | Excellent — built for GIS-scale data, Canvas 2D rendering |
| **Bundle** | ~300KB |
| **Pros** | Most capable GIS library, handles 10,000+ features natively |
| **Cons** | Heavier API, more complex integration, OL-specific paradigms |

### Option D: Keep Current Architecture (HTML/SVG + MapLibre tiles)

**Approach**: No renderer change. Continue with DebugOverlay as primary renderer.

| Aspect | Assessment |
|--------|-----------|
| **Effort** | 0 days |
| **Performance** | Adequate for current needs (50-100 entities), degrades at ~500 |
| **Pros** | Proven working, no risk, fully debuggable |
| **Cons** | DOM-heavy, no GPU acceleration, scaling ceiling |

---

## 4. Recommended Approach

**Primary: Option B (Leaflet)** with **Option D as permanent fallback**.

Rationale:
- Leaflet's Canvas renderer works in all environments including Cloud Run
- Smallest migration effort (3-5 days)
- DebugOverlay continues to work — Leaflet provides identical `project()` API
- Can be done incrementally: tile layer first, then optionally port SVG to Canvas
- Deck.gl overlay can coexist with Leaflet (separate WebGL context)

---

## 5. Rollback Strategy

### Pre-implementation safeguard
1. **Tag the current commit**: `git tag pre-raster-reimpl` before any changes
2. **Work on a dedicated branch**: `claude/raster-reimpl-XXXXX`
3. **Feature flag**: `RASTER_RENDERER=maplibre|leaflet` environment variable
4. **Dual init**: Both renderers available, flag selects which one initializes

### Rollback procedure
```bash
# Complete revert — returns to exact pre-implementation state
git checkout pre-raster-reimpl
# OR
git revert --no-commit HEAD~N  # Revert the N implementation commits
```

### Gradual rollback
- Set `RASTER_RENDERER=maplibre` to switch back without code changes
- DebugOverlay (HTML/SVG) works with both renderers — it's renderer-agnostic

---

## 6. Migration Plan (If Approved)

### Phase R-1: Leaflet tile layer (Day 1)
1. Install Leaflet: `pnpm add leaflet @types/leaflet`
2. Create `LeafletMap.tsx` alongside existing `MapView.tsx`
3. Initialize Leaflet with same CARTO Dark tiles
4. Port navigation controls (zoom, scale)
5. Port Ctrl+drag box zoom
6. Verify tiles render identically in Cloud Run

### Phase R-2: DebugOverlay integration (Day 2)
1. Update `map.project()` → `map.latLngToContainerPoint()` in DebugOverlay
2. Update `map.unproject()` → `map.containerPointToLatLng()`
3. Update `map.on('move')` → `map.on('moveend')`
4. Update `map.getZoom()`, `map.getBounds()` to Leaflet equivalents
5. Verify all markers, labels, SVG geometry renders correctly

### Phase R-3: Feature flag and swap (Day 3)
1. Add `RASTER_RENDERER` env var to Vite config
2. `MapView.tsx` conditionally loads MapLibre or Leaflet
3. Test both renderers locally
4. Deploy to Cloud Run with Leaflet as default
5. Verify in production

### Phase R-4: Cleanup (Day 4-5)
1. Port EditorMap and DeploymentView to Leaflet
2. Verify Ctrl+drag box zoom works on all maps
3. Test Deck.gl overlay compatibility
4. Optional: Port SVG overlay to Leaflet Canvas layer for performance
5. Remove MapLibre dependency (or keep as optional)

### Phase R-5: Validation
1. Full regression test — all views, all interactions
2. Cloud Run deployment test
3. Performance comparison (entity count, FPS, memory)
4. Document results

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Leaflet Canvas also fails in Cloud Run | High | Pre-test with Docker locally; Canvas 2D is CPU-based, no GPU needed |
| DebugOverlay incompatible with Leaflet projection | Medium | Port projection calls incrementally; test each element |
| Deck.gl conflicts with Leaflet | Low | Deck.gl uses own WebGL context, independent of map lib |
| Performance regression | Low | Leaflet Canvas handles 1,000+ entities; current need is ~100 |
| User-visible rendering differences | Low | Both use same tile provider; marker rendering is via DebugOverlay |

---

## 8. Decision Matrix

| Criterion (weight) | MapLibre Fix (A) | Leaflet (B) | OpenLayers (C) | Keep Current (D) |
|--------------------|:---:|:---:|:---:|:---:|
| Reliability (30%) | 2 | 9 | 9 | 10 |
| Performance (25%) | 10 | 7 | 9 | 4 |
| Effort (20%) | 2 | 8 | 5 | 10 |
| Rollback safety (15%) | 3 | 8 | 6 | 10 |
| Future-proof (10%) | 7 | 6 | 9 | 3 |
| **Weighted Total** | **4.4** | **7.9** | **7.5** | **7.4** |

**Winner**: Leaflet (Option B) with 7.9/10.

---

## 9. Files to Modify

| File | Change | Phase |
|------|--------|-------|
| `package.json` (workstation) | Add leaflet dependency | R-1 |
| `MapView.tsx` | Feature flag, conditional renderer | R-1, R-3 |
| `DebugOverlay.tsx` | Port `map.project()` → Leaflet equiv | R-2 |
| `ctrl-box-zoom.ts` | Port to Leaflet API | R-1 |
| `EditorMap.tsx` | Switch to Leaflet | R-4 |
| `DeploymentView.tsx` | Switch to Leaflet | R-4 |
| `DeckGlOverlay.tsx` | Verify Leaflet compatibility | R-4 |
| `MapView layer files (9 files)` | May be removed or kept as reference | R-4 |

---

## 10. Approval Required

This document is a **design specification only**. Implementation requires:
1. Completion of all other phases (bug fixes, UI, libraries, planner, editor)
2. Explicit user approval to proceed
3. Confirmation of the rollback tag name
4. Agreement on the feature flag approach

**No code changes will be made until approval is granted.**
