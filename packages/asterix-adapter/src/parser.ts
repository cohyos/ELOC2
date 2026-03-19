/**
 * ASTERIX binary frame parser for CAT-048 (radar plots) and CAT-062 (system tracks).
 *
 * ASTERIX (All-Purpose Structured Eurocontrol Surveillance Information Exchange)
 * is the standard binary format used by EUROCONTROL for surveillance data.
 *
 * Each ASTERIX datagram contains one or more data blocks.
 * Each block: [CAT (1 byte)] [LEN (2 bytes big-endian)] [records...]
 * Each record: FSPEC bytes (field-presence indicators) then data items in UAP order.
 * FSPEC: MSB first per byte; bit 0 (LSB) = FX (1 = more FSPEC bytes follow).
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
  /** Calculated track velocity (I048/200). Null if not present. */
  calculatedVelocity: {
    /** Ground speed in NM/s. */
    groundSpeed: number;
    /** Heading in degrees. */
    heading: number;
  } | null;
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
  /** Track data ages in seconds (I062/295). Null if not present. */
  trackDataAges: {
    /** Age of last plot used (seconds). */
    plotAge: number | null;
  } | null;
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
export function parseDataBlocks(buffer: Buffer): AsterixBlock[] {
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
// FSPEC parser
// ---------------------------------------------------------------------------

/**
 * Parse the FSPEC (Field Specification) bytes at the start of a record.
 * Each FSPEC byte: bits 7-1 indicate presence of data items, bit 0 (FX) = extension.
 * Returns the FSPEC as an array of booleans (one per data-item slot), plus the
 * number of bytes consumed.
 */
function parseFspec(
  buffer: Buffer,
  offset: number,
): { fields: boolean[]; bytesConsumed: number } {
  const fields: boolean[] = [];
  let pos = offset;

  while (pos < buffer.length) {
    const byte = buffer.readUInt8(pos);
    // Bits 7 down to 1 are data item presence flags
    for (let bit = 7; bit >= 1; bit--) {
      fields.push(((byte >> bit) & 1) === 1);
    }
    pos++;
    // Bit 0 is FX (field extension)
    if ((byte & 1) === 0) break; // No more FSPEC bytes
  }

  return { fields, bytesConsumed: pos - offset };
}

// ---------------------------------------------------------------------------
// CAT-048 parser — full FSPEC-driven decoding
// ---------------------------------------------------------------------------

/**
 * CAT-048 UAP (User Application Profile) field order.
 * Each FSPEC bit (7 data items per FSPEC byte, bit 0 = FX) maps to a data item.
 *
 * FSPEC byte 1: I048/010, I048/140, I048/020, I048/040, I048/070, I048/090, I048/130, FX
 * FSPEC byte 2: I048/220, I048/240, I048/250, I048/161, I048/042, I048/200, I048/170, FX
 */

function parseCAT048Record(
  payload: Buffer,
  offset: number,
): { record: Cat048Record | null; bytesConsumed: number } {
  if (offset >= payload.length) {
    return { record: null, bytesConsumed: 0 };
  }

  const { fields, bytesConsumed: fspecLen } = parseFspec(payload, offset);
  let pos = offset + fspecLen;

  // Defaults
  let sac = 0;
  let sic = 0;
  let timeOfDay = 0;
  let rho = 0;
  let theta = 0;
  let mode3A: number | null = null;
  let flightLevel: number | null = null;
  let cartesianX: number | null = null;
  let cartesianY: number | null = null;
  let trackNumber: number | null = null;
  let groundSpeed: number | null = null;
  let heading: number | null = null;
  let hasMeasuredPos = false;

  // Field index 0: I048/010 — Data Source Identifier (2 bytes: SAC, SIC)
  if (fields[0]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    sac = payload.readUInt8(pos);
    sic = payload.readUInt8(pos + 1);
    pos += 2;
  }

  // Field index 1: I048/140 — Time of Day (3 bytes, unsigned, 1/128 sec)
  if (fields[1]) {
    if (pos + 3 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const raw = (payload.readUInt8(pos) << 16) |
                (payload.readUInt8(pos + 1) << 8) |
                payload.readUInt8(pos + 2);
    timeOfDay = raw / 128; // seconds since midnight
    pos += 3;
  }

  // Field index 2: I048/020 — Target Report Descriptor (1+ bytes, extendable)
  if (fields[2]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // Variable length — skip FX-extended bytes
    while (pos < payload.length) {
      const byte = payload.readUInt8(pos);
      pos++;
      if ((byte & 1) === 0) break; // No extension
    }
  }

  // Field index 3: I048/040 — Measured Position in Polar (4 bytes)
  // RHO: unsigned 16-bit, LSB = 1/256 NM
  // THETA: unsigned 16-bit, LSB = 360/2^16 degrees
  if (fields[3]) {
    if (pos + 4 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const rawRho = payload.readUInt16BE(pos);
    const rawTheta = payload.readUInt16BE(pos + 2);
    rho = rawRho / 256; // NM
    theta = rawTheta * (360 / 65536); // degrees
    hasMeasuredPos = true;
    pos += 4;
  }

  // Field index 4: I048/070 — Mode-3/A Code (2 bytes)
  // Bit 15: V (validated), Bit 14: G (garbled), Bit 13: L (smoothed)
  // Bits 11-0: Mode-3/A code in octal representation
  if (fields[4]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const raw = payload.readUInt16BE(pos);
    mode3A = raw & 0x0FFF; // Lower 12 bits = octal code
    pos += 2;
  }

  // Field index 5: I048/090 — Flight Level in Mode-C (2 bytes)
  // Bit 15: V (validated), Bit 14: G (garbled)
  // Bits 13-0: signed, LSB = 1/4 FL
  if (fields[5]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const raw = payload.readInt16BE(pos);
    flightLevel = (raw & 0x3FFF) / 4; // FL units
    // Check sign bit of the 14-bit value
    if (raw & 0x2000) {
      flightLevel = ((raw & 0x3FFF) - 0x4000) / 4;
    }
    pos += 2;
  }

  // Field index 6: I048/130 — Radar Plot Characteristics (1+ bytes, variable/compound)
  if (fields[6]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // Compound data item — first byte is a sub-field presence indicator
    const subPresence = payload.readUInt8(pos);
    pos++;
    // Each set bit in subPresence (bits 7-1) indicates a 1-byte sub-field
    for (let bit = 7; bit >= 1; bit--) {
      if ((subPresence >> bit) & 1) {
        pos++; // Skip the sub-field byte
        if (pos > payload.length) return { record: null, bytesConsumed: pos - offset };
      }
    }
    // If FX bit set, more sub-field indicators follow (simplified: skip)
    if (subPresence & 1) {
      // Extension — for now skip any additional bytes
      while (pos < payload.length) {
        const ext = payload.readUInt8(pos);
        pos++;
        for (let bit = 7; bit >= 1; bit--) {
          if ((ext >> bit) & 1) {
            pos++;
          }
        }
        if ((ext & 1) === 0) break;
      }
    }
  }

  // --- FSPEC byte 2 fields (indices 7-13) ---

  // Field index 7: I048/220 — Aircraft Address (3 bytes)
  if (fields.length > 7 && fields[7]) {
    pos += 3;
  }

  // Field index 8: I048/240 — Aircraft Identification (6 bytes)
  if (fields.length > 8 && fields[8]) {
    pos += 6;
  }

  // Field index 9: I048/250 — Mode S MB Data (variable: 1 byte count + N*8 bytes)
  if (fields.length > 9 && fields[9]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    const repCount = payload.readUInt8(pos);
    pos += 1 + repCount * 8;
  }

  // Field index 10: I048/161 — Track Number (2 bytes)
  if (fields.length > 10 && fields[10]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    trackNumber = payload.readUInt16BE(pos) & 0x0FFF; // 12-bit track number
    pos += 2;
  }

  // Field index 11: I048/042 — Calculated Position in Cartesian (4 bytes)
  // 2x signed 16-bit, LSB = 1/128 NM
  if (fields.length > 11 && fields[11]) {
    if (pos + 4 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const rawX = payload.readInt16BE(pos);
    const rawY = payload.readInt16BE(pos + 2);
    cartesianX = (rawX / 128) * 1852; // Convert from NM to meters
    cartesianY = (rawY / 128) * 1852;
    pos += 4;
  }

  // Field index 12: I048/200 — Calculated Track Velocity (4 bytes)
  // Ground speed: unsigned 16-bit, LSB = 2^-14 NM/s
  // Heading: unsigned 16-bit, LSB = 360/2^16 degrees
  if (fields.length > 12 && fields[12]) {
    if (pos + 4 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const rawGS = payload.readUInt16BE(pos);
    const rawHdg = payload.readUInt16BE(pos + 2);
    groundSpeed = rawGS * (1 / 16384); // NM/s (2^-14)
    heading = rawHdg * (360 / 65536); // degrees
    pos += 4;
  }

  // Field index 13: I048/170 — Track Status (1+ bytes, extendable)
  if (fields.length > 13 && fields[13]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    while (pos < payload.length) {
      const byte = payload.readUInt8(pos);
      pos++;
      if ((byte & 1) === 0) break;
    }
  }

  // We require at minimum a measured position to produce a valid record
  if (!hasMeasuredPos) {
    return { record: null, bytesConsumed: pos - offset };
  }

  const record: Cat048Record = {
    sac,
    sic,
    measuredPosition: { rho, theta },
    mode3A,
    flightLevel,
    cartesianPosition:
      cartesianX !== null && cartesianY !== null
        ? { x: cartesianX, y: cartesianY }
        : null,
    timeOfDay,
    trackNumber,
    calculatedVelocity:
      groundSpeed !== null && heading !== null
        ? { groundSpeed, heading }
        : null,
  };

  return { record, bytesConsumed: pos - offset };
}

/**
 * Parse CAT-048 records from a raw ASTERIX buffer (one or more data blocks).
 */
export function parseCAT048(buffer: Buffer): Cat048Record[] {
  const blocks = parseDataBlocks(buffer);
  const records: Cat048Record[] = [];

  for (const block of blocks) {
    if (block.category !== 48) continue;

    let offset = 0;
    while (offset < block.payload.length) {
      const { record, bytesConsumed } = parseCAT048Record(block.payload, offset);
      if (bytesConsumed === 0) break;
      if (record) records.push(record);
      offset += bytesConsumed;
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// CAT-062 parser — full FSPEC-driven decoding
// ---------------------------------------------------------------------------

/**
 * CAT-062 UAP field order:
 * FSPEC byte 1: I062/010, I062/015, I062/070, I062/105, I062/100, I062/185, I062/210, FX
 * FSPEC byte 2: I062/060, I062/245, I062/380, I062/040, I062/080, I062/290, I062/200, FX
 * FSPEC byte 3: I062/295, I062/136, I062/130, I062/135, I062/220, I062/390, I062/270, FX
 *
 * We decode the fields we care about and skip the rest.
 */

function parseCAT062Record(
  payload: Buffer,
  offset: number,
): { record: Cat062Record | null; bytesConsumed: number } {
  if (offset >= payload.length) {
    return { record: null, bytesConsumed: 0 };
  }

  const { fields, bytesConsumed: fspecLen } = parseFspec(payload, offset);
  let pos = offset + fspecLen;

  // Defaults
  let sac = 0;
  let sic = 0;
  let timeOfDay = 0;
  let lat = 0;
  let lon = 0;
  let vx: number | null = null;
  let vy: number | null = null;
  let mode3A: number | null = null;
  let trackNumber = 0;
  let flightLevel: number | null = null;
  let multiSensor = false;
  let confirmed = true;
  let coasting = false;
  let hasPosition = false;
  let plotAge: number | null = null;

  // Field index 0: I062/010 — Data Source Identifier (2 bytes: SAC, SIC)
  if (fields[0]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    sac = payload.readUInt8(pos);
    sic = payload.readUInt8(pos + 1);
    pos += 2;
  }

  // Field index 1: I062/015 — Service Identification (1 byte)
  if (fields.length > 1 && fields[1]) {
    pos += 1;
  }

  // Field index 2: I062/070 — Time of Track Information (3 bytes, 1/128 sec)
  if (fields.length > 2 && fields[2]) {
    if (pos + 3 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const raw = (payload.readUInt8(pos) << 16) |
                (payload.readUInt8(pos + 1) << 8) |
                payload.readUInt8(pos + 2);
    timeOfDay = raw / 128;
    pos += 3;
  }

  // Field index 3: I062/105 — Calculated Position in WGS-84 (8 bytes)
  // Latitude: signed 32-bit, LSB = 180/2^25 degrees
  // Longitude: signed 32-bit, LSB = 180/2^25 degrees
  if (fields.length > 3 && fields[3]) {
    if (pos + 8 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const rawLat = payload.readInt32BE(pos);
    const rawLon = payload.readInt32BE(pos + 4);
    lat = rawLat * (180 / Math.pow(2, 25));
    lon = rawLon * (180 / Math.pow(2, 25));
    hasPosition = true;
    pos += 8;
  }

  // Field index 4: I062/100 — Calculated Position in Cartesian (8 bytes)
  if (fields.length > 4 && fields[4]) {
    pos += 8; // Skip — we use WGS-84 from I062/105
  }

  // Field index 5: I062/185 — Calculated Track Velocity (Cartesian) (4 bytes)
  // Vx: signed 16-bit, LSB = 0.25 m/s
  // Vy: signed 16-bit, LSB = 0.25 m/s
  if (fields.length > 5 && fields[5]) {
    if (pos + 4 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const rawVx = payload.readInt16BE(pos);
    const rawVy = payload.readInt16BE(pos + 2);
    vx = rawVx * 0.25;
    vy = rawVy * 0.25;
    pos += 4;
  }

  // Field index 6: I062/210 — Calculated Acceleration (2 bytes)
  if (fields.length > 6 && fields[6]) {
    pos += 2;
  }

  // --- FSPEC byte 2 (indices 7-13) ---

  // Field index 7: I062/060 — Mode-3/A Code (2 bytes)
  if (fields.length > 7 && fields[7]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const raw = payload.readUInt16BE(pos);
    mode3A = raw & 0x0FFF;
    pos += 2;
  }

  // Field index 8: I062/245 — Target Identification (7 bytes)
  if (fields.length > 8 && fields[8]) {
    pos += 7;
  }

  // Field index 9: I062/380 — Aircraft Derived Data (compound, variable length)
  if (fields.length > 9 && fields[9]) {
    // Compound: first byte(s) are sub-field presence (FX-extendable)
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // Skip the entire compound item by reading sub-presence indicators
    // and their associated data. Simplified: read presence byte(s), then skip sub-fields.
    // Sub-field sizes for I062/380 (first 7): 3,3,2,2,2,2,2 bytes
    const subSizes = [3, 3, 2, 2, 2, 2, 2];
    let subIdx = 0;
    let moreSub = true;
    while (moreSub && pos < payload.length) {
      const subPresence = payload.readUInt8(pos);
      pos++;
      for (let bit = 7; bit >= 1 && subIdx < subSizes.length; bit--, subIdx++) {
        if ((subPresence >> bit) & 1) {
          pos += subSizes[subIdx] ?? 2;
        }
      }
      moreSub = (subPresence & 1) === 1;
    }
  }

  // Field index 10: I062/040 — Track Number (2 bytes)
  if (fields.length > 10 && fields[10]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    trackNumber = payload.readUInt16BE(pos);
    pos += 2;
  }

  // Field index 11: I062/080 — Track Status (1+ bytes, FX-extendable)
  if (fields.length > 11 && fields[11]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    const firstByte = payload.readUInt8(pos);
    // Bit 7: MON (0=multi-sensor, 1=mono-sensor)
    multiSensor = ((firstByte >> 7) & 1) === 0;
    // Bit 6: SPI (Special Position Identification)
    // Bit 5: MRH (Most Reliable Height)
    // Bit 4-2: SRC (Source of calculated position)
    // Bit 1: CNF (0=confirmed, 1=tentative)
    confirmed = ((firstByte >> 1) & 1) === 0;
    pos++;
    // Skip FX extension bytes
    let extByte = firstByte;
    while ((extByte & 1) === 1 && pos < payload.length) {
      extByte = payload.readUInt8(pos);
      // Second byte bit 7: CST (coasting)
      coasting = ((extByte >> 7) & 1) === 1;
      pos++;
    }
  }

  // Field index 12: I062/290 — System Track Update Ages (compound, variable)
  if (fields.length > 12 && fields[12]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // Compound: sub-field presence byte(s) + sub-fields (each 1-2 bytes typically)
    // Simplified skip: each sub-field is 1 byte
    const subPresence = payload.readUInt8(pos);
    pos++;
    for (let bit = 7; bit >= 1; bit--) {
      if ((subPresence >> bit) & 1) {
        pos += 1;
      }
    }
    if (subPresence & 1) {
      while (pos < payload.length) {
        const ext = payload.readUInt8(pos);
        pos++;
        for (let bit = 7; bit >= 1; bit--) {
          if ((ext >> bit) & 1) {
            pos += 1;
          }
        }
        if ((ext & 1) === 0) break;
      }
    }
  }

  // Field index 13: I062/200 — Mode of Movement (1 byte)
  if (fields.length > 13 && fields[13]) {
    pos += 1;
  }

  // --- FSPEC byte 3 (indices 14-20) ---

  // Field index 14: I062/295 — Track Data Ages (compound, variable)
  if (fields.length > 14 && fields[14]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // Sub-field presence byte(s)
    const subPresence = payload.readUInt8(pos);
    pos++;
    // Each sub-field of I062/295 is typically 1 byte (age in 1/4 sec)
    let subCount = 0;
    for (let bit = 7; bit >= 1; bit--) {
      if ((subPresence >> bit) & 1) {
        if (subCount === 0 && pos < payload.length) {
          // First sub-field = MDS age (plot age)
          plotAge = payload.readUInt8(pos) * 0.25; // 1/4 second resolution
        }
        pos += 1;
        subCount++;
      }
    }
    if (subPresence & 1) {
      while (pos < payload.length) {
        const ext = payload.readUInt8(pos);
        pos++;
        for (let bit = 7; bit >= 1; bit--) {
          if ((ext >> bit) & 1) {
            pos += 1;
          }
        }
        if ((ext & 1) === 0) break;
      }
    }
  }

  // Field index 15: I062/136 — Measured Flight Level (2 bytes)
  // Signed 16-bit, LSB = 1/4 FL
  if (fields.length > 15 && fields[15]) {
    if (pos + 2 > payload.length) return { record: null, bytesConsumed: pos - offset };
    const raw = payload.readInt16BE(pos);
    flightLevel = raw / 4;
    pos += 2;
  }

  // Field index 16: I062/130 — Calculated Track Geometric Altitude (2 bytes)
  if (fields.length > 16 && fields[16]) {
    pos += 2;
  }

  // Field index 17: I062/135 — Calculated Track Barometric Altitude (2 bytes)
  if (fields.length > 17 && fields[17]) {
    pos += 2;
  }

  // Field index 18: I062/220 — Calculated Rate of Climb/Descent (2 bytes)
  if (fields.length > 18 && fields[18]) {
    pos += 2;
  }

  // Field index 19: I062/390 — Flight Plan Related Data (compound, variable)
  if (fields.length > 19 && fields[19]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // Complex compound — skip using sub-presence + FX
    const subPresence = payload.readUInt8(pos);
    pos++;
    // Sub-field sizes for I062/390 (first 7): 2,7,4,1,4,1,4
    const sizes390 = [2, 7, 4, 1, 4, 1, 4];
    for (let bit = 7, idx = 0; bit >= 1 && idx < sizes390.length; bit--, idx++) {
      if ((subPresence >> bit) & 1) {
        pos += sizes390[idx]!;
      }
    }
    if (subPresence & 1) {
      // Extension — simplified skip
      while (pos < payload.length) {
        const ext = payload.readUInt8(pos);
        pos++;
        for (let bit = 7; bit >= 1; bit--) {
          if ((ext >> bit) & 1) pos += 2; // default sub-field size
        }
        if ((ext & 1) === 0) break;
      }
    }
  }

  // Field index 20: I062/270 — Target Size & Orientation (1+ bytes, variable)
  if (fields.length > 20 && fields[20]) {
    if (pos >= payload.length) return { record: null, bytesConsumed: pos - offset };
    // FX-extendable
    while (pos < payload.length) {
      const byte = payload.readUInt8(pos);
      pos++;
      if ((byte & 1) === 0) break;
    }
  }

  if (!hasPosition) {
    return { record: null, bytesConsumed: pos - offset };
  }

  const record: Cat062Record = {
    trackNumber,
    position: { lat, lon },
    velocity: vx !== null && vy !== null ? { vx, vy } : null,
    flightLevel,
    mode3A,
    trackStatus: { multiSensor, confirmed, coasting },
    timeOfDay,
    sac,
    sic,
    trackDataAges: plotAge !== null ? { plotAge } : null,
  };

  return { record, bytesConsumed: pos - offset };
}

/**
 * Parse CAT-062 records from a raw ASTERIX buffer (one or more data blocks).
 */
export function parseCAT062(buffer: Buffer): Cat062Record[] {
  const blocks = parseDataBlocks(buffer);
  const records: Cat062Record[] = [];

  for (const block of blocks) {
    if (block.category !== 62) continue;

    let offset = 0;
    while (offset < block.payload.length) {
      const { record, bytesConsumed } = parseCAT062Record(block.payload, offset);
      if (bytesConsumed === 0) break;
      if (record) records.push(record);
      offset += bytesConsumed;
    }
  }

  return records;
}
