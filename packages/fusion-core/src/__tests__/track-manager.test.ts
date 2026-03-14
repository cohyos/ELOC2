import { describe, it, expect, beforeEach } from 'vitest';
import type {
  SourceObservation,
  SystemTrackId,
  SensorId,
  Timestamp,
  Covariance3x3,
  RegistrationState,
} from '@eloc2/domain';
import { TrackManager } from '../track-management/track-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let obsCounter = 0;

function makeObservation(
  sensorId: string,
  lat: number,
  lon: number,
  alt = 1000,
  covDiag = 100,
): SourceObservation {
  obsCounter++;
  return {
    observationId: `obs-${obsCounter}`,
    sensorId: sensorId as SensorId,
    timestamp: Date.now() as Timestamp,
    position: { lat, lon, alt },
    velocity: undefined,
    covariance: [
      [covDiag, 0, 0],
      [0, covDiag, 0],
      [0, 0, covDiag],
    ] as Covariance3x3,
    sensorFrame: 'radar',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrackManager', () => {
  let manager: TrackManager;

  beforeEach(() => {
    manager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 5 });
    obsCounter = 0;
  });

  describe('createTrack', () => {
    it('should create a tentative track from a new observation', () => {
      const obs = makeObservation('radar-1', 32.0, 34.0);
      const result = manager.processObservation(obs);

      expect(result.track.status).toBe('tentative');
      expect(result.track.state.lat).toBeCloseTo(32.0, 1);
      expect(result.track.state.lon).toBeCloseTo(34.0, 1);
      expect(result.track.sources).toContain('radar-1');
      expect(result.correlationEvent.data.decision).toBe('new_track');
    });
  });

  describe('confirmTrack', () => {
    it('should confirm a track after 3 consistent updates', () => {
      // First observation creates a tentative track
      const obs1 = makeObservation('radar-1', 32.0, 34.0);
      const result1 = manager.processObservation(obs1);
      expect(result1.track.status).toBe('tentative');

      const trackId = result1.track.systemTrackId;

      // Second observation at nearly the same position (will correlate)
      const obs2 = makeObservation('radar-1', 32.0001, 34.0001);
      const result2 = manager.processObservation(obs2);
      expect(result2.track.systemTrackId).toBe(trackId);
      expect(result2.track.status).toBe('tentative');

      // Third observation — should trigger confirmation (3 total updates)
      const obs3 = makeObservation('radar-1', 32.0002, 34.0002);
      const result3 = manager.processObservation(obs3);
      expect(result3.track.systemTrackId).toBe(trackId);
      expect(result3.track.status).toBe('confirmed');
    });
  });

  describe('dropTrack via missed updates', () => {
    it('should drop a track after 5 consecutive missed updates', () => {
      const obs = makeObservation('radar-1', 32.0, 34.0);
      const result = manager.processObservation(obs);
      const trackId = result.track.systemTrackId;

      // Simulate 5 missed updates
      for (let i = 0; i < 4; i++) {
        const t = manager.missedUpdate(trackId);
        expect(t.status).not.toBe('dropped');
      }

      const dropped = manager.missedUpdate(trackId);
      expect(dropped.status).toBe('dropped');
    });
  });

  describe('mergeTracks', () => {
    it('should merge two tracks into a new track with lineage from both', () => {
      const obs1 = makeObservation('radar-1', 32.0, 34.0);
      const result1 = manager.processObservation(obs1);

      // Create a second track far enough away to not correlate
      const obs2 = makeObservation('radar-2', 33.0, 35.0);
      const result2 = manager.processObservation(obs2);

      const id1 = result1.track.systemTrackId;
      const id2 = result2.track.systemTrackId;

      expect(manager.getAllTracks().length).toBe(2);

      const merged = manager.mergeTracks(id1, id2);

      // The merged track should have a new ID
      expect(merged.systemTrackId).not.toBe(id1);
      expect(merged.systemTrackId).not.toBe(id2);

      // The merged track lineage should reference both parent tracks
      const mergeEntry = merged.lineage.find((e) => e.event === 'track.merged');
      expect(mergeEntry).toBeDefined();
      expect(mergeEntry!.parentTrackIds).toContain(id1);
      expect(mergeEntry!.parentTrackIds).toContain(id2);

      // Old tracks should be dropped
      expect(manager.getTrack(id1)?.status).toBe('dropped');
      expect(manager.getTrack(id2)?.status).toBe('dropped');

      // Merged track should have sources from both
      expect(merged.sources).toContain('radar-1');
      expect(merged.sources).toContain('radar-2');
    });
  });

  describe('processObservation integration', () => {
    it('should converge 2 radars tracking the same target to 1 system track', () => {
      // Radar 1 observes target
      const obs1 = makeObservation('radar-1', 32.0, 34.0, 1000, 100);
      const result1 = manager.processObservation(obs1);
      expect(result1.correlationEvent.data.decision).toBe('new_track');

      const trackId = result1.track.systemTrackId;
      // Capture initial confidence before the second processObservation
      // mutates the same track object via the internal Map reference.
      const initialConfidence = result1.track.confidence;

      // Radar 2 observes the same target at nearly the same position
      const obs2 = makeObservation('radar-2', 32.0001, 34.0001, 1000, 100);
      const result2 = manager.processObservation(obs2);

      // Should correlate with existing track, not create a new one
      expect(result2.correlationEvent.data.decision).toBe('associated');
      expect(result2.track.systemTrackId).toBe(trackId);

      // Track should now have both sensors as sources
      expect(result2.track.sources).toContain('radar-1');
      expect(result2.track.sources).toContain('radar-2');

      // Confidence should have increased from the initial value
      expect(result2.track.confidence).toBeGreaterThan(initialConfidence);

      // System track updated event should be emitted
      expect(result2.event.eventType).toBe('system.track.updated');
      expect(result2.event.data.systemTrackId).toBe(trackId);
    });

    it('should emit correct events', () => {
      const obs = makeObservation('radar-1', 32.0, 34.0);
      const result = manager.processObservation(obs);

      // Correlation event
      expect(result.correlationEvent.eventType).toBe('correlation.decided');
      expect(result.correlationEvent.data.observationId).toBe(obs.observationId);

      // System track updated event
      expect(result.event.eventType).toBe('system.track.updated');
      expect(result.event.sourceReferences).toContain(obs.observationId);
    });
  });

  describe('getTrack / getAllTracks', () => {
    it('should return undefined for unknown track ID', () => {
      expect(manager.getTrack('nonexistent' as SystemTrackId)).toBeUndefined();
    });

    it('should return all tracks including dropped', () => {
      const obs1 = makeObservation('radar-1', 32.0, 34.0);
      const r1 = manager.processObservation(obs1);
      manager.dropTrack(r1.track.systemTrackId);

      const obs2 = makeObservation('radar-1', 33.0, 35.0);
      manager.processObservation(obs2);

      const all = manager.getAllTracks();
      expect(all.length).toBe(2);
      expect(all.filter((t) => t.status === 'dropped').length).toBe(1);
    });
  });

  describe('registration-aware fusion', () => {
    it('should grow track confidence slower when registration is unsafe', () => {
      // Create a track with the first observation
      const obs1 = makeObservation('radar-1', 32.0, 34.0, 1000, 100);
      const result1 = manager.processObservation(obs1);
      const trackId = result1.track.systemTrackId;
      const confidenceAfterCreate = result1.track.confidence;

      // Second observation at nearly the same position with unsafe registration
      const unsafeHealth: RegistrationState = {
        sensorId: 'radar-1' as SensorId,
        spatialBias: { azimuthBiasDeg: 5.0, elevationBiasDeg: 0.1, rangeBiasM: 10 },
        clockBias: { offsetMs: 0, driftRateMs: 0 },
        spatialQuality: 'unsafe',
        timingQuality: 'good',
        biasEstimateAge: 0,
        fusionSafe: false,
        lastUpdated: Date.now() as Timestamp,
      };

      const obs2 = makeObservation('radar-1', 32.0001, 34.0001, 1000, 100);
      const result2 = manager.processObservation(obs2, unsafeHealth);

      // In confirmation-only mode the confidence boost is much smaller (0.01)
      // compared to full fusion (which would be larger due to covariance reduction)
      const confidenceGainUnsafe = result2.track.confidence - confidenceAfterCreate;

      // Create a separate manager for the safe case to compare
      const safeManager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 5 });
      const obs3 = makeObservation('radar-1', 32.0, 34.0, 1000, 100);
      const safeResult1 = safeManager.processObservation(obs3);
      const safeConfidenceAfterCreate = safeResult1.track.confidence;

      const obs4 = makeObservation('radar-1', 32.0001, 34.0001, 1000, 100);
      const safeResult2 = safeManager.processObservation(obs4);
      const confidenceGainSafe = safeResult2.track.confidence - safeConfidenceAfterCreate;

      // Unsafe registration should produce a smaller confidence gain
      expect(confidenceGainUnsafe).toBeLessThan(confidenceGainSafe);
      expect(confidenceGainUnsafe).toBeGreaterThan(0);

      // In confirmation-only mode the track state should remain unchanged
      expect(result2.track.state.lat).toBeCloseTo(32.0, 2);
      expect(result2.track.state.lon).toBeCloseTo(34.0, 2);
    });

    it('should use normal fusion when registration is safe', () => {
      // Create a track
      const obs1 = makeObservation('radar-1', 32.0, 34.0, 1000, 100);
      const result1 = manager.processObservation(obs1);
      const trackId = result1.track.systemTrackId;
      // Capture initial confidence before the second processObservation
      // mutates the same track object via the internal Map reference.
      const initialConfidence = result1.track.confidence;

      // Second observation with safe registration
      const safeHealth: RegistrationState = {
        sensorId: 'radar-1' as SensorId,
        spatialBias: { azimuthBiasDeg: 0.1, elevationBiasDeg: 0.1, rangeBiasM: 10 },
        clockBias: { offsetMs: 5, driftRateMs: 0 },
        spatialQuality: 'good',
        timingQuality: 'good',
        biasEstimateAge: 0,
        fusionSafe: true,
        lastUpdated: Date.now() as Timestamp,
      };

      const obs2 = makeObservation('radar-2', 32.0001, 34.0001, 1000, 100);
      const result2 = manager.processObservation(obs2, safeHealth);

      // Should have performed full fusion (track state should move towards observation)
      expect(result2.track.systemTrackId).toBe(trackId);
      expect(result2.correlationEvent.data.decision).toBe('associated');

      // The fusion method should be information_matrix for safe registration
      expect(result2.event.data.fusionMethod).toBe('information_matrix');

      // Confidence should have increased from initial creation value
      expect(result2.track.confidence).toBeGreaterThan(initialConfidence);
    });
  });
});
