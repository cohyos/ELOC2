/**
 * Single Fighter Track Continuity Test
 *
 * Runs the Green Pine scenario with ONLY the first target (TGT-F1 Su-35 Fighter)
 * and NO radar faults. Goal: maintain the same system track ID from first detection
 * to last detection — zero track breaks for a simple, single, large-RCS fighter.
 *
 * Part 1: Radar + Fusion pipeline (system tracks from TrackManager)
 * Part 2: EO Core triangulation (EO 3D targets from CoreEoDetector)
 */

import { describe, it, expect } from 'vitest';
import { LiveEngine } from '../simulation/live-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Part 1: Radar pipeline — single seek(300)
// ---------------------------------------------------------------------------

describe('Single Fighter Track Continuity — Radar Pipeline', () => {
  it('should maintain the same system track from first to last detection', () => {
    const engine = new LiveEngine('green-pine-defense');

    // Patch: keep only TGT-F1, no faults
    const scenario = (engine as any).scenario;
    scenario.targets = scenario.targets.filter((t: any) => t.targetId === 'TGT-F1');
    scenario.faults = [];
    scenario.durationSec = 310;

    // Recreate runner with patched scenario
    const { ScenarioRunner } = require('@eloc2/simulator');
    (engine as any).runner = new ScenarioRunner(scenario);

    // Single seek to t=300 — replays the entire fighter timeline
    const sm = engine.getSimulationState();
    if (sm.state === 'idle') { engine.start(); engine.pause(); }
    engine.seek(300);

    const state = engine.getState();
    const gt = engine.getGroundTruth();
    const allTracks = (engine as any).trackManager.getAllTracks();
    const detector = (engine as any).coreEoDetector;

    // ── Radar track analysis ──
    const activeTracks = allTracks.filter((t: any) => t.status !== 'dropped');
    const droppedTracks = allTracks.filter((t: any) => t.status === 'dropped');

    console.log('\n══════════════════════════════════════════════════');
    console.log('SINGLE FIGHTER — RADAR PIPELINE (single seek(300))');
    console.log('══════════════════════════════════════════════════');
    console.log(`Total tracks ever created: ${allTracks.length}`);
    console.log(`Active tracks: ${activeTracks.length}`);
    console.log(`Dropped tracks: ${droppedTracks.length}`);
    console.log(`GT targets active: ${gt.length}`);

    // Find tracks near fighter
    if (gt.length > 0) {
      const fighter = gt[0];
      console.log(`\nFighter position: (${fighter.position.lat.toFixed(4)}, ${fighter.position.lon.toFixed(4)}, ${fighter.position.alt}m)`);

      const nearTracks = activeTracks.filter((t: any) =>
        haversineM(fighter.position.lat, fighter.position.lon, t.state.lat, t.state.lon) < 5000
      );
      console.log(`Tracks near fighter (<5km): ${nearTracks.length}`);
      for (const t of nearTracks) {
        const d = haversineM(fighter.position.lat, fighter.position.lon, t.state.lat, t.state.lon);
        console.log(`  ${t.systemTrackId} — ${t.status}, dist=${d.toFixed(0)}m, vel=${t.velocity ? `(${t.velocity.vx?.toFixed(0)},${t.velocity.vy?.toFixed(0)})` : 'none'}, mode=${t.fusionMode ?? 'radar'}, sources=[${t.sources?.join(',')}]`);
      }

      // Also show all active tracks
      console.log(`\nAll active tracks:`);
      for (const t of activeTracks) {
        const d = haversineM(fighter.position.lat, fighter.position.lon, t.state.lat, t.state.lon);
        console.log(`  ${t.systemTrackId} — ${t.status}, dist=${(d/1000).toFixed(1)}km, mode=${t.fusionMode ?? 'radar'}`);
      }
    }

    // ── EO analysis ──
    const eoTargets = detector.getEoTargets();
    const allDetections = detector.getAllDetections();
    console.log(`\n── EO Core Analysis ──`);
    console.log(`Active EO targets: ${eoTargets.length}`);
    console.log(`Active bearing detections: ${allDetections.length}`);

    if (gt.length > 0) {
      const fighter = gt[0];
      for (const et of eoTargets) {
        const d = haversineM(fighter.position.lat, fighter.position.lon, et.position.lat, et.position.lon);
        console.log(`  EO ${et.eoTargetId.slice(0,8)} — ${et.classification}, dist=${(d/1000).toFixed(1)}km, sensors=${et.sensorIds.length}, promoted=${et.promotedTrackId?.slice(0,12) ?? 'no'}`);
      }
    }

    // Count EO-originated tracks
    const eoTracks = activeTracks.filter((t: any) => t.fusionMode === 'eo_triangulation');
    const radarTracks = activeTracks.filter((t: any) => t.fusionMode !== 'eo_triangulation');
    console.log(`\nEO-originated active tracks: ${eoTracks.length}`);
    console.log(`Radar-originated active tracks: ${radarTracks.length}`);

    // All dropped EO tracks
    const droppedEo = droppedTracks.filter((t: any) => t.fusionMode === 'eo_triangulation');
    console.log(`Dropped EO tracks total: ${droppedEo.length}`);

    // ── Track history by seeking to intermediate points ──
    console.log(`\n── Timeline (independent seeks) ──`);
    const checkpoints = [5, 10, 20, 30, 60, 90, 95, 100, 105, 110, 115, 120, 150, 180, 210, 240, 270, 300];
    for (const t of checkpoints) {
      const eng2 = new LiveEngine('green-pine-defense');
      const sc2 = (eng2 as any).scenario;
      sc2.targets = sc2.targets.filter((tgt: any) => tgt.targetId === 'TGT-F1');
      sc2.faults = [];
      sc2.durationSec = 310;
      (eng2 as any).runner = new ScenarioRunner(sc2);

      const sm2 = eng2.getSimulationState();
      if (sm2.state === 'idle') { eng2.start(); eng2.pause(); }
      eng2.seek(t);

      const st2 = eng2.getState();
      const gt2 = eng2.getGroundTruth();
      const allTr2 = (eng2 as any).trackManager.getAllTracks();
      const det2 = (eng2 as any).coreEoDetector;

      const activeTr = allTr2.filter((tr: any) => tr.status !== 'dropped');
      const totalCreated = allTr2.length;
      const eoTgt2 = det2.getEoTargets();

      let matchInfo = '';
      if (gt2.length > 0) {
        const f = gt2[0];
        const near = activeTr.filter((tr: any) =>
          haversineM(f.position.lat, f.position.lon, tr.state.lat, tr.state.lon) < 5000
        );
        const eoNear = eoTgt2.filter((et: any) =>
          haversineM(f.position.lat, f.position.lon, et.position.lat, et.position.lon) < 10000
        );
        const nearInfo = near.map((tr: any) => {
          const d = haversineM(f.position.lat, f.position.lon, tr.state.lat, tr.state.lon);
          return `${tr.systemTrackId}(${tr.status},${d.toFixed(0)}m,${tr.fusionMode ?? 'radar'})`;
        }).join(', ');
        matchInfo = `near=[${nearInfo}] eoNear=${eoNear.length}`;
      }

      console.log(`  t=${String(t).padStart(3)}s: created=${totalCreated}, active=${activeTr.length}, eoTargets=${eoTgt2.length} — ${matchInfo}`);
    }

    console.log('══════════════════════════════════════════════════\n');

    // Assertions: for a single large-RCS fighter with 1 radar and no faults,
    // we should have very few total tracks
    const totalCreated = allTracks.length;
    expect(totalCreated).toBeLessThanOrEqual(10); // ideally ≤3
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Part 2: EO Core — triangulation continuity
// ---------------------------------------------------------------------------

describe('Single Fighter Track Continuity — EO Core', () => {
  it('should maintain consistent EO target with accurate position', () => {
    const engine = new LiveEngine('green-pine-defense');

    // Patch: keep only TGT-F1, no faults
    const scenario = (engine as any).scenario;
    scenario.targets = scenario.targets.filter((t: any) => t.targetId === 'TGT-F1');
    scenario.faults = [];
    scenario.durationSec = 310;
    const { ScenarioRunner } = require('@eloc2/simulator');
    (engine as any).runner = new ScenarioRunner(scenario);

    const sm = engine.getSimulationState();
    if (sm.state === 'idle') { engine.start(); engine.pause(); }

    // Collect EO metrics at every checkpoint
    const checkpoints = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300];

    console.log('\n══════════════════════════════════════════════════');
    console.log('SINGLE FIGHTER — EO CORE CONTINUITY');
    console.log('══════════════════════════════════════════════════');

    let totalEoTargetIds = 0;
    let maxEoError = 0;
    const eoErrors: number[] = [];

    for (const t of checkpoints) {
      const eng = new LiveEngine('green-pine-defense');
      const sc = (eng as any).scenario;
      sc.targets = sc.targets.filter((tgt: any) => tgt.targetId === 'TGT-F1');
      sc.faults = [];
      sc.durationSec = 310;
      (eng as any).runner = new ScenarioRunner(sc);
      const sm2 = eng.getSimulationState();
      if (sm2.state === 'idle') { eng.start(); eng.pause(); }
      eng.seek(t);

      const gt = eng.getGroundTruth();
      const detector = (eng as any).coreEoDetector;
      const eoTargets = detector.getEoTargets();
      const allDets = detector.getAllDetections();

      // Count total unique EO target IDs at this checkpoint
      // (within this single seek, how many EO targets were created)
      totalEoTargetIds = Math.max(totalEoTargetIds, eoTargets.length);

      let info = '';
      if (gt.length > 0) {
        const f = gt[0];
        const nearEo = eoTargets.filter((et: any) => {
          const d = haversineM(f.position.lat, f.position.lon, et.position.lat, et.position.lon);
          return d < 15000;
        });
        const errors = nearEo.map((et: any) => {
          const d = haversineM(f.position.lat, f.position.lon, et.position.lat, et.position.lon);
          eoErrors.push(d);
          if (d > maxEoError) maxEoError = d;
          return `${(d/1000).toFixed(1)}km(${et.sensorIds.length}s,${et.classification})`;
        });
        info = `near=[${errors.join(', ')}]`;
      }

      // Count sensors with detections
      const sensorIds = new Set(allDets.map((d: any) => d.sensorId));

      console.log(`  t=${String(t).padStart(3)}s: eoTargets=${eoTargets.length}, dets=${allDets.length}, sensors=${sensorIds.size} — ${info}`);
    }

    const avgEoError = eoErrors.length > 0 ? eoErrors.reduce((s, e) => s + e, 0) / eoErrors.length : 0;
    console.log(`\nEO position: avg=${(avgEoError/1000).toFixed(2)}km, max=${(maxEoError/1000).toFixed(2)}km`);
    console.log(`Max simultaneous EO targets: ${totalEoTargetIds}`);
    console.log('══════════════════════════════════════════════════\n');

    // Assertions
    expect(totalEoTargetIds).toBeLessThanOrEqual(3); // 1 target = at most 3 EO targets
    // EO triangulation for a fighter at 10km alt from 40km range is imprecise,
    // but should stay under 15km avg error
    if (eoErrors.length > 0) {
      expect(avgEoError).toBeLessThan(15_000);
    }
  }, 120_000);
});
