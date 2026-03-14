import type { RegistrationState, SensorId } from '@eloc2/domain';
import type { EventEnvelope } from './event-envelope.js';

// ---------------------------------------------------------------------------
// registration.state.updated
// ---------------------------------------------------------------------------

/** Emitted when a sensor's registration (alignment) state changes. */
export interface RegistrationStateUpdated extends EventEnvelope {
  eventType: 'registration.state.updated';
  data: {
    sensorId: SensorId;
    previousState: RegistrationState | undefined;
    newState: RegistrationState;
    estimationMethod: string;
    confidence: number;
  };
}
