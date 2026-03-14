# Map simulation and workstation

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [Map simulation and workstation](#map-simulation-and-workstation)
- [Build rules](#build-rules)
- [Suggested layout](#suggested-layout)
- [Retrieval cues](#retrieval-cues)
- [Main papers](#main-papers)
- [References](#references)

## Map simulation and workstation

A credible EO C2 demo should show sensing process, not just icons on a map. The simulation and visualization literature supports a map centered operator workstation that exposes track state, sensor coverage, tasking logic, latency, and degraded modes \[Cho00, App00, Flo24, Pat09\]. Operator trust depends on seeing why the automation acted as it did \[Kup94\].

## Build rules

- Show system tracks as the default air picture \[Flo24\]
- Allow drill down into local tracks and source evidence \[Kup94\]
- Display sensor field of regard, line of sight, and coverage overlays \[Mew05, Hew03\]
- Show tasking timeline and assignment rationale \[Pat09, Kup94\]
- Show triangulation rays and geometry quality, not only a 3D point \[San01, Fer13\]
- Expose faults and latency rather than hiding them \[App00, Flo24\]
- Support replay because reasoning is temporal \[Flo24\]

## Suggested layout

- Map and 3D scene pane
- Track and investigation detail pane
- Tasking and event timeline pane

This layout is a synthesis from operator interface and simulation work \[Kup94, Pat09, Ram09\].

## Retrieval cues

Useful when the agent needs:

- workstation layout
- map overlays
- operator trust features
- replay and timeline design
- scenario visualization

## Main papers

\[Pat09, Cho00, Kup94, App00, Flo24\]

---

## References

\[Cho00\] S. Choi and D. Wijesekera, “The DADSim air defense simulation environment,” *Proceedings. Fifth IEEE International Symposium on High Assurance Systems Engineering (HASE 2000)*, pp. 75–82, Nov. 2000, doi: [10.1109/HASE.2000.895444](https://doi.org/10.1109/HASE.2000.895444).

\[App00\] “Approved for public release; distribution is unlimited. Dynamo: A Tool for Modeling Integrated Air Defense Systems.”

\[Flo24\] G. Florian, “Multi-Sensor Simulation from Target Tracking to a Recognized Air Picture,” *2024 Sensor Data Fusion: Trends, Solutions, Applications (SDF)*, pp. 1–8, Nov. 2024, doi: [10.1109/SDF63218.2024.10773927](https://doi.org/10.1109/SDF63218.2024.10773927).

\[Pat09\] P. Patrick and T. W. Pearce, “OpenEOIR - An open source simulation based electro-optic sensor training environment prototype,” Dec. 01, 2009.

\[Kup94\] G. Kuperman, “Operator interface for a multi-sensor target acquisition system,” in *Proceedings of National Aerospace and Electronics Conference (NAECON’94)*, May 1994, pp. 638–645 vol.2. doi: [10.1109/NAECON.1994.332971](https://doi.org/10.1109/NAECON.1994.332971).

\[Mew05\] D. David. Mewett, “Dynamic Display for Visualising Surveillance Coverage in Complex Terrain,” 2005.

\[Hew03\] P. Hew, “Visualisation of Surveillance Coverage by Latency Mapping,” *InVis.au*, pp. 11–16, 2003.

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Fer13\] M. H. Ferdowsi, “Passive Range Estimation Using Two and Three Optical Cameras,” Apr. 30, 2013. doi: [10.15866/iremos.v6i2.2441](https://doi.org/10.15866/iremos.v6i2.2441).

\[Ram09\] P. Ramadeen, B. Duvenhage, and A. Duvenhage, “Effectively utilising a 3rd party 3D visualization component in a discrete event simulation environment for Joint Command and Control (JC2),” Sep. 01, 2009.
