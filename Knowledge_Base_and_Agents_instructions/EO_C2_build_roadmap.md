# EO C2 build roadmap

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO C2 build roadmap](#eo-c2-build-roadmap)
- [Phase 1](#phase-1)
  - [Fusion core and recognized air picture](#fusion-core-and-recognized-air-picture)
- [Phase 2](#phase-2)
  - [Registration and timing health](#registration-and-timing-health)
- [Phase 3](#phase-3)
  - [Radar to EO cueing and basic investigation](#radar-to-eo-cueing-and-basic-investigation)
- [Phase 4](#phase-4)
  - [Human supervised tasking](#human-supervised-tasking)
- [Phase 5](#phase-5)
  - [EO multi target resolution](#eo-multi-target-resolution)
- [Phase 6](#phase-6)
  - [Triangulation and 3D geometry](#triangulation-and-3d-geometry)
- [Phase 7](#phase-7)
  - [Advanced fusion of radar and EO tracks](#advanced-fusion-of-radar-and-eo-tracks)
- [Phase 8](#phase-8)
  - [Workstation and demo polish](#workstation-and-demo-polish)
- [Phase 9](#phase-9)
  - [Scenario library and validation suite](#scenario-library-and-validation-suite)
- [Build staffing pattern](#build-staffing-pattern)
- [Recommended milestone cuts](#recommended-milestone-cuts)
- [References](#references)

## EO C2 build roadmap

This roadmap orders the demo so that each phase yields a coherent system slice. The target demonstration is that a recognized air picture from C4ISR sources can autonomously cue a network of electro optical investigators to scan radar targets, support target identification, resolve EO image ambiguities, and build a 3D electro optical plot when geometry permits \[Joh05, Paw96, Ben07b, San01, Cor11, Flo24\]. The sequence follows the research logic of air defense fusion systems: first establish a recognized air picture, then add electro optical cueing and tasking, then add hard geometry and ambiguity handling, and only then polish the operator workstation \[Joh05, Paw96, Kal04, San01, Cor11, Flo24\].

## Phase 1

### Fusion core and recognized air picture

Goal: build one trusted system track picture from radar and other C4ISR inputs \[Joh05, Dru93\].

Deliverables:

- Source ingest for observations and local tracks
- Correlation and fusion service
- System track store with lineage
- RAP snapshot endpoint
- Replay of track history on the map

Acceptance checks:

- Local tracks from multiple radars can be associated into one system track
- Track number continuity survives ordinary crossings and handoffs
- Every system track update keeps provenance and confidence change
- Registration state can gate fusion confidence \[Joh05, Oke01\]

Why first:

Nothing else is reliable without a stable system picture. Cueing, tasking, and EO investigation all depend on this layer \[Joh05, Flo24\].

## Phase 2

### Registration and timing health

Goal: make cross sensor fusion safe enough to trust \[Oke01, Bel14, Wes18\].

Deliverables:

- Per sensor bias state
- Clock health state
- Registration safe and unsafe gating
- UI overlay for sensor health

Acceptance checks:

- Synthetic bias creates visible degradation
- Registration correction improves association and fused track quality
- Unsafe registration prevents precision fusion and marks tracks accordingly \[Joh05, Hoy24\]

Why second:

Without this phase, later EO fusion and triangulation can look precise while being wrong \[Joh05, Bel14\].

## Phase 3

### Radar to EO cueing and basic investigation

Goal: turn system tracks into autonomous EO investigations \[Paw96, Guo02\].

Deliverables:

- Cue issuance service
- Gimbal state and FOV model
- EO report ingest
- EO confirmation, identification support, and no contact outcomes
- Cue validity windows and dwell logic

Acceptance checks:

- A system track can generate a time bounded EO cue
- EO sensors slew into an uncertainty gate rather than a point target
- EO reports can confirm, refine, or reject a cue \[Paw96, Sko09\]

Why here:

This phase makes the system visibly interactive while still relying on simple EO outputs.

## Phase 4

### Human supervised tasking

Goal: allocate scarce EO sensors in a way that looks operationally credible while supporting autonomous scan through radar targets \[Ben07b, Kal04, Cum04\].

Deliverables:

- Ranked task proposals
- Recommended only, auto with veto, and manual modes
- Operator reservation and override controls
- Task explanation panel with score breakdown

Acceptance checks:

- The planner explains why one track won over another
- Slew cost, dwell cost, and geometry gain affect assignment choice
- Operator overrides are preserved in the task timeline \[Her23, Sko09\]

Why here:

Tasking is more persuasive once cueing exists and the operator can see the effect of assignments.

## Phase 5

### EO multi target resolution

Goal: handle crowded fields of view without fake certainty \[Cor11, Cho18, Cor19\].

Deliverables:

- EO track entity
- Unresolved group entity
- Split and merge logic
- Association hypotheses and lineage
- UI display for ambiguous cases

Acceptance checks:

- One incoming cue can produce more than one EO track
- The system can hold unresolved groups before later split
- History shows why a split or reassociation occurred \[Cor19, Tar09\]

Why here:

This is the first phase where the EO subsystem behaves like a true investigator rather than a binary confirmation sensor.

## Phase 6

### Triangulation and 3D geometry

Goal: derive 3D electro optical target plots from multiple EO bearings with honest quality measures \[Ham85, San01, Fer13\].

Deliverables:

- Bearing based geometry engine
- Geometry quality score
- Candidate and confirmed 3D states
- Triangulation overlays on the map

Acceptance checks:

- Weak geometry does not appear as hard 3D truth
- The system requests more views when the baseline is poor
- Moving target triangulation uses common time alignment \[Ris01, Tia10\]

Why after multi target resolution:

Triangulation quality depends on the integrity of the EO tracks being paired.

## Phase 7

### Advanced fusion of radar and EO tracks

Goal: move from confirmation style EO use to deeper heterogeneous fusion \[Mal19, Yan19, Nai23\].

Deliverables:

- Conservative track to track fusion mode
- Optional centralized measurement fusion mode
- Cross covariance aware quality controls
- Fallback confirmation only mode

Acceptance checks:

- The system can switch between confirmation only and fused tracking
- Ignoring cross covariance produces visible overconfidence in test scenarios
- Conservative fusion remains stable under asynchronous updates \[Yan19, Qua22\]

Why here:

This phase is algorithmically harder and should be added after the workflow and track logic are already stable.

## Phase 8

### Workstation and demo polish

Goal: make system behavior legible to operators and viewers \[Pat09, Kup94, Flo24\].

Deliverables:

- Three pane workstation with map, details, and timeline
- Coverage overlays and FOV footprints
- Track evidence view
- Latency and fault overlays
- Replay and scenario controls

Acceptance checks:

- A user can explain why a sensor was tasked
- A user can inspect why a track split or why 3D confidence dropped
- The UI never hides degraded mode conditions \[App00, Flo24\]

## Phase 9

### Scenario library and validation suite

Goal: make the demo repeatable and credible.

Scenario set:

- Single target cue and confirm
- Crossed tracks from two radars
- Low altitude clutter case
- One cue and two EO objects
- Good triangulation geometry
- Bad triangulation geometry
- Sensor bias and clock offset fault
- Operator override against auto tasking

Validation focus:

- Track continuity
- Registration safety
- Task explanation quality
- Geometry honesty
- Ambiguity handling
- Replay fidelity

## Build staffing pattern

| Phase  | Best agent focus                      |
|:-------|:--------------------------------------|
| 1 to 2 | Backend systems and estimation agents |
| 3 to 4 | Integration and tasking agents        |
| 5 to 7 | Tracking and geometry agents          |
| 8 to 9 | UI and validation agents              |

## Recommended milestone cuts

- Milestone A: phases 1 to 3
- Milestone B: phases 4 to 6
- Milestone C: phases 7 to 9

Milestone A yields a credible radar to EO cueing demo. Milestone B yields a professional autonomous EO investigation workflow. Milestone C yields the most research faithful version of the system, including ambiguity resolution and 3D EO plot generation \[Joh05, Paw96, Cor11, Flo24\].

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Ben07b\] A. Benaskeur and H. Irandoust, “Sensor Management for Tactical Surveillance Operations,” Nov. 01, 2007.

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Bel14\] D. Belfadel and R. W. Osborn, “Bias Estimation and Observability for Optical Sensor Measurements with Targets of Opportunity,” 2014.

\[Wes18\] M. Westenkirchner and M. Ger, “Joint Tracking and Registration in Multi-Target Multi-Sensor Surveillance Using Factor Graphs,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 1464–1471, Jul. 2018, doi: [10.23919/ICIF.2018.8455675](https://doi.org/10.23919/ICIF.2018.8455675).

\[Hoy24\] S. J. Hoyt, W. D. Blair, and A. Lanterman, “Non-Linear Bias Mitigation in Multi-Sensor Multi-Track Fusion,” *2024 27th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2024, doi: [10.23919/FUSION59988.2024.10706450](https://doi.org/10.23919/FUSION59988.2024.10706450).

\[Guo02\] W. Guo, “Performance Analysis of Using an IRST Sensor Cueing a 3D Radar,” 2002.

\[Sko09\] P. Skoglar, “A Planning Algorithm of a Gimballed EO/IR Sensor for Multi Target Tracking,” 2009.

\[Cum04\] M. Cummings, P. Mitchell, and T. Sheridan, “HUMAN SUPERVISORY CONTROL ISSUES IN NETWORK CENTRIC WARFARE,” 2004.

\[Her23\] M. Hernandez, Á. F. García-Fernández, and S. Maskell, “Nonmyopic Sensor Control for Target Search and Track Using a Sample-Based GOSPA Implementation,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 60, pp. 387–404, Aug. 2023, doi: [10.1109/TAES.2023.3324908](https://doi.org/10.1109/TAES.2023.3324908).

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

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

\[Kup94\] G. Kuperman, “Operator interface for a multi-sensor target acquisition system,” in *Proceedings of National Aerospace and Electronics Conference (NAECON’94)*, May 1994, pp. 638–645 vol.2. doi: [10.1109/NAECON.1994.332971](https://doi.org/10.1109/NAECON.1994.332971).

\[App00\] “Approved for public release; distribution is unlimited. Dynamo: A Tool for Modeling Integrated Air Defense Systems.”
