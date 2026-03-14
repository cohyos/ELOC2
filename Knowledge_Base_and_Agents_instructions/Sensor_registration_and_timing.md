# Sensor registration and timing

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [Sensor registration and timing](#sensor-registration-and-timing)
- [Build rules](#build-rules)
- [Health outputs](#health-outputs)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## Sensor registration and timing

Registration is a first order constraint on multisensor fusion. Bias in boresight, platform attitude, position, or clock timing can create duplicate tracks, missed associations, and false precision \[Joh05, Oke01, Bel14\]. Registration should be maintained online rather than treated as a one time calibration step \[Wes18, Hoy24\].

## Build rules

- Estimate angle bias, position bias, and clock bias per sensor \[Bel14, Oke01\]
- Publish registration health as a service output \[Wes18\]
- Gate precision fusion when registration is unsafe \[Joh05\]
- Prefer bias models in native sensor coordinates where practical \[Hoy24\]
- Use conservative fusion if cross covariance is uncertain \[Yan19, Qua22\]

## Health outputs

- Spatial alignment quality
- Time synchronization quality
- Bias estimate age
- Fusion safe or unsafe flag

## Retrieval cues

Useful when the agent needs:

- sensor alignment logic
- timing health model
- fusion gating rules
- bias estimation workflow
- cross covariance caution

## Main papers

\[Joh05, Oke01, Bel14, Wes18, Hoy24, Qua22\]

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Bel14\] D. Belfadel and R. W. Osborn, “Bias Estimation and Observability for Optical Sensor Measurements with Targets of Opportunity,” 2014.

\[Wes18\] M. Westenkirchner and M. Ger, “Joint Tracking and Registration in Multi-Target Multi-Sensor Surveillance Using Factor Graphs,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 1464–1471, Jul. 2018, doi: [10.23919/ICIF.2018.8455675](https://doi.org/10.23919/ICIF.2018.8455675).

\[Hoy24\] S. J. Hoyt, W. D. Blair, and A. Lanterman, “Non-Linear Bias Mitigation in Multi-Sensor Multi-Track Fusion,” *2024 27th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2024, doi: [10.23919/FUSION59988.2024.10706450](https://doi.org/10.23919/FUSION59988.2024.10706450).

\[Yan19\] K. Yang, Y. Bar-Shalom, and P. Willett, “Track-to-Track fusion with cross-covariances from radar and IR/EO sensor,” *2019 22th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2019, doi: [10.23919/fusion43075.2019.9011439](https://doi.org/10.23919/fusion43075.2019.9011439).

\[Qua22\] C. Quaranta and G. Balzarotti, “Estimation of Consistent Cross-Covariance Matrices in a Multisensor Data Fusion,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 58, pp. 5456–5469, Dec. 2022, doi: [10.1109/TAES.2022.3172399](https://doi.org/10.1109/TAES.2022.3172399).
