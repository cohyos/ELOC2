/**
 * ASTERIX CAT-062 binary encoder.
 *
 * Converts ELOC2 SystemTrack objects to ASTERIX CAT-062 binary records
 * for export to external surveillance systems via UDP.
 */

import type { SystemTrack } from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Resolution for WGS-84 lat/lon encoding: 180 / 2^25 degrees per LSB */
const WGS84_RESOLUTION = 180 / Math.pow(2, 25);

/** Resolution for velocity encoding: 0.25 m/s per LSB */
const VELOCITY_RESOLUTION = 0.25;

/** Resolution for flight level encoding: 1/4 FL per LSB */
const FL_RESOLUTION = 0.25;

/** Resolution for time of day: 1/128 seconds per LSB */
const TOD_RESOLUTION = 1 / 128;

/** Meters to flight level: 1 FL = 100 ft = 30.48 m */
const METERS_TO_FL = 1 / 30.48;

// ---------------------------------------------------------------------------
// FSPEC builder
// ---------------------------------------------------------------------------

/**
 * Build FSPEC bytes from a list of field-presence booleans.
 * Groups fields into 7-bit chunks; bit 0 of each byte is the FX extension indicator.
 */
function buildFspec(fieldPresent: boolean[]): Buffer {
  const fspecBytes: number[] = [];
  let i = 0;

  while (i < fieldPresent.length) {
    let byte = 0;
    // Pack 7 data-item flags into bits 7-1
    for (let bit = 7; bit >= 1; bit--) {
      if (i < fieldPresent.length && fieldPresent[i]) {
        byte |= 1 << bit;
      }
      i++;
    }
    // Set FX bit (bit 0) if there are more fields
    const hasMore = i < fieldPresent.length && fieldPresent.slice(i).some(Boolean);
    if (hasMore) {
      byte |= 1; // FX = 1
    }
    fspecBytes.push(byte);

    if (!hasMore) break;
  }

  // Ensure at least one FSPEC byte
  if (fspecBytes.length === 0) {
    fspecBytes.push(0);
  }

  return Buffer.from(fspecBytes);
}

// ---------------------------------------------------------------------------
// Encoder helpers
// ---------------------------------------------------------------------------

function encodeDataSourceId(sac: number, sic: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt8(sac, 0);
  buf.writeUInt8(sic, 1);
  return buf;
}

function encodeTimeOfDay(secondsSinceMidnight: number): Buffer {
  const raw = Math.round(secondsSinceMidnight / TOD_RESOLUTION);
  const clamped = Math.max(0, Math.min(0xFFFFFF, raw));
  const buf = Buffer.alloc(3);
  buf.writeUInt8((clamped >> 16) & 0xFF, 0);
  buf.writeUInt8((clamped >> 8) & 0xFF, 1);
  buf.writeUInt8(clamped & 0xFF, 2);
  return buf;
}

function encodeWGS84Position(lat: number, lon: number): Buffer {
  const rawLat = Math.round(lat / WGS84_RESOLUTION);
  const rawLon = Math.round(lon / WGS84_RESOLUTION);
  const buf = Buffer.alloc(8);
  buf.writeInt32BE(rawLat, 0);
  buf.writeInt32BE(rawLon, 4);
  return buf;
}

function encodeVelocity(vx: number, vy: number): Buffer {
  const rawVx = Math.round(vx / VELOCITY_RESOLUTION);
  const rawVy = Math.round(vy / VELOCITY_RESOLUTION);
  const buf = Buffer.alloc(4);
  buf.writeInt16BE(Math.max(-32768, Math.min(32767, rawVx)), 0);
  buf.writeInt16BE(Math.max(-32768, Math.min(32767, rawVy)), 2);
  return buf;
}

function encodeTrackNumber(trackNum: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(trackNum & 0xFFFF, 0);
  return buf;
}

function encodeTrackStatus(track: SystemTrack): Buffer {
  let byte = 0;
  // Bit 7: MON (0=multi-sensor, 1=mono-sensor)
  if (track.sources.length <= 1) byte |= 0x80;
  // Bit 1: CNF (0=confirmed, 1=tentative)
  if (track.status === 'tentative') byte |= 0x02;
  // No FX extension (bit 0 = 0)
  return Buffer.from([byte]);
}

function encodeFlightLevel(altitudeMeters: number): Buffer {
  const fl = altitudeMeters * METERS_TO_FL;
  const raw = Math.round(fl / FL_RESOLUTION);
  const buf = Buffer.alloc(2);
  buf.writeInt16BE(Math.max(-32768, Math.min(32767, raw)), 0);
  return buf;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a numeric track ID string to a 16-bit number for ASTERIX encoding.
 * Extracts the trailing numeric portion or hashes if non-numeric.
 */
function trackIdToNumber(id: string): number {
  const match = id.match(/(\d+)/);
  if (match) {
    return parseInt(match[1]!, 10) & 0xFFFF;
  }
  // Simple hash for non-numeric IDs
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) & 0xFFFF;
  }
  return hash;
}

/**
 * Get seconds since midnight UTC for a given epoch-ms timestamp.
 */
function timestampToTod(epochMs: number): number {
  const d = new Date(epochMs);
  return (
    d.getUTCHours() * 3600 +
    d.getUTCMinutes() * 60 +
    d.getUTCSeconds() +
    d.getUTCMilliseconds() / 1000
  );
}

/**
 * Encode a single SystemTrack as a CAT-062 ASTERIX record (without block header).
 *
 * Encodes the following data items:
 *   I062/010 — Data Source Identifier (SAC=0, SIC=1)
 *   I062/070 — Time of Track Information
 *   I062/105 — Calculated Position in WGS-84
 *   I062/185 — Calculated Track Velocity (if available)
 *   I062/040 — Track Number
 *   I062/080 — Track Status
 *   I062/136 — Measured Flight Level
 *
 * The FSPEC follows the CAT-062 UAP field order.
 */
export function encodeCAT062Record(track: SystemTrack, sac = 0, sic = 1): Buffer {
  const hasVelocity = track.velocity != null;

  // CAT-062 UAP order (per FSPEC):
  // Byte1: I062/010(0), I062/015(1), I062/070(2), I062/105(3), I062/100(4), I062/185(5), I062/210(6)
  // Byte2: I062/060(7), I062/245(8), I062/380(9), I062/040(10), I062/080(11), I062/290(12), I062/200(13)
  // Byte3: I062/295(14), I062/136(15), ...

  const fieldPresent: boolean[] = [
    true,        // 0: I062/010 — always present
    false,       // 1: I062/015 — service ID, not used
    true,        // 2: I062/070 — time of track
    true,        // 3: I062/105 — WGS-84 position
    false,       // 4: I062/100 — Cartesian position, not used
    hasVelocity, // 5: I062/185 — velocity
    false,       // 6: I062/210 — acceleration, not used
    false,       // 7: I062/060 — mode 3/A, not used
    false,       // 8: I062/245 — target ID, not used
    false,       // 9: I062/380 — aircraft derived data, not used
    true,        // 10: I062/040 — track number
    true,        // 11: I062/080 — track status
    false,       // 12: I062/290 — update ages, not used
    false,       // 13: I062/200 — mode of movement, not used
    false,       // 14: I062/295 — track data ages, not used
    true,        // 15: I062/136 — flight level
  ];

  const fspec = buildFspec(fieldPresent);

  const parts: Buffer[] = [fspec];

  // I062/010
  parts.push(encodeDataSourceId(sac, sic));

  // I062/070
  const tod = timestampToTod(track.lastUpdated as number);
  parts.push(encodeTimeOfDay(tod));

  // I062/105
  parts.push(encodeWGS84Position(track.state.lat, track.state.lon));

  // I062/185 (conditional)
  if (hasVelocity && track.velocity) {
    parts.push(encodeVelocity(track.velocity.vx, track.velocity.vy));
  }

  // I062/040
  const trackNum = trackIdToNumber(track.systemTrackId as string);
  parts.push(encodeTrackNumber(trackNum));

  // I062/080
  parts.push(encodeTrackStatus(track));

  // I062/136
  parts.push(encodeFlightLevel(track.state.alt));

  return Buffer.concat(parts);
}

/**
 * Wrap one or more ASTERIX records into a data block with the standard header.
 *
 * Block format: [CAT (1 byte)] [LEN (2 bytes big-endian)] [records...]
 * LEN includes the 3-byte header.
 *
 * @param category  ASTERIX category number (e.g. 62)
 * @param records   Array of encoded record Buffers
 * @returns Complete ASTERIX data block
 */
export function encodeAsterixBlock(category: number, records: Buffer[]): Buffer {
  const payload = Buffer.concat(records);
  const totalLen = 3 + payload.length; // 1 (cat) + 2 (len) + payload

  const header = Buffer.alloc(3);
  header.writeUInt8(category, 0);
  header.writeUInt16BE(totalLen, 1);

  return Buffer.concat([header, payload]);
}
