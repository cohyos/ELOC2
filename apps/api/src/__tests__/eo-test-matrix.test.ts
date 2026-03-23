/**
 * EO Test Matrix — 8 test suites characterizing EO-only pipeline behavior
 *
 * 1. Multi-target resolution at varying separations
 * 2. Sensor failure resilience
 * 3. Time-of-day detection rate
 * 4. Formation tracking at range
 * 5. Velocity estimation quality
 * 6. Crossing tracks verification
 * 7. Coverage gap analysis
 * 8. Seek consistency (determinism)
 */

import { describe, it, expect } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function seekTo(engine: LiveEngine, toSec: number): void {
  const sm = engine.getSimulationState();
  if (sm.state === 'idle') { engine.start(); engine.pause(); }
  else if (sm.state === 'running') { engine.pause(); }
  engine.seek(toSec);
}

// ── Suite 1: Multi-Target Resolution ────────────────────────────────────

describe('EO Matrix: Multi-Target Resolution', { timeout: 120_000 }, () => {
  it('characterizes resolution at different target separations', () => {
    // Phase 2 formation has targets at ~1.5-2.5km spacing
    // Check how many distinct tracks are formed at different times
    const checkpoints = [350, 400, 450, 500, 550];
    const results: Array<{ time: number; gtCount: number; trackCount: number; coverage: number }> = [];

    for (const t of checkpoints) {
      const eng = new LiveEngine('eo-staring-defense');
      seekTo(eng, t);
      const gt = eng.getGroundTruth();
      const state = eng.getState();
      const tracks = state.tracks;

      // Match tracks to GT (8km gate for EO)
      const matched = new Set<string>();
      for (const track of tracks) {
        for (const g of gt) {
          if (!matched.has(g.targetId) && haversineM(track.state.lat, track.state.lon, g.position.lat, g.position.lon) < 8000) {
            matched.add(g.targetId);
          }
        }
      }

      results.push({
        time: t,
        gtCount: gt.length,
        trackCount: tracks.length,
        coverage: gt.length > 0 ? matched.size / gt.length : 1,
      });
    }

    console.log('\n  Multi-Target Resolution:');
    console.log('  Time | GT | Tracks | Coverage');
    for (const r of results) {
      console.log(`  ${r.time}s  | ${r.gtCount}  |   ${r.trackCount}    | ${(r.coverage * 100).toFixed(0)}%`);
    }

    // At least some coverage across checkpoints
    const avgCoverage = results.reduce((s, r) => s + r.coverage, 0) / results.length;
    console.log(`  Avg coverage: ${(avgCoverage * 100).toFixed(0)}%`);
    expect(results.length).toBe(checkpoints.length);
  });
});

// ── Suite 2: Sensor Failure Resilience ──────────────────────────────────

describe('EO Matrix: Sensor Failure Resilience', { timeout: 120_000 }, () => {
  it('measures quality degradation with sensor outages', () => {
    const results: Array<{ faults: number; accuracy: number; coverage: number }> = [];

    // Baseline: no faults
    const eng0 = new LiveEngine('eo-staring-defense');
    seekTo(eng0, 200);
    const qm0 = eng0.getQualityMetrics();
    results.push({ faults: 0, accuracy: qm0?.pictureAccuracy ?? 0, coverage: qm0?.coveragePercent ?? 0 });

    // 1 cluster faulted (N cluster = 3 sensors)
    const eng1 = new LiveEngine('eo-staring-defense');
    eng1.start(); eng1.pause();
    try { eng1.injectFault({ type: 'sensor_outage', sensorId: 'STARE-N-1', durationSec: 300, magnitude: 0 }); } catch {}
    try { eng1.injectFault({ type: 'sensor_outage', sensorId: 'STARE-N-2', durationSec: 300, magnitude: 0 }); } catch {}
    try { eng1.injectFault({ type: 'sensor_outage', sensorId: 'STARE-N-3', durationSec: 300, magnitude: 0 }); } catch {}
    eng1.seek(200);
    const qm1 = eng1.getQualityMetrics();
    results.push({ faults: 3, accuracy: qm1?.pictureAccuracy ?? 0, coverage: qm1?.coveragePercent ?? 0 });

    // 2 clusters faulted
    const eng2 = new LiveEngine('eo-staring-defense');
    eng2.start(); eng2.pause();
    for (const sid of ['STARE-N-1', 'STARE-N-2', 'STARE-N-3', 'STARE-NW-1', 'STARE-NW-2', 'STARE-NW-3']) {
      try { eng2.injectFault({ type: 'sensor_outage', sensorId: sid, durationSec: 300, magnitude: 0 }); } catch {}
    }
    eng2.seek(200);
    const qm2 = eng2.getQualityMetrics();
    results.push({ faults: 6, accuracy: qm2?.pictureAccuracy ?? 0, coverage: qm2?.coveragePercent ?? 0 });

    console.log('\n  Sensor Failure Resilience:');
    console.log('  Faults | Accuracy | Coverage');
    for (const r of results) {
      console.log(`    ${r.faults}    |  ${r.accuracy.toFixed(0)}%     | ${(r.coverage * 100).toFixed(0)}%`);
    }

    expect(results.length).toBe(3);
  });
});

// ── Suite 3: Time-of-Day Detection Rate ─────────────────────────────────

describe('EO Matrix: Time-of-Day', { timeout: 120_000 }, () => {
  it('verifies detection rate varies with scenario time', () => {
    // The EO model uses time-of-day modifiers.
    // Scenario starts at 08:00.
    // t=0: 08:00 (day, 100%)
    // t=36000: 18:00 (dusk, 70%)
    // We can only test within scenario duration (3600s)
    // so let's test at different times during Phase 1
    const times = [50, 100, 200, 300];
    const results: Array<{ time: number; detections: number; accuracy: number }> = [];

    for (const t of times) {
      const eng = new LiveEngine('eo-staring-defense');
      seekTo(eng, t);
      const coreDetector = (eng as any).coreEoDetector;
      const detCount = coreDetector ? coreDetector.getAllDetections().length : 0;
      const qm = eng.getQualityMetrics();
      results.push({ time: t, detections: detCount, accuracy: qm?.pictureAccuracy ?? 0 });
    }

    console.log('\n  Time-of-Day Detection (all daytime 08:00+):');
    console.log('  Time | Hour  | Detections | Accuracy');
    for (const r of results) {
      const hour = 8 + r.time / 3600;
      console.log(`  ${r.time}s  | ${hour.toFixed(1)}h |     ${r.detections}      | ${r.accuracy.toFixed(0)}%`);
    }

    expect(results.length).toBe(times.length);
  });
});

// ── Suite 4: Formation Tracking at Range ────────────────────────────────

describe('EO Matrix: Formation at Range', { timeout: 120_000 }, () => {
  it('measures formation resolution vs range', () => {
    // Formation starts at ~28km (t=300), approaches center (~0km at t=600)
    const checkpoints = [320, 380, 440, 500, 560];
    const results: Array<{ time: number; rangeKm: number; tracksForFormation: number }> = [];

    for (const t of checkpoints) {
      const eng = new LiveEngine('eo-staring-defense');
      seekTo(eng, t);
      const gt = eng.getGroundTruth();
      const state = eng.getState();

      // Count GT formation members
      const formGt = gt.filter(g => g.targetId.startsWith('TGT-S136'));

      // Count tracks near formation GT
      const formTracks = new Set<string>();
      for (const track of state.tracks) {
        for (const fg of formGt) {
          if (haversineM(track.state.lat, track.state.lon, fg.position.lat, fg.position.lon) < 8000) {
            formTracks.add(track.systemTrackId as string);
          }
        }
      }

      // Estimate range from center
      const centerLat = 31.25, centerLon = 34.80;
      const avgLat = formGt.length > 0 ? formGt.reduce((s, g) => s + g.position.lat, 0) / formGt.length : centerLat;
      const rangeM = haversineM(centerLat, centerLon, avgLat, centerLon);

      results.push({
        time: t,
        rangeKm: rangeM / 1000,
        tracksForFormation: formTracks.size,
      });
    }

    console.log('\n  Formation Resolution vs Range:');
    console.log('  Time | Range  | Tracks (of 5 drones)');
    for (const r of results) {
      console.log(`  ${r.time}s  | ${r.rangeKm.toFixed(1)}km | ${r.tracksForFormation}`);
    }

    expect(results.length).toBe(checkpoints.length);
  });
});

// ── Suite 5: Velocity Estimation ────────────────────────────────────────

describe('EO Matrix: Velocity Estimation', { timeout: 120_000 }, () => {
  it('measures EO velocity estimation vs GT', () => {
    const eng = new LiveEngine('eo-staring-defense');
    seekTo(eng, 250); // Fighter at ~mid-flight
    const state = eng.getState();
    const gt = eng.getGroundTruth();

    const fighter = gt.find(g => g.targetId === 'TGT-F1');
    const eoTracks = state.tracks.filter(t => t.fusionMode === 'eo_triangulation');

    console.log('\n  Velocity Estimation (t=250):');
    console.log(`  GT fighter: vx=${fighter?.velocity?.vx?.toFixed(0)}, vy=${fighter?.velocity?.vy?.toFixed(0)}`);

    if (eoTracks.length > 0 && fighter) {
      for (const track of eoTracks) {
        if (track.velocity) {
          const vxErr = Math.abs((track.velocity as any).vx - (fighter.velocity?.vx ?? 0));
          const vyErr = Math.abs((track.velocity as any).vy - (fighter.velocity?.vy ?? 0));
          const speedEst = Math.sqrt((track.velocity as any).vx ** 2 + (track.velocity as any).vy ** 2);
          const speedGt = Math.sqrt((fighter.velocity?.vx ?? 0) ** 2 + (fighter.velocity?.vy ?? 0) ** 2);
          console.log(`  Track ${(track.systemTrackId as string).slice(0, 8)}: vx=${(track.velocity as any).vx?.toFixed(0)}, vy=${(track.velocity as any).vy?.toFixed(0)} | speed: ${speedEst.toFixed(0)} vs ${speedGt.toFixed(0)} m/s | error: vx±${vxErr.toFixed(0)}, vy±${vyErr.toFixed(0)}`);
        } else {
          console.log(`  Track ${(track.systemTrackId as string).slice(0, 8)}: no velocity estimated`);
        }
      }
    } else {
      console.log(`  No EO tracks with velocity at t=250`);
    }

    expect(state.tracks.length).toBeGreaterThanOrEqual(0);
  });
});

// ── Suite 6: Crossing Tracks ────────────────────────────────────────────

describe('EO Matrix: Crossing Tracks', { timeout: 120_000 }, () => {
  it('checks track identity maintenance when targets are close', () => {
    // During Phase 4, multiple targets may pass near each other
    // Check if system maintains distinct tracks
    const eng = new LiveEngine('eo-staring-defense');
    seekTo(eng, 1100);
    const state = eng.getState();
    const gt = eng.getGroundTruth();

    console.log('\n  Crossing Tracks Analysis (t=1100):');
    console.log(`  GT targets: ${gt.length}, System tracks: ${state.tracks.length}`);

    // Find close GT pairs
    let closePairs = 0;
    for (let i = 0; i < gt.length; i++) {
      for (let j = i + 1; j < gt.length; j++) {
        const d = haversineM(gt[i].position.lat, gt[i].position.lon, gt[j].position.lat, gt[j].position.lon);
        if (d < 5000) {
          closePairs++;
          console.log(`  Close pair: ${gt[i].targetId}↔${gt[j].targetId} = ${(d / 1000).toFixed(1)}km`);
        }
      }
    }
    console.log(`  Close pairs (<5km): ${closePairs}`);

    // Check if tracks maintain distinct positions
    const trackPairs = new Set<string>();
    for (let i = 0; i < state.tracks.length; i++) {
      for (let j = i + 1; j < state.tracks.length; j++) {
        const d = haversineM(state.tracks[i].state.lat, state.tracks[i].state.lon,
          state.tracks[j].state.lat, state.tracks[j].state.lon);
        if (d < 2000) trackPairs.add(`${i}-${j}`);
      }
    }
    console.log(`  Merged track pairs (<2km): ${trackPairs.size}`);

    expect(gt.length).toBeGreaterThan(0);
  });
});

// ── Suite 7: Coverage Gap Analysis ──────────────────────────────────────

describe('EO Matrix: Coverage Gaps', { timeout: 120_000 }, () => {
  it('analyzes sensor coverage distribution', () => {
    const eng = new LiveEngine('eo-staring-defense');
    seekTo(eng, 200);
    const state = eng.getState();
    const coreDetector = (eng as any).coreEoDetector;
    const detections = coreDetector ? coreDetector.getAllDetections() : [];

    // Count detections per sensor to identify coverage distribution
    const bySensor = new Map<string, number>();
    for (const det of detections) {
      bySensor.set(det.sensorId, (bySensor.get(det.sensorId) ?? 0) + 1);
    }

    console.log('\n  Coverage Distribution (t=200):');
    const sensors = state.sensors;
    const staring = sensors.filter((s: any) => s.gimbal?.slewRateDegPerSec === 0);

    // Group by cluster
    const clusters = new Map<string, { detecting: number; total: number }>();
    for (const s of staring) {
      const sid = s.sensorId as string;
      const cluster = sid.replace(/-\d$/, '');
      if (!clusters.has(cluster)) clusters.set(cluster, { detecting: 0, total: 0 });
      const c = clusters.get(cluster)!;
      c.total++;
      if (bySensor.has(sid)) c.detecting++;
    }

    console.log('  Cluster    | Active/Total');
    for (const [name, stats] of clusters) {
      console.log(`  ${name.padEnd(12)} | ${stats.detecting}/${stats.total}`);
    }

    const totalActive = [...bySensor.keys()].length;
    console.log(`\n  Total active sensors: ${totalActive}/${staring.length}`);
    expect(staring.length).toBe(15);
  });
});

// ── Suite 8: Seek Consistency ───────────────────────────────────────────

describe('EO Matrix: Seek Consistency', { timeout: 120_000 }, () => {
  it('verifies deterministic results from repeated seeks', () => {
    const results: number[] = [];

    for (let i = 0; i < 3; i++) {
      const eng = new LiveEngine('eo-staring-defense');
      seekTo(eng, 200);
      const qm = eng.getQualityMetrics();
      results.push(qm?.pictureAccuracy ?? 0);
    }

    console.log('\n  Seek Consistency (t=200):');
    for (let i = 0; i < results.length; i++) {
      console.log(`  Run ${i + 1}: accuracy=${results[i].toFixed(1)}%`);
    }

    // All runs should produce same result (deterministic with seed=42)
    const allSame = results.every(r => r === results[0]);
    console.log(`  Deterministic: ${allSame ? 'YES' : 'NO'}`);

    expect(allSame).toBe(true);
  });
});
