# Claude agent build prompts

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [Claude agent build prompts](#claude-agent-build-prompts)
- [Global instructions for all agents](#global-instructions-for-all-agents)
- [Phase 1 prompt](#phase-1-prompt)
  - [Fusion core and recognized air picture](#fusion-core-and-recognized-air-picture)
- [Phase 2 prompt](#phase-2-prompt)
  - [Registration and timing health](#registration-and-timing-health)
- [Phase 3 prompt](#phase-3-prompt)
  - [Radar to EO cueing and basic investigation](#radar-to-eo-cueing-and-basic-investigation)
- [Phase 4 prompt](#phase-4-prompt)
  - [Human supervised tasking](#human-supervised-tasking)
- [Phase 5 prompt](#phase-5-prompt)
  - [EO multi target resolution](#eo-multi-target-resolution)
- [Phase 6 prompt](#phase-6-prompt)
  - [Triangulation and 3D geometry](#triangulation-and-3d-geometry)
- [Phase 7 prompt](#phase-7-prompt)
  - [Advanced radar and EO fusion](#advanced-radar-and-eo-fusion)
- [Phase 8 prompt](#phase-8-prompt)
  - [Workstation and demo polish](#workstation-and-demo-polish)
- [Phase 9 prompt](#phase-9-prompt)
  - [Scenario library and validation suite](#scenario-library-and-validation-suite)
- [Suggested chunk mapping by phase](#suggested-chunk-mapping-by-phase)
- [Handoff note](#handoff-note)
- [References](#references)

## Claude agent build prompts

This file gives one scoped prompt per build phase for Claude code agents. Each prompt is tied to the project files **EO C2 implementation specs**, **EO C2 build roadmap**, and **EO C2 demo build knowledge base**. The prompts are written to keep agents focused on one coherent slice at a time while preserving the research grounded goal of a C4ISR driven EO demo that autonomously scans radar tracks, supports target identification, resolves EO ambiguities, and builds 3D EO plots when possible \[Joh05, Paw96, Ben07b, San01, Cor11, Oke01, Flo24\].

## Global instructions for all agents

Use these rules in every phase.

- Read **EO C2 implementation specs** first for service boundaries, events, and API contracts
- Read **EO C2 build roadmap** for phase scope and acceptance checks
- Read only the retrieval chunk files needed for the assigned phase
- Keep services modular and connected through explicit events rather than hidden shared state \[Flo24, Cor11, Wes18\]
- Preserve provenance, lineage, and replay support wherever state changes matter \[Dru93, Flo24\]
- Do not fake certainty in fusion, triangulation, or multi target resolution \[Joh05, San01, Cor19\]
- Surface degraded mode honestly when registration, geometry, or association quality is weak \[Joh05, Bel14, App00\]

Common output format for every agent:

1.  Short design note
2.  Proposed file tree
3.  Data model changes
4.  Event schemas added or changed
5.  API endpoints added or changed
6.  Core implementation
7.  Tests
8.  Known risks and deferred work

## Phase 1 prompt

### Fusion core and recognized air picture

Build the fusion core and recognized air picture slice described in **EO C2 build roadmap** phase 1 using the contracts in **EO C2 implementation specs** and the retrieval chunk **RAP fusion architecture**. The goal is to ingest source observations and local tracks from multiple radars or other C4ISR sources, correlate them into persistent system tracks, preserve lineage, and publish a clean recognized air picture \[Joh05, Dru93, Flo24\].

Required scope:

- Implement source ingest models and validators
- Implement correlation decisions with explicit reason codes
- Implement system track creation, update, merge, split, retirement, and lineage versioning
- Implement RAP snapshot projection for UI consumption
- Implement replay support for track history

Required constraints:

- Keep raw observations, local tracks, system tracks, and investigation tasks as separate entities \[Joh05\]
- Every correlation decision must persist score, method, and input evidence \[Dru93\]
- The RAP projection must be read only on top of core domain state \[Flo24\]

Done criteria:

- Two local radar tracks can converge into one system track
- Provenance is preserved for each system track update
- A replay window can reconstruct the RAP over time
- Merge and split lineage is queryable through API

Do not implement EO cueing, tasking, or triangulation in this phase.

## Phase 2 prompt

### Registration and timing health

Build the registration and timing slice described in **EO C2 build roadmap** phase 2 using **EO C2 implementation specs** and the retrieval chunk **Sensor registration and timing**. The goal is to estimate or represent per sensor bias and clock health, publish registration safety, and gate precision fusion when alignment quality is weak \[Oke01, Bel14, Wes18, Hoy24\].

Required scope:

- Implement registration state model per sensor
- Implement clock bias and freshness tracking
- Implement registration health projection and API
- Integrate registration safety checks into fusion decisions
- Add test scenarios with synthetic angle bias and clock offset

Required constraints:

- Registration is an online service, not a one time setup step \[Wes18\]
- Bias and timing quality must be exposed to the rest of the system \[Bel14\]
- Fusion must degrade gracefully when registration is unsafe \[Joh05\]

Done criteria:

- A biased sensor produces visible degraded association or fusion quality
- Corrected registration improves results in replay tests
- Precision fusion is blocked or downgraded when health is unsafe
- UI consumable health output exists per sensor

Do not implement EO algorithms here beyond the data needed for health gating.

## Phase 3 prompt

### Radar to EO cueing and basic investigation

Build the cueing and basic EO investigation slice described in **EO C2 build roadmap** phase 3 using **EO C2 implementation specs** and the retrieval chunk **Radar EO cueing and fusion**. The goal is to turn a system track into a time bounded EO cue, model gimbal and field of view state, and accept EO investigation results such as confirm, refine, no contact, or split detected \[Paw96, Guo02, Sko09\].

Required scope:

- Implement EO cue event and validation
- Implement cue issuance service from system tracks
- Implement gimbal state and field of view model
- Implement EO report ingest with outcomes confirm, refine, no support, and split detected
- Project cue and investigation state for workstation use

Required constraints:

- Cues must carry predicted state, uncertainty gate, priority, and validity window \[Paw96, Kal04\]
- EO search should target a region, not a point \[Paw96, Sko09\]
- EO results must not directly overwrite system tracks without an explicit fusion step \[Joh05\]

Done criteria:

- A system track can issue a valid cue to an EO sensor
- An EO sensor can report confirm or no support
- Cue validity and dwell timing are enforced
- Workstation projection shows active cues and recent outcomes

Do not implement advanced task ranking or deep heterogeneous fusion yet.

## Phase 4 prompt

### Human supervised tasking

Build the EO tasking planner slice described in **EO C2 build roadmap** phase 4 using **EO C2 implementation specs** and the retrieval chunk **EO sensor tasking**. The goal is to rank candidate EO assignments, support recommended only, auto with veto, and manual modes, and make assignment reasons legible to operators \[Ben07b, Kal04, Cum04, Her23\].

Required scope:

- Implement task proposal generation from active system tracks and sensor state
- Implement task scoring with clear score breakdown
- Implement operator approve, reject, and reserve controls
- Implement task timeline projection for UI use
- Add tests for slew cost, occupancy cost, and geometry gain effects

Required constraints:

- Planner must include threat, uncertainty reduction, geometry gain, operator intent, slew cost, and occupancy cost \[Ben07b, Her23\]
- Automation must remain vetoable by the operator \[Cum04\]
- Explanations must be persisted for later replay \[Kup94\]

Done criteria:

- The planner ranks at least several competing targets for one EO sensor
- The winning task includes a usable explanation payload
- Operator override changes assignment behavior and is visible in replay
- Manual reservation blocks automatic assignment

Do not add crowded FOV logic or triangulation quality scoring in this phase beyond using geometry gain as an input.

## Phase 5 prompt

### EO multi target resolution

Build the EO ambiguity handling slice described in **EO C2 build roadmap** phase 5 using **EO C2 implementation specs** and the retrieval chunk **EO multi target resolution**. The goal is to support one cue mapping to zero, one, or many EO tracks, maintain unresolved groups, and preserve multiple association hypotheses over time \[Cor11, Cho18, Cor19, Tar09\].

Required scope:

- Implement EO track entity
- Implement unresolved group entity
- Implement split and merge events with lineage
- Implement association hypothesis representation
- Implement projection for ambiguous and crowded EO scenes

Required constraints:

- Do not force hard certainty when data is ambiguous \[Cor11\]
- Preserve lineage through split and merge \[Cor19\]
- Allow downstream correction of upstream assumptions \[Cor11\]

Done criteria:

- A single cue can yield multiple EO tracks
- An unresolved group can later split into separate tracks
- Replay explains why reassociation or splitting occurred
- UI ready projections expose ambiguity rather than hiding it

Do not add full track before detect unless needed to support a narrow weak target test.

## Phase 6 prompt

### Triangulation and 3D geometry

Build the geometry slice described in **EO C2 build roadmap** phase 6 using **EO C2 implementation specs** and the retrieval chunk **EO triangulation geometry**. The goal is to estimate 3D target position from multiple EO bearing reports, publish uncertainty and geometry quality, and distinguish weak geometry from strong geometry \[Ham85, San01, Fer13\].

Required scope:

- Implement geometry estimate service
- Implement common time alignment for input bearings
- Implement geometry quality metrics such as intersection angle and covariance size
- Implement estimate classes bearing only, candidate 3D, and confirmed 3D
- Implement triangulation overlays for workstation projection

Required constraints:

- Never publish bare 3D without quality and uncertainty \[San01\]
- Weak geometry must remain candidate only \[Ham85, San01\]
- The engine should request or indicate need for more views when geometry is poor \[Fer13\]

Done criteria:

- Two EO bearing sets can produce a geometry estimate
- Weak baseline cases remain visibly low confidence
- A third sensor can improve geometry in replay cases
- Moving target tests use common time alignment correctly \[Ris01, Tia10\]

Do not deeply fuse EO geometry into radar tracks here beyond publishing geometry outputs.

## Phase 7 prompt

### Advanced radar and EO fusion

Build the advanced heterogeneous fusion slice described in **EO C2 build roadmap** phase 7 using **EO C2 implementation specs** and the retrieval chunk **Radar EO cueing and fusion** plus **Sensor registration and timing**. The goal is to support conservative radar and EO track fusion, optional centralized measurement fusion where available, and a confirmation only fallback when assumptions are weak \[Mal19, Yan19, Nai23, Qua22\].

Required scope:

- Implement fusion mode selection between confirmation only, conservative track fusion, and centralized measurement fusion where inputs support it
- Implement cross covariance aware quality handling or conservative fallback
- Integrate asynchronous update handling
- Project fusion mode and quality to the workstation

Required constraints:

- Do not treat heterogeneous asynchronous tracks as simple independent Cartesian tracks \[Mal19, Yan19\]
- If cross covariance is uncertain, stay conservative \[Qua22\]
- Unsafe registration must block precision fusion \[Joh05, Oke01\]

Done criteria:

- The system can switch cleanly between confirmation only and fused tracking
- Asynchronous update tests do not produce unstable fused tracks
- Overconfidence is reduced when conservative mode is used
- Workstation shows fusion mode and confidence state

Do not redesign the core APIs unless the existing contracts are insufficient. Extend them minimally.

## Phase 8 prompt

### Workstation and demo polish

Build the workstation slice described in **EO C2 build roadmap** phase 8 using **EO C2 implementation specs** and the retrieval chunk **Map simulation and workstation**. The goal is to make the full system legible to operators and viewers through map layers, details, and timeline views \[Pat09, Kup94, Flo24\].

Required scope:

- Implement a three pane workstation projection
- Show system tracks, optional local tracks, sensor coverage, field of regard, and line of sight
- Show cue state, tasking rationale, triangulation rays, and geometry quality
- Show ambiguity, split history, latency, and degraded mode indicators
- Implement replay and scenario controls

Required constraints:

- The UI must expose why the system acted as it did \[Kup94\]
- Degraded mode and latency must be shown rather than hidden \[App00, Flo24\]
- Display should prefer the recognized air picture as the default operational layer \[Flo24\]

Done criteria:

- A reviewer can explain why a sensor was assigned using the UI alone
- A reviewer can inspect why a track split or why 3D confidence dropped
- Replay shows state changes over time without hidden jumps
- The UI remains readable under multi target and degraded scenarios

Do not introduce speculative UI concepts that have no connection to the available domain events.

## Phase 9 prompt

### Scenario library and validation suite

Build the scenario and validation slice described in **EO C2 build roadmap** phase 9 using the implementation specs and all retrieval chunks relevant to the tests. The goal is to make the demo repeatable, inspectable, and robust under both normal and degraded conditions \[App00, Flo24\].

Required scope:

- Implement named scenario definitions for the roadmap scenario set
- Implement validation assertions for track continuity, registration safety, task explanation quality, geometry honesty, ambiguity handling, and replay fidelity
- Implement regression harness for replay based verification
- Produce machine readable validation outputs and human readable summaries

Required constraints:

- Validation should test both success and honest failure modes \[Joh05, San01, Cor19\]
- Fault scenarios must include sensor bias and clock offset \[Bel14, Oke01\]
- Tests should verify that the workstation exposes, rather than hides, degraded conditions \[App00, Flo24\]

Done criteria:

- Each named scenario can be executed repeatedly
- Validation outputs identify pass, fail, and explanation
- Regression runs catch overconfidence, hidden ambiguity, or silent degraded mode behavior
- The scenario suite is easy to extend with new tracks, sensors, and faults

## Suggested chunk mapping by phase

| Phase | Primary files to load |
|:---|:---|
| 1 | EO C2 implementation specs, EO C2 build roadmap, RAP fusion architecture |
| 2 | EO C2 implementation specs, EO C2 build roadmap, Sensor registration and timing |
| 3 | EO C2 implementation specs, EO C2 build roadmap, Radar EO cueing and fusion |
| 4 | EO C2 implementation specs, EO C2 build roadmap, EO sensor tasking |
| 5 | EO C2 implementation specs, EO C2 build roadmap, EO multi target resolution |
| 6 | EO C2 implementation specs, EO C2 build roadmap, EO triangulation geometry |
| 7 | EO C2 implementation specs, EO C2 build roadmap, Radar EO cueing and fusion, Sensor registration and timing |
| 8 | EO C2 implementation specs, EO C2 build roadmap, Map simulation and workstation |
| 9 | EO C2 implementation specs, EO C2 build roadmap, all relevant retrieval chunks |

## Handoff note

When one Claude agent finishes a phase, its handoff should include:

- implemented files
- event and API changes
- assumptions made
- known limits
- exact tests added
- what the next phase can safely rely on

That handoff discipline is a software engineering synthesis, but it fits the modular and replay centered logic supported by the underlying research base \[Flo24, Cor11, Joh05\].

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Ben07b\] A. Benaskeur and H. Irandoust, “Sensor Management for Tactical Surveillance Operations,” Nov. 01, 2007.

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Wes18\] M. Westenkirchner and M. Ger, “Joint Tracking and Registration in Multi-Target Multi-Sensor Surveillance Using Factor Graphs,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 1464–1471, Jul. 2018, doi: [10.23919/ICIF.2018.8455675](https://doi.org/10.23919/ICIF.2018.8455675).

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

\[Bel14\] D. Belfadel and R. W. Osborn, “Bias Estimation and Observability for Optical Sensor Measurements with Targets of Opportunity,” 2014.

\[App00\] “Approved for public release; distribution is unlimited. Dynamo: A Tool for Modeling Integrated Air Defense Systems.”

\[Hoy24\] S. J. Hoyt, W. D. Blair, and A. Lanterman, “Non-Linear Bias Mitigation in Multi-Sensor Multi-Track Fusion,” *2024 27th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2024, doi: [10.23919/FUSION59988.2024.10706450](https://doi.org/10.23919/FUSION59988.2024.10706450).

\[Guo02\] W. Guo, “Performance Analysis of Using an IRST Sensor Cueing a 3D Radar,” 2002.

\[Sko09\] P. Skoglar, “A Planning Algorithm of a Gimballed EO/IR Sensor for Multi Target Tracking,” 2009.

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Cum04\] M. Cummings, P. Mitchell, and T. Sheridan, “HUMAN SUPERVISORY CONTROL ISSUES IN NETWORK CENTRIC WARFARE,” 2004.

\[Her23\] M. Hernandez, Á. F. García-Fernández, and S. Maskell, “Nonmyopic Sensor Control for Target Search and Track Using a Sample-Based GOSPA Implementation,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 60, pp. 387–404, Aug. 2023, doi: [10.1109/TAES.2023.3324908](https://doi.org/10.1109/TAES.2023.3324908).

\[Kup94\] G. Kuperman, “Operator interface for a multi-sensor target acquisition system,” in *Proceedings of National Aerospace and Electronics Conference (NAECON’94)*, May 1994, pp. 638–645 vol.2. doi: [10.1109/NAECON.1994.332971](https://doi.org/10.1109/NAECON.1994.332971).

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Tar09\] A. Tartakovsky, A. P. Brown, and J. Brown, “Enhanced Algorithms for EO/IR Electronic Stabilization, Clutter Suppression, and Track-Before-Detect for Multiple Low Observable Targets,” Sep. 01, 2009.

\[Ham85\] S. Hammel and V. Aidala, “Observability Requirements for Three-Dimensional Tracking via Angle Measurements,” Mar. 01, 1985. doi: [10.1109/TAES.1985.310617](https://doi.org/10.1109/TAES.1985.310617).

\[Fer13\] M. H. Ferdowsi, “Passive Range Estimation Using Two and Three Optical Cameras,” Apr. 30, 2013. doi: [10.15866/iremos.v6i2.2441](https://doi.org/10.15866/iremos.v6i2.2441).

\[Ris01\] B. Ristic, S. Zollo, and S. Arulampalam, “Performance Bounds for Manoeuvring Target Tracking Using Asynchronous Multi-Platform Angle-Only Measurements,” 2001.

\[Tia10\] X. Tian and Y. Bar-Shalom, “On algorithms for asynchronous Track-to-Track Fusion,” *2010 13th International Conference on Information Fusion*, pp. 1–8, Jul. 2010, doi: [10.1109/ICIF.2010.5711956](https://doi.org/10.1109/ICIF.2010.5711956).

\[Mal19\] M. Mallick, K.-C. Chang, S. Arulampalam, and Y. Yan, “Heterogeneous Track-to-Track Fusion in 3-D Using IRST Sensor and Air MTI Radar,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 55, pp. 3062–3079, Feb. 2019, doi: [10.1109/TAES.2019.2898302](https://doi.org/10.1109/TAES.2019.2898302).

\[Yan19\] K. Yang, Y. Bar-Shalom, and P. Willett, “Track-to-Track fusion with cross-covariances from radar and IR/EO sensor,” *2019 22th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2019, doi: [10.23919/fusion43075.2019.9011439](https://doi.org/10.23919/fusion43075.2019.9011439).

\[Nai23\] V. Naidu, “Fusion Architectures for 3D Target Tracking Using IRST and Radar Measurements,” *Journal of Aerospace Sciences and Technologies*, Aug. 2023, doi: [10.61653/joast.v62i3.2010.502](https://doi.org/10.61653/joast.v62i3.2010.502).

\[Qua22\] C. Quaranta and G. Balzarotti, “Estimation of Consistent Cross-Covariance Matrices in a Multisensor Data Fusion,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 58, pp. 5456–5469, Dec. 2022, doi: [10.1109/TAES.2022.3172399](https://doi.org/10.1109/TAES.2022.3172399).

\[Pat09\] P. Patrick and T. W. Pearce, “OpenEOIR - An open source simulation based electro-optic sensor training environment prototype,” Dec. 01, 2009.
