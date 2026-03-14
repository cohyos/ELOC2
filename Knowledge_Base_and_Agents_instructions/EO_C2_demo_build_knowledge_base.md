# EO C2 demo build knowledge base

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO C2 demo build knowledge base](#eo-c2-demo-build-knowledge-base)
- [Air defense C2 and recognized air picture generation](#air-defense-c2-and-recognized-air-picture-generation)
- [Radar and EO integration and cueing handoff](#radar-and-eo-integration-and-cueing-handoff)
- [Sensor management and tasking](#sensor-management-and-tasking)
- [Multi sensor 3D localization and triangulation from EO bearings](#multi-sensor-3d-localization-and-triangulation-from-eo-bearings)
- [Resolving multiple targets in EO fields of view](#resolving-multiple-targets-in-eo-fields-of-view)
- [Sensor registration and bias mitigation](#sensor-registration-and-bias-mitigation)
- [Demo oriented simulation, map display, and operator workstation](#demo-oriented-simulation-map-display-and-operator-workstation)
- [Cross cutting build architecture](#cross-cutting-build-architecture)
- [Recommended baseline for the demo](#recommended-baseline-for-the-demo)
- [References](#references)

## EO C2 demo build knowledge base

An electro optical command and control demo for air defense is strongest when it demonstrates a real operational idea rather than just a map with icons. The core idea in this project is that a working C4ISR air picture can drive a network of electro optical investigators that automatically and autonomously scan radar tracks, investigate them, help identify them, resolve ambiguities inside the EO image, and when possible build a 3D electro optical target plot from multiple sensor views \[Joh05, Paw96, Ben07b, San01, Cor11, Flo24\]. The research base points to seven hard problems that shape whether that demonstration looks credible: building a recognized air picture from heterogeneous tracks, handing radar tracks to electro optical sensors, tasking scarce sensors over time, estimating 3D position from angle only views, resolving several objects inside one field of view, keeping sensors registered in one common frame, and presenting the whole process in an operator workstation that explains why the system is doing what it is doing \[Joh05, Dru93, Flo24, Paw96, Kal04, San01, Cor11, Pat09\].

The papers support a clear build stance. The demo should be organized as a distributed but coordinated system whose visible behavior is autonomous EO investigation driven by C4ISR tracks. Radar and other C4ISR sources produce local observations and local tracks. A fusion layer builds system tracks and maintains track identity. A tasking layer automatically assigns electro optical investigators to high value or high uncertainty tracks. An EO investigation layer returns confirmation, refinement, target count, and identification support. A geometry layer estimates 3D position when enough angular information exists. A workstation layer shows the map, the sensor field of regard, the active investigations, the confidence of each track, the current identification picture, and the reasons for each action \[Joh05, Mal19, Ben07b, Kup94, Flo24\].

| Subtopic | Main build question | Demo artifact | Key papers |
|:---|:---|:---|:---|
| Recognized air picture | How is one system track picture built | Fusion core and track store | \[Joh05, Dru93, Flo24\] |
| Radar and EO integration | How does a track become a cue and then an EO investigation with identification support | Cueing and fusion services | \[Paw96, Mal19, Yan19, Nai23\] |
| Sensor management | Which sensor should look where and when | Tasking planner and operator controls | \[Ben07b, Kal04, Sko09, Her23\] |
| 3D triangulation | When is angle only geometry good enough for a 3D EO plot | Geometry engine and quality score | \[Ham85, San01, Fer13\] |
| Multi target resolution | How are several objects in one view kept separate and tied back to radar tracks | EO tracker and association logic | \[Cor11, Cho18, Cor19, Tar09\] |
| Registration and timing | Are all sensors aligned enough to fuse safely | Registration health service | \[Oke01, Bel14, Wes18, Hoy24\] |
| Simulation and workstation | How is the process shown clearly to an operator | Map and replay environment | \[Pat09, Cho00, Kup94, App00\] |

## Air defense C2 and recognized air picture generation

The recognized air picture is the backbone of the demo. The literature treats it as a persistent system level track picture built from many local sources, not as a direct display of sensor outputs. Good fusion improves state accuracy, extends track continuity, increases coverage, and reduces track number switching, but the benefit depends heavily on registration quality and time alignment \[Joh05, Wig96, Svi90, Dro06\]. The classic air defense work also shows that track management is as important as estimation. Promotion, deletion, handoff, identity continuity, and conflict handling are part of the product, not just bookkeeping \[Dru93, Joh05, Bar95\].

For the demo, the fusion core should keep a sharp distinction between four objects.

- Raw observation
- Local sensor track
- System track
- Investigation task

That separation makes it possible to show both the complete picture and the evidence trail behind it. It also prevents a common demo failure where an electro optical investigation silently overwrites the system track rather than updating it through an auditable fusion step \[Joh05, Flo24\].

| Layer | Responsibility | Implementation note | Evidence |
|:---|:---|:---|:---|
| Observation ingest | Accept time stamped detections and tracks from radar and other sources | Preserve source frame and source covariance | \[Joh05, Flo24\] |
| Correlation | Decide whether reports belong to an existing system track | Keep association score and rationale | \[Dru93, Bar95\] |
| Fusion | Produce the best current state estimate | Treat clocks and registration as first class inputs | \[Joh05, Dro06\] |
| Track management | Promote, merge, split, retire, and relabel tracks | Keep track lineage for replay and audit | \[Dru93, Wig96\] |
| RAP projection | Publish a clean map ready track picture | Separate operator display state from estimator internals | \[Flo24, Ive01\] |

**Synthesis**

A professional demo should implement the recognized air picture as an event sourced state machine. Every system track update should record source reports used, association result, fusion method, and confidence change. This recommendation is a software design synthesis based on the fusion and simulation literature rather than a direct finding from one paper \[Joh05, Dru93, Flo24\].

## Radar and EO integration and cueing handoff

The radar to electro optical relationship in the literature is cooperative, not competitive. Radar gives wide area surveillance and kinematics. Electro optical sensors give visual confirmation, passive bearing, fine discrimination, and in some settings better support for classification or low altitude cases. The strongest results come when one sensor narrows the search burden of the other and the combined system feeds a common tracker or fusion center \[Paw96, Bla00, Kes01, Guo02\].

A cue should therefore be treated as a time bounded search order, not as truth. The cue must include predicted target state, uncertainty, target priority, and a validity window. After slew to cue, the electro optical sensor should either confirm the track, refine it, support target identification, split it into multiple targets, or report no supporting evidence \[Paw96, Guo02, Zha11\].

Recent fusion work shows that radar and electro optical tracks are usually heterogeneous, asynchronous, and represented in different state spaces. Fusing them as if they were simple independent Cartesian tracks gives overconfident results. Cross covariance, common process noise, and different local models matter, especially when local trackers run in different coordinates or at different rates \[Mal19, Yan19, Tia10, Qua22\]. Work comparing fusion architectures also suggests a useful practical rule. If raw or common measurements can be centralized, that path is often simpler and more accurate. If the architecture is distributed, track to track fusion is necessary but must be made conservative and consistency aware \[Nai23, Mal19\].

| Step | Recommended behavior | Why it matters | Evidence |
|:---|:---|:---|:---|
| Radar cue creation | Predict target state into EO task start time | Avoid stale handoff | \[Guo02, Tia10\] |
| EO search window | Point gimbal to uncertainty gated region, not a single pixel center | Real cues have uncertainty | \[Paw96, Sko09\] |
| EO confirmation | Return bearing, image quality, and target count estimate | EO may split one external track into several objects | \[Zha11, Cor19\] |
| Fusion | Use centralized measurement fusion when available, else conservative track fusion | Heterogeneous track fusion is tricky | \[Nai23, Mal19, Yan19\] |
| Fallback mode | If registration or covariance quality is poor, treat EO as confirmation only | Prevent false precision | \[Joh05, Qua22\] |

**Synthesis**

For the demo, the cue interface should carry these fields:

- System track id
- Predicted position and velocity
- Covariance or uncertainty ellipsoid
- Priority score
- Valid from time
- Valid to time
- Expected target count
- Suggested dwell time
- Registration health

That message schema is a build recommendation synthesized from cueing, fusion, and scheduling papers \[Paw96, Mal19, Kal04\].

## Sensor management and tasking

The sensor management literature is clear that good surveillance systems do not simply assign the nearest free sensor. They trade off information gain, threat priority, sensor limits, communication delays, and downstream mission value \[Ben07b, Kal04, Her10, Xio02\]. For a gimballed electro optical investigator, planning must account for finite slew, finite field of view, revisit interval, dwell time, and the fact that looking at one target means not looking at another \[Sko09, Mah04\].

The research also supports a human supervised model rather than full autonomy for a command and control setting. Operators should be able to understand why a task was proposed, approve or override it, and reserve sensors for special tasks. Human supervisory control work warns against hidden automation that silently commits scarce resources while giving the operator only a passive display \[Cum04, Ben02b\].

A strong demo tasking engine should score candidate tasks using both track importance and expected value of observation. Modern nonmyopic methods improve performance, but even a one step score can produce professional behavior if it includes future revisit needs and geometry gain for triangulation \[Her23, Tha04, Sev14\].

| Task factor | Build meaning | Recommended signal | Evidence |
|:---|:---|:---|:---|
| Threat priority | Importance of the target | Mission score | \[Tun22, Ben07b\] |
| Uncertainty reduction | Expected drop in track covariance | Predicted information gain | \[Kal04, Tha04\] |
| Geometry gain | Value of adding this sensor to triangulation | Baseline angle improvement | \[Her04b, San01\] |
| Sensor cost | Slew time and lost coverage elsewhere | Time and opportunity cost | \[Sko09, Mah04\] |
| Operator intent | Explicit human direction | Override weight and reservations | \[Cum04, Ben02b\] |

**Synthesis**

A practical task score for the demo can be written as a weighted sum of threat, uncertainty reduction, geometry gain, and operator intent minus slew cost and occupancy cost. This is a synthesis for implementation, not a direct formula from one paper. It is faithful to the logic of the sensor management literature \[Ben07b, Kal04, Her23, Tun22\].

The tasking layer should expose three modes.

- Recommended only
- Auto assign with operator veto
- Manual assign

That allows the same backend to support both a technically rich demo and a control room style operator workflow \[Cum04, Kup94\].

## Multi sensor 3D localization and triangulation from EO bearings

Triangulation is one of the most attractive features in the demo, but the geometry literature is a warning against naive 3D claims. Two angle only sensors can estimate 3D position, yet the accuracy depends strongly on baseline geometry, line of sight intersection angle, sensor noise, and synchronization. When the target lies near the sensor baseline or when sight lines are nearly parallel, depth becomes poorly observed and the estimate can look stable while actually carrying huge uncertainty \[Ham85, San01, San02\].

This means the demo should never present 3D as a binary success. It should publish a 3D estimate together with a geometry quality score and an uncertainty volume. Three non collinear sensors help recover observability in weak two sensor geometries and reduce the near baseline failure case \[Fer13\]. For moving targets, asynchronous measurements require time alignment and motion modeling. Otherwise a target maneuver can be mistaken for parallax \[Ris01, Tia10\].

| Geometry issue | Effect on the estimate | Demo safeguard | Evidence |
|:---|:---|:---|:---|
| Small intersection angle | Large range error | Reject or down weight 3D | \[San01, Ham85\] |
| Target near baseline | Poor observability | Ask for third view | \[Fer13, San02\] |
| Timing mismatch | Biased triangulation on moving targets | Predict to common time | \[Ris01, Tia10\] |
| High bearing noise | Inflated uncertainty volume | Surface quality score to UI | \[San01, Hor03\] |
| Platform motion uncertainty | Geometry model drift | Include platform state error | \[Pun06, Bel14\] |

**Synthesis**

The geometry engine should have three output classes.

- Bearing only track
- 3D candidate with weak geometry
- 3D confirmed with acceptable geometry

The boundary between weak and acceptable geometry should be driven by intersection angle, predicted covariance volume, and time alignment quality. This thresholding policy is a build recommendation synthesized from the observability and error propagation papers \[Ham85, San01, Fer13\].

## Resolving multiple targets in EO fields of view

The multi target literature supports using delayed association rather than forcing immediate certainty. In clutter or close target encounters, the best trackers keep several association hypotheses alive over multiple frames. This is the central reason that multiple hypothesis tracking remains valuable after decades of development \[Cor11, Cho18\]. For an electro optical investigator, this matters whenever one radar track enters a dense field of view, when one bright object masks another, or when a single unresolved blob later separates into several targets \[Cor19, Bla96\].

For the demo, the most professional baseline is a track oriented multi stage MHT design. It allows local EO processing to handle unresolved or ambiguous image measurements while the system fusion layer reasons over track identities and external cues \[Cor11\]. PMHT and related methods are also relevant, especially for dense or ambiguous measurement sets, and track before detect is valuable when the sensor must maintain weak objects before clean detections emerge \[Wil02, Tar09\].

The practical lesson is that the demo should represent ambiguity explicitly.

- One external track may map to zero, one, or many EO objects
- One EO object may be a false alarm, a true target, or part of an unresolved group
- Final identity should be delayed until enough temporal evidence exists

That behavior is far more faithful to the research than immediate hard assignment \[Cor11, Cor18, Cor19\].

| Situation | Recommended tracker behavior | Evidence |
|:---|:---|:---|
| Crossing or closely spaced targets | Keep competing identity hypotheses alive | \[Cor11, Cho18\] |
| One blob later becomes two objects | Support unresolved group states and later split | \[Cor19, Cor18\] |
| Very weak targets in clutter | Use track before detect or low threshold candidate logic | \[Tar09, Liu12b\] |
| Mixed external and EO inputs | Use multi stage tracking to preserve upstream labels while allowing downstream correction | \[Cor11, Kri97\] |

**Synthesis**

The EO investigation service should maintain separate entities for detection, EO track, unresolved group, and association hypothesis. This domain model is an implementation synthesis drawn from MHT and EO tracking work \[Cor11, Cor19, Tar09\].

## Sensor registration and bias mitigation

Registration is the hidden constraint that determines whether fusion looks credible or theatrical. The air defense fusion papers repeatedly note that even strong correlation and filtering can fail if sensors are not aligned in space and time \[Joh05\]. The registration literature expands this into a full design problem. Biases arise from boresight error, platform attitude error, timing error, and coordinate conversion effects. If left untreated, they create false separation between sensors, missed associations, duplicate tracks, and overconfident fused states \[Oke01, Bel14, Wes18\].

The literature also shows that registration should not be a one time setup step. Joint tracking and registration can be run online, and recent work shows benefits from modeling biases in native sensor coordinates rather than only as Cartesian offsets \[Wes18, Hoy24\]. For a demo that fuses radar and electro optical sources, this is especially important because optical biases often present first as angle errors, while fusion centers are tempted to reason only in global Cartesian space \[Bel14, Hoy24\].

Cross covariance is part of the same story. If remote tracks share common information and the fusion layer ignores that dependence, the result is too confident and can even degrade association quality \[Yan19, Qua22\].

| Bias or timing issue | Visible symptom | Demo treatment | Evidence |
|:---|:---|:---|:---|
| Boresight or angle bias | EO line of sight misses the radar track | Estimate and display sensor bias state | \[Bel14, Hoy24\] |
| Radar registration bias | Duplicate or shifted system tracks | Joint registration and fusion | \[Oke01, Wes18\] |
| Clock offset | Good geometry with bad fusion timing | Track clock health and common time projection | \[Joh05, Oke01\] |
| Ignored cross covariance | Overconfident fused covariance | Conservative fusion mode | \[Yan19, Qua22\] |

**Synthesis**

The demo should include a registration health service that publishes per sensor status.

- Spatial alignment quality
- Time synchronization quality
- Bias estimate age
- Fusion safe or not safe flag

This service abstraction is a build recommendation synthesized from the registration and fusion papers \[Oke01, Bel14, Wes18, Hoy24\].

## Demo oriented simulation, map display, and operator workstation

The simulation and visualization papers point toward a map centered, operator facing environment that shows not only tracks but also sensing process, latency, and control actions \[Cho00, App00, Flo24\]. Open electro optical training environments and air defense simulators reinforce the same lesson. A credible system display must show what sensors can see, what they are currently doing, and how their outputs contribute to the track picture \[Pat09, Cho00\]. Earlier operator interface work also emphasizes that multi sensor systems need clear representations of tasking state, target state, and sensor contribution, otherwise the operator cannot build trust in the automation \[Kup94\].

For this demo, the workstation should therefore make sensor management legible. The map should show system tracks, local sensor tracks when requested, current EO line of sight, field of view footprint, planned handoffs, triangulation rays, and confidence overlays. Replay matters as much as live display because most of the interesting behavior in this system is temporal. The operator should be able to scrub backward and ask why a sensor was assigned, why a track split, or why 3D confidence fell \[Flo24, Mew05, Pei09\].

| Display element | Purpose | Research basis |
|:---|:---|:---|
| System track layer | Common recognized air picture | \[Cho00, Flo24\] |
| Sensor coverage and field of regard | Explain what each sensor could observe | \[Mew05, Hew03\] |
| EO tasking timeline | Explain current and upcoming assignments | \[Kup94, Pat09\] |
| Triangulation rays and quality | Make 3D confidence understandable | \[San01, Fer13\] |
| Association and split history | Explain ambiguity and target resolution | \[Cor11, Flo24\] |
| Fault and latency overlays | Show degraded modes honestly | \[App00, Flo24\] |

**Synthesis**

The most effective workstation layout is likely a three pane design.

- Map and 3D scene pane
- Track and investigation detail pane
- Tasking and event timeline pane

This is a design synthesis based on the simulation and operator interface literature rather than a directly tested standard \[Kup94, Pat09, Ram09\].

## Cross cutting build architecture

The literature does not prescribe one software stack, but it does strongly support a modular architecture where track estimation, fusion, tasking, geometry, registration, and display are cleanly separated \[Flo24, Cor11, Wes18\]. A demo meant to guide code agents should therefore be built around explicit service boundaries and explicit data contracts.

| Service | Core inputs | Core outputs | Notes |
|:---|:---|:---|:---|
| Source ingest | Radar plots, local tracks, external reports | Time normalized source events | Keep provenance |
| Correlation and fusion | Source events, registration state | System tracks and RAP updates | Central truth store |
| Registration | Sensor reports, track pairs, timing data | Bias estimates and health flags | Gates fusion confidence |
| EO tasking planner | System tracks, sensor states, operator intent | Task proposals and assignments | Human supervised |
| EO investigation | Cue orders, video detections, gimbal state | EO tracks and target count hypotheses | Supports unresolved groups |
| Geometry engine | Bearing tracks, platform states, timing | 3D estimate and quality score | Never output bare point only |
| Workstation projection | All service outputs | View models and replay log | Read only on core truth |
| Scenario simulator | Target truth, sensor models, comm delays | Synthetic events and imagery surrogates | Must model faults and lag |

**Synthesis**

A near term build should prefer conservative realism over maximal algorithmic novelty.

- Use centralized fusion where raw measurements are available
- Use conservative track fusion where only local tracks are available
- Make tasking recommendation quality visible to the operator
- Surface geometry quality instead of claiming unconditional 3D
- Represent ambiguity explicitly when several objects share one view
- Block precision fusion when registration health is poor

These are implementation choices derived by combining the evidence across the subtopics rather than reading any one paper literally \[Joh05, Mal19, Kal04, San01, Cor11, Oke01, Flo24\].

## Recommended baseline for the demo

A professional first version of the demo should implement the following baseline.

1.  A recognized air picture service that correlates local tracks into persistent system tracks with lineage and confidence \[Joh05, Dru93\].
2.  A radar to EO cueing service that sends predicted state, uncertainty, and priority to gimballed investigators \[Paw96, Guo02\].
3.  An automatic EO tasking planner that can run autonomously while still allowing human supervision, and that scores threat, uncertainty reduction, geometry gain, and slew cost \[Ben07b, Sko09, Her23\].
4.  An EO investigation service that supports confirmation, identification support, one to many resolution, and delayed association through multi hypothesis logic \[Cor11, Cor19\].
5.  A triangulation service that emits a 3D EO plot only with explicit geometry quality and timing quality \[San01, Fer13\].
6.  A registration service that estimates bias, tracks clock quality, and gates fusion confidence \[Oke01, Bel14, Hoy24\].
7.  A map based workstation with replay, field of regard overlays, association history, identification state, and tasking rationale \[Pat09, Kup94, Flo24\].

That baseline is close to the center of gravity of the research literature and should let code agents build a demo that looks professional because its behavior is professional.

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Ben07b\] A. Benaskeur and H. Irandoust, “Sensor Management for Tactical Surveillance Operations,” Nov. 01, 2007.

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Pat09\] P. Patrick and T. W. Pearce, “OpenEOIR - An open source simulation based electro-optic sensor training environment prototype,” Dec. 01, 2009.

\[Mal19\] M. Mallick, K.-C. Chang, S. Arulampalam, and Y. Yan, “Heterogeneous Track-to-Track Fusion in 3-D Using IRST Sensor and Air MTI Radar,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 55, pp. 3062–3079, Feb. 2019, doi: [10.1109/TAES.2019.2898302](https://doi.org/10.1109/TAES.2019.2898302).

\[Kup94\] G. Kuperman, “Operator interface for a multi-sensor target acquisition system,” in *Proceedings of National Aerospace and Electronics Conference (NAECON’94)*, May 1994, pp. 638–645 vol.2. doi: [10.1109/NAECON.1994.332971](https://doi.org/10.1109/NAECON.1994.332971).

\[Yan19\] K. Yang, Y. Bar-Shalom, and P. Willett, “Track-to-Track fusion with cross-covariances from radar and IR/EO sensor,” *2019 22th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2019, doi: [10.23919/fusion43075.2019.9011439](https://doi.org/10.23919/fusion43075.2019.9011439).

\[Nai23\] V. Naidu, “Fusion Architectures for 3D Target Tracking Using IRST and Radar Measurements,” *Journal of Aerospace Sciences and Technologies*, Aug. 2023, doi: [10.61653/joast.v62i3.2010.502](https://doi.org/10.61653/joast.v62i3.2010.502).

\[Sko09\] P. Skoglar, “A Planning Algorithm of a Gimballed EO/IR Sensor for Multi Target Tracking,” 2009.

\[Her23\] M. Hernandez, Á. F. García-Fernández, and S. Maskell, “Nonmyopic Sensor Control for Target Search and Track Using a Sample-Based GOSPA Implementation,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 60, pp. 387–404, Aug. 2023, doi: [10.1109/TAES.2023.3324908](https://doi.org/10.1109/TAES.2023.3324908).

\[Ham85\] S. Hammel and V. Aidala, “Observability Requirements for Three-Dimensional Tracking via Angle Measurements,” Mar. 01, 1985. doi: [10.1109/TAES.1985.310617](https://doi.org/10.1109/TAES.1985.310617).

\[Fer13\] M. H. Ferdowsi, “Passive Range Estimation Using Two and Three Optical Cameras,” Apr. 30, 2013. doi: [10.15866/iremos.v6i2.2441](https://doi.org/10.15866/iremos.v6i2.2441).

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

\[Tar09\] A. Tartakovsky, A. P. Brown, and J. Brown, “Enhanced Algorithms for EO/IR Electronic Stabilization, Clutter Suppression, and Track-Before-Detect for Multiple Low Observable Targets,” Sep. 01, 2009.

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Bel14\] D. Belfadel and R. W. Osborn, “Bias Estimation and Observability for Optical Sensor Measurements with Targets of Opportunity,” 2014.

\[Wes18\] M. Westenkirchner and M. Ger, “Joint Tracking and Registration in Multi-Target Multi-Sensor Surveillance Using Factor Graphs,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 1464–1471, Jul. 2018, doi: [10.23919/ICIF.2018.8455675](https://doi.org/10.23919/ICIF.2018.8455675).

\[Hoy24\] S. J. Hoyt, W. D. Blair, and A. Lanterman, “Non-Linear Bias Mitigation in Multi-Sensor Multi-Track Fusion,” *2024 27th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2024, doi: [10.23919/FUSION59988.2024.10706450](https://doi.org/10.23919/FUSION59988.2024.10706450).

\[Cho00\] S. Choi and D. Wijesekera, “The DADSim air defense simulation environment,” *Proceedings. Fifth IEEE International Symposium on High Assurance Systems Engineering (HASE 2000)*, pp. 75–82, Nov. 2000, doi: [10.1109/HASE.2000.895444](https://doi.org/10.1109/HASE.2000.895444).

\[App00\] “Approved for public release; distribution is unlimited. Dynamo: A Tool for Modeling Integrated Air Defense Systems.”

\[Wig96\] T. Wigren, E. Sviestins, and H. Egnell, “Operational multi-sensor tracking for air defense,” Nov. 21, 1996. doi: [10.1109/ADFS.1996.581074](https://doi.org/10.1109/ADFS.1996.581074).

\[Svi90\] E. Sviestins, “True multi-radar tracking for air defence C/sup 3/ systems,” in *IEEE International Conference on Radar*, May 1990, pp. 612–614. doi: [10.1109/RADAR.1990.201097](https://doi.org/10.1109/RADAR.1990.201097).

\[Dro06\] A. Drozd, R. Niu, I. Kasperovich, P. Varshney, and C. E. Carroll, “Real-time radar data fusion and registration systems for single integrated air picture,” May 05, 2006. doi: [10.1117/12.665786](https://doi.org/10.1117/12.665786).

\[Bar95\] Y. Bar-Shalom and R. Xiao, “Multitarget-Multisensor Tracking: Principles and Techniques,” 1995.

\[Ive01\] T. F. Iversea, “Mobile and Netted Air Defence Systems,” Mar. 01, 2001.

\[Bla00\] S. Blackman, R. Dempster, S. H. Roszkowski, D. M. Sasaki, and P. Singer, “Improved tracking capability and efficient radar allocation through the fusion of radar and infrared search-and-track observations,” May 01, 2000. doi: [10.1117/1.602506](https://doi.org/10.1117/1.602506).

\[Kes01\] L. Kester and A. Theil, “Fusion of radar and EO sensors for surveillance,” Aug. 16, 2001. doi: [10.1117/12.436973](https://doi.org/10.1117/12.436973).

\[Guo02\] W. Guo, “Performance Analysis of Using an IRST Sensor Cueing a 3D Radar,” 2002.

\[Zha11\] H. Zhang, H. Yang, and W. Yu, “The Handoff Method of IRST and Radar Under Multi-target Scenario: The Handoff Method of IRST and Radar Under Multi-target Scenario,” May 12, 2011. doi: [10.3724/SP.J.1146.2010.00982](https://doi.org/10.3724/SP.J.1146.2010.00982).

\[Tia10\] X. Tian and Y. Bar-Shalom, “On algorithms for asynchronous Track-to-Track Fusion,” *2010 13th International Conference on Information Fusion*, pp. 1–8, Jul. 2010, doi: [10.1109/ICIF.2010.5711956](https://doi.org/10.1109/ICIF.2010.5711956).

\[Qua22\] C. Quaranta and G. Balzarotti, “Estimation of Consistent Cross-Covariance Matrices in a Multisensor Data Fusion,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 58, pp. 5456–5469, Dec. 2022, doi: [10.1109/TAES.2022.3172399](https://doi.org/10.1109/TAES.2022.3172399).

\[Her10\] A. Hero, D. Castan, D. Cochran, and K. Kastella, “Foundations and Applications of Sensor Management,” Nov. 23, 2010. doi: [10.1007/978-0-387-49819-5](https://doi.org/10.1007/978-0-387-49819-5).

\[Xio02\] N. Xiong and P. Svensson, “Multi-sensor management for information fusion: issues and approaches,” *Inf. Fusion*, vol. 3, pp. 163–186, Jun. 2002, doi: [10.1016/S1566-2535(02)00055-6](https://doi.org/10.1016/S1566-2535(02)00055-6).

\[Mah04\] R. Mahler, “Sensor Management with Non-Ideal Sensor Dynamics,” 2004.

\[Cum04\] M. Cummings, P. Mitchell, and T. Sheridan, “HUMAN SUPERVISORY CONTROL ISSUES IN NETWORK CENTRIC WARFARE,” 2004.

\[Ben02b\] A. Benaskeur, “Sensor Management in Command & Control,” Sep. 01, 2002.

\[Tha04\] R. Tharmarasa, T. Kirubarajan, M. L. Hernandez, and E. Lab, “PCRLB-based multisensor array management for multitarget tracking,” Aug. 25, 2004. doi: [10.1117/12.541884](https://doi.org/10.1117/12.541884).

\[Sev14\] T. A. Severson and D. Paley, “Optimal sensor coordination for multitarget search and track assignment,” Dec. 10, 2014. doi: [10.1109/TAES.2014.120747](https://doi.org/10.1109/TAES.2014.120747).

\[Tun22\] O. Tuncer and H. A. Çırpan, “Target priority based optimisation of radar resources for networked air defence systems,” Apr. 05, 2022. doi: [10.1049/rsn2.12255](https://doi.org/10.1049/rsn2.12255).

\[Her04b\] M. L. Hernandez, T. Kirubarajan, and Y. Bar-Shalom, “Multisensor resource deployment using posterior Cramer-Rao bounds,” Jul. 12, 2004. doi: [10.1109/TAES.2004.1309993](https://doi.org/10.1109/TAES.2004.1309993).

\[San02\] J. Sanders-Reed, “Impact of tracking system knowledge on multisensor 3D triangulation,” Jul. 01, 2002. doi: [10.1117/12.472599](https://doi.org/10.1117/12.472599).

\[Ris01\] B. Ristic, S. Zollo, and S. Arulampalam, “Performance Bounds for Manoeuvring Target Tracking Using Asynchronous Multi-Platform Angle-Only Measurements,” 2001.

\[Hor03\] P. Horridge and M. L. Hernandez, “Performance bounds for angle-only filtering with application to sensor network management,” in *Sixth International Conference of Information Fusion, 2003. Proceedings of the*, Jul. 2003, pp. 695–703. doi: [10.1109/ICIF.2003.177514](https://doi.org/10.1109/ICIF.2003.177514).

\[Pun06\] K. Punithakumar, T. Kirubarajan, and M. Hernandez, “Multisensor deployment using PCRLBS, incorporating sensor deployment and motion uncertainties,” Oct. 01, 2006. doi: [10.1109/TAES.2006.314587](https://doi.org/10.1109/TAES.2006.314587).

\[Bla96\] S. Blackman, R. Dempster, G. K. Tucker, and S. H. Roszkowski, “Application of multiple-hypothesis tracking to shipboard IRST tracking,” May 31, 1996. doi: [10.1117/12.241205](https://doi.org/10.1117/12.241205).

\[Wil02\] P. Willett, Y. Ruan, and R. Streit, “PMHT: problems and some solutions,” Dec. 10, 2002. doi: [10.1109/TAES.2002.1039396](https://doi.org/10.1109/TAES.2002.1039396).

\[Cor18\] S. Coraluppi and C. Carthel, “Multiple-Hypothesis Tracking for Targets Producing Multiple Measurements,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 54, pp. 1485–1498, Jan. 2018, doi: [10.1109/TAES.2018.2796478](https://doi.org/10.1109/TAES.2018.2796478).

\[Liu12b\] S. Liu, “Integrated Waveform-Agile Multi-Modal Track-before-Detect Algorithms for Tracking Low Observable Targets,” 2012.

\[Kri97\] M. Krieg and D. Gray, “Multisensor probabilistic multihypothesis tracking using dissimilar sensors,” Jun. 23, 1997. doi: [10.1117/12.277181](https://doi.org/10.1117/12.277181).

\[Mew05\] D. David. Mewett, “Dynamic Display for Visualising Surveillance Coverage in Complex Terrain,” 2005.

\[Pei09\] E. Peinsipp-Byma, J. Geisler, and T. Bader, “Digital Map & Situation Surface: A Team-oriented Multi-Display Workspace for Network Enabled Situation Analysis,” 2009.

\[Hew03\] P. Hew, “Visualisation of Surveillance Coverage by Latency Mapping,” *InVis.au*, pp. 11–16, 2003.

\[Ram09\] P. Ramadeen, B. Duvenhage, and A. Duvenhage, “Effectively utilising a 3rd party 3D visualization component in a discrete event simulation environment for Joint Command and Control (JC2),” Sep. 01, 2009.
