# Map Renderer Evaluation for ELOC2

## Document Info

| Field | Value |
|-------|-------|
| Author | ELOC2 Architecture Team |
| Date | 2026-03-19 |
| Status | Draft |
| Scope | Evaluate map rendering options for ELOC2 workstation |

---

## 1. Executive Summary

ELOC2's map rendering currently uses a **dual architecture**: MapLibre GL JS 5 provides
raster base map tiles, while a custom `DebugOverlay` component renders ALL data
visualization (tracks, sensors, coverage arcs, EO bearing rays, triangulation geometry,
trails, labels) using plain HTML divs and inline SVG. This architecture was adopted
after discovering that MapLibre's WebGL data layers are non-functional in the Cloud Run
production environment.

This document evaluates five rendering approaches against ELOC2's requirements:
Cloud Run compatibility, performance at 100+ entities, military symbology support,
3D capability, bundle size, and migration effort.

**Recommendation**: Keep the current MapLibre + DebugOverlay architecture for 2D
rendering. It works reliably in production and meets all current requirements. For
future 3D visualization needs, add Deck.gl as a separate WebGL overlay canvas —
it uses its own WebGL context independent of MapLibre's broken pipeline.

---

## 2. Current Architecture

### 2.1 How It Works Today

```
┌─────────────────────────────────────────────────┐
│  Browser Viewport                                │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  MapLibre GL JS (z-index: 0)               │  │
│  │  - CartoDB Dark Matter raster tiles         │  │
│  │  - Pan/zoom/rotate interactions             │  │
│  │  - NO data layers (WebGL broken in prod)    │  │
│  ├────────────────────────────────────────────┤  │
│  │  SVG Overlay (z-index: 14)                  │  │
│  │  - Coverage arcs (radar/EO ranges)          │  │
│  │  - EO bearing rays                          │  │
│  │  - FOV wedges                               │  │
│  │  - Triangulation geometry                   │  │
│  ├────────────────────────────────────────────┤  │
│  │  HTML Div Overlay (z-index: 15)             │  │
│  │  - Track markers (colored dots + labels)    │  │
│  │  - Sensor markers                           │  │
│  │  - Trail breadcrumbs                        │  │
│  │  - Ambiguity indicators                     │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 2.2 Key Components

| Component | File | Role |
|-----------|------|------|
| `MapView.tsx` | `apps/workstation/src/map/MapView.tsx` | Map container, layer initialization |
| `DebugOverlay.tsx` | `apps/workstation/src/map/DebugOverlay.tsx` | Primary renderer — HTML + SVG overlays |
| `track-layer.ts` | `apps/workstation/src/map/layers/track-layer.ts` | MapLibre track layer (inactive fallback) |
| `sensor-layer.ts` | `apps/workstation/src/map/layers/sensor-layer.ts` | MapLibre sensor layer (inactive fallback) |
| `triangulation-layer.ts` | `apps/workstation/src/map/layers/triangulation-layer.ts` | MapLibre triangulation layer (inactive fallback) |

### 2.3 Why WebGL Data Layers Broke

The full post-mortem is in `Blank_Map_Postmortem_and_Testing_Lessons.md`. Summary:

- MapLibre GL JS WebGL data layers (circles, lines, fills, symbols) render correctly
  in local development but produce blank/invisible output in the Cloud Run Docker
  container environment.
- Root cause is likely related to the headless Chrome/browser WebGL context in the
  containerized serving environment, combined with glyph/font loading failures that
  stall the entire WebGL rendering pipeline.
- This is NOT a MapLibre bug per se — it is an environment-specific WebGL context issue.
- The HTML/SVG overlay approach bypasses WebGL entirely, using `map.project()` to
  convert geo coordinates to screen pixels and rendering with standard DOM elements.

### 2.4 Current Approach: Strengths and Weaknesses

**Strengths**:
- Works reliably in all environments (local, Docker, Cloud Run)
- Simple to debug (DOM elements visible in browser DevTools)
- No WebGL dependency for data rendering
- Easy to add new visual elements (just HTML/CSS)
- Full CSS styling control (hover, transitions, animations)

**Weaknesses**:
- DOM-based rendering scales poorly beyond ~500 elements
- No hardware-accelerated rendering for data layers
- SVG geometry recalculation on every pan/zoom frame
- No native 3D perspective rendering
- Manual coordinate projection via `map.project()` on each frame
- No built-in clustering, heatmaps, or advanced visualization

---

## 3. Candidate Renderers

### 3.1 OpenLayers (Canvas 2D)

**Version**: 10.x | **License**: BSD-2-Clause | **Bundle**: ~400 KB gzipped

OpenLayers is a full-featured open-source mapping library that renders data layers
using Canvas 2D (not WebGL). This makes it immune to the WebGL issues affecting
MapLibre in Cloud Run.

| Aspect | Assessment |
|--------|------------|
| Rendering engine | Canvas 2D (primary), WebGL (optional for large point sets) |
| Cloud Run compat | High — Canvas 2D works everywhere |
| Entity capacity | 1,000+ with Canvas 2D, 100K+ with WebGL point layer |
| Military symbology | Via ol-military-symbology or custom styles |
| 3D support | Limited — 2.5D view with terrain, no true 3D globe |
| Tile sources | Excellent — supports all standard tile protocols |
| React integration | `@vis.gl/react-openlayers` or manual ref-based |
| Migration effort | **High** — complete rewrite of map component, different API paradigm |

**Key advantage**: Canvas 2D rendering is reliable across all environments. The vector
rendering pipeline is independent of WebGL context issues.

**Key risk**: Completely different API from MapLibre. All map interaction code, layer
management, and styling would need rewriting. The React ecosystem around OpenLayers
is less mature than MapLibre's.

### 3.2 Leaflet (HTML/SVG/Canvas)

**Version**: 1.9.x | **License**: BSD-2-Clause | **Bundle**: ~40 KB gzipped

Leaflet is the most widely used open-source mapping library, known for simplicity
and a vast plugin ecosystem. It renders data using HTML, SVG, or Canvas 2D.

| Aspect | Assessment |
|--------|------------|
| Rendering engine | SVG (default), Canvas 2D (via `preferCanvas`), HTML markers |
| Cloud Run compat | High — no WebGL dependency for core features |
| Entity capacity | 500-1,000 with SVG, 5,000+ with Canvas renderer |
| Military symbology | Via Leaflet.MilSymbol plugin (MIL-STD-2525) |
| 3D support | None — strictly 2D |
| Tile sources | Good — standard tile URL templates, WMS, WMTS |
| React integration | `react-leaflet` v4 — mature, well-documented |
| Migration effort | **Medium** — simpler API, but still a full rewrite |

**Key advantage**: Leaflet's default rendering model (HTML/SVG) is essentially what
ELOC2's DebugOverlay already does. Migration would formalize the current approach
within a well-supported framework.

**Key risk**: Leaflet's SVG rendering has the same scaling limitations as the current
DebugOverlay. Using `preferCanvas: true` helps but still does not match WebGL
performance. No path to 3D. Vector tiles require plugins.

### 3.3 Deck.gl (Separate WebGL Canvas)

**Version**: 9.x | **License**: MIT | **Bundle**: ~200 KB gzipped (core + layers)

Deck.gl is a GPU-powered visualization framework that creates its own WebGL canvas,
independent of any map library. It can overlay on MapLibre, Google Maps, or run
standalone.

| Aspect | Assessment |
|--------|------------|
| Rendering engine | WebGL 2 (own canvas and context) |
| Cloud Run compat | **Needs testing** — separate WebGL context may work even if MapLibre's fails |
| Entity capacity | 1M+ points, 100K+ icons, excellent GPU batching |
| Military symbology | Custom icon layers with sprite sheets |
| 3D support | Excellent — 3D arcs, columns, point clouds, terrain |
| Tile sources | Overlays on MapLibre/Google Maps for base tiles |
| React integration | `@deck.gl/react` — first-class React support |
| Migration effort | **Low-Medium** — can be added incrementally as overlay |

**Key advantage**: Deck.gl creates its own WebGL context separate from MapLibre. Even
if MapLibre's WebGL data pipeline is broken, Deck.gl's independent context may work.
It can be added incrementally — no need to replace the existing map library.

**Key risk**: If the Cloud Run WebGL issue is at the OS/driver level (not MapLibre-
specific), Deck.gl will have the same problem. Requires testing in the actual Cloud
Run environment. Also, Deck.gl does not render in the server-side Docker container —
it renders in the client browser, so the Cloud Run issue may not apply at all.

**Important clarification**: The WebGL issue is in the **client browser** connecting to
Cloud Run, not in the server container. The root cause was glyph CDN failures
disrupting MapLibre's internal rendering pipeline. Deck.gl, having no dependency on
MapLibre's glyph loading, would likely work correctly.

### 3.4 CesiumJS (3D Globe)

**Version**: 1.120+ | **License**: Apache-2.0 | **Bundle**: ~3 MB gzipped

CesiumJS is a 3D geospatial visualization platform providing a virtual globe with
terrain, 3D models, and time-dynamic visualization.

| Aspect | Assessment |
|--------|------------|
| Rendering engine | WebGL 2 with custom 3D engine |
| Cloud Run compat | **Uncertain** — heavy WebGL dependency, large asset loading |
| Entity capacity | 10K+ entities with optimization, LOD system |
| Military symbology | Via CZML or custom Entity graphics |
| 3D support | **Excellent** — true 3D globe, terrain, flight paths, sensor volumes |
| Tile sources | Cesium Ion, WMS, WMTS, custom tile providers |
| React integration | `resium` — React bindings for CesiumJS |
| Migration effort | **Very High** — completely different paradigm (3D globe vs 2D map) |

**Key advantage**: True 3D globe with terrain provides unmatched situational awareness
for air defense. Sensor coverage volumes, missile engagement envelopes, and aircraft
flight paths can be visualized in 3D.

**Key risk**: Massive bundle size (3 MB+), heavy WebGL requirements, significant
migration effort. The entire UI concept changes from a 2D map to a 3D globe.
Overkill for the current demonstrator scope.

### 3.5 Keep Current Approach (MapLibre + DebugOverlay)

| Aspect | Assessment |
|--------|------------|
| Rendering engine | HTML/SVG (DebugOverlay), raster tiles (MapLibre) |
| Cloud Run compat | **Proven** — works in production |
| Entity capacity | ~200-500 entities before performance degrades |
| Military symbology | Custom HTML/CSS markers (current) |
| 3D support | None |
| Tile sources | MapLibre raster tile support |
| React integration | Already integrated |
| Migration effort | **Zero** |

---

## 4. Evaluation Criteria

| # | Criterion | Weight | Description |
|---|-----------|--------|-------------|
| 1 | Cloud Run Compatibility | **Critical** | Must render correctly when served from Cloud Run |
| 2 | Entity Performance | High | Must handle 100+ tracks + sensors smoothly at 60fps |
| 3 | Military Symbology | Medium | MIL-STD-2525 or NATO APP-6 symbol support |
| 4 | 3D Capability | Low | 3D perspective, terrain, altitude visualization |
| 5 | Bundle Size | Medium | Impact on initial page load (<500 KB target) |
| 6 | Migration Effort | High | Development time to switch renderers |
| 7 | React Integration | Medium | Quality of React bindings, hook support |
| 8 | Maintenance Burden | Medium | Community size, release cadence, documentation |

---

## 5. Compatibility Matrix

| Criterion | MapLibre + DebugOverlay | OpenLayers | Leaflet | Deck.gl (overlay) | CesiumJS |
|-----------|:----------------------:|:----------:|:-------:|:-----------------:|:--------:|
| Cloud Run Compat | **Proven** | High | High | Likely | Uncertain |
| 100+ Entities | Good | Excellent | Good | Excellent | Good |
| 500+ Entities | Degrades | Good | Degrades | Excellent | Good |
| Mil Symbology | Manual CSS | Plugin | Plugin | Custom icons | Custom |
| 3D Support | None | Minimal | None | **Excellent** | **Excellent** |
| Bundle Size | ~200 KB | ~400 KB | ~40 KB | ~200 KB add | ~3 MB |
| Migration Effort | **None** | Very High | High | **Low** | Very High |
| React Quality | Good | Fair | Good | **Excellent** | Good |
| Community | Large | Large | **Very Large** | Large | Medium |
| WebGL Required | No (data) | No (Canvas) | No | Yes (own ctx) | Yes |

### Scoring (1-5, weighted)

| Criterion | Wt | Current | OpenLayers | Leaflet | Deck.gl+ | CesiumJS |
|-----------|:--:|:-------:|:----------:|:-------:|:--------:|:--------:|
| Cloud Run | 5 | **5** | 4 | 4 | 4 | 2 |
| Performance | 4 | 3 | 4 | 3 | **5** | 4 |
| Mil Symbology | 3 | 2 | 3 | 3 | 3 | 3 |
| 3D | 2 | 1 | 2 | 1 | **5** | **5** |
| Bundle Size | 3 | 4 | 3 | **5** | 4 | 1 |
| Migration | 4 | **5** | 1 | 2 | 4 | 1 |
| React | 3 | 4 | 3 | 4 | **5** | 4 |
| Maintenance | 3 | 4 | 4 | **5** | 4 | 3 |
| **Total** | | **99** | **81** | **86** | **111** | **71** |

*"Deck.gl+" means Deck.gl added as overlay to current MapLibre + DebugOverlay.*

---

## 6. Risk Assessment

### 6.1 Risk: Current Approach Hits Scale Limits

**Probability**: Medium (if ELOC2 grows to 500+ entities)
**Impact**: High (UI becomes unusable)
**Mitigation**: Add Deck.gl overlay for high-density layers (trails, heatmaps),
keep DebugOverlay for interactive elements (tracks, sensors).

### 6.2 Risk: Deck.gl WebGL Also Fails in Cloud Run

**Probability**: Low (Deck.gl renders client-side, independent of MapLibre pipeline)
**Impact**: High (blocks 3D capability)
**Mitigation**: Test Deck.gl in Cloud Run environment before committing to migration.
The Cloud Run WebGL issue was caused by MapLibre's glyph loading stalling its
internal WebGL pipeline. Deck.gl has no such dependency.

### 6.3 Risk: Full Renderer Migration Introduces Regressions

**Probability**: High (for OpenLayers or CesiumJS migration)
**Impact**: High (weeks of rework, broken interactions)
**Mitigation**: Avoid full migration. Use incremental overlay approach with Deck.gl.

### 6.4 Risk: DebugOverlay DOM Manipulation Conflicts with React

**Probability**: Low-Medium
**Impact**: Medium (rendering glitches, stale elements)
**Mitigation**: Current implementation uses `useEffect` cleanup properly. Direct DOM
manipulation is contained within DebugOverlay and does not conflict with React's
virtual DOM for the rest of the application.

### 6.5 Risk: Military Symbology Requirements Increase

**Probability**: Medium (if ELOC2 moves toward operational use)
**Impact**: Medium (significant rendering work for MIL-STD-2525 symbols)
**Mitigation**: Use `milsymbol` npm package to generate SVG symbols on demand.
Works with any renderer since it outputs standalone SVG.

---

## 7. Recommendation

### Primary: Keep MapLibre + DebugOverlay (No Change)

The current architecture is **proven in production**, handles ELOC2's entity scale
(typically 20-100 entities in demo scenarios), and requires zero migration effort.
The DebugOverlay approach, while unconventional, is reliable and maintainable.

There is no justification for a full renderer migration at this time. The risks
and effort of switching to OpenLayers, Leaflet, or CesiumJS outweigh the benefits
for a demonstrator application.

### Secondary: Add Deck.gl Overlay for 3D (When Needed)

When 3D visualization requirements materialize (altitude columns, engagement
envelopes, 3D flight paths), add Deck.gl as a **supplementary overlay**:

```
MapLibre (raster tiles) → DebugOverlay (2D markers/geometry) → Deck.gl (3D layers)
```

This is a low-risk, incremental addition:

1. Deck.gl creates its own WebGL canvas, independent of MapLibre
2. It integrates natively with React via `@deck.gl/react`
3. Specific layers can be migrated one at a time (e.g., trails first)
4. The DebugOverlay continues to work for all 2D rendering
5. Bundle size increase is ~200 KB, acceptable for the capability gained

### Not Recommended

- **OpenLayers**: Complete rewrite for marginal rendering improvement. Canvas 2D
  is better than SVG but not enough to justify the migration cost.
- **Leaflet**: Would formalize the current HTML/SVG approach within a framework
  but adds a dependency without solving the scale problem.
- **CesiumJS**: Massive overkill for a demonstrator. The 3 MB bundle, complex
  API, and full 3D globe paradigm are not warranted.

---

## 8. Migration Strategy (Deck.gl Overlay)

If/when the decision is made to add Deck.gl, follow this incremental approach:

### Phase 1: Proof of Concept (1 week)

1. Install `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react`, `@deck.gl/mapbox`
2. Create `DeckOverlay.tsx` component that mounts a Deck.gl canvas over the MapLibre map
3. Render a single `ScatterplotLayer` with track positions
4. Verify rendering works in Cloud Run deployment
5. Benchmark: compare frame rate with DebugOverlay at 100 entities

### Phase 2: Migrate Performance-Critical Layers (2 weeks)

Priority order for migration to Deck.gl:

| Layer | Current Renderer | Deck.gl Layer Type | Benefit |
|-------|-----------------|-------------------|---------|
| Track trails | DebugOverlay (HTML divs) | `ScatterplotLayer` | Hundreds of trail points, GPU-batched |
| Coverage arcs | DebugOverlay (SVG) | `PolygonLayer` | Complex geometry, hardware accelerated |
| EO bearing rays | DebugOverlay (SVG lines) | `LineLayer` | Many simultaneous rays |
| Triangulation | DebugOverlay (SVG) | `LineLayer` + `ScatterplotLayer` | Geometry-heavy |

Keep in DebugOverlay (interactive elements benefit from DOM):

| Layer | Reason to Keep |
|-------|---------------|
| Track markers | CSS hover states, click handlers, tooltips |
| Sensor markers | Same as above |
| Labels | CSS text rendering, font control |
| Selection highlights | CSS animations |

### Phase 3: 3D Layers (2-3 weeks)

New layers enabled by Deck.gl that are not possible with DebugOverlay:

- **Altitude columns**: `ColumnLayer` showing track altitude as vertical bars
- **3D flight paths**: `PathLayer` with altitude component
- **Sensor coverage volumes**: `SolidPolygonLayer` with 3D extrusion
- **Engagement envelopes**: `PolygonLayer` with altitude
- **Terrain-aware rendering**: Drape layers on terrain model

### Phase 4: Cleanup (1 week)

- Remove migrated layers from DebugOverlay
- Remove MapLibre fallback layer code (track-layer.ts, sensor-layer.ts, etc.)
- Update documentation and tests
- Performance benchmarking at 500+ entities

---

## 9. Performance Benchmarks (Estimated)

### Current Architecture (DebugOverlay)

| Entity Count | Frame Time | FPS | Notes |
|-------------|-----------|-----|-------|
| 50 | 4 ms | 60 | Smooth |
| 100 | 8 ms | 60 | Smooth |
| 200 | 16 ms | 60 | Borderline |
| 500 | 40 ms | 25 | Noticeable lag on pan/zoom |
| 1000 | 80 ms | 12 | Unusable |

### Projected with Deck.gl (GPU-rendered layers)

| Entity Count | Frame Time | FPS | Notes |
|-------------|-----------|-----|-------|
| 50 | 2 ms | 60 | Smooth |
| 100 | 3 ms | 60 | Smooth |
| 500 | 5 ms | 60 | Smooth |
| 1000 | 8 ms | 60 | Smooth |
| 5000 | 16 ms | 60 | Borderline |

*Estimates based on Deck.gl published benchmarks for ScatterplotLayer.*

---

## 10. References

| Reference | URL / Path |
|-----------|------------|
| MapLibre GL JS | https://maplibre.org/maplibre-gl-js/docs/ |
| Deck.gl | https://deck.gl/ |
| OpenLayers | https://openlayers.org/ |
| Leaflet | https://leafletjs.com/ |
| CesiumJS | https://cesium.com/cesiumjs/ |
| milsymbol (MIL-STD-2525) | https://www.spatialillusions.com/milsymbol/ |
| ELOC2 Blank Map Post-mortem | `Knowledge_Base_and_Agents_instructions/Blank_Map_Postmortem_and_Testing_Lessons.md` |
| ELOC2 Map/Workstation Spec | `Knowledge_Base_and_Agents_instructions/Map_simulation_and_workstation.md` |
| ELOC2 UI Requirements | `Knowledge_Base_and_Agents_instructions/ELOC2_UI_Requirements_and_VV_Spec.md` |
| Cloud Run Container Contract | https://cloud.google.com/run/docs/container-contract |
| React 19 | https://react.dev/ |
| Zustand 5 | https://docs.pmnd.rs/zustand/ |
