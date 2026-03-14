# Radar EO cueing and fusion

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [Radar EO cueing and fusion](#radar-eo-cueing-and-fusion)
- [Build rules](#build-rules)
- [Key implementation note](#key-implementation-note)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## Radar EO cueing and fusion

Radar and electro optical sensors play complementary roles. Radar provides wide area search and kinematics. EO provides bearing, visual investigation, passive confirmation, and possible target splitting inside one field of view \[Paw96, Bla00, Guo02\]. The cue should be treated as a time bounded search order with uncertainty, not as truth \[Paw96\].

## Build rules

- A cue must include predicted state, uncertainty gate, priority, validity window, and dwell suggestion \[Paw96, Kal04\]
- EO search should aim at a gated region rather than a point \[Paw96, Sko09\]
- EO may return confirm, refine, split, or no support \[Zha11, Cor19\]
- Prefer centralized measurement fusion if common measurements are available \[Nai23\]
- If only local tracks are available, use conservative heterogeneous track fusion \[Mal19, Yan19\]
- If registration or covariance quality is poor, use EO as confirmation only \[Joh05, Qua22\]

## Key implementation note

Heterogeneous radar and EO tracks often live in different state spaces and update asynchronously. Treating them as simple independent Cartesian tracks leads to overconfidence \[Mal19, Yan19, Tia10\].

## Retrieval cues

Useful when the agent needs:

- cue message schema
- handoff workflow
- radar to EO integration logic
- confirmation versus fusion logic
- asynchronous track fusion constraints

## Main papers

\[Paw96, Mal19, Yan19, Nai23, Guo02, Tia10\]

---

## References

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Bla00\] S. Blackman, R. Dempster, S. H. Roszkowski, D. M. Sasaki, and P. Singer, “Improved tracking capability and efficient radar allocation through the fusion of radar and infrared search-and-track observations,” May 01, 2000. doi: [10.1117/1.602506](https://doi.org/10.1117/1.602506).

\[Guo02\] W. Guo, “Performance Analysis of Using an IRST Sensor Cueing a 3D Radar,” 2002.

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[Sko09\] P. Skoglar, “A Planning Algorithm of a Gimballed EO/IR Sensor for Multi Target Tracking,” 2009.

\[Zha11\] H. Zhang, H. Yang, and W. Yu, “The Handoff Method of IRST and Radar Under Multi-target Scenario: The Handoff Method of IRST and Radar Under Multi-target Scenario,” May 12, 2011. doi: [10.3724/SP.J.1146.2010.00982](https://doi.org/10.3724/SP.J.1146.2010.00982).

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

\[Nai23\] V. Naidu, “Fusion Architectures for 3D Target Tracking Using IRST and Radar Measurements,” *Journal of Aerospace Sciences and Technologies*, Aug. 2023, doi: [10.61653/joast.v62i3.2010.502](https://doi.org/10.61653/joast.v62i3.2010.502).

\[Mal19\] M. Mallick, K.-C. Chang, S. Arulampalam, and Y. Yan, “Heterogeneous Track-to-Track Fusion in 3-D Using IRST Sensor and Air MTI Radar,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 55, pp. 3062–3079, Feb. 2019, doi: [10.1109/TAES.2019.2898302](https://doi.org/10.1109/TAES.2019.2898302).

\[Yan19\] K. Yang, Y. Bar-Shalom, and P. Willett, “Track-to-Track fusion with cross-covariances from radar and IR/EO sensor,” *2019 22th International Conference on Information Fusion (FUSION)*, pp. 1–5, Jul. 2019, doi: [10.23919/fusion43075.2019.9011439](https://doi.org/10.23919/fusion43075.2019.9011439).

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Qua22\] C. Quaranta and G. Balzarotti, “Estimation of Consistent Cross-Covariance Matrices in a Multisensor Data Fusion,” *IEEE Transactions on Aerospace and Electronic Systems*, vol. 58, pp. 5456–5469, Dec. 2022, doi: [10.1109/TAES.2022.3172399](https://doi.org/10.1109/TAES.2022.3172399).

\[Tia10\] X. Tian and Y. Bar-Shalom, “On algorithms for asynchronous Track-to-Track Fusion,” *2010 13th International Conference on Information Fusion*, pp. 1–8, Jul. 2010, doi: [10.1109/ICIF.2010.5711956](https://doi.org/10.1109/ICIF.2010.5711956).
