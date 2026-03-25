/**
 * Workstation Broadcast Rate Comparison Test
 *
 * Tests the impact of WS broadcast throttling at different rates
 * on workstation update frequency and system performance.
 *
 * At 15 Hz internal tick rate:
 *   - No throttle: 15 broadcasts/sec (900 per minute)
 *   - 4 Hz: 4 broadcasts/sec (240 per minute)
 *   - 2 Hz: 2 broadcasts/sec (120 per minute)
 */

import { describe, it, expect } from 'vitest';

// ─── Broadcast throttle simulator ────────────────────────────────────────────

interface ThrottleConfig {
  label: string;
  broadcastRateHz: number;  // 0 = no throttle
  internalRateHz: number;   // pipeline tick rate
}

interface ThrottleResult {
  config: ThrottleConfig;
  simDurationSec: number;
  totalTicks: number;
  totalBroadcasts: number;
  broadcastsPerSec: number;
  skippedTicks: number;
  skipRatio: number;
  /** Worst-case staleness: max time between consecutive broadcasts (ms) */
  maxGapMs: number;
  /** Average time between consecutive broadcasts (ms) */
  avgGapMs: number;
  /** Estimated WS payload per second (KB) — assumes ~2KB per broadcast */
  bandwidthKBps: number;
}

function simulateThrottle(config: ThrottleConfig): ThrottleResult {
  const SIM_DURATION = 60; // 1 minute of sim time
  const dtSec = 1 / config.internalRateHz;
  const minIntervalSec = config.broadcastRateHz > 0 ? 1 / config.broadcastRateHz : 0;

  let totalBroadcasts = 0;
  let skippedTicks = 0;
  let lastBroadcastSec = 0;
  const gaps: number[] = [];

  for (let t = dtSec; t <= SIM_DURATION; t += dtSec) {
    const simTime = Math.round(t * 10000) / 10000; // avoid float drift

    if (minIntervalSec > 0 && simTime - lastBroadcastSec < minIntervalSec) {
      skippedTicks++;
      continue;
    }

    // This tick would broadcast
    if (totalBroadcasts > 0) {
      gaps.push((simTime - lastBroadcastSec) * 1000); // ms
    }
    lastBroadcastSec = simTime;
    totalBroadcasts++;
  }

  const totalTicks = Math.round(SIM_DURATION * config.internalRateHz);
  const maxGapMs = gaps.length > 0 ? Math.max(...gaps) : 0;
  const avgGapMs = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const PAYLOAD_KB = 2; // estimated avg RAP payload size

  return {
    config,
    simDurationSec: SIM_DURATION,
    totalTicks,
    totalBroadcasts,
    broadcastsPerSec: totalBroadcasts / SIM_DURATION,
    skippedTicks,
    skipRatio: skippedTicks / totalTicks,
    maxGapMs,
    avgGapMs,
    bandwidthKBps: (totalBroadcasts / SIM_DURATION) * PAYLOAD_KB,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('WS Broadcast Rate Comparison', () => {
  const configs: ThrottleConfig[] = [
    { label: 'No throttle (15 Hz)', broadcastRateHz: 0, internalRateHz: 15 },
    { label: '8 Hz throttle', broadcastRateHz: 8, internalRateHz: 15 },
    { label: '4 Hz throttle', broadcastRateHz: 4, internalRateHz: 15 },
    { label: '2 Hz throttle', broadcastRateHz: 2, internalRateHz: 15 },
    { label: '1 Hz throttle', broadcastRateHz: 1, internalRateHz: 15 },
  ];

  it('should compare WS broadcast rates', () => {
    const results = configs.map(simulateThrottle);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('    WS BROADCAST RATE COMPARISON (15 Hz internal)');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('  Config           │ Bcasts │ Bcasts/s │ Skipped │ Skip% │ MaxGap │ AvgGap │ BW KB/s');
    console.log('  ─────────────────┼────────┼──────────┼─────────┼───────┼────────┼────────┼────────');
    for (const r of results) {
      console.log(
        `  ${r.config.label.padEnd(17)}│ ` +
        `${String(r.totalBroadcasts).padStart(6)} │ ` +
        `${r.broadcastsPerSec.toFixed(1).padStart(8)} │ ` +
        `${String(r.skippedTicks).padStart(7)} │ ` +
        `${(r.skipRatio * 100).toFixed(0).padStart(4)}% │ ` +
        `${r.maxGapMs.toFixed(0).padStart(5)}ms│ ` +
        `${r.avgGapMs.toFixed(0).padStart(5)}ms│ ` +
        `${r.bandwidthKBps.toFixed(1).padStart(6)}`
      );
    }

    console.log('\n── ANALYSIS ──');

    const noThrottle = results[0];
    const hz4 = results.find(r => r.config.broadcastRateHz === 4)!;
    const hz2 = results.find(r => r.config.broadcastRateHz === 2)!;

    console.log(`\n  No throttle: ${noThrottle.totalBroadcasts} broadcasts in 60s = ${noThrottle.bandwidthKBps.toFixed(1)} KB/s`);
    console.log(`  4 Hz:        ${hz4.totalBroadcasts} broadcasts (${(hz4.skipRatio * 100).toFixed(0)}% saved), max gap ${hz4.maxGapMs.toFixed(0)}ms`);
    console.log(`  2 Hz:        ${hz2.totalBroadcasts} broadcasts (${(hz2.skipRatio * 100).toFixed(0)}% saved), max gap ${hz2.maxGapMs.toFixed(0)}ms`);

    // Human perception threshold: 250ms update is smooth, 500ms is noticeable
    console.log('\n── RECOMMENDATION ──');
    if (hz4.maxGapMs <= 300) {
      console.log('  4 Hz: MAX GAP ≤300ms — smooth for operator display');
      console.log(`  4 Hz saves ${(hz4.skipRatio * 100).toFixed(0)}% of WS traffic vs no throttle`);
    }
    if (hz2.maxGapMs <= 600) {
      console.log('  2 Hz: MAX GAP ≤600ms — acceptable for overview display');
      console.log(`  2 Hz saves ${(hz2.skipRatio * 100).toFixed(0)}% of WS traffic vs no throttle`);
    }

    // Best pick
    const best = hz4.maxGapMs <= 300 ? '4 Hz' : hz2.maxGapMs <= 600 ? '2 Hz' : '8 Hz';
    console.log(`\n  RECOMMENDED WS RATE: ${best}`);

    // Assertions
    expect(hz4.broadcastsPerSec).toBeGreaterThanOrEqual(3);
    expect(hz4.broadcastsPerSec).toBeLessThanOrEqual(5);
    expect(hz2.broadcastsPerSec).toBeGreaterThanOrEqual(1.5);
    expect(hz2.broadcastsPerSec).toBeLessThanOrEqual(3);
    expect(hz4.maxGapMs).toBeLessThan(500); // 4Hz should have <500ms gaps
    expect(hz2.maxGapMs).toBeLessThan(1000); // 2Hz should have <1000ms gaps
  });
});
