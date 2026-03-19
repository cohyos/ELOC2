# MHT/JPDA Data Association Design Document

## 1. Problem Statement

ELOC2's current tracking pipeline uses **single-hypothesis nearest-neighbor (NN) association** in the `TrackManager.correlate()` step. For each new observation, the correlator finds the single best-matching existing track based on gating distance (Mahalanobis or Euclidean) and assigns the observation to that track.

This approach fails in dense multi-target scenarios because:

- **Ambiguous assignments**: When two or more tracks are within the gate of a single observation (or vice versa), NN makes an irrevocable hard decision. If wrong, the error propagates — the assigned track drifts, and the correct track starves for updates and eventually drops.
- **Track coalescence**: Closely-spaced targets (e.g., formation flight, Grad barrage) produce overlapping gates. NN tends to merge distinct targets into a single track.
- **Ghost tracks**: In clutter-dense environments, false alarms can hijack track updates, creating persistent ghost tracks while real targets lose continuity.
- **Crossing targets**: When two targets cross paths, NN frequently swaps track identities — a critical failure for engagement-quality tracking.

For ELOC2's operational scenarios — Grad barrages (10 simultaneous rockets, ~500 m spacing), UAV diamond formations (~200 m spacing), and combined threat environments — nearest-neighbor association is demonstrably insufficient. More sophisticated data association algorithms are required.

## 2. MHT (Multiple Hypothesis Tracking)

### 2.1 Algorithm Overview

MHT, first proposed by Reid (1979), defers hard association decisions by maintaining multiple hypotheses about which observations belong to which tracks. Each hypothesis represents a complete, consistent assignment of all observations to tracks (including false alarms and new track initiations).

**Two major variants exist:**

- **Measurement-Oriented MHT (Reid's original)**: Builds a hypothesis tree rooted at each new measurement. Each branch represents a different association possibility (existing track k, new track, false alarm). The tree grows combinatorially with each scan.

- **Track-Oriented MHT (Kurien, 1990; Blackman, 1999)**: Organizes hypotheses by track rather than measurement. Each track maintains a tree of possible observation sequences. Hypothesis management is more tractable because pruning can be done per-track.

**ELOC2 recommendation: Track-Oriented MHT** — it maps naturally to the existing `SystemTrack` data structure and allows incremental pruning.

### 2.2 Data Structures

```
HypothesisNode {
  trackId: SystemTrackId
  scanIndex: number                  // which sensor scan this node corresponds to
  associatedObservation: ObservationId | null  // null = missed detection
  state: KalmanState                 // predicted/updated state at this node
  logLikelihoodRatio: number         // cumulative LLR from root to this node
  parent: HypothesisNode | null
  children: HypothesisNode[]
}

TrackHypothesisTree {
  trackId: SystemTrackId
  root: HypothesisNode
  leaves: HypothesisNode[]          // current active hypotheses
  bestLeaf: HypothesisNode          // highest-LLR leaf (used for display/output)
}

GlobalHypothesis {
  id: number
  score: number                     // sum of per-track LLRs
  trackAssignments: Map<SystemTrackId, HypothesisNode>
  // Constraint: no two tracks share the same observation
}
```

### 2.3 Scoring (Log-Likelihood Ratio)

Each hypothesis node is scored using the log-likelihood ratio (LLR):

```
LLR(track, observation) = ln[ p(observation | track) / p(observation | clutter) ]
```

Where:
- `p(observation | track)` = Gaussian likelihood from Kalman innovation: `N(innovation; 0, S)` where `S` is the innovation covariance
- `p(observation | clutter)` = uniform density over the surveillance volume: `1 / V_gate`

For missed detections:
```
LLR(missed) = ln(1 - P_D)    // P_D = probability of detection
```

For new track initiation:
```
LLR(new_track) = ln(β_NT)    // β_NT = new track density, typically set empirically
```

### 2.4 Pruning Strategies

Without pruning, MHT's hypothesis count grows as O(m^n) where m = measurements per scan and n = number of scans. Three practical pruning strategies:

#### N-Scan Pruning
- Look back N scans from the current time
- If all surviving hypotheses agree on the association at scan (current - N), commit that association and prune all branches that disagree
- Typical N = 3–5 for air defense applications
- **Recommended for ELOC2**: N=3 (at 1-second update rate, this is a 3-second look-back)

#### K-Best Pruning
- After forming all possible hypotheses at each scan, keep only the top K by cumulative LLR score
- Murty's algorithm (1968) efficiently finds the K-best assignments in O(K * m^3) time
- Typical K = 50–200
- **Recommended for ELOC2**: K=100

#### Ratio Test Pruning
- Delete any hypothesis whose LLR is more than `Δ_max` below the best hypothesis
- Acts as a dynamic threshold — more aggressive when one hypothesis is clearly dominant
- Typical Δ_max = 10–20 (in natural log units)
- **Recommended for ELOC2**: Δ_max = 15

### 2.5 Computational Complexity

| Operation | Complexity |
|-----------|-----------|
| Hypothesis generation (per scan) | O(m * T) where T = active tracks |
| Global hypothesis formation | O(m^T) worst case (NP-hard assignment) |
| K-best via Murty's algorithm | O(K * m^3) |
| N-scan pruning | O(T * K) |
| Memory | O(T * K * N) hypothesis nodes |

**For ELOC2 operating envelope** (10–100 targets, 3–10 sensors, 1-second updates):
- m ≈ 10–100 measurements per scan
- T ≈ 10–100 active tracks
- With K=100 and N=3: ~30,000 active hypothesis nodes — manageable in memory
- Per-scan computation: ~10–50 ms on modern hardware

### 2.6 Pros and Cons

**Pros:**
- Optimal for ambiguous situations — defers decisions until evidence accumulates
- Naturally handles track splits and merges
- Robust to temporary obscuration and missed detections
- Provides explicit confidence in track identity through hypothesis scores
- Handles crossing targets correctly (maintains both association hypotheses)

**Cons:**
- Exponential growth without aggressive pruning
- Memory intensive — each track maintains a hypothesis tree
- Implementation complexity is significantly higher than NN or JPDA
- Latency: decisions are deferred by N scans (N-scan pruning delay)
- Pruning parameters require careful tuning per scenario type

## 3. JPDA (Joint Probabilistic Data Association)

### 3.1 Algorithm Overview

JPDA, developed by Bar-Shalom and Fortmann (1988), takes a fundamentally different approach from MHT: instead of maintaining multiple hypotheses, it computes **marginal association probabilities** for each observation-track pair and uses a **weighted update** of the track state.

At each scan:
1. Gate: identify which observations fall within each track's validation gate
2. Enumerate all feasible joint events (consistent 1-to-1 or 0-to-1 assignments)
3. Compute the probability of each joint event
4. Marginalize to get per-track association probabilities (β coefficients)
5. Update each track with a weighted combination of all gated observations

### 3.2 Data Structures

```
AssociationMatrix {
  // Rows = tracks, Columns = observations + 1 (for "no association")
  // Cell (i, j) = Gaussian likelihood of observation j given track i
  likelihoods: number[][]
}

BetaCoefficients {
  trackId: SystemTrackId
  // β[j] = probability that observation j is the correct association for this track
  // β[0] = probability of no association (missed detection)
  betas: Map<ObservationId | null, number>
}

JPDAUpdate {
  // Combined innovation = Σ β[j] * innovation[j]
  combinedInnovation: number[]
  // Combined covariance includes a "spread of means" term
  combinedCovariance: number[][]
}
```

### 3.3 Algorithm Steps

```
function jpdaUpdate(tracks: Track[], observations: Observation[]):
  1. GATING:
     For each track t, each observation z:
       if mahalanobis(z, t.predicted) < γ:
         gatedObs[t].add(z)

  2. FEASIBLE EVENTS:
     Enumerate all θ ∈ Θ where:
       - Each observation is assigned to at most one track (or clutter)
       - Each track gets at most one observation (or missed detection)

  3. EVENT PROBABILITIES:
     For each θ ∈ Θ:
       P(θ) ∝ Π_{assignments in θ} [
         P_D * N(z; ẑ_t, S_t) / λ_c    // if obs z assigned to track t
         (1 - P_D)                        // if track t has no observation
         λ_c                              // if obs z is clutter
       ]
     Normalize: P(θ) = P(θ) / Σ P(θ')

  4. MARGINAL PROBABILITIES:
     For each track t, observation z:
       β_t(z) = Σ_{θ: z→t in θ} P(θ)
       β_t(0) = Σ_{θ: t unassigned in θ} P(θ)

  5. COMBINED UPDATE:
     For each track t:
       combined_innovation = Σ_z β_t(z) * (z - ẑ_t)
       x_updated = x_predicted + K * combined_innovation
       P_updated = β_t(0) * P_predicted
                   + (1 - β_t(0)) * P_standard_update
                   + K * P_spread * K'
       where P_spread = Σ_z β_t(z) * innovation_z * innovation_z' - combined * combined'
```

### 3.4 Computational Complexity

| Operation | Complexity |
|-----------|-----------|
| Gating | O(m * T) |
| Feasible event enumeration | O(m! / (m-T)!) worst case |
| In practice (sparse gating) | O(m * T) per cluster |
| Marginal probability computation | O(number of feasible events) |
| Track update | O(T * state_dim^2) |
| Memory | O(m * T) — fixed, no hypothesis history |

**For ELOC2 operating envelope** (10–100 targets, 3–10 sensors, 1-second updates):
- Gating typically produces small clusters (2–5 tracks competing for 2–5 observations)
- Within each cluster, feasible event enumeration is tractable
- Per-scan computation: ~1–10 ms — significantly faster than MHT
- Fixed memory footprint

### 3.5 Pros and Cons

**Pros:**
- Fixed memory — no hypothesis history, O(m * T) per scan
- Computationally efficient for moderate clutter and target density
- Straightforward implementation — extends standard Kalman filter
- Good tracking performance for well-separated and moderately-spaced targets
- No pruning parameters to tune
- No decision latency — produces best estimate at each scan

**Cons:**
- **Track coalescence**: In dense scenarios, β coefficients spread across multiple tracks, causing their state estimates to converge toward each other
- **No deferred decisions**: Cannot recover from early misassociations
- **Combinatorial explosion**: Feasible event enumeration becomes intractable for large clusters (>8–10 interacting tracks)
- **No explicit track initiation/deletion logic**: Must be handled separately
- Cannot represent split/merge hypotheses — fundamentally single-hypothesis output

## 4. Comparison Table

| Criterion | NN (Current) | JPDA | MHT |
|-----------|-------------|------|-----|
| **Association quality** | Poor in clutter | Good for moderate density | Best — optimal deferred decisions |
| **Crossing targets** | Swaps identity | Partial — coalescence risk | Handles correctly |
| **Dense formations** (Grad, UAV swarm) | Fails — track merger | Marginal — coalescence | Good — maintains hypotheses |
| **Computation (10 targets)** | <1 ms | ~2 ms | ~10 ms |
| **Computation (100 targets)** | ~5 ms | ~20 ms | ~50 ms (with K=100 pruning) |
| **Memory** | O(T) | O(m*T) | O(T*K*N) |
| **Memory (100 targets)** | ~100 KB | ~1 MB | ~30 MB |
| **Implementation complexity** | Low | Medium | High |
| **Tuning parameters** | Gate size | Gate size, P_D, λ_c | Gate, P_D, λ_c, K, N, Δ_max |
| **Track initiation** | Threshold | Separate logic needed | Built-in (new track hypothesis) |
| **Split/merge handling** | None | None | Native |
| **Decision latency** | 0 scans | 0 scans | N scans (typ. 3) |
| **Suitability for ELOC2 demo** | Insufficient | Good | Best (but complex) |
| **Suitability for production** | No | Moderate | Yes |

## 5. Recommendation for ELOC2

### Phase 1: JPDA (Demo / Near-Term)

**Rationale**: JPDA provides a significant improvement over NN association with moderate implementation effort. It is sufficient for the demo scenarios (10–20 targets) and can be implemented within the existing `TrackManager` architecture.

**Key benefits for Phase 1:**
- Handles the Grad barrage scenario (10 closely-spaced rockets) without track coalescence at the observed spacings (~500 m)
- Improves UAV diamond formation tracking (~200 m spacing)
- Fixed memory footprint suitable for browser-based workstation
- Implementable in 2–3 weeks by extending the current correlator

**Limitations accepted for Phase 1:**
- Track coalescence possible for very dense formations (<100 m spacing)
- Crossing target identity maintenance is probabilistic, not guaranteed
- No deferred decision capability

### Phase 2: MHT (Production-Grade)

**Rationale**: For production deployment with 50–100 simultaneous targets, complex threat mixtures, and engagement-quality tracking requirements, MHT is the correct choice. The N-scan look-back provides robust identity maintenance through crossings and temporary obscurations.

**Key benefits for Phase 2:**
- Guaranteed correct identity maintenance through target crossings
- Natural handling of track splits (formation breakup) and merges
- Built-in track initiation scoring eliminates separate M-of-N logic
- Hypothesis trees provide explicit confidence metrics for operator display

### Integration Points in Existing TrackManager

The current pipeline in `TrackManager`:

```
processObservationBatch(observations)
  → for each obs: correlate(obs)        ← REPLACE THIS
    → gate check (Mahalanobis)
    → best-match selection (NN)
  → fuseObservation(track, obs)          ← KEEP (Kalman update)
  → checkTrackStatus()                   ← KEEP (tentative/confirmed/dropped)
```

**JPDA integration** (Phase 1):
```
processObservationBatch(observations)
  → gateAllObservations(observations)    ← NEW: build gating matrix
  → clusterTracks(gatingMatrix)          ← NEW: find interacting groups
  → for each cluster:
      jpdaAssociate(cluster)             ← NEW: compute β coefficients
  → for each track:
      jpdaUpdate(track, betas)           ← MODIFIED: weighted Kalman update
  → checkTrackStatus()
```

**MHT integration** (Phase 2):
```
processObservationBatch(observations)
  → gateAllObservations(observations)    ← REUSE from JPDA
  → for each track:
      expandHypothesisTree(track, gated) ← NEW: add hypothesis nodes
  → formGlobalHypotheses()               ← NEW: K-best assignment
  → pruneHypotheses(N_scan, K_best)      ← NEW: prune trees
  → for each track:
      updateBestEstimate(track)          ← NEW: extract best leaf state
  → checkTrackStatus()
```

## 6. Implementation Roadmap

### Phase 1: JPDA Integration (Estimated: 3 weeks)

#### Week 1: Core JPDA Algorithm
1. **New file**: `packages/fusion-core/src/jpda/association-matrix.ts`
   - Gating matrix construction
   - Gaussian likelihood computation
   - Cluster identification (connected components in gating graph)

2. **New file**: `packages/fusion-core/src/jpda/jpda-associator.ts`
   - Feasible event enumeration (per cluster)
   - Joint event probability computation
   - β coefficient marginalization

3. **New file**: `packages/fusion-core/src/jpda/jpda-updater.ts`
   - Combined innovation computation
   - Spread-of-means covariance adjustment
   - Integration with existing `InformationMatrixFuser`

#### Week 2: TrackManager Integration
4. **Modified**: `packages/fusion-core/src/track-manager.ts`
   - Replace per-observation `correlate()` with batch `jpdaCorrelate()`
   - Add `AssociationMode` config: `'nn' | 'jpda'`
   - Maintain backward compatibility — NN remains available

5. **Modified**: `packages/fusion-core/src/correlator.ts`
   - Extract gating logic into shared `GatingService`
   - Reuse for both NN and JPDA paths

#### Week 3: Testing and Tuning
6. **New tests**: `packages/fusion-core/src/jpda/__tests__/`
   - Unit tests for association matrix, β computation
   - Integration tests with Grad barrage scenario
   - Integration tests with UAV diamond formation
   - Regression tests: verify NN-equivalent behavior for well-separated targets

7. **Tuning**: Run all 4 new scenarios through JPDA pipeline
   - Optimize P_D, λ_c, gate size for each scenario type
   - Document parameter sensitivity

### Phase 2: MHT Integration (Estimated: 6 weeks)

#### Weeks 1–2: Hypothesis Tree Infrastructure
1. `packages/fusion-core/src/mht/hypothesis-node.ts` — Tree node data structure
2. `packages/fusion-core/src/mht/hypothesis-tree.ts` — Per-track tree management
3. `packages/fusion-core/src/mht/tree-pruner.ts` — N-scan, K-best, ratio test pruning

#### Weeks 3–4: Global Hypothesis Management
4. `packages/fusion-core/src/mht/global-hypothesis.ts` — Multi-track consistent hypotheses
5. `packages/fusion-core/src/mht/murty-solver.ts` — K-best assignment via Murty's algorithm
6. `packages/fusion-core/src/mht/mht-associator.ts` — Main MHT association driver

#### Weeks 5–6: Integration, Testing, Operator Display
7. Modified `TrackManager` — add `'mht'` association mode
8. Hypothesis confidence display in workstation UI
9. Full scenario regression testing
10. Performance profiling and optimization

## References

1. **Reid, D.B.** (1979). "An Algorithm for Tracking Multiple Targets." *IEEE Transactions on Automatic Control*, AC-24(6), 843–854. — *Original MHT formulation.*

2. **Bar-Shalom, Y. and Fortmann, T.E.** (1988). *Tracking and Data Association*. Academic Press. — *Foundational text on JPDA and PDA.*

3. **Blackman, S.S.** (1999). "Multiple Hypothesis Tracking for Multiple Target Tracking." *IEEE Aerospace and Electronic Systems Magazine*, 19(1), 5–18. — *Track-oriented MHT overview.*

4. **Blackman, S.S. and Popoli, R.** (1999). *Design and Analysis of Modern Tracking Systems*. Artech House. — *Comprehensive reference for MHT implementation details.*

5. **Bar-Shalom, Y., Willett, P.K., and Tian, X.** (2011). *Tracking and Data Fusion: A Handbook of Algorithms*. YBS Publishing. — *Modern treatment of JPDA, MHT, and hybrid approaches.*

6. **Kurien, T.** (1990). "Issues in the Design of Practical Multitarget Tracking Algorithms." In *Multitarget-Multisensor Tracking: Advanced Applications*, Bar-Shalom (ed.), Artech House. — *Track-oriented MHT formalization.*

7. **Murty, K.G.** (1968). "An Algorithm for Ranking All the Assignments in Order of Increasing Cost." *Operations Research*, 16(3), 682–687. — *K-best assignment algorithm used in MHT pruning.*

8. **Musicki, D. and Evans, R.** (2004). "Joint Integrated Probabilistic Data Association — JIPDA." *IEEE Transactions on Aerospace and Electronic Systems*, 40(3), 1093–1099. — *JIPDA extension handling track existence probability.*
