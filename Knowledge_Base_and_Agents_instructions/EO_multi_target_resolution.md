# EO multi target resolution

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [EO multi target resolution](#eo-multi-target-resolution)
- [Build rules](#build-rules)
- [Core entities](#core-entities)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## EO multi target resolution

The right response to ambiguous EO scenes is delayed association, not forced certainty. Multiple hypothesis tracking remains a strong baseline because it keeps competing explanations alive across frames \[Cor11, Cho18\]. This matters when one external track enters a crowded field of view, one blob later splits into two objects, or dim targets sit in clutter \[Cor19, Tar09\].

## Build rules

- Support zero, one, or many EO objects for one incoming cue \[Cor19\]
- Maintain unresolved group state when objects are not yet separable \[Cor19\]
- Preserve competing association hypotheses across time \[Cor11\]
- Use track before detect style logic for weak targets in clutter when needed \[Tar09, Liu12b\]
- Preserve lineage through split and merge events \[Cor11\]

## Core entities

- Detection
- EO track
- Unresolved group
- Association hypothesis

This entity split is an implementation synthesis based on MHT and EO tracking work \[Cor11, Cor19, Tar09\].

## Retrieval cues

Useful when the agent needs:

- crowded FOV logic
- MHT style tracking
- unresolved target groups
- split and merge handling
- EO association under ambiguity

## Main papers

\[Cor11, Cho18, Cor19, Tar09, Wil02\]

---

## References

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Cho18\] C. Chong, S. Mori, and D. Reid, “Forty Years of Multiple Hypothesis Tracking - A Review of Key Developments,” *2018 21st International Conference on Information Fusion (FUSION)*, pp. 452–459, Jul. 2018, doi: [10.23919/ICIF.2018.8455386](https://doi.org/10.23919/ICIF.2018.8455386).

\[Cor19\] S. Coraluppi and C. Carthel, “Track-Oriented MHT with Unresolved Measurements,” *2019 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–6, Oct. 2019, doi: [10.1109/SDF.2019.8916657](https://doi.org/10.1109/SDF.2019.8916657).

\[Tar09\] A. Tartakovsky, A. P. Brown, and J. Brown, “Enhanced Algorithms for EO/IR Electronic Stabilization, Clutter Suppression, and Track-Before-Detect for Multiple Low Observable Targets,” Sep. 01, 2009.

\[Liu12b\] S. Liu, “Integrated Waveform-Agile Multi-Modal Track-before-Detect Algorithms for Tracking Low Observable Targets,” 2012.

\[Wil02\] P. Willett, Y. Ruan, and R. Streit, “PMHT: problems and some solutions,” Dec. 10, 2002. doi: [10.1109/TAES.2002.1039396](https://doi.org/10.1109/TAES.2002.1039396).
