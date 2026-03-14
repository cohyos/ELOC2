# EO triangulation geometry

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO triangulation geometry](#eo-triangulation-geometry)
- [Build rules](#build-rules)
- [Geometry indicators](#geometry-indicators)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## EO triangulation geometry

Angle only 3D localization is sensitive to geometry. Two EO sensors can estimate 3D position, but depth quality depends strongly on baseline geometry, line of sight intersection angle, measurement noise, and time alignment \[Ham85, San01\]. Targets near the sensor baseline or with nearly parallel sight lines are weakly observed \[San01, San02\]. Three non collinear sensors help when two sensor geometry is poor \[Fer13\].

## Build rules

- Never publish 3D without uncertainty and geometry quality \[San01\]
- Classify output as bearing only, candidate 3D, or confirmed 3D \[Ham85, Fer13\]
- Down weight or reject 3D when intersection angle is weak \[San01\]
- Request a third view when the target is near the baseline \[Fer13\]
- Align measurements to common time for moving targets \[Ris01, Tia10\]

## Geometry indicators

| Indicator              | Meaning                              |
|:-----------------------|:-------------------------------------|
| Intersection angle     | Main depth observability signal      |
| Covariance volume      | Overall 3D uncertainty               |
| Time alignment quality | Trust in moving target triangulation |
| Bearing noise          | Sensitivity to sensor error          |

## Retrieval cues

Useful when the agent needs:

- triangulation engine rules
- geometry quality score
- when to suppress weak 3D
- multi sensor bearing fusion limits

## Main papers

\[Ham85, San01, San02, Fer13, Ris01\]

---

## References

\[Ham85\] S. Hammel and V. Aidala, “Observability Requirements for Three-Dimensional Tracking via Angle Measurements,” Mar. 01, 1985. doi: [10.1109/TAES.1985.310617](https://doi.org/10.1109/TAES.1985.310617).

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[San02\] J. Sanders-Reed, “Impact of tracking system knowledge on multisensor 3D triangulation,” Jul. 01, 2002. doi: [10.1117/12.472599](https://doi.org/10.1117/12.472599).

\[Fer13\] M. H. Ferdowsi, “Passive Range Estimation Using Two and Three Optical Cameras,” Apr. 30, 2013. doi: [10.15866/iremos.v6i2.2441](https://doi.org/10.15866/iremos.v6i2.2441).

\[Ris01\] B. Ristic, S. Zollo, and S. Arulampalam, “Performance Bounds for Manoeuvring Target Tracking Using Asynchronous Multi-Platform Angle-Only Measurements,” 2001.

\[Tia10\] X. Tian and Y. Bar-Shalom, “On algorithms for asynchronous Track-to-Track Fusion,” *2010 13th International Conference on Information Fusion*, pp. 1–8, Jul. 2010, doi: [10.1109/ICIF.2010.5711956](https://doi.org/10.1109/ICIF.2010.5711956).
