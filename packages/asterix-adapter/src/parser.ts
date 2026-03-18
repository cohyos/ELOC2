/**
 * ASTERIX binary frame parser for CAT-048 (radar plots) and CAT-062 (system tracks).
 *
 * ASTERIX (All-Purpose Structured Eurocontrol Surveillance Information Exchange)
 * is the standard binary format used by EUROCONTROL for surveillance data.
 *
 * NOTE: The binary decoding below is a structural stub. Full ASTERIX binary
 * parsing requires handling UAP (User Application Profile) field-presence
 * indicators (FSPEC), variable-length fields, and data-item encoding rules
 * per EUROCONTROL specification. The interfaces and patterns here are correct;
 * the actual bit-level decoding should be filled in per the ASTERIX spec docs.
 */

// ---------------------------------------------------------------------------
// CAT-048 — Monoradar Target Reports (radar plot messages)
// ---------------------------------------------------------------------------

/** Parsed record from an ASTERIX CAT-048 data block. */
export interface Cat048Record {
  /** Data Source Identifier — System Area Code (I048/010 SAC). */
  sac: number;
  /** Data Source Identifier — System Identification Code (I048/010 SIC). */
  sic: number;
  /** Measured position in polar coordinates (I048/040). */
  measuredPosition: {
    /** Slant range in nautical miles. */
    rho: number;
    /** Azimuth in degrees (0 = North, clockwise). */
    theta: number;
  };
  /** Mode-3/A code (I048/070), octal SSR code, e.g. 1234. */
  mode3A: number | null;
  /** Flight level in units of 1/4 FL (I048/090). Null if not present. */
  flightLevel: number | null;
  /** Calculated position in Cartesian (I048/042) — meters from radar. */
  cartesianPosition: {
    x: number;
    y: number;
  } | null;
  /** Time of day in seconds past midnight (I048/140). */
  timeOfDay: number;
  /** Track number assigned by the radar (I048/161). Null if plot-only. */
  trackNumber: number | null;
}

// ---------------------------------------------------------------------------
// CAT-062 — System Track Data (SDPS / multi-sensor tracker output)
// ---------------------------------------------------------------------------

/** Track status flags from CAT-062. */
export interface Cat062TrackStatus {
  /** Multi-sensor track (MST) vs mono-sensor. */
  multiSensor: boolean;
  /** Track confirmed vs tentative. */
  confirmed: boolean;
  /** Coasting — no sensor update for N scans. */
  coasting: boolean;
}

/** Parsed record from an ASTERIX CAT-062 data block. */
export interface Cat062Record {
  /** System track number (I062/040). */
  trackNumber: number;
  /** WGS-84 position (I062/105). */
  position: {
    lat: number;
    lon: number;
  };
  /** Calculated track velocity in Cartesian (I062/185). m/s. */
  velocity: {
    vx: number;
    vy: number;
  } | null;
  /** Flight level (I062/136) in FL units. Null if barometric not available. */
  flightLevel: number | null;
  /** Mode-3/A code (I062/060). */
  mode3A: number | null;
  /** Track status flags (I062/080). */
  trackStatus: Cat062TrackStatus;
  /** Time of track information in seconds past midnight (I062/070). */
  timeOfDay: number;
  /** Data source identifier (I062/010 SAC/SIC). */
  sac: number;
  sic: number;
}

// ---------------------------------------------------------------------------
// ASTERIX frame header
// ---------------------------------------------------------------------------

interface AsterixBlock {
  category: number;
  length: number;
  payload: Buffer;
}

/**
 * Parse top-level ASTERIX data blocks from a UDP datagram.
 * An ASTERIX datagram may contain one or more data blocks.
 * Each block: [CAT (1 byte)] [LEN (2 bytes, big-endian)] [records...]
 */
function parseDataBlocks(buffer: Buffer): AsterixBlock[] {
  const blocks: AsterixBlock[] = [];
  let offset = 0;

  while (offset + 3 <= buffer.length) {
    const category = buffer.readUInt8(offset);
    const length = buffer.readUInt16BE(offset + 1);

    if (length < 3 || offset + length > buffer.length) {
      // Malformed block — stop parsing
      break;
    }

    const payload = buffer.subarray(offset + 3, offset + length);
    blocks.push({ category, length, payload });
    offset += length;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// CAT-048 parser
// ---------------------------------------------------------------------------

/**
 * Parse CAT-048 records from a raw ASTERIX buffer (one or more data blocks).
 *
 * TODO: Implement full FSPEC-driven field decoding per EUROCONTROL
 * ASTERIX CAT-048 specification (SUR.ET1.ST05.2000-STD-48-01).
 * The current implementation extracts the data-block envelope but
 * returns an empty record array — fill in the per-field decoding
 * when integrating with a real radar feed.
 */
export function parseCAT048(buffer: Buffer): Cat048Record[] {
  const blocks = parseDataBlocks(buffer);
  const records: Cat048Record[] = [];

  for (const block of blocks) {
    if (block.category !== 48) continue;

    // TODO: Decode FSPEC (field specification) bits to determine which
    // data items are present, then decode each item per the CAT-048 UAP:
    //
    //   I048/010 — Data Source Identifier (SAC/SIC)     — 2 bytes
    //   I048/140 — Time of Day                          — 3 bytes (1/128 sec)
    //   I048/020 — Target Report Descriptor             — 1+ bytes (extendable)
    //   I048/040 — Measured Position (polar)            — 4 bytes (rho/theta)
    //   I048/070 — Mode-3/A Code                        — 2 bytes
    //   I048/090 — Flight Level (Mode-C)                — 2 bytes
    //   I048/042 — Calculated Position (Cartesian)      — 4 bytes
    //   I048/161 — Track Number                         — 2 bytes
    //
    // Each field's presence is indicated by the corresponding bit in FSPEC.
    // For now, log a warning and skip actual decoding.

    if (block.payload.length > 0) {
      console.warn(
        `[asterix-adapter] CAT-048 block received (${block.payload.length} bytes payload) — binary decoding not yet implemented`,
      );
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// CAT-062 parser
// ---------------------------------------------------------------------------

/**
 * Parse CAT-062 records from a raw ASTERIX buffer (one or more data blocks).
 *
 * TODO: Implement full FSPEC-driven field decoding per EUROCONTROL
 * ASTERIX CAT-062 specification (SUR.ET1.ST05.2000-STD-62-01).
 * The current implementation extracts the data-block envelope but
 * returns an empty record array.
 */
export function parseCAT062(buffer: Buffer): Cat062Record[] {
  const blocks = parseDataBlocks(buffer);
  const records: Cat062Record[] = [];

  for (const block of blocks) {
    if (block.category !== 62) continue;

    // TODO: Decode FSPEC bits and extract data items per CAT-062 UAP:
    //
    //   I062/010 — Data Source Identifier (SAC/SIC)     — 2 bytes
    //   I062/040 — Track Number                         — 2 bytes
    //   I062/070 — Time of Track Information             — 3 bytes (1/128 sec)
    //   I062/080 — Track Status                         — 1+ bytes (extendable)
    //   I062/105 — Calculated Position (WGS-84)         — 8 bytes (lat/lon)
    //   I062/185 — Calculated Track Velocity (Cartesian) — 4 bytes
    //   I062/136 — Measured Flight Level                 — 2 bytes
    //   I062/060 — Mode-3/A Code                        — 2 bytes
    //
    // For now, log a warning and skip actual decoding.

    if (block.payload.length > 0) {
      console.warn(
        `[asterix-adapter] CAT-062 block received (${block.payload.length} bytes payload) — binary decoding not yet implemented`,
      );
    }
  }

  return records;
}
