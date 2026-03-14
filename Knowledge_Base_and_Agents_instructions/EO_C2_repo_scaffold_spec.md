# EO C2 repo scaffold spec

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO C2 repo scaffold spec](#eo-c2-repo-scaffold-spec)
- [Repo shape](#repo-shape)
- [Top level intent](#top-level-intent)
- [Recommended internal module layout](#recommended-internal-module-layout)
  - [packages domain](#packages-domain)
  - [packages events](#packages-events)
  - [packages fusion core](#packages-fusion-core)
  - [packages eo tasking](#packages-eo-tasking)
  - [packages eo investigation](#packages-eo-investigation)
  - [packages geometry](#packages-geometry)
- [Apps detail](#apps-detail)
  - [apps workstation](#apps-workstation)
  - [apps simulator](#apps-simulator)
  - [apps api](#apps-api)
- [Docs layout](#docs-layout)
- [Naming rules](#naming-rules)
- [Ownership by phase](#ownership-by-phase)
- [Projection model](#projection-model)
- [Test layout](#test-layout)
- [Suggested first commit sequence](#suggested-first-commit-sequence)
- [Non goals for v1](#non-goals-for-v1)
- [Recommended implementation posture](#recommended-implementation-posture)
- [What success should feel like in the repo](#what-success-should-feel-like-in-the-repo)
- [References](#references)

## EO C2 repo scaffold spec

This scaffold is designed for the actual demo goal: a C4ISR recognized air picture autonomously cues a network of EO investigators to scan radar tracks, support target identification, resolve EO ambiguities, and build 3D EO plots when geometry allows \[Joh05, Paw96, Ben07b, San01, Cor11, Flo24\]. The structure keeps service boundaries clean, keeps replay and provenance first class, and lets Claude agents work phase by phase without stepping on each other \[Dru93, Cor11, Wes18\].

## Repo shape

``` text
repo
  apps
    workstation
    simulator
    api
  packages
    domain
    events
    schemas
    fusion-core
    registration
    eo-tasking
    eo-investigation
    geometry
    projections
    scenario-library
    validation
    shared-utils
  docs
    architecture
    scenarios
    api
    prompts
  tests
    integration
    replay
    regression
  scripts
  configs
```

## Top level intent

- `apps/workstation`
  - map, timeline, replay, tasking rationale, ambiguity display, 3D EO plot overlays \[Pat09, Kup94, Flo24\]
- `apps/simulator`
  - scenario runner, synthetic targets, synthetic sensors, delays, faults \[Cho00, App00, Flo24\]
- `apps/api`
  - thin HTTP layer over services and projections
- `packages/domain`
  - core entities such as system track, EO track, unresolved group, task, registration state \[Joh05, Cor19\]
- `packages/events`
  - canonical event types and event envelopes
- `packages/schemas`
  - validation for API payloads and event payloads
- `packages/fusion-core`
  - correlation, fusion, lineage, RAP generation \[Joh05, Dru93\]
- `packages/registration`
  - bias, timing, health gating \[Oke01, Bel14, Wes18\]
- `packages/eo-tasking`
  - autonomous scan logic, score breakdowns, operator veto support \[Ben07b, Kal04, Her23\]
- `packages/eo-investigation`
  - cue handling, EO reports, identification support, split and merge logic \[Paw96, Cor11, Cor19\]
- `packages/geometry`
  - EO triangulation, geometry quality, 3D EO plot generation \[Ham85, San01, Fer13\]
- `packages/projections`
  - read models for RAP, task timeline, sensor health, ambiguity, geometry
- `packages/scenario-library`
  - named scenarios and reusable sensor and target templates
- `packages/validation`
  - replay assertions, regression suite, demo readiness checks

## Recommended internal module layout

### packages domain

``` text
packages/domain
  src
    system-track
    source-track
    eo-track
    unresolved-group
    task
    geometry-estimate
    registration-state
    sensor-state
    lineage
```

Rule:

- domain types should be free of HTTP and UI concerns
- identifiers and status enums live here

### packages events

``` text
packages/events
  src
    source-observation-reported
    local-track-updated
    registration-state-updated
    correlation-decided
    system-track-updated
    eo-cue-issued
    eo-report-received
    geometry-estimate-updated
    task-decided
```

Rule:

- event names should stay stable once external agents depend on them
- every event carries event id, time, provenance, and source references where relevant \[Dru93, Flo24\]

### packages fusion core

``` text
packages/fusion-core
  src
    ingest
    correlation
    fusion
    track-management
    rap-projection
    replay
```

Rule:

- correlation logic and track management stay separate
- replay should reuse stored events rather than custom reconstruction code

### packages eo tasking

``` text
packages/eo-tasking
  src
    candidate-generation
    scoring
    policy
    operator-controls
    assignment
    timeline-projection
```

Rule:

- keep scoring pure and testable
- keep policy modes explicit: recommended only, auto with veto, manual \[Cum04\]

### packages eo investigation

``` text
packages/eo-investigation
  src
    cue-handling
    gimbal-model
    fov-model
    eo-reporting
    identification
    ambiguity
    split-merge
```

Rule:

- confirmation, identification support, and ambiguity handling belong together here
- do not bury split logic inside UI code \[Cor11, Cor19\]

### packages geometry

``` text
packages/geometry
  src
    time-alignment
    bearings
    triangulation
    quality
    projection
```

Rule:

- 3D output must always be paired with uncertainty and geometry quality \[San01, Fer13\]

## Apps detail

### apps workstation

``` text
apps/workstation
  src
    map
    timeline
    track-detail
    sensor-detail
    replay
    overlays
      coverage
      line-of-sight
      ambiguity
      geometry
      degraded-mode
```

### apps simulator

``` text
apps/simulator
  src
    scenarios
    targets
    sensors
      radar
      eo
      c4isr-source
    delays
    faults
    engine
```

### apps api

``` text
apps/api
  src
    routes
      source-observations
      local-tracks
      system-tracks
      registration
      tasks
      eo-cues
      eo-reports
      geometry
      replay
      view
    controllers
    adapters
```

## Docs layout

``` text
docs
  architecture
    service-boundaries
    event-model
    data-model
    replay-model
  scenarios
    single-target-cue-and-confirm
    ambiguous-fov-split
    good-geometry-3d-plot
    bad-geometry-degraded-case
    sensor-bias-and-clock-fault
  api
    contracts
  prompts
    claude-phase-prompts
```

## Naming rules

- use clear nouns for domain modules
- use action names for events
- use `kebab-case` for folders if codebase convention allows
- use stable ids such as `system_track_id`, `task_id`, `eo_track_id`
- do not shorten key concepts too early
  - prefer `registration-state` over `reg`
  - prefer `geometry-estimate` over `geo`

## Ownership by phase

| Phase | Main packages                                      |
|:------|:---------------------------------------------------|
| 1     | domain, events, schemas, fusion-core, projections  |
| 2     | registration, fusion-core, projections, validation |
| 3     | eo-investigation, events, schemas, projections     |
| 4     | eo-tasking, projections, validation                |
| 5     | eo-investigation, domain, projections              |
| 6     | geometry, projections, validation                  |
| 7     | fusion-core, registration, geometry, validation    |
| 8     | workstation, projections, api                      |
| 9     | simulator, scenario-library, validation            |

## Projection model

Keep UI reads out of core services.

``` text
packages/projections
  src
    rap-view
    task-timeline-view
    track-detail-view
    sensor-health-view
    ambiguity-view
    geometry-view
    replay-view
```

Rule:

- projections are disposable read models
- the source of truth remains domain state plus events \[Flo24\]

## Test layout

``` text
tests
  integration
    fusion-core
    registration
    eo-cueing
    eo-tasking
    eo-ambiguity
    geometry
  replay
    scenario-replays
  regression
    overconfidence
    hidden-ambiguity
    degraded-mode-visibility
```

Test priority:

- track lineage continuity \[Dru93\]
- registration gating \[Joh05, Oke01\]
- autonomous task explanation \[Ben07b, Cum04\]
- ambiguity persistence \[Cor11, Cor19\]
- weak geometry honesty \[San01, Ham85\]

## Suggested first commit sequence

1.  repo skeleton
2.  domain and events packages
3.  schemas and shared utils
4.  fusion-core slice
5.  registration slice
6.  eo-investigation cueing slice
7.  eo-tasking slice
8.  geometry slice
9.  workstation projections and UI
10. scenario-library and validation

## Non goals for v1

To keep the repo honest to the demo, these should stay out unless clearly needed.

- full production authentication stack
- premature microservice deployment complexity
- image processing realism beyond what the scenario and ambiguity logic need
- deep classification pipelines that are not needed for identification support display

## Recommended implementation posture

Start as a modular monorepo, not as many separately deployed services. The research supports modular reasoning and replayable event flows, but the demo does not need operational deployment complexity on day one \[Flo24, Cor11\]. A monorepo with strict package boundaries is the cleanest path for Claude agents and for later refactoring into deployable services.

## What success should feel like in the repo

A new agent should be able to answer these questions quickly.

- Where is the recognized air picture built
- Where are EO cues issued
- Where is autonomous scan logic implemented
- Where is identification support attached to EO outputs
- Where are ambiguities represented
- Where is 3D EO plot quality computed
- Where does the workstation get its replay views

If those answers are obvious from the folder structure, the scaffold is doing its job.

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Ben07b\] A. Benaskeur and H. Irandoust, “Sensor Management for Tactical Surveillance Operations,” Nov. 01, 2007.

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Wes18\] M. Westenkirchner and M. Ger, “Joint Tracking and Registration in Multi-Target Multi-Sensor Surveillance Using Factor Graphs,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 1464–1471, Jul. 2018, doi: [10.23919/ICIF.2018.8455675](https://doi.org/10.23919/ICIF.2018.8455675).

\[Pat09\] P. Patrick and T. W. Pearce, “OpenEOIR - An open source simulation based electro-optic sensor training environment prototype,” Dec. 01, 2009.

\[Kup94\] G. Kuperman, “Operator interface for a multi-sensor target acquisition system,” in *Proceedings of National Aerospace and Electronics Conference (NAECON’94)*, May 1994, pp. 638–645 vol.2. doi: [10.1109/NAECON.1994.332971](https://doi.org/10.1109/NAECON.1994.332971).

\[Cho00\] S. Choi and D. Wijesekera, “The DADSim air defense simulation environment,” *Proceedings. Fifth IEEE International Symposium on High Assurance Systems Engineering (HASE 2000)*, pp. 75–82, Nov. 2000, doi: [10.1109/HASE.2000.895444](https://doi.org/10.1109/HASE.2000.895444).

\[App00\] “Approved for public release; distribution is unlimited. Dynamo: A Tool for Modeling Integrated Air Defense Systems.”

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Bel14\] D. Belfadel and R. W. Osborn, “Bias Estimation and Observability for Optical Sensor Measurements with Targets of Opportunity,” 2014.

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Her23\] M. Hernandez, Á. F. García-Fernández, and S. Maskell, “Nonmyopic Sensor Control for Target Search and Track Using a Sample-Based GOSPA Implementation,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 60, pp. 387–404, Aug. 2023, doi: [10.1109/TAES.2023.3324908](https://doi.org/10.1109/TAES.2023.3324908).

\[Ham85\] S. Hammel and V. Aidala, “Observability Requirements for Three-Dimensional Tracking via Angle Measurements,” Mar. 01, 1985. doi: [10.1109/TAES.1985.310617](https://doi.org/10.1109/TAES.1985.310617).

\[Fer13\] M. H. Ferdowsi, “Passive Range Estimation Using Two and Three Optical Cameras,” Apr. 30, 2013. doi: [10.15866/iremos.v6i2.2441](https://doi.org/10.15866/iremos.v6i2.2441).

\[Cum04\] M. Cummings, P. Mitchell, and T. Sheridan, “HUMAN SUPERVISORY CONTROL ISSUES IN NETWORK CENTRIC WARFARE,” 2004.
