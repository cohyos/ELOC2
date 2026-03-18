/**
 * Performance tests for the ELOC2 simulation engine.
 *
 * These are benchmarks with generous thresholds to ensure reliable CI
 * while still catching severe regressions. Actual timings are logged
 * for manual review.
 */
import { describe, it, expect } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';
import { SimulationStateMachine } from '../simulation/state-machine.js';
import { optimize } from '@eloc2/deployment-planner';
import type { SensorSpec, DeploymentConstraints } from '@eloc2/deployment-planner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run N ticks on a LiveEngine synchronously by calling the internal tick
 * via the public seek() method which replays from 0→N.
 * Since tick() is private, we use seek(n) which replays n seconds of sim.
 */
function runTicks(engine: LiveEngine, count: number): void {
  // seek() replays from 0 to target time — effectively running `count` ticks
  engine.start();
  engine.pause();
  engine.seek(count);
}

// ---------------------------------------------------------------------------
// 1. Tick performance
// ---------------------------------------------------------------------------

describe('Performance: tick throughput', () => {
  it('should run 100 ticks in acceptable time (avg < 50ms/tick)', { timeout: 30_000 }, () => {
    const engine = new LiveEngine('central-israel');

    const start = performance.now();
    runTicks(engine, 100);
    const elapsed = performance.now() - start;

    const avgMs = elapsed / 100;
    console.log(`[perf] 100 ticks in ${elapsed.toFixed(1)}ms — avg ${avgMs.toFixed(2)}ms/tick`);

    expect(avgMs).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// 2. Track scaling
// ---------------------------------------------------------------------------

describe('Performance: track scaling', () => {
  it('should not scale exponentially with tick count', { timeout: 60_000 }, () => {
    const tickCounts = [10, 30, 60];
    const timings: { ticks: number; totalMs: number; avgMs: number }[] = [];

    for (const count of tickCounts) {
      const engine = new LiveEngine('central-israel');
      const start = performance.now();
      runTicks(engine, count);
      const elapsed = performance.now() - start;
      const avg = elapsed / count;
      timings.push({ ticks: count, totalMs: elapsed, avgMs: avg });
      console.log(`[perf] ${count} ticks: ${elapsed.toFixed(1)}ms total, ${avg.toFixed(2)}ms/tick avg`);
    }

    // Average tick time at 60 ticks should not be more than 8x the time at 10 ticks.
    // Truly exponential growth would blow past this easily.
    // Note: post-tick merge sweep adds O(n²) work on active tracks, so ratio may be ~6x.
    const ratio = timings[2].avgMs / timings[0].avgMs;
    console.log(`[perf] Scaling ratio (60-tick avg / 10-tick avg): ${ratio.toFixed(2)}x`);
    expect(ratio).toBeLessThan(8);
  });
});

// ---------------------------------------------------------------------------
// 3. Memory stability
// ---------------------------------------------------------------------------

describe('Performance: memory stability', () => {
  it('should not grow heap unboundedly over 200 ticks', { timeout: 60_000 }, () => {
    // Force GC if available (node --expose-gc)
    if (global.gc) global.gc();

    const before = process.memoryUsage();
    const engine = new LiveEngine('central-israel');

    runTicks(engine, 200);

    if (global.gc) global.gc();
    const after = process.memoryUsage();

    const heapGrowthMB = (after.heapUsed - before.heapUsed) / (1024 * 1024);
    console.log(`[perf] Heap before: ${(before.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    console.log(`[perf] Heap after:  ${(after.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    console.log(`[perf] Heap growth: ${heapGrowthMB.toFixed(1)}MB`);

    // 50MB threshold — generous for a 200-tick run
    expect(heapGrowthMB).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// 4. Broadcast payload size
// ---------------------------------------------------------------------------

describe('Performance: broadcast payload size', () => {
  it('should produce a snapshot < 1MB JSON', { timeout: 30_000 }, () => {
    const engine = new LiveEngine('central-israel');
    runTicks(engine, 30);

    const snapshot = engine.getFullSnapshot();
    const json = JSON.stringify(snapshot);
    const sizeKB = json.length / 1024;

    console.log(`[perf] Snapshot JSON size: ${sizeKB.toFixed(1)}KB`);
    console.log(`[perf] Snapshot track count: ${(snapshot as any).trackCount}`);
    console.log(`[perf] Snapshot sensor count: ${(snapshot as any).sensors?.length ?? 0}`);

    expect(sizeKB).toBeLessThan(1024); // < 1MB
  });
});

// ---------------------------------------------------------------------------
// 5. Concurrent operations — state machine conflict prevention
// ---------------------------------------------------------------------------

describe('Performance: state machine conflict prevention', () => {
  it('should prevent starting a scenario that is already running', () => {
    const sm = new SimulationStateMachine();

    // idle → running
    const r1 = sm.tryTransition('start');
    expect(r1.allowed).toBe(true);
    expect(sm.currentState).toBe('running');

    // running → start should fail (not in transition table)
    const r2 = sm.tryTransition('start');
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toContain('not allowed');
    expect(sm.currentState).toBe('running');
  });

  it('should prevent seeking while running (must pause first)', () => {
    const sm = new SimulationStateMachine();
    sm.tryTransition('start'); // idle → running

    // seek while running should fail
    const r = sm.tryTransition('seek');
    expect(r.allowed).toBe(false);

    // pause first, then seek should work
    sm.tryTransition('pause');
    expect(sm.currentState).toBe('paused');

    const r2 = sm.tryTransition('seek');
    expect(r2.allowed).toBe(true);
    expect(sm.currentState).toBe('seeking');
  });

  it('should only allow seek_complete from seeking state', () => {
    const sm = new SimulationStateMachine();

    // From idle
    const r1 = sm.tryTransition('seek_complete');
    expect(r1.allowed).toBe(false);

    // Get to seeking state
    sm.tryTransition('start');
    sm.tryTransition('pause');
    sm.tryTransition('seek');
    expect(sm.currentState).toBe('seeking');

    const r2 = sm.tryTransition('seek_complete');
    expect(r2.allowed).toBe(true);
    expect(sm.currentState).toBe('paused');
  });
});

// ---------------------------------------------------------------------------
// 6. Package build performance
// ---------------------------------------------------------------------------

describe('Performance: pnpm build', () => {
  it('should complete build in < 120 seconds', { timeout: 180_000 }, async () => {
    const { execSync } = await import('child_process');
    const start = performance.now();

    execSync('pnpm build', {
      cwd: '/home/user/ELOC2',
      stdio: 'pipe',
      timeout: 150_000,
    });

    const elapsed = performance.now() - start;
    const elapsedSec = elapsed / 1000;
    console.log(`[perf] pnpm build completed in ${elapsedSec.toFixed(1)}s`);

    expect(elapsedSec).toBeLessThan(120);
  });
});

// ---------------------------------------------------------------------------
// 7. Deployment optimizer performance
// ---------------------------------------------------------------------------

describe('Performance: deployment optimizer', () => {
  it('should optimize 5 sensors on a moderate grid in < 10 seconds', { timeout: 30_000 }, () => {
    // Create a ~50x50 grid area (roughly 50km x 50km region in Israel)
    const baseLat = 31.5;
    const baseLon = 34.5;
    const spanDeg = 0.45; // ~50km

    const sensors: SensorSpec[] = Array.from({ length: 5 }, (_, i) => ({
      id: `sensor-${i}`,
      type: (i < 2 ? 'radar' : 'eo') as 'radar' | 'eo',
      maxRangeM: 15000,
      fovHalfAngleDeg: i < 2 ? 180 : 15,
      minAzDeg: 0,
      maxAzDeg: 360,
    }));

    const constraints: DeploymentConstraints = {
      scannedArea: [
        { lat: baseLat, lon: baseLon },
        { lat: baseLat + spanDeg, lon: baseLon },
        { lat: baseLat + spanDeg, lon: baseLon + spanDeg },
        { lat: baseLat, lon: baseLon + spanDeg },
      ],
      inclusionZones: [],
      exclusionZones: [],
      threatCorridors: [],
      minCoveragePercent: 80,
      gridResolutionM: 1000, // 1km cells → ~50x50 = 2500 cells
    };

    const start = performance.now();
    const result = optimize(sensors, constraints);
    const elapsed = performance.now() - start;
    const elapsedSec = elapsed / 1000;

    console.log(`[perf] Optimizer: ${result.placedSensors.length} sensors placed in ${elapsedSec.toFixed(2)}s`);
    console.log(`[perf] Coverage: ${result.metrics.coveragePercent.toFixed(1)}%`);
    console.log(`[perf] Geometry quality: ${result.metrics.geometryQuality.toFixed(3)}`);

    expect(result.placedSensors.length).toBe(5);
    expect(elapsedSec).toBeLessThan(10);
  });
});
