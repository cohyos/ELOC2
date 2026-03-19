/**
 * @eloc2/asterix-adapter
 *
 * Adapter layer for ingesting real radar feeds in EUROCONTROL ASTERIX
 * CAT-048 (radar plots) and CAT-062 (system tracks) format, converting
 * them to the ELOC2 SourceObservation type for fusion pipeline ingestion.
 * Also supports exporting SystemTrack data as CAT-062 binary.
 */

export { AsterixAdapter } from './asterix-adapter.js';
export type { AsterixConfig } from './asterix-adapter.js';

export { AsterixListener } from './udp-listener.js';
export type { AsterixListenerConfig } from './udp-listener.js';

export { parseCAT048, parseCAT062, parseDataBlocks } from './parser.js';
export type { Cat048Record, Cat062Record, Cat062TrackStatus } from './parser.js';

export { cat048ToObservation, cat062ToObservation } from './adapter.js';

export { encodeCAT062Record, encodeAsterixBlock } from './exporter.js';
