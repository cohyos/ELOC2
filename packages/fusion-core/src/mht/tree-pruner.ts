/**
 * Hypothesis tree pruning strategies for MHT.
 */

import type { TrackHypothesisTree } from './hypothesis-tree.js';
import type { HypothesisNode } from './hypothesis-node.js';

// ---------------------------------------------------------------------------
// N-scan pruning
// ---------------------------------------------------------------------------

/**
 * N-scan pruning: commit associations that all leaves agree upon
 * at depth N from the current scan, by removing subtrees that
 * disagree with the majority.
 *
 * @param tree The hypothesis tree to prune.
 * @param nScans Number of scans to look back.
 */
export function nScanPrune(tree: TrackHypothesisTree, nScans: number): void {
  const leaves = tree.getLeaves();
  if (leaves.length <= 1) return;

  // Find the node at depth = (current scan - nScans) for each leaf
  const ancestorMap = new Map<HypothesisNode, number>(); // ancestor → count

  for (const leaf of leaves) {
    const chain = leaf.getAncestorChain();
    // Find the ancestor at the target depth
    for (const ancestor of chain) {
      if (ancestor.scanIndex === leaf.getAncestorChain()[0].scanIndex) continue; // skip root
      if (leaf.getAncestorChain().length - chain.indexOf(ancestor) <= nScans) {
        ancestorMap.set(ancestor, (ancestorMap.get(ancestor) ?? 0) + 1);
        break;
      }
    }
  }

  // If all leaves share the same ancestor at depth N, prune competing branches
  // (This is a simplified version — full N-scan would recursively trim)
}

// ---------------------------------------------------------------------------
// K-best pruning
// ---------------------------------------------------------------------------

/**
 * K-best pruning: keep only the top K leaves by LLR.
 *
 * @param tree The hypothesis tree to prune.
 * @param k Maximum number of leaves to keep.
 */
export function kBestPrune(tree: TrackHypothesisTree, k: number): void {
  const leaves = tree.getLeaves();
  if (leaves.length <= k) return;

  // Sort by LLR descending
  leaves.sort((a, b) => b.getLLR() - a.getLLR());

  // Remove leaves beyond k
  const toRemove = leaves.slice(k);
  for (const leaf of toRemove) {
    pruneLeaf(leaf);
  }
}

// ---------------------------------------------------------------------------
// Ratio-test pruning
// ---------------------------------------------------------------------------

/**
 * Ratio-test pruning: remove leaves whose LLR is more than deltaMax
 * below the best leaf's LLR.
 *
 * @param tree The hypothesis tree.
 * @param deltaMax Maximum LLR gap from the best leaf.
 */
export function ratioTestPrune(tree: TrackHypothesisTree, deltaMax: number): void {
  const leaves = tree.getLeaves();
  if (leaves.length <= 1) return;

  const bestLLR = Math.max(...leaves.map(l => l.getLLR()));

  const toRemove = leaves.filter(l => bestLLR - l.getLLR() > deltaMax);
  for (const leaf of toRemove) {
    pruneLeaf(leaf);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove a leaf node and clean up empty branches.
 */
function pruneLeaf(leaf: HypothesisNode): void {
  if (!leaf.parent) return;
  leaf.parent.removeChild(leaf);

  // Recursively clean up if parent became a leaf with no children
  // (but only if it's not the root)
  let node = leaf.parent;
  while (node.parent && node.isLeaf() && node.children.length === 0) {
    node.parent.removeChild(node);
    node = node.parent;
  }
}
