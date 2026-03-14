import type { EventEnvelope, RegistrationStateUpdated, SystemTrackUpdated } from '@eloc2/events';
import type { Timestamp } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Registration safety assertion
// ---------------------------------------------------------------------------

export interface RegistrationSafetyResult {
  passed: boolean;
  biasDetected: boolean;
  fusionDegraded: boolean;
  confidenceDropped: boolean;
  details: string[];
}

/**
 * Validates that fusion degrades when bias is injected.
 *
 * After bias injection time, RegistrationStateUpdated events should show
 * quality degradation. SystemTrackUpdated events should show lower confidence.
 */
export function assertRegistrationSafety(
  events: EventEnvelope[],
  biasInjectionTime: number,
): RegistrationSafetyResult {
  const details: string[] = [];
  const biasTimestamp = biasInjectionTime as Timestamp;

  // Find registration state events after bias injection
  const regEvents = events.filter(
    (e): e is RegistrationStateUpdated =>
      e.eventType === 'registration.state.updated' &&
      e.timestamp >= biasTimestamp,
  );

  // Find system track events after bias injection
  const trackEventsAfter = events.filter(
    (e): e is SystemTrackUpdated =>
      e.eventType === 'system.track.updated' &&
      e.timestamp >= biasTimestamp,
  );

  // Check if bias was detected: registration quality should degrade
  let biasDetected = false;
  for (const evt of regEvents) {
    const state = evt.data.newState;
    if (
      state.spatialQuality === 'degraded' ||
      state.spatialQuality === 'unsafe' ||
      state.timingQuality === 'degraded' ||
      state.timingQuality === 'unsafe'
    ) {
      biasDetected = true;
      details.push(
        `Bias detected on sensor ${evt.data.sensorId}: spatial=${state.spatialQuality}, timing=${state.timingQuality}`,
      );
      break;
    }
  }

  // Check if fusion degraded: fusionSafe should become false
  let fusionDegraded = false;
  for (const evt of regEvents) {
    if (!evt.data.newState.fusionSafe) {
      fusionDegraded = true;
      details.push(
        `Fusion degraded for sensor ${evt.data.sensorId}: fusionSafe=false`,
      );
      break;
    }
  }

  // Check if confidence dropped on system tracks
  let confidenceDropped = false;
  for (const evt of trackEventsAfter) {
    if (evt.data.confidenceChange < 0) {
      confidenceDropped = true;
      details.push(
        `Confidence dropped on track ${evt.data.systemTrackId}: change=${evt.data.confidenceChange}`,
      );
      break;
    }
  }

  if (!biasDetected) {
    details.push('No bias detection found in registration events after injection time');
  }
  if (!fusionDegraded) {
    details.push('Fusion did not degrade after bias injection');
  }
  if (!confidenceDropped) {
    details.push('No confidence drop observed on system tracks after bias injection');
  }

  const passed = biasDetected && fusionDegraded && confidenceDropped;

  if (passed) {
    details.push('Registration safety assertion passed');
  }

  return { passed, biasDetected, fusionDegraded, confidenceDropped, details };
}
