# Claude code prompt templates

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [Claude code prompt templates](#claude-code-prompt-templates)
- [Shared prefix](#shared-prefix)
- [Phase 1 template](#phase-1-template)
- [Phase 2 template](#phase-2-template)
- [Phase 3 template](#phase-3-template)
- [Phase 4 template](#phase-4-template)
- [Phase 5 template](#phase-5-template)
- [Phase 6 template](#phase-6-template)
- [Phase 7 template](#phase-7-template)
- [Phase 8 template](#phase-8-template)
- [Phase 9 template](#phase-9-template)
- [Final integrator template](#final-integrator-template)
- [Suggested usage note](#suggested-usage-note)

## Claude code prompt templates

This file provides copy paste ready prompts for Claude Code. Each prompt is tightly scoped to one roadmap phase and assumes the project already contains **EO C2 implementation specs**, **EO C2 build roadmap**, **EO C2 demo build knowledge base**, and the retrieval chunk files in **EO C2 retrieval chunks**.

## Shared prefix

Use this prefix before any phase prompt.

``` text
You are implementing one phase of an electro optical command and control air defense demo. The top level goal is to show that a recognized air picture from C4ISR sources can autonomously cue a network of EO investigators to scan radar tracks, support identification, resolve EO ambiguities, and build 3D EO plots when geometry allows. Work only within the requested phase scope. Read the listed project files first and treat them as the source of truth. Preserve modular service boundaries, explicit events, explicit API contracts, lineage, provenance, replay support, and honest uncertainty handling.

Output in this order:
1. Short implementation plan
2. Proposed file changes
3. Code changes
4. Tests
5. Assumptions
6. Risks and deferred work

Rules:
- Do not silently change unrelated phases
- Do not collapse service boundaries for convenience
- Do not hide degraded mode conditions
- Do not represent uncertain fusion or triangulation as hard truth
- Keep changes production minded and easy to extend
```

## Phase 1 template

``` text
Task: Implement phase 1, fusion core and recognized air picture.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/RAP fusion architecture

Build goals:
- ingest source observations and local tracks
- correlate them into persistent system tracks
- preserve lineage and provenance
- publish a recognized air picture projection
- support replay of track history

Required deliverables:
- source ingest models and validators
- correlation decision logic with reason codes
- system track store with create, update, merge, split, retire
- RAP snapshot API or projection
- replay support for a time window
- tests for multi radar correlation and lineage

Constraints:
- keep raw observations, local tracks, system tracks, and tasks separate
- every correlation decision must persist evidence, score, and method
- projection layer must read from core state, not own hidden state

Done means:
- two local radar tracks can become one system track
- system track lineage is queryable
- provenance is retained on updates
- replay reconstructs the recognized air picture over time

Do not implement EO cueing, tasking, or triangulation.
```

## Phase 2 template

``` text
Task: Implement phase 2, registration and timing health.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/Sensor registration and timing

Build goals:
- track per sensor bias and clock quality
- publish registration health
- gate precision fusion when registration is unsafe
- support replay tests with synthetic bias and timing faults

Required deliverables:
- registration state model
- clock bias and freshness tracking
- registration health API or projection
- fusion safety gating integration
- tests for angle bias and clock offset

Constraints:
- treat registration as an online state, not a one time setup
- expose health and freshness to other services
- degrade fusion honestly when registration is unsafe

Done means:
- biased sensors visibly degrade association or fusion quality
- improved registration improves replay results
- unsafe registration blocks or downgrades precision fusion
- per sensor health is available to the UI

Do not implement advanced EO logic here.
```

## Phase 3 template

``` text
Task: Implement phase 3, radar to EO cueing and basic investigation.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/Radar EO cueing and fusion

Build goals:
- issue EO cues from system tracks
- model gimbal state and field of view
- ingest EO investigation results
- support confirm, refine, no support, and split detected outcomes

Required deliverables:
- EO cue event and validator
- cue issuance service
- gimbal and field of view model
- EO report ingest
- cue and investigation projection for UI
- tests for cue validity and dwell timing

Constraints:
- cues must include predicted state, uncertainty gate, priority, and validity window
- EO search targets a region, not a point
- EO results cannot directly overwrite system tracks without explicit fusion

Done means:
- a system track can generate a valid EO cue
- an EO sensor can report confirm or no support
- cue validity windows are enforced
- the workstation can show active cues and outcomes

Do not implement advanced task ranking or deep heterogeneous fusion.
```

## Phase 4 template

``` text
Task: Implement phase 4, human supervised EO tasking.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/EO sensor tasking

Build goals:
- rank EO assignment candidates
- support recommended only, auto with veto, and manual modes
- expose assignment reasons and operator overrides

Required deliverables:
- task proposal generation
- task scoring with score breakdown
- approve, reject, and reserve controls
- task timeline projection
- tests for slew cost, occupancy cost, and geometry gain effects

Constraints:
- score must include threat, uncertainty reduction, geometry gain, operator intent, slew cost, and occupancy cost
- automation must remain vetoable
- explanations must be persisted for replay

Done means:
- several targets can compete for one EO sensor
- the winning task has a usable explanation payload
- operator override changes assignment behavior
- manual reservation blocks automatic assignment

Do not add crowded FOV logic or triangulation quality output beyond using geometry gain as an input.
```

## Phase 5 template

``` text
Task: Implement phase 5, EO multi target resolution.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/EO multi target resolution

Build goals:
- support one cue mapping to zero, one, or many EO tracks
- maintain unresolved groups
- preserve association hypotheses and lineage through time

Required deliverables:
- EO track entity
- unresolved group entity
- split and merge events
- association hypothesis representation
- projection for ambiguous EO scenes
- tests for split and reassociation behavior

Constraints:
- do not force hard certainty under ambiguity
- preserve lineage through split and merge
- allow downstream correction of earlier assumptions

Done means:
- a single cue can yield multiple EO tracks
- unresolved groups can later split into separate tracks
- replay explains reassociation and splitting
- UI ready state exposes ambiguity rather than hiding it

Do not add full track before detect unless narrowly needed for a test.
```

## Phase 6 template

``` text
Task: Implement phase 6, triangulation and 3D geometry.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/EO triangulation geometry

Build goals:
- estimate 3D target position from multiple EO bearings
- align inputs to common time
- publish uncertainty and geometry quality
- distinguish bearing only, candidate 3D, and confirmed 3D

Required deliverables:
- geometry estimate service
- common time alignment logic
- quality metrics including intersection angle and covariance size
- geometry projection for map overlays
- tests for weak and strong geometry cases

Constraints:
- never publish bare 3D without uncertainty and quality
- weak geometry must remain candidate only
- poor geometry should trigger need for more views

Done means:
- two EO bearing sets can produce a geometry estimate
- weak baseline cases stay visibly low confidence
- a third sensor can improve geometry in replay cases
- moving target tests use common time alignment correctly

Do not deeply fuse EO geometry back into radar tracks in this phase.
```

## Phase 7 template

``` text
Task: Implement phase 7, advanced radar and EO fusion.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/Radar EO cueing and fusion
- EO C2 retrieval chunks/Sensor registration and timing

Build goals:
- support confirmation only, conservative track fusion, and centralized measurement fusion where available
- handle asynchronous heterogeneous updates
- expose fusion mode and confidence state

Required deliverables:
- fusion mode selection logic
- conservative heterogeneous fusion path
- optional centralized measurement fusion path
- cross covariance aware quality handling or conservative fallback
- tests for asynchronous updates and overconfidence control

Constraints:
- do not treat heterogeneous asynchronous tracks as simple independent Cartesian tracks
- if cross covariance is uncertain, stay conservative
- unsafe registration must block precision fusion

Done means:
- the system can switch between confirmation only and fused tracking
- asynchronous updates remain stable
- conservative mode reduces overconfidence in tests
- fusion mode and confidence are visible to the workstation

Do not redesign core APIs unless strictly needed.
```

## Phase 8 template

``` text
Task: Implement phase 8, workstation and demo polish.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 retrieval chunks/Map simulation and workstation

Build goals:
- make the whole system legible to operators and viewers
- show map state, details, timeline, coverage, cueing, ambiguity, and degraded modes
- support replay and scenario control

Required deliverables:
- three pane workstation projection
- system track and optional local track layers
- sensor coverage, field of regard, and line of sight overlays
- tasking rationale and event timeline
- triangulation rays and geometry quality overlays
- latency and degraded mode indicators
- replay controls

Constraints:
- the UI must explain why the system acted as it did
- degraded mode and latency must be visible, not hidden
- the recognized air picture stays the default operational layer

Done means:
- a reviewer can explain why a sensor was assigned from the UI alone
- a reviewer can inspect why a track split or why 3D confidence dropped
- replay shows temporal state changes cleanly
- the UI remains readable in degraded and multi target cases

Do not invent UI state that is unsupported by domain events.
```

## Phase 9 template

``` text
Task: Implement phase 9, scenario library and validation suite.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- relevant files in EO C2 retrieval chunks

Build goals:
- make the demo repeatable and testable under normal and degraded conditions
- provide regression checks for track continuity, registration safety, geometry honesty, ambiguity handling, task explanations, and replay fidelity

Required deliverables:
- named scenario definitions for the roadmap scenario set
- machine readable validation outputs
- human readable validation summary
- regression harness for replay based checks
- tests for sensor bias and clock faults

Constraints:
- validate both success cases and honest failure modes
- degraded conditions must be exposed rather than hidden
- the suite should be easy to extend with new sensors, targets, and faults

Done means:
- each named scenario can run repeatedly
- validation clearly reports pass, fail, and explanation
- regressions catch overconfidence, hidden ambiguity, and silent degraded mode behavior
- the scenario suite is simple to extend
```

## Final integrator template

``` text
Task: Perform final integration review across completed phases.

Read these files first:
- EO C2 implementation specs
- EO C2 build roadmap
- EO C2 demo build knowledge base
- Claude agent build prompts
- all relevant retrieval chunks

Goals:
- verify service boundaries remain clean
- verify events and APIs still align across phases
- verify replay, lineage, provenance, and degraded mode visibility remain intact
- identify integration gaps, duplicated logic, and brittle interfaces

Required deliverables:
- integration findings report
- list of API mismatches
- list of event schema mismatches
- recommended cleanups by priority
- regression additions needed before demo release

Constraints:
- do not rewrite large areas without clear need
- prefer narrow interface fixes over architectural churn
- preserve research grounded honesty about uncertainty and degraded modes

Done means:
- the full system can be evaluated phase to phase without hidden contract drift
- integration risks are explicit and prioritized
- release blocking issues are clearly separated from nice to have cleanup
```

## Suggested usage note

A good operating pattern is:

1.  paste the shared prefix
2.  paste one phase template
3.  add any local repo details
4.  ask Claude Code to stop after tests and a handoff note

That keeps agents scoped and reduces spillover across phases.
