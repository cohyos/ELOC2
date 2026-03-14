# EO sensor tasking

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO sensor tasking](#eo-sensor-tasking)
- [Build rules](#build-rules)
- [Minimal score shape](#minimal-score-shape)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## EO sensor tasking

Sensor management in air defense is a resource allocation problem, not a nearest sensor rule. Good tasking trades off threat priority, expected information gain, geometry value, slew cost, dwell cost, and operator intent \[Ben07b, Kal04, Her23\]. Human supervisory control matters because operators need to understand and override automation in command settings \[Cum04, Ben02b\].

## Build rules

- Score tasks using threat, uncertainty reduction, geometry gain, operator intent, slew cost, and occupancy cost \[Ben07b, Kal04, Her23\]
- Keep three modes: recommended only, auto with veto, manual \[Cum04\]
- A proposal must explain why it won \[Ben07b\]
- Planning must model finite slew, limited field of view, revisit need, and dwell time \[Sko09, Mah04\]

## Minimal score shape

``` math
score = threat + uncertainty\ gain + geometry\ gain + operator\ intent - slew\ cost - occupancy\ cost
```

This is a synthesis for implementation, not a direct paper formula \[Ben07b, Kal04, Her23\].

## Retrieval cues

Useful when the agent needs:

- task planner design
- assignment scoring
- operator override workflow
- gimbal planning logic

## Main papers

\[Ben07b, Kal04, Sko09, Her23, Cum04\]

---

## References

\[Ben07b\] A. Benaskeur and H. Irandoust, “Sensor Management for Tactical Surveillance Operations,” Nov. 01, 2007.

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Her23\] M. Hernandez, Á. F. García-Fernández, and S. Maskell, “Nonmyopic Sensor Control for Target Search and Track Using a Sample-Based GOSPA Implementation,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 60, pp. 387–404, Aug. 2023, doi: [10.1109/TAES.2023.3324908](https://doi.org/10.1109/TAES.2023.3324908).

\[Cum04\] M. Cummings, P. Mitchell, and T. Sheridan, “HUMAN SUPERVISORY CONTROL ISSUES IN NETWORK CENTRIC WARFARE,” 2004.

\[Ben02b\] A. Benaskeur, “Sensor Management in Command & Control,” Sep. 01, 2002.

\[Sko09\] P. Skoglar, “A Planning Algorithm of a Gimballed EO/IR Sensor for Multi Target Tracking,” 2009.

\[Mah04\] R. Mahler, “Sensor Management with Non-Ideal Sensor Dynamics,” 2004.
