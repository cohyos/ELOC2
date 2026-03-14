# RAP fusion architecture

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [RAP fusion architecture](#rap-fusion-architecture)
- [Build rules](#build-rules)
- [Core services](#core-services)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## RAP fusion architecture

The recognized air picture is a persistent system track picture built from many local sources rather than a direct display of sensor outputs \[Joh05, Dru93\]. Strong air defense fusion improves state accuracy, track continuity, and coverage, but only if registration and timing are handled explicitly \[Joh05, Dro06\]. Track management is part of the core algorithm, not a display detail \[Dru93, Bar95\].

## Build rules

- Keep raw observations, local tracks, system tracks, and investigation tasks as separate entities \[Joh05, Flo24\]
- Correlation decisions must record score, method, and evidence \[Dru93\]
- Fusion must be gated by registration and clock health \[Joh05\]
- Track lineage must survive merge, split, handoff, and retirement \[Dru93, Wig96\]
- The workstation should read a projected RAP view rather than estimator internals \[Flo24\]

## Core services

| Service          | Responsibility                              |
|:-----------------|:--------------------------------------------|
| Source ingest    | Normalize observations and local tracks     |
| Correlation      | Associate incoming reports to system tracks |
| Fusion           | Produce fused state and covariance          |
| Track management | Promote, merge, split, retire               |
| RAP projection   | Publish map ready track picture             |

## Retrieval cues

Useful when the agent needs:

- fusion core design
- system track store design
- track lineage logic
- association audit trail
- replayable air picture generation

## Main papers

\[Joh05, Dru93, Flo24, Wig96, Dro06\]

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Dru93\] J. Drury, “The IADS track management concept: Data fusion in the real world,” Aug. 25, 1993. doi: [10.1109/ISIC.1993.397701](https://doi.org/10.1109/ISIC.1993.397701).

\[Dro06\] A. Drozd, R. Niu, I. Kasperovich, P. Varshney, and C. E. Carroll, “Real-time radar data fusion and registration systems for single integrated air picture,” May 05, 2006. doi: [10.1117/12.665786](https://doi.org/10.1117/12.665786).

\[Bar95\] Y. Bar-Shalom and R. Xiao, “Multitarget-Multisensor Tracking: Principles and Techniques,” 1995.

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Wig96\] T. Wigren, E. Sviestins, and H. Egnell, “Operational multi-sensor tracking for air defense,” Nov. 21, 1996. doi: [10.1109/ADFS.1996.581074](https://doi.org/10.1109/ADFS.1996.581074).
