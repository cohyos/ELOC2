# Chunk index

##### [**Undermind**](https://undermind.ai)

---


## Table of Contents

- [Chunk index](#chunk-index)
- [References](#references)

## Chunk index

This folder contains tighter retrieval oriented files derived from the master report.

| File                           | Use                                    |
|:-------------------------------|:---------------------------------------|
| RAP fusion architecture        | recognized air picture and fusion core |
| Radar EO cueing and fusion     | handoff, cueing, fusion policy         |
| EO sensor tasking              | planner logic and operator control     |
| EO triangulation geometry      | 3D from multiple EO bearings           |
| EO multi target resolution     | crowded FOV and ambiguity handling     |
| Sensor registration and timing | bias, timing, and fusion safety        |
| Map simulation and workstation | UI, replay, and map display            |
| ELOC2 UI Requirements and VV Spec | Full UI/UX requirements, visual inventory, interaction flows, QA agent spec, acceptance criteria |
| ELOC2 Implementation Plan       | Detailed implementation plan: 20 sub-tasks, file paths, agent prompts, execution order |
| Blank Map Postmortem and Testing Lessons | Post-mortem: why MapLibre layers never rendered, testing gaps, 7 mandatory rules, dual rendering architecture |
| ELOC2 Corrections and Upgrades Plan | Corrections & upgrades: 7 phases, 16 REQ items with traceability matrix |
| MHT JPDA Design                      | MHT vs JPDA algorithm comparison for dense multi-target tracking scenarios |
| ASTERIX Feasibility Study             | CAT-048/062 integration evaluation, Cloud Run deployment constraints |
| ASTERIX Integration                   | ASTERIX implementation spec: AsterixListener, parsers, adapter architecture |
| Map Renderer Evaluation               | Rendering approach evaluation (5 options), dual architecture justification |
| EO Processing Server Architecture     | EO processing microservice: RTSP ingestion, YOLO detection, gRPC output |
| High Load Architecture                | Distributed architecture for 100+ targets, 10+ operators, Redis Streams |
| EO C2 demo for air defense            | High-level concept, requirements, and system overview |
| EO C2 build roadmap                   | Phase sequence, acceptance criteria, scenario specifications |
| EO C2 demo build knowledge base       | Research-grounded design decisions and domain logic |
| EO C2 repo scaffold spec              | Monorepo structure, package boundaries, directory layout |
| EO C2 search outcome report           | Technology evaluation rationale and tool selection |
| Claude code prompt templates          | Copy-paste agent prompts with shared prefix for build agents |
| Claude agent build prompts            | Detailed agent prompts with scope and done criteria |

These chunk files are written to improve retrieval precision for MCP or RAG while preserving the key research backed claims from the master report \[Joh05, Paw96, Kal04, San01, Cor11, Oke01, Pat09\].

---

## References

\[Joh05\] T. Johnsen, B. Hafskjold, and S. Fagerlund, “Data Fusion for Improved Air Picture Generation in Air Defence Systems,” 2005.

\[Paw96\] R. Pawlak, R. Horman, R. Stapleton, and R. Headley, “DESIGN OF A REAL-TIME MULTISENSOR SEARCH AND TRACK SYSTEM,” May 01, 1996. doi: [10.1111/J.1559-3584.1996.TB01573.X](https://doi.org/10.1111/J.1559-3584.1996.TB01573.X).

\[Kal04\] M. Kalandros, L. Trailovic, L. Pao, and Y. Bar-Shalom, “Tutorial on multisensor management and fusion algorithms for target tracking,” *Proceedings of the 2004 American Control Conference*, vol. 5, pp. 4734–4748 vol.5, 2004, doi: [10.23919/ACC.2004.1384060](https://doi.org/10.23919/ACC.2004.1384060).

\[San01\] J. Sanders-Reed, “Error propagation in two-sensor three-dimensional position estimation,” Apr. 01, 2001. doi: [10.1117/1.1353798](https://doi.org/10.1117/1.1353798).

\[Cor11\] S. Coraluppi and C. Carthel, “Multi-Stage Multiple-Hypothesis Tracking,” *J. Adv. Inf. Fusion*, vol. 6, pp. 57–67, 2011.

\[Oke01\] N. Okello and S. Challa, “Simultaneous Registration and Track Fusion for Networked Trackers,” 2001.

\[Pat09\] P. Patrick and T. W. Pearce, “OpenEOIR - An open source simulation based electro-optic sensor training environment prototype,” Dec. 01, 2009.
