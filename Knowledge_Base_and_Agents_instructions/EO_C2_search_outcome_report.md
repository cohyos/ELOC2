# EO C2 search outcome report

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO C2 search outcome report](#eo-c2-search-outcome-report)
- [What the search found overall](#what-the-search-found-overall)
- [Main consensus across the literature](#main-consensus-across-the-literature)
- [Recognized air picture and fusion architecture](#recognized-air-picture-and-fusion-architecture)
- [Radar to EO cueing and heterogeneous fusion](#radar-to-eo-cueing-and-heterogeneous-fusion)
- [Sensor management and autonomous scan logic](#sensor-management-and-autonomous-scan-logic)
- [3D EO plot generation from multiple sensors](#d-eo-plot-generation-from-multiple-sensors)
- [Resolving ambiguities in aerial pictures](#resolving-ambiguities-in-aerial-pictures)
- [Registration, timing, and bias](#registration-timing-and-bias)
- [Simulation, visualization, and operator workstation](#simulation-visualization-and-operator-workstation)
- [Evidence landscape by maturity](#evidence-landscape-by-maturity)
- [What the search says is most defensible to demonstrate](#what-the-search-says-is-most-defensible-to-demonstrate)
- [Where the search is more cautious](#where-the-search-is-more-cautious)
- [Overall judgment](#overall-judgment)
- [References](#references)

## EO C2 search outcome report

The search returns a mature and surprisingly coherent literature base for the kind of demo under consideration. The strongest result is not one single algorithm, but an end to end pattern that appears across air defense fusion, radar and IRST integration, sensor management, bearings only geometry, multi target tracking, and command workstation design. That pattern is a recognized air picture built from heterogeneous C4ISR sources, a cueing layer that turns tracks into EO investigations, a tasking layer that allocates scarce sensors, an ambiguity handling layer that avoids premature certainty inside the EO image, and a geometry layer that produces 3D only when the viewing geometry is good enough \[Joh05, Dru93, Paw96, Ben07b, San01, Cor11, Flo24\].

The search also shows that the concept is feasible for a professional demo if the demo behaves honestly. The literature strongly supports radar to EO cueing, multisensor track fusion, autonomous or semi autonomous tasking, and multi sensor triangulation. It also warns against the main ways such a demo can become misleading: overconfident fusion without registration control, overclaiming 3D from weak geometry, hard assigning ambiguous EO scenes too early, and hiding the rationale behind automated sensor tasking \[Joh05, Oke01, San01, Cho18, Cum04\].

| Area | Search outcome | Strength of literature | Main implication |
|:---|:---|:---|:---|
| Recognized air picture | Strong and mature | High | Use a persistent system track picture, not direct sensor overlays \[Joh05, Dru93\] |
| Radar to EO cueing | Strong and practical | High | Cueing is a core behavior, not an optional extra \[Paw96, Guo02\] |
| Sensor tasking | Strong but design choices vary | High | Automatic tasking is feasible if rationale stays visible \[Ben07b, Kal04, Her23\] |
| 3D EO plot generation | Strong foundations, geometry limited | Medium to high | Publish 3D only with quality measures \[Ham85, San01, Fer13\] |
| Ambiguity resolution in EO view | Strong tracking literature | High | Use delayed association and unresolved groups \[Cor11, Cor19, Cho18\] |
| Registration and timing | Essential and often underappreciated | High | Fusion quality depends on alignment and clock health \[Joh05, Oke01, Bel14\] |
| Map based demo and operator display | Good support | Medium | Replay and rationale are as important as live display \[Pat09, Cho00, Kup94, Flo24\] |

## What the search found overall

The completed search found 188 relevant papers and organized them into seven subtopics with estimated coverage above 95 percent for the topic cluster that was searched. The result set spans foundational work from the 1980s and 1990s through more recent work in the 2019 to 2025 period. The older papers provide much of the enduring structure for air defense tracking, track management, observability, and cueing. The newer papers sharpen the treatment of asynchronous heterogeneous fusion, cross covariance consistency, nonmyopic sensor management, and scalable simulation \[Ham85, Dru93, Paw96, Joh05, Mal19, Yan19, Her23, Flo24\].

A notable strength of the result set is that it does not just contain abstract estimation papers. It contains system oriented air defense work, operator interface work, simulation environments, and implementation minded fusion studies. That makes the search outcome unusually usable for a demo effort rather than only for a theoretical study \[Joh05, Cho00, Pat09, Flo24\].

## Main consensus across the literature

A broad consensus appears across the subtopics.

- The system should maintain one recognized air picture built from heterogeneous sources rather than letting each sensor drive the display directly \[Joh05, Dru93\].
- EO assets should be treated as managed investigators that are cued by the air picture and then feed back confirmation, refinement, identification support, or ambiguity \[Paw96, Guo02\].
- Sensor assignment is a resource management problem, not a nearest sensor heuristic \[Ben07b, Kal04\].
- 3D from EO bearings is possible, but only under geometry and timing conditions that must be made visible \[Ham85, San01, Fer13\].
- Crowded EO scenes require delayed association and explicit ambiguity handling, not immediate hard decisions \[Cor11, Cho18, Cor19\].
- Registration and timing are first class determinants of fusion quality \[Joh05, Oke01, Bel14\].
- A credible demo must expose rationale, history, and degraded modes to the operator \[Kup94, Pat09, Flo24\].

## Recognized air picture and fusion architecture

This is the most mature part of the literature. Air defense systems benefit from combining many sensor feeds into a common track picture with improved continuity, better state estimates, and broader coverage. The literature also treats track management as central. Promotion, deletion, correlation, conflict handling, and track number continuity are not support functions. They are part of the core operational product \[Joh05, Dru93, Wig96, Svi90\].

The search outcome here is clear. Any convincing demo should separate raw observations, local sensor tracks, and system tracks. The recognized air picture should be the object that drives EO cueing and map display. This is one of the strongest and least controversial design conclusions in the search set \[Joh05, Dru93, Flo24\].

| Key finding | Why it matters for the demo | Papers |
|:---|:---|:---|
| Multisensor fusion improves continuity and coverage | Keeps one stable target picture for downstream EO investigation | \[Joh05, Wig96\] |
| Track management is operationally central | Prevents track number switching and brittle cueing | \[Dru93, Joh05\] |
| Simulation and fusion should be tightly linked | Lets the demo show process rather than just state | \[Flo24, App00\] |

## Radar to EO cueing and heterogeneous fusion

The search strongly supports the core demo claim that radar tracks can drive EO investigations. Early practical work already shows that IR or EO sensing can improve surveillance by cueing search and helping radar focus effort in difficult cases \[Paw96, Bla00\]. More recent work expands this into radar and IRST fusion architectures for three dimensional tracking \[Mal19, Nai23\].

The main nuance is that cueing is easier than trustworthy fusion. The papers consistently support radar to EO handoff, but they are more cautious about fusing heterogeneous local tracks as if they were simple independent estimates. Differences in state representation, update rate, and shared process noise matter. Cross covariance must either be handled properly or the fusion must remain conservative \[Mal19, Yan19, Qua22\].

This means the search outcome supports a staged interpretation.

- Strong support for radar to EO cueing
- Strong support for EO confirmation and refinement
- Good support for heterogeneous fusion with careful consistency handling
- Weak support for naive plug and play fusion of arbitrary local tracks

That distinction matters a great deal for demo credibility \[Paw96, Mal19, Yan19\].

## Sensor management and autonomous scan logic

The tasking literature strongly supports the idea of an automatic EO scan loop over radar targets. The main body of work frames sensor management as adaptive allocation of scarce sensing resources under uncertainty, changing priorities, and dynamic platform constraints \[Ben07b, Kal04, Her10\]. That maps directly onto the desired demo behavior in which a network of investigators is automatically cued across the current air picture.

What the search does not support is a simplistic scheduler. The stronger papers emphasize information gain, threat priority, sensor dynamics, revisit need, and opportunity cost. More recent work adds nonmyopic planning, which is attractive when a sensor assignment now affects geometry or availability later \[Her23\].

The literature outcome is therefore favorable, but with one caveat. Full hidden autonomy is not the dominant recommendation in command settings. Human supervisory control remains an important theme, mainly to keep operators aware of why the system is choosing one investigation over another \[Cum04, Ben02b\]. A demo can still foreground autonomy, but it should expose the reasons for its decisions.

| Tasking theme | Search outcome | Demo consequence |
|:---|:---|:---|
| Automatic resource allocation | Strong support | The system can autonomously scan through radar targets \[Ben07b, Kal04\] |
| Nonmyopic planning | Emerging but promising | Helps explain multi step task choices \[Her23\] |
| Human supervisory control | Persistent concern | Keep rationale visible and allow override modes \[Cum04\] |
| Gimballed EO planning | Practical support | Model slew, FOV, dwell, and revisit limits \[Sko09\] |

## 3D EO plot generation from multiple sensors

The search finds strong foundations for angle only 3D localization, but this is also where the literature imposes the clearest physical limits. Observability depends on geometry. If lines of sight are nearly parallel, or the target lies close to the sensor baseline, depth uncertainty becomes very large \[Ham85, San01\]. Two sensors can be enough, but three non collinear views help recover difficult cases \[Fer13\].

The overall outcome is positive for a demo, as long as 3D is shown as a quality conditioned product rather than a binary capability. The literature supports a professional system that declares when the geometry is weak, asks for more views, or publishes only a candidate 3D estimate. It does not support a system that simply draws a precise 3D point every time two EO sensors are present \[San01, San02, Fer13\].

This subtopic is one of the clearest examples where a research faithful demo will look better than an overconfident one.

## Resolving ambiguities in aerial pictures

This is another area where the search result is strong. The multiple hypothesis tracking literature, including later work on unresolved measurements, directly addresses the case where multiple targets share a field of view, cross one another, or appear as one unresolved object before separating \[Cor11, Cho18, Cor19\].

The general outcome is that ambiguity should be preserved rather than crushed. In practice this means one radar track may cue an EO sensor that later returns two plausible EO objects, or an unresolved group that only later splits into separate tracks. The literature strongly favors keeping competing hypotheses alive across time rather than making immediate irreversible assignments \[Cor11, Cor19\].

For the stated demo objective, this is one of the best supported pieces of the entire search. It directly underwrites the claim that the system can solve ambiguities in the aerial picture, because there is a large body of work on exactly that problem \[Cho18, Cor11, Tar09\].

## Registration, timing, and bias

This is the most important cautionary theme in the whole search. The literature repeatedly shows that sensor alignment and clock quality are not secondary implementation details. They directly affect association, track continuity, fusion consistency, and EO cue accuracy \[Joh05, Oke01, Bel14\].

The broader outcome is that any demo trying to show a tight loop from radar track to EO investigation to fused state must include at least a basic registration health model. Recent work reinforces the same point with better formulations for joint tracking and registration and better handling of nonlinear biases in native sensor coordinates \[Wes18\]. The cross covariance literature adds another warning. Even if registration is good, fused track confidence can still be wrong if dependence between local tracks is ignored \[Yan19, Qua22\].

This part of the search does not negate the demo concept. It simply sets a standard for how honest the implementation should be.

## Simulation, visualization, and operator workstation

The search outcome here is practical rather than theoretically deep. The simulation and interface papers support map based demonstrations that expose tracks, sensor coverage, tasking, and system dynamics over time \[Cho00, Pat09, Flo24\]. Operator interface work adds an important message. A multisensor system is trusted only when the operator can understand what each sensor contributed and why the system chose its actions \[Kup94\].

The literature therefore supports a workstation that shows more than the final answer.

- recognized air picture
- current EO assignments
- field of regard and line of sight
- ambiguity and split history
- triangulation rays and quality
- degraded mode and latency indicators
- replay timeline

This is one of the strongest demo specific outcomes from the search because it connects the algorithmic layers to how the system should actually be presented \[Pat09, Kup94, Flo24\].

## Evidence landscape by maturity

| Maturity level | Topics | Meaning for the report |
|:---|:---|:---|
| Very mature | air defense fusion architecture, track management, bearings only observability, MHT foundations | Safe ground for the core demo story \[Ham85, Dru93, Joh05, Cor11\] |
| Mature and practical | radar to EO cueing, registration, map based operator display | Strong support for a credible demo implementation \[Paw96, Oke01, Kup94, Cho00\] |
| Mature but technically delicate | heterogeneous asynchronous radar and EO fusion, cross covariance handling | Feasible, but should be implemented conservatively \[Mal19, Yan19, Qua22, Nai23\] |
| Emerging refinement | nonmyopic sensor control, newer scalable joint registration methods | Good upgrade path, not essential for first proof of concept \[Her23, Wes18\] |

## What the search says is most defensible to demonstrate

The following claims are well supported by the search.

- A C4ISR track picture can drive EO cueing and investigation \[Joh05, Paw96\].
- A network of EO sensors can be managed automatically against many targets \[Ben07b, Kal04, Her23\].
- EO sensors can refine, confirm, and in some cases help identify targets seen first in radar tracks \[Paw96, Wil90\].
- Multiple EO views can produce a 3D target estimate if geometry is adequate \[Ham85, San01, Fer13\].
- The system can resolve crowded or ambiguous EO scenes by maintaining hypotheses over time \[Cor11, Cor19, Cho18\].
- A professional demo should show not only decisions, but also uncertainty, rationale, and degraded modes \[Kup94, Flo24\].

## Where the search is more cautious

The search supports the concept, but it is cautious in four places.

- Registration and time sync can make or break the quality of cueing and fusion \[Joh05, Oke01\].
- Heterogeneous track fusion can become overconfident if cross covariance is ignored \[Yan19, Qua22\].
- 3D EO plots should not be shown as equally reliable in all geometries \[San01, Ham85\].
- Human supervisory control remains important when automatic sensor management affects operational trust \[Cum04\].

These are not holes in the concept. They are the places where a research faithful demo should deliberately show its own limits.

## Overall judgment

The overall outcome of the search is strongly positive. The literature does not treat the proposed demo as an artificial stitching together of unrelated ideas. It treats nearly all of its major pieces as established or actively developed parts of air defense and multisensor surveillance systems. The search therefore supports the demo as a serious and research grounded concept, provided it is built around a recognized air picture, explicit EO cueing and tasking, honest ambiguity handling, geometry aware 3D estimation, and visible registration health \[Joh05, Paw96, Ben07b, San01, Cor11, Oke01, Flo24\].

The clearest big picture conclusion is that the demo should present autonomy as disciplined autonomy. The system should automatically scan radar tracks with EO investigators, but it should also show why each sensor was assigned, what evidence came back, where ambiguity remains, and how strong the 3D geometry really is. That is the center of gravity of the search outcome, and it is what would make the final demo look both professional and true to the literature \[Ben07b, Cum04, San01, Kup94, Flo24\].

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Ben07b\] A. Benaskeur and H. Irandoust, “Sensor Management for Tactical Surveillance Operations,” Nov. 01, 2007.

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Cum04\] M. Cummings, P. Mitchell, and T. Sheridan, “HUMAN SUPERVISORY CONTROL ISSUES IN NETWORK CENTRIC WARFARE,” 2004.

\[Guo02\] W. Guo, “Performance Analysis of Using an IRST Sensor Cueing a 3D Radar,” 2002.

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Her23\] M. Hernandez, Á. F. García-Fernández, and S. Maskell, “Nonmyopic Sensor Control for Target Search and Track Using a Sample-Based GOSPA Implementation,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 60, pp. 387–404, Aug. 2023, doi: [10.1109/TAES.2023.3324908](https://doi.org/10.1109/TAES.2023.3324908).

\[Ham85\] S. Hammel and V. Aidala, “Observability Requirements for Three-Dimensional Tracking via Angle Measurements,” Mar. 01, 1985. doi: [10.1109/TAES.1985.310617](https://doi.org/10.1109/TAES.1985.310617).

\[Fer13\] M. H. Ferdowsi, “Passive Range Estimation Using Two and Three Optical Cameras,” Apr. 30, 2013. doi: [10.15866/iremos.v6i2.2441](https://doi.org/10.15866/iremos.v6i2.2441).

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

\[Bel14\] D. Belfadel and R. W. Osborn, “Bias Estimation and Observability for Optical Sensor Measurements with Targets of Opportunity,” 2014.

\[Pat09\] P. Patrick and T. W. Pearce, “OpenEOIR - An open source simulation based electro-optic sensor training environment prototype,” Dec. 01, 2009.

\[Cho00\] S. Choi and D. Wijesekera, “The DADSim air defense simulation environment,” *Proceedings. Fifth IEEE International Symposium on High Assurance Systems Engineering (HASE 2000)*, pp. 75–82, Nov. 2000, doi: [10.1109/HASE.2000.895444](https://doi.org/10.1109/HASE.2000.895444).

\[Kup94\] G. Kuperman, “Operator interface for a multi-sensor target acquisition system,” in *Proceedings of National Aerospace and Electronics Conference (NAECON’94)*, May 1994, pp. 638–645 vol.2. doi: [10.1109/NAECON.1994.332971](https://doi.org/10.1109/NAECON.1994.332971).

\[Mal19\] M. Mallick, K.-C. Chang, S. Arulampalam, and Y. Yan, “Heterogeneous Track-to-Track Fusion in 3-D Using IRST Sensor and Air MTI Radar,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 55, pp. 3062–3079, Feb. 2019, doi: [10.1109/TAES.2019.2898302](https://doi.org/10.1109/TAES.2019.2898302).

\[Yan19\] K. Yang, Y. Bar-Shalom, and P. Willett, “Track-to-Track fusion with cross-covariances from radar and IR/EO sensor,” *2019 22th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2019, doi: [10.23919/fusion43075.2019.9011439](https://doi.org/10.23919/fusion43075.2019.9011439).

\[Wig96\] T. Wigren, E. Sviestins, and H. Egnell, “Operational multi-sensor tracking for air defense,” Nov. 21, 1996. doi: [10.1109/ADFS.1996.581074](https://doi.org/10.1109/ADFS.1996.581074).

\[Svi90\] E. Sviestins, “True multi-radar tracking for air defence C/sup 3/ systems,” in *IEEE International Conference on Radar*, May 1990, pp. 612–614. doi: [10.1109/RADAR.1990.201097](https://doi.org/10.1109/RADAR.1990.201097).

\[App00\] “Approved for public release; distribution is unlimited. Dynamo: A Tool for Modeling Integrated Air Defense Systems.”

\[Bla00\] S. Blackman, R. Dempster, S. H. Roszkowski, D. M. Sasaki, and P. Singer, “Improved tracking capability and efficient radar allocation through the fusion of radar and infrared search-and-track observations,” May 01, 2000. doi: [10.1117/1.602506](https://doi.org/10.1117/1.602506).

\[Nai23\] V. Naidu, “Fusion Architectures for 3D Target Tracking Using IRST and Radar Measurements,” *Journal of Aerospace Sciences and Technologies*, Aug. 2023, doi: [10.61653/joast.v62i3.2010.502](https://doi.org/10.61653/joast.v62i3.2010.502).

\[Qua22\] C. Quaranta and G. Balzarotti, “Estimation of Consistent Cross-Covariance Matrices in a Multisensor Data Fusion,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 58, pp. 5456–5469, Dec. 2022, doi: [10.1109/TAES.2022.3172399](https://doi.org/10.1109/TAES.2022.3172399).

\[Her10\] A. Hero, D. Castan, D. Cochran, and K. Kastella, “Foundations and Applications of Sensor Management,” Nov. 23, 2010. doi: [10.1007/978-0-387-49819-5](https://doi.org/10.1007/978-0-387-49819-5).

\[Ben02b\] A. Benaskeur, “Sensor Management in Command & Control,” Sep. 01, 2002.

\[Sko09\] P. Skoglar, “A Planning Algorithm of a Gimballed EO/IR Sensor for Multi Target Tracking,” 2009.

\[San02\] J. Sanders-Reed, “Impact of tracking system knowledge on multisensor 3D triangulation,” Jul. 01, 2002. doi: [10.1117/12.472599](https://doi.org/10.1117/12.472599).

\[Tar09\] A. Tartakovsky, A. P. Brown, and J. Brown, “Enhanced Algorithms for EO/IR Electronic Stabilization, Clutter Suppression, and Track-Before-Detect for Multiple Low Observable Targets,” Sep. 01, 2009.

\[Wes18\] M. Westenkirchner and M. Ger, “Joint Tracking and Registration in Multi-Target Multi-Sensor Surveillance Using Factor Graphs,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 1464–1471, Jul. 2018, doi: [10.23919/ICIF.2018.8455675](https://doi.org/10.23919/ICIF.2018.8455675).

\[Wil90\] E. Williams, “IR sensor data fusion for target detection, identification, and tracking,” Sep. 01, 1990. doi: [10.1117/12.2322205](https://doi.org/10.1117/12.2322205).
