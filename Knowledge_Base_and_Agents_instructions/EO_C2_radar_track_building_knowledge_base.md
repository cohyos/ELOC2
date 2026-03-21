# EO C2 radar track building knowledge base

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO C2 radar track building knowledge base](#eo-c2-radar-track-building-knowledge-base)
- [Build stance](#build-stance)
- [Radar detection parameters needed for track building](#radar-detection-parameters-needed-for-track-building)
  - [Minimum per-detection parameter set](#minimum-per-detection-parameter-set)
  - [Minimum per-track parameter set](#minimum-per-track-parameter-set)
  - [Parameter handling rules](#parameter-handling-rules)
- [Single-radar track building](#single-radar-track-building)
  - [Recommended single-radar processing chain](#recommended-single-radar-processing-chain)
  - [Track initiation and confirmation](#track-initiation-and-confirmation)
  - [Data association choices](#data-association-choices)
  - [Filter design and measurement space](#filter-design-and-measurement-space)
  - [Track quality and deletion](#track-quality-and-deletion)
- [Track before detect and weak target logic](#track-before-detect-and-weak-target-logic)
- [Phased-array and multifunction radar specifics](#phased-array-and-multifunction-radar-specifics)
  - [What changes relative to a rotating surveillance radar](#what-changes-relative-to-a-rotating-surveillance-radar)
  - [Recommended phased-array policy](#recommended-phased-array-policy)
- [Multi-radar track fusion and handoff](#multi-radar-track-fusion-and-handoff)
  - [Architecture choice](#architecture-choice)
  - [Fusion prerequisites](#fusion-prerequisites)
  - [Recommended fusion rules for EO C2](#recommended-fusion-rules-for-eo-c2)
  - [Multi-radar handoff to EO](#multi-radar-handoff-to-eo)
- [Recommended EO C2 data contract for radar track building](#recommended-eo-c2-data-contract-for-radar-track-building)
  - [Detection object](#detection-object)
  - [Local radar track object](#local-radar-track-object)
  - [System track object](#system-track-object)
- [Recommended algorithm stack by scenario](#recommended-algorithm-stack-by-scenario)
- [Algorithm selection rules for code agents](#algorithm-selection-rules-for-code-agents)
- [Failure modes that should be modeled explicitly](#failure-modes-that-should-be-modeled-explicitly)
- [Baseline recommendation for the EO C2 enhancement](#baseline-recommendation-for-the-eo-c2-enhancement)
- [References](#references)

## EO C2 radar track building knowledge base

Radar track building is the layer that turns radar detections into a stable recognized air picture that EO services can trust. The literature is consistent on one point. Good downstream cueing depends less on any single filter choice than on a disciplined chain of measurement handling, initiation logic, data association, track existence management, maneuver handling, and fusion hygiene \[Bla99, Bar95, Far80\]. For EO C2, the right design stance is to keep single-radar track building separate from multi-radar fusion, then connect both through explicit uncertainty, timing, and track quality fields \[Joh05, Cho00b, Cho08\].

This report is written as a build-oriented knowledge base for retrieval by Claude and MCP style RAG workflows. It aims to answer five recurring implementation questions.

- What radar detection parameters are required for credible track building
- Which algorithms fit each stage of the pipeline
- When single-radar logic is enough and when multisensor fusion changes the problem
- How phased-array and rotating radars change revisit and scheduling logic
- Which concrete data fields and track states should exist in EO C2

## Build stance

The recommended architecture is a staged pipeline with explicit handoff objects. That matches the operational tracking literature better than a monolithic tracker and makes retrieval easier for code agents \[Bla99, Bar95, Dru93\].

| Stage | Input | Output | Preferred logic |
|:---|:---|:---|:---|
| Detection normalization | Radar plots and plot attributes | Time-stamped measurements with covariance and quality | Preserve native measurement space \[Ler93, Par01\] |
| Single-radar initiation | Measurements from one radar | Tentative local tracks | M of N or IPDA family \[Mus94, Cla19, Sea71\] |
| Single-radar maintenance | Local tracks and new plots | Confirmed local tracks | IMM plus PDA or JPDA or MHT by clutter level \[Kir04, Mus08, Bla04b\] |
| Track management | Local track history | Confirmed, coasted, deleted, split states | Existence and quality logic \[Mus94, You16, Jef89\] |
| Multi-radar fusion | Local tracks or common measurements | System tracks | Centralized fusion if possible, conservative track fusion otherwise \[Che03, Jul01, Cho00b\] |
| Handoff to EO C2 | System tracks with uncertainty | Cue objects for EO services | Predict to cue time, carry validity and uncertainty \[Joh05, Flo24\] |

## Radar detection parameters needed for track building

A track builder needs more than range and angle. The papers repeatedly show that bad coordinate conversion, missing covariance, weak timing, and hidden sensor bias can undo strong tracking logic \[Ler93, Par01, Joh05\].

### Minimum per-detection parameter set

| Parameter | Why it matters | Used by |
|:---|:---|:---|
| Detection time stamp | Enables prediction, gating, fusion, out of sequence handling | All stages \[Joh05, Bar04\] |
| Sensor id and mode | Distinguishes radar source, scan type, beam mode, face or sector | Initiation, fusion, scheduling \[Far80, But98\] |
| Range | Core positional measurement | Filtering and gating \[Ler93, Par01\] |
| Azimuth | Core angular measurement | Filtering and gating \[Ler93\] |
| Elevation or height proxy | Needed for 3D track quality | 3D filtering and fusion \[Par01\] |
| Radial velocity or Doppler | Sharpens association and helps initiation in clutter | Initiation, maintenance, fusion \[Bor11b, Kur06\] |
| Measurement covariance | Needed for statistically valid gating and fusion | Association and filtering \[Bar95, Cho00b\] |
| Detection amplitude or SNR | Supports weak target logic and low observable initiation | TBD and low SNR tracking \[Ton98, Sed06\] |
| Detection quality flags | Encodes weather, jamming, sidelobe, saturation, ambiguity | Quality control \[Far80, Bla99\] |
| Beam pointing and scan geometry | Needed to interpret uncertainty and revisit behavior | Phased-array scheduling and rotating radar logic \[Hon92, But98\] |
| False alarm setting and detection threshold context | Shapes initiation burden and track confirmation thresholds | Initiation and maintenance \[Hen61, Cla19\] |
| Registration and clock status | Prevents false associations across radars | Fusion and handoff \[Joh05, Dro06\] |

### Minimum per-track parameter set

| Parameter | Why it matters | Notes |
|:---|:---|:---|
| State estimate | Position and velocity are the baseline | Cartesian system state is still the practical default \[Bla99, Bar95\] |
| State covariance | Needed for gating, scheduling, and EO cueing | Must stay consistent through coordinate conversion \[Ler93\] |
| Existence score | More useful than binary alive or dead | IPDA and JIPDA make this explicit \[Mus94, Mus02\] |
| Track quality score | Needed for promotion, retention, and display | Quality should reflect evidence depth, not only covariance \[Jef89\] |
| Last update time | Required for coast logic and handoff validity | All architectures \[Joh05\] |
| Track source history | Supports fusion lineage and operator audit | Strongly recommended for EO C2 \[Dru93, Joh05\] |
| Motion model status | Indicates constant velocity, coordinated turn, maneuvering | IMM and adaptive revisit depend on it \[Bus95, Shi95\] |
| Classification or type hints | Helps scheduling and downstream fusion | Keep confidence explicit \[Bla99\] |
| Sensor contribution list | Needed to know whether correlation is independent | Important for track fusion consistency \[Cho00b, Jul01\] |

### Parameter handling rules

- Preserve measurements in native sensor form until a justified conversion step is needed \[Ler93, Par01\].
- Carry covariance with every measurement and every track update \[Bar95, Cho00b\].
- Treat Doppler as a first-class association feature when available, especially in clutter \[Bor11b, Kur06\].
- Store the radar mode that produced the detection, since rotating search and phased-array track beams imply different revisit assumptions \[Far80, But98\].
- Do not fuse across sensors when clock or registration health is unknown \[Joh05, Dro06\].

## Single-radar track building

Single-radar track building is the problem of turning one radar stream into stable local tracks. The literature splits it into four coupled decisions.

- Was there a plausible target here at all
- Does this new measurement belong to an existing track
- Which motion model should explain the target now
- When should the track be promoted, coasted, split, or deleted

### Recommended single-radar processing chain

| Step | Recommended baseline | Upgrade when needed |
|:---|:---|:---|
| Measurement normalization | Convert plots to a common measurement object with covariance | Add Doppler enriched measurement model \[Bor11b, Kur06\] |
| Validation gating | Ellipsoidal statistical gate | Adaptive maneuver gate in heavy clutter \[Wan02b\] |
| Initiation | M of N logic for simple cases | IPDA or alert confirm in clutter or low observability \[Mus94, Cla19\] |
| Association | Nearest neighbor or GNN for sparse scenes | PDA, JPDA, or MHT as crossing density rises \[Kir04, Bla04b\] |
| Filter update | Kalman or converted measurement Kalman filter | IMM for maneuvering targets \[Ler93, Bus95\] |
| Existence update | Simple hit and miss score | Explicit existence probability with IPDA or JIPDA \[Mus94, Mus02\] |
| Termination | Coast count plus quality floor | Sequential existence or SPRT based deletion \[Li02b, You16\] |

### Track initiation and confirmation

Track initiation is a policy problem as much as a filter problem. Low thresholds create false tracks. High thresholds lose weak or intermittent targets. The classic operational answer is some form of M of N logic, sometimes extended with amplitude or velocity cues \[Sea71, Hen61, Sed06\]. More modern work makes the existence question explicit, which is cleaner for EO C2 because cueing services can reason over graded confidence rather than a hard confirmed or not confirmed split \[Mus94, Mus02, Ain21\].

For EO C2, the best default is this.

| Scene type | Recommended initiation logic | Reason |
|:---|:---|:---|
| Sparse air picture, modest clutter | M of N | Simple and cheap \[Sea71, Cla19\] |
| Moderate clutter, intermittent detections | IPDA | Jointly estimates association and track existence \[Mus94\] |
| Dense multitarget scene | JIPDA or MHT based confirmation | Handles coexistence and ambiguity better \[Mus02, Bla04b\] |
| Very weak targets near threshold | Track before detect front end or low threshold candidate logic | Conventional initiation may miss them \[Ton98, Joh02\] |

A practical state machine is:

- Candidate
- Tentative
- Confirmed
- Coasting
- Deleted
- Split child
- Merged history only

Promotion should depend on both hit history and existence score. Deletion should depend on both consecutive misses and forecast covariance growth \[Mus94, You16, Jef89\].

### Data association choices

Data association is where most real-world track builders succeed or fail. The literature gives a clear ladder of methods \[Bar75, Kir04, Bla04b\].

| Method | Best fit | Weakness |
|:---|:---|:---|
| Nearest neighbor | Sparse targets, low clutter, low compute | Brittle in crossings |
| Global nearest neighbor | Moderate density with one best assignment per scan | Still commits too early |
| PDA | Single target in clutter | Does not resolve multitarget coupling well \[Bar75, Bar09\] |
| JPDA | Moderate multitarget clutter | Can coalesce close tracks \[For80, Cha84\] |
| IPDA and JIPDA | Need explicit existence management | Higher complexity \[Mus94, Mus02\] |
| MHT | Dense multitarget ambiguity, delayed decisions | Compute and pruning burden \[Rei78, Bla04b, Cho18\] |
| Integrated track splitting family | Heavy clutter and multiscan evidence accumulation | More specialized and less familiar in fielded stacks \[Dar07, Mus09\] |

For EO C2 local radar tracks, the recommended baseline is:

- GNN plus IMM for clean sparse sectors
- PDA or JPDA plus IMM for moderate clutter and crossing targets
- JIPDA when explicit track existence is operationally important
- Track-oriented MHT for high-value dense sectors or when split and merge behavior matters

That ordering is conservative and sits near the center of the literature \[Kir04, Mus02, Bla04b, Cho18\].

### Filter design and measurement space

Three implementation lessons appear often in the radar tracking papers.

- Coordinate conversion matters. Converted-measurement filters can outperform naive EKF use when conversion bias is handled correctly \[Ler93, Suc99\].
- Three-dimensional radar measurements can be strongly nonlinear, so covariance design should reflect actual measurement geometry \[Par01\].
- Maneuvering targets justify IMM style model switching in air-defense conditions \[Bus95, Mus08\].

| Problem | Recommended handling |
|:---|:---|
| Range and angle measurements only | Debiased converted measurement Kalman filter or careful EKF design \[Ler93, Par01\] |
| Range, angle, and Doppler available | Use Doppler in the measurement model and association logic \[Bor11b, Kur06\] |
| Maneuvering targets | IMM with constant velocity and maneuver model bank \[Bus95, Mus08\] |
| Very high clutter with multi-frame evidence | Add multiscan logic rather than only tuning the filter \[Roe95, Dar07\] |

### Track quality and deletion

Track quality should not be reduced to covariance trace. Operational systems care about life expectancy, evidence depth, clutter context, and consistency under stress \[Jef89, Leu99\]. A useful EO C2 quality object should include:

- Existence probability
- Kinematic confidence
- Last reliable update age
- Number of supporting detections in the rolling window
- Number of supporting sensors if fused
- Current maneuver model confidence
- Clutter stress indicator for the sector

## Track before detect and weak target logic

Track before detect belongs in a separate branch, not as a default tracker. It becomes valuable when targets are too weak or intermittent for clean thresholded plots, especially in surveillance settings where evidence must be accumulated over time \[Ton96, Ton98, Joh02\]. The cost is compute and integration complexity.

| Use TBD when | Avoid TBD when |
|:---|:---|
| Low SNR and intermittent detectability dominate | Plot quality is already strong and stable |
| Mission value justifies higher compute | Latency budget is very tight |
| Radar can expose cell level or low-threshold evidence | Only hard plots are available |

For EO C2, TBD is an upgrade path, not the baseline. It is most useful for a future low observable or small target branch \[Ton98, Gro13\].

## Phased-array and multifunction radar specifics

Phased-array track building is not just single-radar tracking with faster scans. The radar decides revisit rate, dwell time, beam position, and task scheduling, so the tracker and the scheduler interact directly \[Coh86, Hon92, Din08\]. Rotating multifunction designs show similar coupling when sector load is uneven \[But98\].

### What changes relative to a rotating surveillance radar

| Issue | Rotating radar default | Phased-array implication |
|:---|:---|:---|
| Revisit interval | Mostly scan-driven | Can be target-adaptive \[Shi95, Hon92\] |
| Beam pointing | Determined by rotation and scan pattern | Actively scheduled \[Kuo02, Str96\] |
| Tracking burden | Shared with surveillance by scan geometry | Shared by scheduler across competing tasks \[Din08, Ylm19\] |
| Track update policy | Often near-fixed | Should depend on maneuver and quality \[Coh86, Wat94b\] |

### Recommended phased-array policy

- Use adaptive revisit based on predicted error growth and maneuver status \[Shi95, Hon92\].
- Keep scheduler inputs explicit: track priority, predicted covariance growth, threat class, and beam cost \[Din08, Kuo02\].
- Reserve resources for minimum search load before optimizing track beams \[Kuo02\].
- Expose update interval decisions to the track record so downstream services know how stale a track may be \[Str96, Ylm19\].

For EO C2, that means every local track from a phased-array radar should carry:

- Planned next update time
- Actual last update time
- Radar task class such as search or dedicated track
- Radar resource pressure score if available

## Multi-radar track fusion and handoff

Multi-radar fusion should be treated as a separate problem from single-radar tracking. The central distinction is that single-radar tracking reasons over measurements from one sensor model, while multisensor fusion must also reason over unknown error correlations, bias, asynchronous timing, and architecture choice \[Cho00b, Che03, Jul01\].

### Architecture choice

| Architecture | When to prefer it | Main caution |
|:---|:---|:---|
| Centralized measurement fusion | Raw or common measurements are available | Data transport and common timing burden \[Che03, Cho08\] |
| Sensor to system track fusion | Local trackers are fixed and publish tracks centrally | Correlation between local track errors must be handled \[Cho00b\] |
| Sensor to sensor track fusion | Peer style architecture or decentralized network | Harder consistency management \[Cho00b, Tia12\] |
| Covariance intersection fusion | Correlations are unknown or unsafe to model | Conservative, may lose accuracy \[Jul01\] |

The literature is consistent that centralized estimation is the accuracy reference and usually outperforms track-to-track fusion as the number of sensors grows \[Che03\]. For EO C2, use centralized measurement fusion where politically and technically possible. Use conservative track fusion only when the system boundary forces local trackers to remain separate \[Cho00b, Jul01\].

### Fusion prerequisites

| Prerequisite | Why it matters |
|:---|:---|
| Clock alignment | Needed to predict all sources to a common fusion time \[Joh05\] |
| Registration bias estimate | Needed to avoid duplicate or shifted tracks \[Joh05, Dro06\] |
| Source lineage | Needed to know whether information is independent \[Cho00b\] |
| Local track quality | Needed to avoid over-weighting weak contributors \[Cho08b\] |
| Out of sequence handling | Needed when remote tracks arrive late \[Bar04, Mal02\] |

### Recommended fusion rules for EO C2

- Fuse at measurement level when raw plots or equivalent measurements are available \[Che03\].
- If only local tracks are available, require track quality, covariance, last update time, source list, and registration health as mandatory fields \[Cho00b, Joh05\].
- Use covariance intersection or another conservative method when cross correlation is unknown \[Jul01\].
- Reject or down-weight fusion when clock accuracy or bias estimates are stale \[Joh05, Dro06\].
- Predict all candidate tracks to a common fusion epoch before association \[Tal14, Bar04\].
- Keep local track id to system track id lineage for audit and EO cue explanations \[Dru93, Joh05\].

### Multi-radar handoff to EO

EO handoff should originate from a system track, not directly from whichever radar updated last. That keeps the cue aligned with the best available fused state and makes confidence legible \[Joh05\]. The cue object should contain:

- System track id
- Predicted state at cue start time
- Covariance at cue start time
- Existence score
- Track quality score
- Source radars contributing
- Registration health summary
- Valid from and valid to times
- Threat or priority label
- Expected target count if ambiguity remains

## Recommended EO C2 data contract for radar track building

### Detection object

| Field                    | Meaning                                        |
|:-------------------------|:-----------------------------------------------|
| `detection_id`           | Stable per report                              |
| `sensor_id`              | Radar source                                   |
| `sensor_mode`            | Search, track, sector, phased-array task class |
| `time`                   | Measurement time                               |
| `measurement_type`       | Polar, polar plus Doppler, local Cartesian     |
| `measurement`            | Raw measured values                            |
| `measurement_covariance` | Measurement uncertainty                        |
| `snr_or_amplitude`       | Detection strength                             |
| `quality_flags`          | Weather, jam, ambiguity, sidelobe, saturation  |
| `beam_metadata`          | Beam pointing, dwell, scan context             |

### Local radar track object

| Field | Meaning |
|:---|:---|
| `local_track_id` | Stable per radar |
| `sensor_id` | Owning radar |
| `state` | Position and velocity estimate |
| `covariance` | State uncertainty |
| `existence_probability` | Probability the target is real |
| `track_quality` | Operational quality summary |
| `track_state` | Candidate, tentative, confirmed, coasting, deleted |
| `motion_model` | CV, CA, coordinated turn, IMM mixture |
| `last_update_time` | Freshness |
| `planned_next_update_time` | Important for phased-array sources |
| `support_count` | Recent supporting detections |
| `sector_clutter_level` | Local stress indicator |

### System track object

| Field                       | Meaning                       |
|:----------------------------|:------------------------------|
| `system_track_id`           | EO C2 stable id               |
| `state`                     | Fused state estimate          |
| `covariance`                | Fused uncertainty             |
| `existence_probability`     | System-level existence        |
| `track_quality`             | Overall quality               |
| `classification_hypotheses` | Optional type beliefs         |
| `contributing_local_tracks` | Provenance list               |
| `fusion_mode`               | Centralized, track fusion, CI |
| `registration_health`       | Safe, degraded, unsafe        |
| `time`                      | Common fusion epoch           |
| `lineage_version`           | Update history                |

## Recommended algorithm stack by scenario

| Scenario | Single-radar recommendation | Multi-radar recommendation |
|:---|:---|:---|
| Sparse surveillance, modest clutter | GNN plus Kalman or converted-measurement filter | Centralized fusion if available |
| Moderate clutter, moderate maneuvers | PDA or JPDA plus IMM | Track fusion with explicit quality and bias handling |
| Dense crossings and unresolved ambiguity | Track-oriented MHT or JIPDA | Conservative fusion and delayed confirmation |
| Low observable or weak detections | Candidate logic plus TBD branch | Fuse only after existence rises above threshold |
| Multifunction phased-array with heavy task competition | IMM plus adaptive revisit and scheduler coupling | Do not ignore update timing heterogeneity |

## Algorithm selection rules for code agents

The following rules are suitable retrieval targets for Claude.

- If clutter is low and targets are well separated, start with GNN before adopting heavier association logic \[Kir04\].
- If the design needs explicit promotion and deletion confidence, choose IPDA or JIPDA rather than only M of N logic \[Mus94, Mus02\].
- If close crossings, unresolved groups, or delayed decisions matter, move to track-oriented MHT \[Bla04b, Cho18\].
- If targets maneuver enough to break a single kinematic model, use IMM \[Bus95, Mus08\].
- If Doppler exists, include it in both association and filtering, not only in display \[Bor11b, Kur06\].
- If multiple radars publish only tracks and error correlation is unknown, use conservative fusion such as covariance intersection \[Jul01\].
- If clock or registration state is weak, do not claim precision fused tracks \[Joh05, Dro06\].
- If the radar is phased-array, revisit interval is part of the tracker state, not outside context \[Shi95, Hon92\].

## Failure modes that should be modeled explicitly

| Failure mode | Likely root cause | Correct response |
|:---|:---|:---|
| False confirmed tracks | Threshold too low or confirmation too permissive | Raise existence threshold or strengthen initiation logic \[Hen61, Cla19\] |
| Track swaps in crossings | Early hard assignment | Move from GNN to JPDA or MHT \[For80, Bla04b\] |
| Track coalescence | PDA or JPDA under close spacing | Use MHT or stronger separation logic \[Fit85, Cho18\] |
| Duplicate system tracks across radars | Registration bias or weak association | Bias estimation and conservative fusion \[Joh05, Dro06\] |
| Overconfident fused tracks | Ignored cross correlation | CI or explicit correlation treatment \[Jul01, Cho00b\] |
| Track loss on maneuver | Single model filter or slow revisit | IMM and adaptive revisit \[Bus95, Shi95\] |
| Missed weak targets | Hard thresholding too early | TBD branch or low-threshold candidate logic \[Ton98, Joh02\] |

## Baseline recommendation for the EO C2 enhancement

A strong first implementation should avoid novelty for its own sake. The literature supports a conservative baseline that can later be extended.

1.  Use debiased converted measurement filtering or carefully designed EKF logic for single-radar updates from range and angle data \[Ler93, Par01\].
2.  Use IMM for maneuver handling in air-defense conditions \[Bus95, Mus08\].
3.  Use IPDA or JIPDA when the system needs explicit existence scoring and robust promotion or deletion \[Mus94, Mus02\].
4.  Use track-oriented MHT only in sectors where ambiguity and crossings justify the cost \[Bla04b, Cho18\].
5.  Keep track before detect as an optional weak-target branch rather than the default architecture \[Ton98, Gro13\].
6.  Separate local radar tracks from fused system tracks and do not hide the transition between them \[Cho00b, Joh05\].
7.  Prefer centralized measurement fusion. When forced into track-to-track fusion, use conservative logic and enforce registration and timing health gates \[Che03, Jul01, Joh05\].
8.  For phased-array radars, store planned revisit and scheduler context on each track \[Hon92, Kuo02, Ylm19\].
9.  Expose existence, covariance, freshness, and provenance in every EO cue generated from a radar track \[Joh05, Dru93\].

This baseline is the best fit for EO C2 because it yields retrieval-friendly artifacts, stable build contracts, and operationally credible cue quality without requiring an immediately maximal tracking stack \[Bla99, Bar95, Joh05\].

---

## References

\[Bla99\] S. Blackman and R. Populi, “Design and Analysis of Modern Tracking Systems,” Aug. 01, 1999.

\[Bar95\] Y. Bar-Shalom and R. Xiao, “Multitarget-Multisensor Tracking: Principles and Techniques,” 1995.

\[Far80\] A. Farina and S. Pardini, “Survey of radar data-processing techniques in air-traffic-control and surveillance systems,” vol. 127, pp. 190–204, Jun. 1980, doi: [10.1049/IP-F-1:19800030](https://doi.org/10.1049/IP-F-1:19800030).

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Cho00b\] C. Chong, S. Mori, W. H. Barker, and K.-C. Chang, “Architectures and algorithms for track association and fusion,” 2000. doi: [10.1109/62.821657](https://doi.org/10.1109/62.821657).

\[Cho08\] W.-Y. Choi, S.-M. Hong, D.-G. Lee, and J.-K. Jung, “A Survey on Track Fusion for Radar Target Tracking,” *Journal of the Korea Institute of Military Science and Technology*, vol. 11, pp. 85–92, 2008.

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Ler93\] D. Lerro and Y. Bar-Shalom, “Tracking with debiased consistent converted measurements versus EKF,” Jul. 01, 1993. doi: [10.1109/7.220948](https://doi.org/10.1109/7.220948).

\[Par01\] S.-T. Park and J.-G. Lee, “Improved Kalman filter design for three-dimensional radar tracking,” Apr. 01, 2001. doi: [10.1109/7.937485](https://doi.org/10.1109/7.937485).

\[Mus94\] D. Musicki, R. Evans, and S. Stankovic, “Integrated probabilistic data association,” *IEEE Trans. Autom. Control.*, vol. 39, pp. 1237–1241, Jun. 1994, doi: [10.1109/9.293185](https://doi.org/10.1109/9.293185).

\[Cla19\] I. Clarkson and J. L. Williams, “Alert-Confirm Track Confirmation for Radar,” in *2019 International Radar Conference (RADAR)*, Sep. 2019, pp. 1–5. doi: [10.1109/RADAR41533.2019.171251](https://doi.org/10.1109/RADAR41533.2019.171251).

\[Sea71\] R. Sea, “An efficient suboptimal decision procedure for associating sensor data with stored tracks in real-time surveillance systems,” Dec. 01, 1971. doi: [10.1109/CDC.1971.270945](https://doi.org/10.1109/CDC.1971.270945).

\[Kir04\] T. Kirubarajan and Y. Bar-Shalom, “Probabilistic data association techniques for target tracking in clutter,” *Proceedings of the IEEE*, vol. 92, pp. 536–557, Nov. 2004, doi: [10.1109/JPROC.2003.823149](https://doi.org/10.1109/JPROC.2003.823149).

\[Mus08\] D. Musicki and S. Suvorova, “Tracking in clutter using IMM-IPDA-based algorithms,” May 12, 2008. doi: [10.1109/TAES.2008.4516993](https://doi.org/10.1109/TAES.2008.4516993).

\[Bla04b\] S. Blackman, “Multiple hypothesis tracking for multiple target tracking,” *IEEE Aerospace and Electronic Systems Magazine*, vol. 19, pp. 5–18, 2004, doi: [10.1109/MAES.2004.1263228](https://doi.org/10.1109/MAES.2004.1263228).

\[You16\] H. You, X. Jianjuan, and G. Xin, “Multi‐target Track Termination Theory and Track Management,” Aug. 08, 2016. doi: [10.1002/9781118956878.CH11](https://doi.org/10.1002/9781118956878.CH11).

\[Jef89\] T. W. Jeffrey, “Track quality estimation for multiple-target tracking radars,” in *Proceedings of the IEEE National Radar Conference*, Mar. 1989, pp. 76–79. doi: [10.1109/NRC.1989.47619](https://doi.org/10.1109/NRC.1989.47619).

\[Che03\] H. Chen, T. Kirubarajan, and Y. Bar-Shalom, “Performance limits of track-to-track fusion versus centralized estimation: theory and application \[sensor fusion\],” Jun. 25, 2003. doi: [10.1109/TAES.2003.1207252](https://doi.org/10.1109/TAES.2003.1207252).

\[Jul01\] S. Julier and J. Uhlmann, “General Decentralized Data Fusion With Covariance Intersection (CI),” 2001. doi: [10.1201/9781420053098-19](https://doi.org/10.1201/9781420053098-19).

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Bar04\] Y. Bar-Shalom and H. Chen, “IMM estimator with out-of-sequence measurements,” Aug. 25, 2004. doi: [10.1117/12.562691](https://doi.org/10.1117/12.562691).

\[But98\] J. M. Butler, “Tracking and control in multi-function radar,” 1998.

\[Bor11b\] S. Bordonaro, P. Willett, and Y. Bar-Shalom, “Tracking with converted position and Doppler measurements,” Sep. 16, 2011. doi: [10.1117/12.895484](https://doi.org/10.1117/12.895484).

\[Kur06\] F. Kural, F. Arıkan, O. Arikan, and M. Efe, “Incorporating Doppler Velocity Measurement for Track Initiation and Maintenance,” Mar. 07, 2006. doi: [10.1049/IC:20060562](https://doi.org/10.1049/IC:20060562).

\[Ton98\] S. M. Tonissen and Y. Bar-Shalom, “Maximum likelihood track-before-detect with fluctuating target amplitude,” Jul. 01, 1998. doi: [10.1109/7.705887](https://doi.org/10.1109/7.705887).

\[Sed06\] M. Sedehi, P. Lombardo, and A. Farina, “A modified M/N logic for track initiation of low observable targets using amplitude information,” May 24, 2006. doi: [10.1109/IRS.2006.4338080](https://doi.org/10.1109/IRS.2006.4338080).

\[Hon92\] S.-M. Hong, “Design of a Variable Sampling Rate Tracking Filter for a Phased Array Radar,” 1992.

\[Hen61\] H. R. Henn, “Optimizing the decision to track in an automatic radar processor.” 1961.

\[Dro06\] A. Drozd, R. Niu, I. Kasperovich, P. Varshney, and C. E. Carroll, “Real-time radar data fusion and registration systems for single integrated air picture,” May 05, 2006. doi: [10.1117/12.665786](https://doi.org/10.1117/12.665786).

\[Mus02\] D. Musicki and R. Evans, “Joint Integrated Probabilistic Data Association - JIPDA,” in *Proceedings of the Fifth International Conference on Information Fusion. FUSION 2002. (IEEE Cat.No.02EX5997)*, Jul. 2002, pp. 1120–1125 vol.2. doi: [10.1109/ICIF.2002.1020938](https://doi.org/10.1109/ICIF.2002.1020938).

\[Bus95\] M. Busch and S. Blackman, “Evaluation of IMM filtering for an air defense system application,” Sep. 01, 1995. doi: [10.1117/12.217717](https://doi.org/10.1117/12.217717).

\[Shi95\] H.-J. Shin, S. Hong, and D. Hong, “Adaptive-update-rate target tracking for phased-array radar,” Jun. 01, 1995. doi: [10.1049/IP-RSN:19951903](https://doi.org/10.1049/IP-RSN:19951903).

\[Wan02b\] X. Wang, S. Challa, and R. Evans, “Gating techniques for maneuvering target tracking in clutter,” *Advances in Engineering Software*, Dec. 2002, doi: [10.1109/TAES.2002.1039426](https://doi.org/10.1109/TAES.2002.1039426).

\[Li02b\] X. R. Li, N. Li, and V. Jilkov, “SPRT-Based track confirmation and rejection,” in *Proceedings of the Fifth International Conference on Information Fusion. FUSION 2002. (IEEE Cat.No.02EX5997)*, Jul. 2002, pp. 951–958 vol.2. doi: [10.1109/ICIF.2002.1020914](https://doi.org/10.1109/ICIF.2002.1020914).

\[Ain21\] P. Ainsleigh, T. Luginbuhl, and P. Willett, “A Sequential Target Existence Statistic for Joint Probabilistic Data Association,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 57, pp. 371–381, Feb. 2021, doi: [10.1109/TAES.2020.3018899](https://doi.org/10.1109/TAES.2020.3018899).

\[Joh02\] L. Johnston and V. Krishnamurthy, “Performance analysis of a dynamic programming track before detect algorithm,” Aug. 07, 2002. doi: [10.1109/7.993242](https://doi.org/10.1109/7.993242).

\[Bar75\] Y. Bar-Shalom and E. Tse, “Tracking in a cluttered environment with probabilistic data association,” *Autom.*, vol. 11, pp. 451–460, Sep. 1975, doi: [10.1016/0005-1098(75)90021-7](https://doi.org/10.1016/0005-1098(75)90021-7).

\[Bar09\] Y. Bar-Shalom, F. Daum, and J. Huang, “The probabilistic data association filter,” Nov. 20, 2009. doi: [10.1109/MCS.2009.934469](https://doi.org/10.1109/MCS.2009.934469).

\[For80\] T. Fortmann, Y. Bar-Shalom, and M. Scheffe, “Multi-target tracking using joint probabilistic data association,” in *1980 19th IEEE Conference on Decision and Control including the Symposium on Adaptive Processes*, Dec. 1980, pp. 807–812. doi: [10.1109/CDC.1980.271915](https://doi.org/10.1109/CDC.1980.271915).

\[Cha84\] K.-C. Chang and Y. Bar-Shalom, “Joint probabilistic data association for multitarget tracking with possibly unresolved measurements and maneuvers,” Jul. 01, 1984. doi: [10.1109/TAC.1984.1103597](https://doi.org/10.1109/TAC.1984.1103597).

\[Rei78\] D. Reid, “An algorithm for tracking multiple targets,” in *1978 IEEE Conference on Decision and Control including the 17th Symposium on Adaptive Processes*, 1978, pp. 1202–1211. doi: [10.1109/CDC.1978.268125](https://doi.org/10.1109/CDC.1978.268125).

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Dar07\] M. Darko, B. F. L. Scala, and R. J. Evans, “Integrated track splitting filter - efficient multi-scan single target tracking in clutter,” Oct. 01, 2007. doi: [10.1109/TAES.2007.4441748](https://doi.org/10.1109/TAES.2007.4441748).

\[Mus09\] D. Musicki and R. J. Evans, “Multiscan Multitarget Tracking in Clutter with Integrated Track Splitting Filter,” Oct. 01, 2009. doi: [10.1109/TAES.2009.5310309](https://doi.org/10.1109/TAES.2009.5310309).

\[Suc99\] P. Suchomski, “Explicit expressions for debiased statistics of 3D converted measurements,” 1999. doi: [10.1109/7.745708](https://doi.org/10.1109/7.745708).

\[Roe95\] J. A. Roecker, “Multiple scan joint probabilistic data association,” Jul. 01, 1995. doi: [10.1109/7.395216](https://doi.org/10.1109/7.395216).

\[Leu99\] H. Leung, Z. Hu, and M. Blanchette, “Evaluation of multiple radar target trackers in stressful environments,” Apr. 01, 1999. doi: [10.1109/7.766946](https://doi.org/10.1109/7.766946).

\[Ton96\] S. M. Tonissen and R. Evans, “Peformance of dynamic programming techniques for Track-Before-Detect,” Oct. 01, 1996. doi: [10.1109/7.543865](https://doi.org/10.1109/7.543865).

\[Gro13\] E. Grossi, M. Lops, and L. Venturino, “A Novel Dynamic Programming Algorithm for Track-Before-Detect in Radar Systems,” *IEEE Transactions on Signal Processing*, vol. 61, pp. 2608–2619, May 2013, doi: [10.1109/TSP.2013.2251338](https://doi.org/10.1109/TSP.2013.2251338).

\[Coh86\] S. Cohen, “Adaptive variable update rate algorithm for tracking targets with a phased array radar,” Jun. 01, 1986. doi: [10.1049/IP-F-1:19860045](https://doi.org/10.1049/IP-F-1:19860045).

\[Din08\] Z. Ding, “A survey of radar resource management algorithms,” in *2008 Canadian Conference on Electrical and Computer Engineering*, May 2008, pp. 001559–001564. doi: [10.1109/CCECE.2008.4564804](https://doi.org/10.1109/CCECE.2008.4564804).

\[Kuo02\] T.-W. Kuo, Y.-S. Chao, C.-F. Kuo, and C. Chang, “Real-time dwell scheduling of component-oriented phased array radars,” *Proceedings of the 2002 IEEE Radar Conference (IEEE Cat. No.02CH37322)*, pp. 92–97a, Aug. 2002, doi: [10.1109/NRC.2002.999699](https://doi.org/10.1109/NRC.2002.999699).

\[Str96\] D. Stromberg, “Scheduling of track updates in phased array radars,” in *Proceedings of the 1996 IEEE National Radar Conference*, May 1996, pp. 214–219. doi: [10.1109/NRC.1996.510683](https://doi.org/10.1109/NRC.1996.510683).

\[Ylm19\] A. Yılmaz, “A Survey on Radar Scheduling: An Essential Component for Multifunction Radars,” 2019.

\[Wat94b\] G. Watson and W. Blair, “Tracking performance of a phased array radar with revisit time controlled using the IMM algorithm,” in *Proceedings of 1994 IEEE National Radar Conference*, Mar. 1994, pp. 160–165. doi: [10.1109/NRC.1994.328112](https://doi.org/10.1109/NRC.1994.328112).

\[Tia12\] X. Tian and Y. Bar-Shalom, “Track-to-Track Fusion Architectures - A Review,” Oct. 2012.

\[Cho08b\] C. Chong, “Representing Input Track Quality in Distributed Tracking,” 2008.

\[Mal02\] M. Mallick, J. Krant, and Y. Bar-Shalom, “Multi-sensor multi-target tracking using out-of-sequence measurements,” in *Proceedings of the Fifth International Conference on Information Fusion. FUSION 2002. (IEEE Cat.No.02EX5997)*, Jul. 2002, pp. 135–142 vol.1. doi: [10.1109/ICIF.2002.1021142](https://doi.org/10.1109/ICIF.2002.1021142).

\[Tal14\] H. Talebi and A. Hemmatyar, “Asynchronous Track-to-Track Fusion by Direct Estimation of Time of Sample in Sensor Networks,” 2014. doi: [10.1109/JSEN.2013.2281394](https://doi.org/10.1109/JSEN.2013.2281394).

\[Fit85\] R. Fitzgerald, “Track Biases and Coalescence with Probabilistic Data Association,” Nov. 01, 1985. doi: [10.1109/TAES.1985.310670](https://doi.org/10.1109/TAES.1985.310670).
