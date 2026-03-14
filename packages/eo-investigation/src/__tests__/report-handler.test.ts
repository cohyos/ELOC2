import { describe, it, expect, beforeEach } from 'vitest';
import type {
  CueId,
  SensorId,
  SourceObservation,
  SystemTrackId,
  Timestamp,
  Covariance3x3,
} from '@eloc2/domain';
import { TrackManager } from '@eloc2/fusion-core';
import { createEoReport, handleEoReport } from '../eo-reporting/report-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let obsCounter = 0;

function makeObservation(
  sensorId: string,
  lat: number,
  lon: number,
): SourceObservation {
  obsCounter++;
  return {
    observationId: `obs-${obsCounter}`,
    sensorId: sensorId as SensorId,
    timestamp: Date.now() as Timestamp,
    position: { lat, lon, alt: 1000 },
    velocity: undefined,
    covariance: [
      [100, 0, 0],
      [0, 100, 0],
      [0, 0, 100],
    ] as Covariance3x3,
    sensorFrame: 'radar',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('report-handler', () => {
  let manager: TrackManager;
  let trackId: string;

  beforeEach(() => {
    manager = new TrackManager({ confirmAfter: 3, dropAfterMisses: 5 });
    obsCounter = 0;

    // Create a track so we can adjust its confidence
    const obs = makeObservation('radar-1', 32.0, 34.0);
    const result = manager.processObservation(obs);
    trackId = result.track.systemTrackId;
  });

  describe('createEoReport', () => {
    it('should create a proper event envelope', () => {
      const report = createEoReport({
        cueId: 'cue-1' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'confirmed',
        timestamp: Date.now() as Timestamp,
      });

      expect(report.eventType).toBe('eo.report.received');
      expect(report.eventId).toBeDefined();
      expect(report.data.cueId).toBe('cue-1');
      expect(report.data.sensorId).toBe('eo-1');
      expect(report.data.outcome).toBe('confirmed');
      expect(report.sourceReferences).toContain('cue-1');
    });

    it('should include optional fields when provided', () => {
      const report = createEoReport({
        cueId: 'cue-2' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'refined',
        bearing: {
          azimuthDeg: 45,
          elevationDeg: 10,
          timestamp: Date.now() as Timestamp,
          sensorId: 'eo-1' as SensorId,
        },
        imageQuality: 0.85,
        targetCountEstimate: 1,
        identificationSupport: {
          type: 'aircraft',
          confidence: 0.9,
          features: ['wings', 'tail'],
        },
        timestamp: Date.now() as Timestamp,
      });

      expect(report.data.bearing).toBeDefined();
      expect(report.data.bearing!.azimuthDeg).toBe(45);
      expect(report.data.imageQuality).toBe(0.85);
      expect(report.data.targetCountEstimate).toBe(1);
      expect(report.data.identificationSupport!.type).toBe('aircraft');
    });
  });

  describe('handleEoReport', () => {
    it('should boost track confidence on confirmed outcome', () => {
      const initialConfidence = manager.getTrack(trackId as SystemTrackId)!.confidence;

      const report = createEoReport({
        cueId: 'cue-1' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'confirmed',
        timestamp: Date.now() as Timestamp,
      });

      handleEoReport(report, manager, trackId);

      const track = manager.getTrack(trackId as SystemTrackId)!;
      expect(track.confidence).toBeCloseTo(initialConfidence + 0.15, 5);
      expect(track.eoInvestigationStatus).toBe('confirmed');
    });

    it('should reduce track confidence on no_support outcome', () => {
      const initialConfidence = manager.getTrack(trackId as SystemTrackId)!.confidence;

      const report = createEoReport({
        cueId: 'cue-1' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'no_support',
        timestamp: Date.now() as Timestamp,
      });

      handleEoReport(report, manager, trackId);

      const track = manager.getTrack(trackId as SystemTrackId)!;
      expect(track.confidence).toBeCloseTo(initialConfidence - 0.1, 5);
      expect(track.eoInvestigationStatus).toBe('no_support');
    });

    it('should set split_detected status on split_detected outcome', () => {
      const report = createEoReport({
        cueId: 'cue-1' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'split_detected',
        timestamp: Date.now() as Timestamp,
      });

      handleEoReport(report, manager, trackId);

      const track = manager.getTrack(trackId as SystemTrackId)!;
      expect(track.eoInvestigationStatus).toBe('split_detected');
    });

    it('should boost confidence on refined outcome', () => {
      const initialConfidence = manager.getTrack(trackId as SystemTrackId)!.confidence;

      const report = createEoReport({
        cueId: 'cue-1' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'refined',
        timestamp: Date.now() as Timestamp,
      });

      handleEoReport(report, manager, trackId);

      const track = manager.getTrack(trackId as SystemTrackId)!;
      expect(track.confidence).toBeCloseTo(initialConfidence + 0.1, 5);
      expect(track.eoInvestigationStatus).toBe('confirmed');
    });

    it('should clamp confidence to [0, 1]', () => {
      // Set a very low confidence track
      manager.adjustConfidence(trackId, -1); // should clamp to 0
      const track = manager.getTrack(trackId as SystemTrackId)!;
      expect(track.confidence).toBe(0);

      // Reduce further should stay at 0
      const report = createEoReport({
        cueId: 'cue-1' as CueId,
        sensorId: 'eo-1' as SensorId,
        outcome: 'no_support',
        timestamp: Date.now() as Timestamp,
      });

      handleEoReport(report, manager, trackId);
      expect(manager.getTrack(trackId as SystemTrackId)!.confidence).toBe(0);
    });
  });
});
