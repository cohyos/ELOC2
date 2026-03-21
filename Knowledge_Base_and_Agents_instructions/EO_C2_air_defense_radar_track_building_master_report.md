# EO C2 air defense radar track building master report

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO C2 air defense radar track building master report](#eo-c2-air-defense-radar-track-building-master-report)
- [Main conclusions](#main-conclusions)
- [End-to-end build architecture](#end-to-end-build-architecture)
- [Radar detection and measurement requirements](#radar-detection-and-measurement-requirements)
  - [Minimum detection fields](#minimum-detection-fields)
  - [Minimum track fields](#minimum-track-fields)
  - [Measurement handling rules](#measurement-handling-rules)
- [Single-radar track building](#single-radar-track-building)
  - [Practical processing chain](#practical-processing-chain)
  - [Track initiation, confirmation, and termination](#track-initiation-confirmation-and-termination)
  - [Data association ladder](#data-association-ladder)
  - [Filters, models, and smoothing](#filters-models-and-smoothing)
- [Multiscan ambiguity and heavy clutter methods](#multiscan-ambiguity-and-heavy-clutter-methods)
- [Track-before-detect and weak target tracking](#track-before-detect-and-weak-target-tracking)
- [Phased-array and multifunction radar specifics](#phased-array-and-multifunction-radar-specifics)
  - [Core differences from rotating surveillance radars](#core-differences-from-rotating-surveillance-radars)
  - [Practical policy for EO C2](#practical-policy-for-eo-c2)
- [Multi-radar fusion kept separate from single-radar tracking](#multi-radar-fusion-kept-separate-from-single-radar-tracking)
  - [Architecture choice](#architecture-choice)
  - [Fusion prerequisites](#fusion-prerequisites)
  - [Fusion rules for EO C2](#fusion-rules-for-eo-c2)
- [Track quality, failure modes, and operational safeguards](#track-quality-failure-modes-and-operational-safeguards)
  - [Recommended quality object](#recommended-quality-object)
  - [Failure modes](#failure-modes)
- [EO C2 integration requirements](#eo-c2-integration-requirements)
  - [Required EO-facing system track fields](#required-eo-facing-system-track-fields)
  - [Cue object fields for downstream EO services](#cue-object-fields-for-downstream-eo-services)
- [Recommended baseline stack for the first serious build](#recommended-baseline-stack-for-the-first-serious-build)
- [Reference tables by subtopic](#reference-tables-by-subtopic)
  - [Core references for radar tracking system design and multi-target tracking practice](#core-references-for-radar-tracking-system-design-and-multi-target-tracking-practice)
  - [Radar measurement models needed for track building](#radar-measurement-models-needed-for-track-building)
  - [Single-radar track initiation, confirmation, termination, and quality metrics](#single-radar-track-initiation-confirmation-termination-and-quality-metrics)
  - [Single-radar data association and multitarget tracking](#single-radar-data-association-and-multitarget-tracking)
  - [Multi-scan track building in dense clutter with track splitting and existence probability](#multi-scan-track-building-in-dense-clutter-with-track-splitting-and-existence-probability)
  - [Multiple Hypothesis Tracking for surveillance radar track building](#multiple-hypothesis-tracking-for-surveillance-radar-track-building)
  - [Track-before-detect and weak-target track building](#track-before-detect-and-weak-target-track-building)
  - [Track filters and smoothing used in operational TWS](#track-filters-and-smoothing-used-in-operational-tws)
  - [Phased-array and multi-function radar specifics for tracking](#phased-array-and-multi-function-radar-specifics-for-tracking)
  - [Multi-radar track fusion and handoff kept separate from single-radar tracking](#multi-radar-track-fusion-and-handoff-kept-separate-from-single-radar-tracking)
- [Final synthesis](#final-synthesis)
- [References](#references)

## EO C2 air defense radar track building master report

Air-defense radar track building is the discipline that turns noisy detections, irregular revisits, clutter returns, and multisensor timing mismatch into a stable air picture that a command system can act on. The literature is mature on the core architecture. A credible system separates measurement handling, local track formation, existence management, multitarget association, maneuver filtering, track management, and multisensor fusion, then carries uncertainty and provenance all the way to downstream consumers \[Bla99, Bar95, Far80, Joh05\].

For EO C2, the key architectural lesson is simple. Single-radar track building and multi-radar fusion should not be treated as the same problem. Single-radar tracking is mostly about measurement models, initiation, gating, association, and maneuver handling within one sensor stream. Multi-radar fusion adds asynchronous timing, registration bias, track-to-track correlation, and architecture tradeoffs between centralized and distributed fusion \[Cho00b, Che03, Jul01, Joh05\]. A strong implementation preserves that separation in both software and data contracts.

The center of gravity of the literature supports a conservative operational baseline. Use statistically sound measurement handling, explicit track existence logic, IMM style maneuver handling, adaptive association complexity by clutter regime, and conservative fusion when cross-correlation is unknown \[Ler93, Par01, Mus94, Mus02, Kir04, Bus95, Jul01\]. More advanced options such as track-before-detect, integrated track splitting, and track-oriented MHT should exist as deliberate upgrades for weak targets or dense ambiguity, not as the default everywhere \[Ton98, Dar07, Mus09, Cho18\].

## Main conclusions

| Question | Most defensible answer |
|:---|:---|
| What measurements are needed | Time, sensor mode, range, azimuth, elevation if available, Doppler if available, covariance, detection strength, and quality flags \[Ler93, Par01, Bor11b\] |
| Best default initiation logic | M of N in simple scenes, IPDA when explicit existence scoring is needed, JIPDA or MHT in dense ambiguity \[Mus94, Mus02, Cla19, Bla04b\] |
| Best default maintenance logic | Kalman or converted-measurement filtering with IMM for maneuvers and PDA or JPDA class association by clutter level \[Ler93, Bus95, Kir04\] |
| Best default fusion architecture | Centralized measurement fusion when possible, conservative track fusion when local trackers must remain separate \[Che03, Cho00b, Jul01\] |
| Biggest implementation risk | Registration bias, clock mismatch, and overconfident fusion of correlated local tracks \[Joh05, Dro06, Jul01\] |
| Biggest phased-array difference | Revisit interval becomes a controlled variable and part of the tracking problem itself \[Hon92, Shi95, Kuo02\] |
| Upgrade path for weak targets | Track-before-detect and multiscan evidence accumulation \[Ton98, Joh02, Dar07\] |

## End-to-end build architecture

The most robust architecture is a staged pipeline with explicit handoff objects between stages. That is how the older radar tracking canon and the air-defense fusion literature remain compatible \[Bla99, Bar95, Dru93, Joh05\].

| Layer | Core responsibility | Recommended baseline |
|:---|:---|:---|
| Detection normalization | Preserve raw radar measurements and metadata | Keep native measurement coordinates plus covariance \[Ler93, Par01\] |
| Local track initiation | Decide whether a plausible new target exists | M of N or IPDA family \[Mus94, Cla19, Sea71\] |
| Local track maintenance | Associate plots and update track state | GNN, PDA, JPDA, or MHT by clutter level \[Kir04, Bla04b\] |
| Track management | Promote, coast, split, merge, and delete | Use existence and quality logic, not hit count alone \[Mus94, You16, Jef89\] |
| Radar resource control | Decide revisit and dwell policy for multifunction radars | Adaptive update policy tied to maneuver and load \[Hon92, Shi95, Din08\] |
| Multisensor fusion | Build system tracks from local tracks or measurements | Centralized if possible, conservative if distributed \[Che03, Cho00b, Jul01\] |
| EO C2 publication | Publish track objects for cueing and operator display | Carry provenance, uncertainty, freshness, and health \[Joh05, Dru93\] |

## Radar detection and measurement requirements

The measurement model is the first place where many radar tracking systems quietly lose consistency. A track builder that receives only flattened Cartesian points with no covariance, no timing quality, and no mode metadata is already damaged before association begins \[Ler93, Par01, Far80\].

### Minimum detection fields

| Field | Purpose | Notes |
|:---|:---|:---|
| Detection time | Common prediction epoch | Required for fusion and OOSM handling \[Joh05, Bar04\] |
| Sensor id | Source identity | Needed for lineage and fusion \[Cho00b\] |
| Sensor mode | Search, track, sector, phased-array task class | Needed for revisit interpretation \[But98, Ylm19\] |
| Range | Primary positional content | Use native uncertainty \[Ler93\] |
| Azimuth | Primary angular content | Use native uncertainty \[Ler93\] |
| Elevation or altitude proxy | 3D observability | Important for 3D filters \[Par01\] |
| Doppler or range rate | Strong extra discriminator | Improves initiation and association \[Bor11b, Kur06\] |
| Measurement covariance | Statistical validity of filtering and gating | Mandatory, not optional \[Bar95, Par01\] |
| Amplitude or SNR | Weak target support | Important for low observable logic \[Ton98, Sed06\] |
| Quality flags | Clutter, ambiguity, jamming, sidelobe, saturation | Prevents blind trust in plots \[Far80, Bla99\] |
| Beam metadata | Pointing, dwell, scan context | Important for phased-array radars \[Hon92, Kuo02\] |

### Minimum track fields

| Field | Purpose | Notes |
|:---|:---|:---|
| State estimate | Position and velocity | Cartesian state remains the practical default \[Bla99, Bar95\] |
| State covariance | Gating, fusion, downstream scheduling | Must remain consistent after conversion \[Ler93\] |
| Existence probability | Track reality score | Better than binary confirmed or not confirmed \[Mus94, Mus02\] |
| Track quality | Operational confidence | Should reflect evidence depth and stability \[Jef89, Leu99\] |
| Track state | Candidate, tentative, confirmed, coasted, deleted | Explicit lifecycle is essential \[Dru93, You16\] |
| Last update time | Freshness | Needed for coast and cue validity \[Joh05\] |
| Motion model status | CV, maneuvering, IMM mixture | Guides revisit and prediction \[Bus95, Shi95\] |
| Source history | Provenance and audit | Required for correct multisensor use \[Joh05, Cho00b\] |
| Planned next update time | Scheduler awareness | Critical for phased-array radars \[Hon92, Str96\] |

### Measurement handling rules

- Preserve native sensor measurements until the conversion step is explicitly justified \[Ler93, Par01\].
- Carry covariance with every measurement and every track update \[Bar95, Cho00b\].
- Treat Doppler as a first-class measurement when available \[Bor11b, Kur06\].
- Store mode and beam context because they shape revisit expectations and update policy \[But98, Hon92\].
- Never treat missing timing and registration quality as harmless omissions in multisensor fusion \[Joh05, Dro06\].

## Single-radar track building

Single-radar track building is the foundation on which the rest of the air picture sits. Even when a system is multisensor, each source must still solve local existence, association, and maneuver problems in its own stream \[Bla99, Bar95\].

### Practical processing chain

| Step | Baseline | Upgrade path |
|:---|:---|:---|
| Plot normalization | Native measurement plus covariance | Add Doppler enriched models \[Bor11b, Kur06\] |
| Validation gating | Ellipsoidal statistical gate | Adaptive maneuver gating \[Wan02b\] |
| Initiation | M of N for sparse clean scenes | IPDA or alert-confirm in clutter \[Mus94, Cla19\] |
| Association | GNN for sparse sectors | PDA, JPDA, JIPDA, MHT in ambiguity \[Kir04, Mus02, Bla04b\] |
| Filtering | Converted-measurement KF or careful EKF | IMM for maneuvers \[Ler93, Bus95\] |
| Lifecycle management | Coast logic and deletion thresholds | Existence-driven management \[Mus94, You16\] |
| Quality scoring | Evidence and consistency score | Add perceivability and track-life metrics \[Li01, Jef89\] |

### Track initiation, confirmation, and termination

Track initiation is not one solved formula. It is a trade between false-track rate, missed weak targets, and computational burden. The classical answer is M of N logic, often with variants that use amplitude or velocity information in heavy clutter \[Sea71, Hen61, Sed06, Lee18\]. Modern approaches move the same decision into an existence-probability framework, which is more natural for systems that need graded confidence rather than a brittle hard threshold \[Mus94, Mus02, Ain21\].

| Regime | Recommended logic | Why |
|:---|:---|:---|
| Sparse surveillance | M of N | Fast and operationally simple \[Sea71\] |
| Moderate clutter | IPDA | Integrates association and track existence \[Mus94\] |
| Dense ambiguity | JIPDA or MHT-based confirmation | Better delayed decisions \[Mus02, Bla04b\] |
| Electronically scanned alert-confirm operation | Alert-confirm track confirmation | Natural fit when confirmation dwells are available \[Cla19\] |
| Weak targets near threshold | Candidate logic plus TBD support | Hard thresholding may fail \[Ton98, Joh02\] |

A practical track state machine for EO C2 is:

- Candidate
- Tentative
- Confirmed
- Coasting
- Deleted
- Split child
- Merged history only

Promotion should depend on both evidence count and existence score. Deletion should depend on both miss history and forecast uncertainty growth \[Mus94, You16, Jef89\].

### Data association ladder

Data association complexity should scale with scene difficulty. The literature does not support one universal winner. Instead it supports a ladder from cheap hard assignment to delayed hypothesis management \[Bar75, Kir04, Bla04b\].

| Method | Best use case | Main limitation |
|:---|:---|:---|
| Nearest neighbor | Sparse targets, low clutter | Swaps easily in crossings |
| Global nearest neighbor | Moderate density | Still commits too early |
| PDA | Single target in clutter | Limited for coupled multitarget ambiguity \[Bar75, Bar09\] |
| JPDA | Moderate multitarget scenes | Can coalesce close tracks \[For80, Cha84, Fit85\] |
| IPDA and JIPDA | Need explicit existence management | Higher complexity \[Mus94, Mus02\] |
| Track-oriented MHT | Dense ambiguity and delayed decisions | Compute and pruning burden \[Rei78, Cho18\] |
| Integrated track splitting family | Heavy clutter and multiscan evidence | Specialized and less common operationally \[Dar07, Mus09\] |

The most defensible EO C2 default is:

- GNN plus IMM for clean sparse sectors
- PDA or JPDA plus IMM for moderate clutter and crossing targets
- JIPDA when existence logic matters operationally
- Track-oriented MHT for high-value sectors with dense ambiguity

### Filters, models, and smoothing

Filtering choices should follow measurement geometry and target dynamics, not fashion. The measurement conversion literature shows that a carefully debiased converted-measurement filter can outperform naive EKF use and produce more consistent covariance behavior \[Ler93, Suc99\]. The 3D radar literature reinforces that nonlinear geometry must be reflected in covariance design, especially when elevation is involved \[Par01\]. Maneuvering air-defense targets justify model switching, with IMM standing out as the most practical baseline \[Bus95, Mus08\].

| Condition | Recommended handling |
|:---|:---|
| Range and angle only | Debiased converted-measurement filtering or carefully designed EKF \[Ler93, Par01\] |
| Range, angle, and Doppler | Put Doppler into both association and filtering \[Bor11b, Kur06\] |
| Maneuvering targets | IMM with constant velocity and maneuver model bank \[Bus95, Mus08\] |
| Need smoother historical state | Fixed-lag smoothing branch for maintenance and replay \[Cha04, Ogl02\] |
| Legacy or low compute TWS | Alpha-beta or alpha-beta-gamma family still viable \[Ben62, Sin71\] |

## Multiscan ambiguity and heavy clutter methods

When clutter is high and decisions should not be forced scan by scan, multiscan methods become important. The integrated track splitting family offers a middle ground between simple PDA class methods and full MHT. It uses multiscan evidence and track existence ideas to remain efficient in clutter \[Dar07, Mus03, Mus09\]. MHT remains the canonical approach when delayed decisions across multiple scans are the main requirement \[Rei78, Bla04b, Cho18\].

| Situation | Strongest candidate |
|:---|:---|
| Dense clutter with one target per local problem | Integrated track splitting family \[Dar07\] |
| Dense multitarget ambiguity | Track-oriented MHT \[Cho18, Cor11\] |
| Moderate ambiguity with explicit existence need | JIPDA \[Mus02\] |
| Extreme compute constraint | JPDA or GNN with strong gating, accepting lower robustness \[Kir04\] |

## Track-before-detect and weak target tracking

Track-before-detect is an important branch for weak or intermittent targets but should not be forced into the whole architecture. It is most useful when hard-thresholded plots are already losing the target before track initiation can stabilize \[Ton96, Ton98, Joh02\].

| Use TBD when | Avoid TBD when |
|:---|:---|
| SNR is low and detections are intermittent | Plot quality is already reliable |
| Cell-level or low-threshold evidence is available | Only hard plots are exposed |
| Mission value justifies extra compute | Latency and compute budgets are very tight |

For EO C2, TBD should be an upgrade branch for small or low observable targets rather than the baseline for all air tracks \[Ton98, Gro13\].

## Phased-array and multifunction radar specifics

Phased-array tracking changes the structure of the problem because revisit interval is no longer fixed by scan geometry. The radar can vary update time, dwell scheduling, and beam allocation by target. That means tracking performance and resource management are coupled \[Coh86, Hon92, Shi95, Din08\]. Rotating multifunction radars show a similar coupling under sector load imbalance, though less flexibly \[But98\].

### Core differences from rotating surveillance radars

| Issue | Rotating radar | Phased-array or multifunction radar |
|:---|:---|:---|
| Revisit interval | Largely scan-driven | Adaptive and target-dependent \[Shi95, Hon92\] |
| Beam control | Follows scan pattern | Explicitly scheduled \[Kuo02, Str96\] |
| Load balancing | Geometric and limited | Resource management problem \[Din08, Ylm19\] |
| Track freshness | Often near-uniform | Heterogeneous across tracks \[Wat94b, Kuo02\] |

### Practical policy for EO C2

- Use adaptive revisit based on predicted error growth and maneuver status \[Shi95, Hon92\].
- Keep scheduler inputs explicit: track priority, threat class, predicted covariance growth, and beam cost \[Din08, Kuo02\].
- Reserve minimum surveillance resources before optimizing track updates \[Kuo02\].
- Publish planned next update time on each track so downstream fusion can reason about staleness \[Str96, Ylm19\].
- Treat scheduler pressure as a track quality input when deciding whether a local track is safe to use downstream \[But98, Din08\].

## Multi-radar fusion kept separate from single-radar tracking

Once multiple radars contribute to one air picture, the problem changes from local estimation to system architecture. The key choices are whether to fuse measurements centrally or to fuse locally built tracks, and how to remain consistent when local track errors are correlated or registration is imperfect \[Cho00b, Che03, Jul01\].

### Architecture choice

| Architecture | Strength | Main caution |
|:---|:---|:---|
| Centralized measurement fusion | Best accuracy reference | Requires shared measurements and timing \[Che03, Cho08\] |
| Sensor to system track fusion | Easier to integrate with existing local trackers | Correlated errors and track association burden \[Cho00b\] |
| Sensor to sensor track fusion | Useful in distributed networks | Harder consistency and governance \[Cho00b, Tia12\] |
| Covariance intersection style fusion | Safe when correlation is unknown | Conservative and sometimes less accurate \[Jul01\] |

The literature consistently points to centralized fusion as the performance reference and warns that track-to-track fusion degrades relative to centralized estimation as sensor count grows \[Che03\]. The practical implication is not that track fusion is wrong. It is that track fusion should be used knowingly, with conservative logic when correlations are unknown \[Cho00b, Jul01\].

### Fusion prerequisites

| Requirement | Why it matters |
|:---|:---|
| Common or predicted fusion epoch | Prevents time-skewed association \[Joh05, Tal14\] |
| Registration bias estimate | Prevents shifted or duplicate tracks \[Joh05, Dro06\] |
| Track lineage | Helps identify shared information and provenance \[Cho00b\] |
| Local track quality | Prevents over-weighting weak sources \[Cho08b\] |
| OOSM handling | Needed when updates arrive late \[Bar04, Mal02\] |

### Fusion rules for EO C2

- Prefer centralized measurement fusion whenever architecture allows it \[Che03\].
- If only local tracks are available, require covariance, update time, existence, quality, source lineage, and registration health on every track \[Cho00b, Joh05\].
- Use covariance intersection or an equally conservative method when cross-correlation is unknown \[Jul01\].
- Down-weight or block fusion when clock or registration health is stale \[Joh05, Dro06\].
- Predict all candidates to a common epoch before correlation \[Tal14, Bar04\].
- Preserve local-track to system-track lineage for operator audit and EO cue explanation \[Dru93, Joh05\].

## Track quality, failure modes, and operational safeguards

Operational tracking quality is not captured by covariance alone. Systems also care about target existence, freshness, ambiguity, maneuver stress, source diversity, and registration health \[Jef89, Leu99, Joh05\].

### Recommended quality object

- Existence probability
- Kinematic confidence
- Time since last solid update
- Rolling support count
- Source diversity count
- Current motion model confidence
- Sector clutter stress
- Registration health for fused tracks
- Scheduler pressure for phased-array local tracks

### Failure modes

| Failure mode | Likely cause | Safeguard |
|:---|:---|:---|
| False confirmed tracks | Initiation too permissive | Raise thresholds or move to existence-based logic \[Hen61, Mus94\] |
| Track swaps in crossings | Early hard assignment | Move to JPDA or MHT \[For80, Bla04b\] |
| Track coalescence | JPDA under close spacing | Use stronger ambiguity logic \[Fit85, Cho18\] |
| Duplicate system tracks | Registration bias or weak correlation | Bias estimation and conservative fusion \[Joh05, Dro06\] |
| Overconfident system covariance | Ignored cross-correlation | Use CI style fusion \[Jul01\] |
| Maneuver track loss | Single model filtering or stale revisit | IMM and adaptive update \[Bus95, Shi95\] |
| Missed weak targets | Hard thresholding too early | TBD or low-threshold candidate branch \[Ton98, Joh02\] |

## EO C2 integration requirements

The track builder is not only a radar function. In EO C2 it is the upstream truth source for tasking, cueing, audit, and operator explanation. That makes provenance and freshness operational fields, not engineering extras \[Joh05, Dru93\].

### Required EO-facing system track fields

| Field                      | Purpose                                 |
|:---------------------------|:----------------------------------------|
| `system_track_id`          | Stable command identifier               |
| `time`                     | Common system epoch                     |
| `state`                    | Predicted state for current epoch       |
| `covariance`               | Cue search region and confidence        |
| `existence_probability`    | Reality score                           |
| `track_quality`            | Operational quality                     |
| `track_state`              | Lifecycle state                         |
| `motion_model`             | Prediction behavior                     |
| `contributing_sources`     | Provenance and audit                    |
| `fusion_mode`              | Centralized, track fusion, conservative |
| `registration_health`      | Safe, degraded, unsafe                  |
| `last_update_time`         | Freshness                               |
| `planned_next_update_time` | Important for phased-array sources      |

### Cue object fields for downstream EO services

| Field                   | Purpose                          |
|:------------------------|:---------------------------------|
| `system_track_id`       | Cue identity                     |
| `predicted_state`       | Track state at cue start         |
| `covariance`            | Search gate                      |
| `valid_from`            | Cue validity start               |
| `valid_to`              | Cue validity end                 |
| `existence_probability` | Confidence                       |
| `track_quality`         | Priority and trust               |
| `source_summary`        | Which radars support the cue     |
| `registration_health`   | Whether precision cueing is safe |
| `expected_target_count` | Useful if ambiguity remains      |

## Recommended baseline stack for the first serious build

A first implementation should be conservative, retrieval-friendly, and operationally legible. The literature supports the following stack.

1.  Native measurement ingest with explicit covariance and mode metadata \[Ler93, Par01, Far80\].
2.  Debiased converted-measurement or carefully designed EKF updates for local radar tracks \[Ler93, Par01\].
3.  IMM for maneuver handling \[Bus95, Mus08\].
4.  M of N or IPDA for initiation depending on clutter burden \[Mus94, Cla19\].
5.  GNN in sparse sectors, PDA or JPDA in moderate clutter, MHT only where ambiguity justifies it \[Kir04, Bla04b, Cho18\].
6.  Centralized fusion where measurements are available, otherwise conservative track fusion with CI-style protection if correlation is unknown \[Che03, Jul01\].
7.  Explicit registration and clock health gating for any fused system track \[Joh05, Dro06\].
8.  Adaptive revisit publication for phased-array sources \[Hon92, Shi95, Ylm19\].
9.  Explicit quality and provenance fields on every EO-facing system track \[Joh05, Dru93\].

## Reference tables by subtopic

### Core references for radar tracking system design and multi-target tracking practice

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Bla99\] | Design and Analysis of Modern Tracking Systems | Broadest systems view of tracking design |
| \[Bar95\] | Multitarget-Multisensor Tracking: Principles and Techniques | Core text on tracking and fusion principles |
| \[Far80\] | Survey of radar data-processing techniques in air-traffic-control and surveillance systems | Early operational framing for surveillance and air-defense radar |
| \[Bla04b\] | Multiple hypothesis tracking for multiple target tracking | Practical MHT overview |
| \[Hal01\] | Handbook of Multisensor Data Fusion | Broad multisensor fusion reference |
| \[Bla86\] | Multiple-Target Tracking with Radar Applications | Classic radar tracking text |
| \[Sto99\] | Bayesian Multiple Target Tracking | Bayesian framing for multitarget tracking |
| \[Bus95\] | Evaluation of IMM filtering for an air defense system application | Air-defense maneuver tracking relevance |
| \[Dru93\] | The IADS track management concept: Data fusion in the real world | Operational track management view |
| \[Wig96\] | Operational multi-sensor tracking for air defense | Direct air-defense context |

### Radar measurement models needed for track building

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Ler93\] | Tracking with debiased consistent converted measurements versus EKF | Measurement conversion consistency |
| \[Par01\] | Improved Kalman filter design for three-dimensional radar tracking | 3D nonlinear radar measurement handling |
| \[Suc99\] | Explicit expressions for debiased statistics of 3D converted measurements | Converted measurement covariance details |
| \[Bor11b\] | Tracking with converted position and Doppler measurements | Doppler integrated filtering |
| \[Zho18\] | Statically Fused Converted Measurement Kalman Filters for Phased-Array Radars | Converted measurement fusion for phased arrays |
| \[Jin16\] | Debiased converted position and Doppler measurement tracking with array radar measurements in direction cosine coordinates | Modern converted Doppler treatment |
| \[Pel19\] | Optimal Radar Tracking in Cartesian Coordinates with Range, Doppler and Angle Measurements | Modern filter design perspective |
| \[Kur06\] | Incorporating Doppler Velocity Measurement for Track Initiation and Maintenance | Doppler as initiation aid |

### Single-radar track initiation, confirmation, termination, and quality metrics

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Sea71\] | An efficient suboptimal decision procedure for associating sensor data with stored tracks in real-time surveillance systems | Classical initiation logic lineage |
| \[Tru81\] | Track Initiation of Occasionally Unresolved Radar Targets | Initiation in unresolved conditions |
| \[Cla19\] | Alert-Confirm Track Confirmation for Radar | Modern alert-confirm logic for scanned radars |
| \[Hen61\] | Optimizing the decision to track in an automatic radar processor | Early trade between false and missed tracks |
| \[Sed06\] | A modified M/N logic for track initiation of low observable targets using amplitude information | M of N in weak-target settings |
| \[You16\] | Multi-target Track Termination Theory and Track Management | Termination and management logic |
| \[Li02b\] | SPRT-Based track confirmation and rejection | Sequential test framing |
| \[Jef89\] | Track quality estimation for multiple-target tracking radars | Operational track quality metrics |
| \[Lee18\] | Probabilistic Track Initiation Algorithm Using Radar Velocity Information in Heavy Clutter Environments | Velocity-aided initiation |
| \[Ain21\] | A Sequential Target Existence Statistic for Joint Probabilistic Data Association | Existence-statistic extension |

### Single-radar data association and multitarget tracking

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Bar75\] | Tracking in a cluttered environment with probabilistic data association | Foundational PDA |
| \[Mus94\] | Integrated probabilistic data association | PDA plus track existence |
| \[Mus02\] | Joint Integrated Probabilistic Data Association | Multitarget existence-aware association |
| \[Kir04\] | Probabilistic data association techniques for target tracking in clutter | Strong review of PDA class methods |
| \[For80\] | Multi-target tracking using joint probabilistic data association | JPDA foundation |
| \[Cha84\] | Joint probabilistic data association for multitarget tracking with possibly unresolved measurements and maneuvers | JPDA with unresolved measurements |
| \[Roe95\] | Multiple scan joint probabilistic data association | Multiscan JPDA |
| \[Fit86\] | Development of Practical PDA Logic for Multitarget Tracking by Microprocessor | Practical PDA implementation |
| \[Mus08\] | Tracking in clutter using IMM-IPDA-based algorithms | Maneuvering target extension |
| \[Wan02b\] | Gating techniques for maneuvering target tracking in clutter | Gating refinement |

### Multi-scan track building in dense clutter with track splitting and existence probability

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Dar07\] | Integrated track splitting filter - efficient multi-scan single target tracking in clutter | Efficient multiscan clutter tracking |
| \[Mus09\] | Multiscan Multitarget Tracking in Clutter with Integrated Track Splitting Filter | ITS extension to multitarget scenes |
| \[Mus03\] | Integrated track splitting suite of target tracking filters | ITS family overview |
| \[Mus04c\] | Integrated Track Splitting Filter for Manoeuvring Targets | Maneuvering target ITS |
| \[Mus12\] | Non-linear automatic target tracking in clutter using dynamic Gaussian mixture | Nonlinear clutter tracking extension |
| \[Jia14\] | Integrated track initialization and maintenance in heavy clutter using probabilistic data association | Initialization plus maintenance in clutter |
| \[Hua19\] | Multiple detection joint integrated track splitting for multiple extended target tracking | More recent multiple-detection extension |

### Multiple Hypothesis Tracking for surveillance radar track building

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Rei78\] | An algorithm for tracking multiple targets | Original MHT foundation |
| \[Bla04b\] | Multiple hypothesis tracking for multiple target tracking | Practical MHT review |
| \[Cho18\] | Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments | Historical and modern MHT synthesis |
| \[Cor11\] | Multi-Stage Multiple-Hypothesis Tracking | Practical multistage MHT |
| \[Dan06\] | Reformulating Reid’s MHT method with generalised Murty K-best ranked linear assignment algorithm | Efficient ranked assignment |
| \[Pop01\] | m-best S-D assignment algorithm with application to multitarget tracking | Assignment optimization |
| \[Poo94\] | Multidimensional assignment formulation of data association problems arising from multitarget and multisensor tracking | Multidimensional assignment view |
| \[Keu95\] | Multihypothesis tracking with electronically scanned radar | MHT in electronically scanned radar context |
| \[Cor18b\] | Track Management in Multiple-Hypothesis Tracking | MHT lifecycle management |

### Track-before-detect and weak-target track building

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Ton96\] | Peformance of dynamic programming techniques for Track-Before-Detect | Dynamic-programming TBD foundation |
| \[Joh02\] | Performance analysis of a dynamic programming track before detect algorithm | Detection and false-alarm characterization |
| \[Ton98\] | Maximum likelihood track-before-detect with fluctuating target amplitude | Weak-target maximum-likelihood TBD |
| \[Gro13\] | A Novel Dynamic Programming Algorithm for Track-Before-Detect in Radar Systems | Later TBD refinement |
| \[Wal02\] | The use of track-before-detect in pulse-Doppler radar | Pulse-Doppler relevance |
| \[Den11\] | Track-before-detect procedures for low pulse repetition frequency surveillance radars | Surveillance radar use case |
| \[Ben24\] | Learn to Track-Before-Detect via Neural Dynamic Programming | Recent learning-based extension |

### Track filters and smoothing used in operational TWS

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Ben62\] | Synthesis of an optimal set of radar track-while-scan smoothing equations | Early TWS smoothing foundation |
| \[Sin71\] | Real-Time Tracking Filter Evaluation and Selection for Tactical Applications | Tactical filter selection |
| \[Sin73\] | New results in optimizing surveillance system tracking and data correlation performance in dense multitarget environments | Dense surveillance tuning |
| \[Sin74\] | Derivation and evaluation of improved tracking filter for use in dense multitarget environments | Improved tracking filter design |
| \[Mah90\] | Improved multi-target tracking in clutter by PDA smoothing | Smoothing with PDA |
| \[Cha04\] | Fixed lag smoothing technique for track maintenance in clutter | Fixed-lag maintenance |
| \[Ogl02\] | Derivation of a fixed-lag, alpha-beta filter for target trajectory smoothing | Low-compute smoother |

### Phased-array and multi-function radar specifics for tracking

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Shi95\] | Adaptive-update-rate target tracking for phased-array radar | IMM-driven adaptive revisit |
| \[But98\] | Tracking and control in multi-function radar | Multifunction radar control and tracking coupling |
| \[Coh86\] | Adaptive variable update rate algorithm for tracking targets with a phased array radar | Early adaptive update rate logic |
| \[Hon92\] | Design of a Variable Sampling Rate Tracking Filter for a Phased Array Radar | Variable sampling policy tied to dynamics |
| \[Din08\] | A survey of radar resource management algorithms | Resource management overview |
| \[Kuo02\] | Real-time dwell scheduling of component-oriented phased array radars | Real-time dwell scheduling |
| \[Wat94b\] | Tracking performance of a phased array radar with revisit time controlled using the IMM algorithm | IMM-controlled revisit analysis |
| \[Str96\] | Scheduling of track updates in phased array radars | Update scheduling logic |
| \[Ylm19\] | A Survey on Radar Scheduling: An Essential Component for Multifunction Radars | Modern scheduling survey |
| \[Cab18\] | Radar Resource Management for Multiple Hypothesis Tracking | MHT-aware resource management |

### Multi-radar track fusion and handoff kept separate from single-radar tracking

| Cite key | Reference | Why it matters |
|:---|:---|:---|
| \[Lig97\] | Distributed Fusion Architectures and Algorithms for Target Tracking | Distributed architecture overview |
| \[Cho00b\] | Architectures and algorithms for track association and fusion | Core track fusion architecture paper |
| \[Joh05\] | Data Fusion for Improved Air Picture Generation in Air Defence Systems | Air-defense fusion and registration relevance |
| \[Cho08\] | A Survey on Track Fusion for Radar Target Tracking | Fusion survey |
| \[Che03\] | Performance limits of track-to-track fusion versus centralized estimation | Centralized versus distributed performance |
| \[Jul01\] | General Decentralized Data Fusion With Covariance Intersection | Conservative fusion under unknown correlation |
| \[Tia12\] | Track-to-Track Fusion Architectures - A Review | Later architecture synthesis |
| \[Tal14\] | Asynchronous Track-to-Track Fusion by Direct Estimation of Time of Sample in Sensor Networks | Asynchronous timing problem |
| \[Bar04\] | IMM estimator with out-of-sequence measurements | OOSM handling |
| \[Dro06\] | Real-time radar data fusion and registration systems for single integrated air picture | Registration and single air picture implementation |

## Final synthesis

The literature supports a disciplined radar track-building stack rather than a single flagship algorithm. The strongest build pattern is native measurement integrity, explicit existence logic, maneuver-aware local filtering, association complexity matched to clutter, and conservative multisensor fusion when the system cannot model dependencies exactly \[Bla99, Bar95, Mus94, Kir04, Che03, Jul01\]. For air-defense systems, that stack is not only theoretically sound. It is also the most practical way to produce stable EO-ready tracks with legible quality and provenance \[Joh05, Dru93\].

The most defensible first build is therefore not the most exotic one. It is a system that gets the basics right, exposes uncertainty honestly, keeps single-radar and multi-radar logic separate, and adds advanced branches only where the scenario demands them. That is the clearest consensus across the current library \[Ler93, Bus95, Mus02, Bla04b, Hon92, Joh05, Cho18\].

---

## References

\[Bla99\] S. Blackman and R. Populi, “Design and Analysis of Modern Tracking Systems,” Aug. 01, 1999.

\[Bar95\] Y. Bar-Shalom and R. Xiao, “Multitarget-Multisensor Tracking: Principles and Techniques,” 1995.

\[Far80\] A. Farina and S. Pardini, “Survey of radar data-processing techniques in air-traffic-control and surveillance systems,” vol. 127, pp. 190–204, Jun. 1980, doi: [10.1049/IP-F-1:19800030](https://doi.org/10.1049/IP-F-1:19800030).

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Cho00b\] C. Chong, S. Mori, W. H. Barker, and K.-C. Chang, “Architectures and algorithms for track association and fusion,” 2000. doi: [10.1109/62.821657](https://doi.org/10.1109/62.821657).

\[Che03\] H. Chen, T. Kirubarajan, and Y. Bar-Shalom, “Performance limits of track-to-track fusion versus centralized estimation: theory and application \[sensor fusion\],” Jun. 25, 2003. doi: [10.1109/TAES.2003.1207252](https://doi.org/10.1109/TAES.2003.1207252).

\[Jul01\] S. Julier and J. Uhlmann, “General Decentralized Data Fusion With Covariance Intersection (CI),” 2001. doi: [10.1201/9781420053098-19](https://doi.org/10.1201/9781420053098-19).

\[Ler93\] D. Lerro and Y. Bar-Shalom, “Tracking with debiased consistent converted measurements versus EKF,” Jul. 01, 1993. doi: [10.1109/7.220948](https://doi.org/10.1109/7.220948).

\[Par01\] S.-T. Park and J.-G. Lee, “Improved Kalman filter design for three-dimensional radar tracking,” Apr. 01, 2001. doi: [10.1109/7.937485](https://doi.org/10.1109/7.937485).

\[Mus94\] D. Musicki, R. Evans, and S. Stankovic, “Integrated probabilistic data association,” *IEEE Trans. Autom. Control.*, vol. 39, pp. 1237–1241, Jun. 1994, doi: [10.1109/9.293185](https://doi.org/10.1109/9.293185).

\[Mus02\] D. Musicki and R. Evans, “Joint Integrated Probabilistic Data Association - JIPDA,” in *Proceedings of the Fifth International Conference on Information Fusion. FUSION 2002. (IEEE Cat.No.02EX5997)*, Jul. 2002, pp. 1120–1125 vol.2. doi: [10.1109/ICIF.2002.1020938](https://doi.org/10.1109/ICIF.2002.1020938).

\[Kir04\] T. Kirubarajan and Y. Bar-Shalom, “Probabilistic data association techniques for target tracking in clutter,” *Proceedings of the IEEE*, vol. 92, pp. 536–557, Nov. 2004, doi: [10.1109/JPROC.2003.823149](https://doi.org/10.1109/JPROC.2003.823149).

\[Bus95\] M. Busch and S. Blackman, “Evaluation of IMM filtering for an air defense system application,” Sep. 01, 1995. doi: [10.1117/12.217717](https://doi.org/10.1117/12.217717).

\[Ton98\] S. M. Tonissen and Y. Bar-Shalom, “Maximum likelihood track-before-detect with fluctuating target amplitude,” Jul. 01, 1998. doi: [10.1109/7.705887](https://doi.org/10.1109/7.705887).

\[Dar07\] M. Darko, B. F. L. Scala, and R. J. Evans, “Integrated track splitting filter - efficient multi-scan single target tracking in clutter,” Oct. 01, 2007. doi: [10.1109/TAES.2007.4441748](https://doi.org/10.1109/TAES.2007.4441748).

\[Mus09\] D. Musicki and R. J. Evans, “Multiscan Multitarget Tracking in Clutter with Integrated Track Splitting Filter,” Oct. 01, 2009. doi: [10.1109/TAES.2009.5310309](https://doi.org/10.1109/TAES.2009.5310309).

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Bor11b\] S. Bordonaro, P. Willett, and Y. Bar-Shalom, “Tracking with converted position and Doppler measurements,” Sep. 16, 2011. doi: [10.1117/12.895484](https://doi.org/10.1117/12.895484).

\[Cla19\] I. Clarkson and J. L. Williams, “Alert-Confirm Track Confirmation for Radar,” in *2019 International Radar Conference (RADAR)*, Sep. 2019, pp. 1–5. doi: [10.1109/RADAR41533.2019.171251](https://doi.org/10.1109/RADAR41533.2019.171251).

\[Bla04b\] S. Blackman, “Multiple hypothesis tracking for multiple target tracking,” *IEEE Aerospace and Electronic Systems Magazine*, vol. 19, pp. 5–18, 2004, doi: [10.1109/MAES.2004.1263228](https://doi.org/10.1109/MAES.2004.1263228).

\[Dro06\] A. Drozd, R. Niu, I. Kasperovich, P. Varshney, and C. E. Carroll, “Real-time radar data fusion and registration systems for single integrated air picture,” May 05, 2006. doi: [10.1117/12.665786](https://doi.org/10.1117/12.665786).

\[Hon92\] S.-M. Hong, “Design of a Variable Sampling Rate Tracking Filter for a Phased Array Radar,” 1992.

\[Shi95\] H.-J. Shin, S. Hong, and D. Hong, “Adaptive-update-rate target tracking for phased-array radar,” Jun. 01, 1995. doi: [10.1049/IP-RSN:19951903](https://doi.org/10.1049/IP-RSN:19951903).

\[Kuo02\] T.-W. Kuo, Y.-S. Chao, C.-F. Kuo, and C. Chang, “Real-time dwell scheduling of component-oriented phased array radars,” *Proceedings of the 2002 IEEE Radar Conference (IEEE Cat. No.02CH37322)*, pp. 92–97a, Aug. 2002, doi: [10.1109/NRC.2002.999699](https://doi.org/10.1109/NRC.2002.999699).

\[Joh02\] L. Johnston and V. Krishnamurthy, “Performance analysis of a dynamic programming track before detect algorithm,” Aug. 07, 2002. doi: [10.1109/7.993242](https://doi.org/10.1109/7.993242).

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Sea71\] R. Sea, “An efficient suboptimal decision procedure for associating sensor data with stored tracks in real-time surveillance systems,” Dec. 01, 1971. doi: [10.1109/CDC.1971.270945](https://doi.org/10.1109/CDC.1971.270945).

\[You16\] H. You, X. Jianjuan, and G. Xin, “Multi‐target Track Termination Theory and Track Management,” Aug. 08, 2016. doi: [10.1002/9781118956878.CH11](https://doi.org/10.1002/9781118956878.CH11).

\[Jef89\] T. W. Jeffrey, “Track quality estimation for multiple-target tracking radars,” in *Proceedings of the IEEE National Radar Conference*, Mar. 1989, pp. 76–79. doi: [10.1109/NRC.1989.47619](https://doi.org/10.1109/NRC.1989.47619).

\[Din08\] Z. Ding, “A survey of radar resource management algorithms,” in *2008 Canadian Conference on Electrical and Computer Engineering*, May 2008, pp. 001559–001564. doi: [10.1109/CCECE.2008.4564804](https://doi.org/10.1109/CCECE.2008.4564804).

\[Bar04\] Y. Bar-Shalom and H. Chen, “IMM estimator with out-of-sequence measurements,” Aug. 25, 2004. doi: [10.1117/12.562691](https://doi.org/10.1117/12.562691).

\[But98\] J. M. Butler, “Tracking and control in multi-function radar,” 1998.

\[Ylm19\] A. Yılmaz, “A Survey on Radar Scheduling: An Essential Component for Multifunction Radars,” 2019.

\[Kur06\] F. Kural, F. Arıkan, O. Arikan, and M. Efe, “Incorporating Doppler Velocity Measurement for Track Initiation and Maintenance,” Mar. 07, 2006. doi: [10.1049/IC:20060562](https://doi.org/10.1049/IC:20060562).

\[Sed06\] M. Sedehi, P. Lombardo, and A. Farina, “A modified M/N logic for track initiation of low observable targets using amplitude information,” May 24, 2006. doi: [10.1109/IRS.2006.4338080](https://doi.org/10.1109/IRS.2006.4338080).

\[Leu99\] H. Leung, Z. Hu, and M. Blanchette, “Evaluation of multiple radar target trackers in stressful environments,” Apr. 01, 1999. doi: [10.1109/7.766946](https://doi.org/10.1109/7.766946).

\[Str96\] D. Stromberg, “Scheduling of track updates in phased array radars,” in *Proceedings of the 1996 IEEE National Radar Conference*, May 1996, pp. 214–219. doi: [10.1109/NRC.1996.510683](https://doi.org/10.1109/NRC.1996.510683).

\[Wan02b\] X. Wang, S. Challa, and R. Evans, “Gating techniques for maneuvering target tracking in clutter,” *Advances in Engineering Software*, Dec. 2002, doi: [10.1109/TAES.2002.1039426](https://doi.org/10.1109/TAES.2002.1039426).

\[Li01\] N. Li and X. Li, “Target perceivability and its applications,” *IEEE Trans. Signal Process.*, vol. 49, pp. 2588–2604, Nov. 2001, doi: [10.1109/78.960406](https://doi.org/10.1109/78.960406).

\[Hen61\] H. R. Henn, “Optimizing the decision to track in an automatic radar processor.” 1961.

\[Lee18\] G. Lee, S. Lee, K. Kim, and N. Kwak, “Probabilistic Track Initiation Algorithm Using Radar Velocity Information in Heavy Clutter Environments,” in *2018 15th European Radar Conference (EuRAD)*, Sep. 2018, pp. 277–280. doi: [10.23919/EURAD.2018.8546666](https://doi.org/10.23919/EURAD.2018.8546666).

\[Ain21\] P. Ainsleigh, T. Luginbuhl, and P. Willett, “A Sequential Target Existence Statistic for Joint Probabilistic Data Association,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 57, pp. 371–381, Feb. 2021, doi: [10.1109/TAES.2020.3018899](https://doi.org/10.1109/TAES.2020.3018899).

\[Bar75\] Y. Bar-Shalom and E. Tse, “Tracking in a cluttered environment with probabilistic data association,” *Autom.*, vol. 11, pp. 451–460, Sep. 1975, doi: [10.1016/0005-1098(75)90021-7](https://doi.org/10.1016/0005-1098(75)90021-7).

\[Bar09\] Y. Bar-Shalom, F. Daum, and J. Huang, “The probabilistic data association filter,” Nov. 20, 2009. doi: [10.1109/MCS.2009.934469](https://doi.org/10.1109/MCS.2009.934469).

\[For80\] T. Fortmann, Y. Bar-Shalom, and M. Scheffe, “Multi-target tracking using joint probabilistic data association,” in *1980 19th IEEE Conference on Decision and Control including the Symposium on Adaptive Processes*, Dec. 1980, pp. 807–812. doi: [10.1109/CDC.1980.271915](https://doi.org/10.1109/CDC.1980.271915).

\[Cha84\] K.-C. Chang and Y. Bar-Shalom, “Joint probabilistic data association for multitarget tracking with possibly unresolved measurements and maneuvers,” Jul. 01, 1984. doi: [10.1109/TAC.1984.1103597](https://doi.org/10.1109/TAC.1984.1103597).

\[Fit85\] R. Fitzgerald, “Track Biases and Coalescence with Probabilistic Data Association,” Nov. 01, 1985. doi: [10.1109/TAES.1985.310670](https://doi.org/10.1109/TAES.1985.310670).

\[Rei78\] D. Reid, “An algorithm for tracking multiple targets,” in *1978 IEEE Conference on Decision and Control including the 17th Symposium on Adaptive Processes*, 1978, pp. 1202–1211. doi: [10.1109/CDC.1978.268125](https://doi.org/10.1109/CDC.1978.268125).

\[Suc99\] P. Suchomski, “Explicit expressions for debiased statistics of 3D converted measurements,” 1999. doi: [10.1109/7.745708](https://doi.org/10.1109/7.745708).

\[Mus08\] D. Musicki and S. Suvorova, “Tracking in clutter using IMM-IPDA-based algorithms,” May 12, 2008. doi: [10.1109/TAES.2008.4516993](https://doi.org/10.1109/TAES.2008.4516993).

\[Cha04\] R. Chakravorty and S. Challa, “Fixed lag smoothing technique for track maintenance in clutter,” in *Proceedings of the 2004 Intelligent Sensors, Sensor Networks and Information Processing Conference, 2004.*, Dec. 2004, pp. 119–124. doi: [10.1109/ISSNIP.2004.1417448](https://doi.org/10.1109/ISSNIP.2004.1417448).

\[Ogl02\] T. Ogle and W. Blair, “Derivation of a fixed-lag, alpha-beta filter for target trajectory smoothing,” 2002. doi: [10.1109/SSST.2002.1026998](https://doi.org/10.1109/SSST.2002.1026998).

\[Ben62\] T. Benedict and G. Bordner, “Synthesis of an optimal set of radar track-while-scan smoothing equations,” Jul. 01, 1962. doi: [10.1109/TAC.1962.1105477](https://doi.org/10.1109/TAC.1962.1105477).

\[Sin71\] R. Singer and K. Behnke, “Real-Time Tracking Filter Evaluation and Selection for Tactical Applications,” 1971. doi: [10.1109/TAES.1971.310257](https://doi.org/10.1109/TAES.1971.310257).

\[Mus03\] D. Muslicki, R. Evens, and B. L. Scala, “Integrated track splitting suite of target tracking filters,” in *Sixth International Conference of Information Fusion, 2003. Proceedings of the*, Jul. 2003, pp. 1039–1046. doi: [10.1109/ICIF.2003.177353](https://doi.org/10.1109/ICIF.2003.177353).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Ton96\] S. M. Tonissen and R. Evans, “Peformance of dynamic programming techniques for Track-Before-Detect,” Oct. 01, 1996. doi: [10.1109/7.543865](https://doi.org/10.1109/7.543865).

\[Gro13\] E. Grossi, M. Lops, and L. Venturino, “A Novel Dynamic Programming Algorithm for Track-Before-Detect in Radar Systems,” *IEEE Transactions on Signal Processing*, vol. 61, pp. 2608–2619, May 2013, doi: [10.1109/TSP.2013.2251338](https://doi.org/10.1109/TSP.2013.2251338).

\[Coh86\] S. Cohen, “Adaptive variable update rate algorithm for tracking targets with a phased array radar,” Jun. 01, 1986. doi: [10.1049/IP-F-1:19860045](https://doi.org/10.1049/IP-F-1:19860045).

\[Wat94b\] G. Watson and W. Blair, “Tracking performance of a phased array radar with revisit time controlled using the IMM algorithm,” in *Proceedings of 1994 IEEE National Radar Conference*, Mar. 1994, pp. 160–165. doi: [10.1109/NRC.1994.328112](https://doi.org/10.1109/NRC.1994.328112).

\[Cho08\] W.-Y. Choi, S.-M. Hong, D.-G. Lee, and J.-K. Jung, “A Survey on Track Fusion for Radar Target Tracking,” *Journal of the Korea Institute of Military Science and Technology*, vol. 11, pp. 85–92, 2008.

\[Tia12\] X. Tian and Y. Bar-Shalom, “Track-to-Track Fusion Architectures - A Review,” Oct. 2012.

\[Tal14\] H. Talebi and A. Hemmatyar, “Asynchronous Track-to-Track Fusion by Direct Estimation of Time of Sample in Sensor Networks,” 2014. doi: [10.1109/JSEN.2013.2281394](https://doi.org/10.1109/JSEN.2013.2281394).

\[Cho08b\] C. Chong, “Representing Input Track Quality in Distributed Tracking,” 2008.

\[Mal02\] M. Mallick, J. Krant, and Y. Bar-Shalom, “Multi-sensor multi-target tracking using out-of-sequence measurements,” in *Proceedings of the Fifth International Conference on Information Fusion. FUSION 2002. (IEEE Cat.No.02EX5997)*, Jul. 2002, pp. 135–142 vol.1. doi: [10.1109/ICIF.2002.1021142](https://doi.org/10.1109/ICIF.2002.1021142).

\[Hal01\] D. Hall and J. Llinas, “Handbook of Multisensor Data Fusion,” 2001.

\[Bla86\] S. S. Blackman, “Multiple-Target Tracking with Radar Applications,” Dec. 01, 1986.

\[Sto99\] L. Stone, T. Corwin, and C. A. Barlow, “Bayesian Multiple Target Tracking,” Aug. 01, 1999.

\[Wig96\] T. Wigren, E. Sviestins, and H. Egnell, “Operational multi-sensor tracking for air defense,” Nov. 21, 1996. doi: [10.1109/ADFS.1996.581074](https://doi.org/10.1109/ADFS.1996.581074).

\[Zho18\] G. Zhou, Z. Guo, X. Chen, R. Xu, and T. Kirubarajan, “Statically Fused Converted Measurement Kalman Filters for Phased-Array Radars,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 54, pp. 554–568, Apr. 2018, doi: [10.1109/TAES.2017.2760798](https://doi.org/10.1109/TAES.2017.2760798).

\[Jin16\] F. Jinbin, S. Jinping, L. Songtao, and Z. Xuwang, “Debiased converted position and Doppler measurement tracking with array radar measurements in direction cosine coordinates,” 2016. doi: [10.1049/IET-RSN.2015.0087](https://doi.org/10.1049/IET-RSN.2015.0087).

\[Pel19\] L. Peled-Eitan and I. Rusnak, “Optimal Radar Tracking in Cartesian Coordinates with Range, Doppler and Angle Measurements,” *2019 27th Mediterranean Conference on Control and Automation (MED)*, pp. 256–261, Jul. 2019, doi: [10.1109/MED.2019.8798503](https://doi.org/10.1109/MED.2019.8798503).

\[Tru81\] G. Trunk and J. D. Wilson, “Track Initiation of Occasionally Unresolved Radar Targets,” 1981. doi: [10.1109/TAES.1981.309044](https://doi.org/10.1109/TAES.1981.309044).

\[Li02b\] X. R. Li, N. Li, and V. Jilkov, “SPRT-Based track confirmation and rejection,” in *Proceedings of the Fifth International Conference on Information Fusion. FUSION 2002. (IEEE Cat.No.02EX5997)*, Jul. 2002, pp. 951–958 vol.2. doi: [10.1109/ICIF.2002.1020914](https://doi.org/10.1109/ICIF.2002.1020914).

\[Roe95\] J. A. Roecker, “Multiple scan joint probabilistic data association,” Jul. 01, 1995. doi: [10.1109/7.395216](https://doi.org/10.1109/7.395216).

\[Fit86\] R. Fitzgerald, “Development of Practical PDA Logic for Multitarget Tracking by Microprocessor,” in *1986 American Control Conference*, Jun. 1986, pp. 889–898. doi: [10.23919/ACC.1986.4789059](https://doi.org/10.23919/ACC.1986.4789059).

\[Mus04c\] D. Musicki, B. F. La, and S. R. Evans, “Integrated Track Splitting Filter for Manoeuvring Targets ∗,” 2004.

\[Mus12\] D. Musicki, T. Song, W. Kim, and D. Nešić, “Non-linear automatic target tracking in clutter using dynamic Gaussian mixture,” Dec. 01, 2012. doi: [10.1049/IET-RSN.2012.0093](https://doi.org/10.1049/IET-RSN.2012.0093).

\[Jia14\] X. Jiang, K. Harishan, R. Tharmarasa, T. Kirubarajan, and T. Thayaparan, “Integrated track initialization and maintenance in heavy clutter using probabilistic data association,” *Signal Process.*, vol. 94, pp. 241–250, 2014, doi: [10.1016/j.sigpro.2013.06.026](https://doi.org/10.1016/j.sigpro.2013.06.026).

\[Hua19\] Y. Huang, T. Song, W. Lee, and T. Kirubarajan, “Multiple detection joint integrated track splitting for multiple extended target tracking,” *Signal Process.*, vol. 162, pp. 126–140, Sep. 2019, doi: [10.1016/J.SIGPRO.2019.04.015](https://doi.org/10.1016/J.SIGPRO.2019.04.015).

\[Dan06\] R. Danchick and G. E. Newnam, “Reformulating Reid’s MHT method with generalised Murty K-best ranked linear assignment algorithm,” Feb. 21, 2006. doi: [10.1049/IP-RSN:20050041](https://doi.org/10.1049/IP-RSN:20050041).

\[Pop01\] R. Popp, K. Pattipati, and Y. Bar-Shalom, “m-best S-D assignment algorithm with application to multitarget tracking,” 2001. doi: [10.1109/7.913665](https://doi.org/10.1109/7.913665).

\[Poo94\] A. Poore, “Multidimensional assignment formulation of data association problems arising from multitarget and multisensor tracking,” *Computational Optimization and Applications*, vol. 3, pp. 27–57, Mar. 1994, doi: [10.1007/BF01299390](https://doi.org/10.1007/BF01299390).

\[Keu95\] G. V. Keuk, “Multihypothesis tracking with electronically scanned radar,” Jul. 01, 1995. doi: [10.1109/7.395247](https://doi.org/10.1109/7.395247).

\[Cor18b\] S. Coraluppi and C. Carthel, “Track Management in Multiple-Hypothesis Tracking,” *2018 IEEE 10th Sensor Array and Multichannel Signal Processing Workshop (SAM)*, pp. 11–15, Jul. 2018, doi: [10.1109/SAM.2018.8448730](https://doi.org/10.1109/SAM.2018.8448730).

\[Wal02\] W. Wallace, “The use of track-before-detect in pulse-Doppler radar,” 2002. doi: [10.1109/RADAR.2002.1174705](https://doi.org/10.1109/RADAR.2002.1174705).

\[Den11\] X. Deng, Y. Pi, M. Morelande, and B. Moran, “Track-before-detect procedures for low pulse repetition frequency surveillance radars,” 2011. doi: [10.1049/IET-RSN.2009.0245](https://doi.org/10.1049/IET-RSN.2009.0245).

\[Ben24\] E. F. Ben, N. Tsarov, T. Tapiro, I. Nuri, and N. Shlezinger, “Learn to Track-Before-Detect via Neural Dynamic Programming,” *ICASSP 2024 - 2024 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)*, pp. 9586–9590, Apr. 2024, doi: [10.1109/ICASSP48485.2024.10448128](https://doi.org/10.1109/ICASSP48485.2024.10448128).

\[Sin73\] R. Singer and R. Sea, “New results in optimizing surveillance system tracking and data correlation performance in dense multitarget environments,” Dec. 01, 1973. doi: [10.1109/TAC.1973.1100421](https://doi.org/10.1109/TAC.1973.1100421).

\[Sin74\] R. Singer, R. Sea, and K. Housewright, “Derivation and evaluation of improved tracking filter for use in dense multitarget environments,” *IEEE Trans. Inf. Theory*, vol. 20, pp. 423–432, Jul. 1974, doi: [10.1109/TIT.1974.1055256](https://doi.org/10.1109/TIT.1974.1055256).

\[Mah90\] A. Mahalanabis, B. Zhou, and N. Bose, “Improved multi-target tracking in clutter by PDA smoothing,” 1990. doi: [10.1109/7.53417](https://doi.org/10.1109/7.53417).

\[Cab18\] J. Cabrera, L. I. Finn, and S. Fairbrother, “Radar Resource Management for Multiple Hypothesis Tracking,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 467–471, Jul. 2018, doi: [10.23919/ICIF.2018.8455769](https://doi.org/10.23919/ICIF.2018.8455769).

\[Lig97\] M. Liggins, C. Chong, I. Kadar, M. Alford, V. Vannicola, and S. Thomopoulos, “Distributed Fusion Architectures and Algorithms for Target Tracking,” *Proc. IEEE*, vol. 85, pp. 95–107, 1997, doi: [10.1109/JPROC.1997.554211](https://doi.org/10.1109/JPROC.1997.554211).
