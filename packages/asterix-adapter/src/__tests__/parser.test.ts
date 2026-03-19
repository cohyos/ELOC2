import { describe, it, expect } from 'vitest';
import { parseCAT048, parseCAT062, parseDataBlocks } from '../parser.js';

// ---------------------------------------------------------------------------
// Helpers — build ASTERIX binary payloads for testing
// ---------------------------------------------------------------------------

/**
 * Wrap a record payload in an ASTERIX data block header.
 * Block: [CAT (1)] [LEN (2 big-endian)] [payload]
 */
function wrapBlock(category: number, recordPayload: Buffer): Buffer {
  const totalLen = 3 + recordPayload.length;
  const header = Buffer.alloc(3);
  header.writeUInt8(category, 0);
  header.writeUInt16BE(totalLen, 1);
  return Buffer.concat([header, recordPayload]);
}

/**
 * Build an FSPEC from field-presence booleans.
 * Groups into 7-bit chunks; bit 0 = FX extension.
 */
function buildFspec(fieldPresent: boolean[]): Buffer {
  const bytes: number[] = [];
  let i = 0;
  while (i < fieldPresent.length) {
    let byte = 0;
    for (let bit = 7; bit >= 1; bit--) {
      if (i < fieldPresent.length && fieldPresent[i]) {
        byte |= 1 << bit;
      }
      i++;
    }
    const hasMore = i < fieldPresent.length && fieldPresent.slice(i).some(Boolean);
    if (hasMore) byte |= 1;
    bytes.push(byte);
    if (!hasMore) break;
  }
  if (bytes.length === 0) bytes.push(0);
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// parseDataBlocks
// ---------------------------------------------------------------------------

describe('parseDataBlocks', () => {
  it('should parse a single data block', () => {
    const payload = Buffer.from([0x01, 0x02, 0x03]);
    const block = wrapBlock(48, payload);
    const blocks = parseDataBlocks(block);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.category).toBe(48);
    expect(blocks[0]!.payload).toEqual(payload);
  });

  it('should parse multiple data blocks', () => {
    const payload1 = Buffer.from([0xAA]);
    const payload2 = Buffer.from([0xBB, 0xCC]);
    const block1 = wrapBlock(48, payload1);
    const block2 = wrapBlock(62, payload2);
    const combined = Buffer.concat([block1, block2]);
    const blocks = parseDataBlocks(combined);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.category).toBe(48);
    expect(blocks[1]!.category).toBe(62);
  });

  it('should handle malformed blocks gracefully', () => {
    // Length too short
    const buf = Buffer.from([48, 0x00, 0x01]);
    const blocks = parseDataBlocks(buf);
    expect(blocks).toHaveLength(0);
  });

  it('should handle empty buffer', () => {
    const blocks = parseDataBlocks(Buffer.alloc(0));
    expect(blocks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CAT-048 parser
// ---------------------------------------------------------------------------

describe('parseCAT048', () => {
  it('should parse a record with I048/010, I048/140, I048/040', () => {
    // FSPEC: I048/010=1, I048/140=1, I048/020=0, I048/040=1, I048/070=0, I048/090=0, I048/130=0
    // Fields present: [true, true, false, true, false, false, false]
    const fspec = buildFspec([true, true, false, true, false, false, false]);

    // I048/010: SAC=10, SIC=20
    const dataSourceId = Buffer.from([10, 20]);

    // I048/140: Time of day = 3600 seconds (1 hour) => 3600 * 128 = 460800
    const todRaw = 3600 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    // I048/040: Measured Position
    // rho = 50 NM => 50 * 256 = 12800
    // theta = 90 deg => 90 * 65536/360 = 16384
    const measuredPos = Buffer.alloc(4);
    measuredPos.writeUInt16BE(12800, 0); // rho
    measuredPos.writeUInt16BE(16384, 2); // theta

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, measuredPos]);
    const asterixBlock = wrapBlock(48, recordPayload);

    const records = parseCAT048(asterixBlock);
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.sac).toBe(10);
    expect(rec.sic).toBe(20);
    expect(rec.timeOfDay).toBeCloseTo(3600, 1);
    expect(rec.measuredPosition.rho).toBeCloseTo(50, 1);
    expect(rec.measuredPosition.theta).toBeCloseTo(90, 1);
    expect(rec.mode3A).toBeNull();
    expect(rec.flightLevel).toBeNull();
    expect(rec.cartesianPosition).toBeNull();
    expect(rec.trackNumber).toBeNull();
  });

  it('should parse mode3A and flight level', () => {
    // FSPEC: I048/010=1, I048/140=1, I048/020=0, I048/040=1, I048/070=1, I048/090=1, I048/130=0
    const fspec = buildFspec([true, true, false, true, true, true, false]);

    const dataSourceId = Buffer.from([5, 10]);
    const todRaw = 1000 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    // rho=30NM, theta=180deg
    const measuredPos = Buffer.alloc(4);
    measuredPos.writeUInt16BE(30 * 256, 0);
    measuredPos.writeUInt16BE(Math.round(180 * 65536 / 360), 2);

    // Mode-3/A: octal 1200 = 0x0280 (in binary representation)
    const mode3A = Buffer.alloc(2);
    mode3A.writeUInt16BE(0x0280, 0);

    // Flight Level: FL350 = 350, raw = 350 * 4 = 1400
    const flightLevel = Buffer.alloc(2);
    flightLevel.writeInt16BE(350 * 4, 0);

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, measuredPos, mode3A, flightLevel]);
    const asterixBlock = wrapBlock(48, recordPayload);

    const records = parseCAT048(asterixBlock);
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.sac).toBe(5);
    expect(rec.sic).toBe(10);
    expect(rec.mode3A).toBe(0x0280);
    expect(rec.flightLevel).toBeCloseTo(350, 0);
  });

  it('should parse track number and cartesian position', () => {
    // Fields: I048/010, I048/140, skip I048/020, I048/040,
    // skip I048/070, I048/090, I048/130, (FX)
    // then: skip I048/220, skip I048/240, skip I048/250, I048/161, I048/042
    const fields = [
      true, true, false, true, false, false, false, // byte 1
      false, false, false, true, true, false, false, // byte 2
    ];
    const fspec = buildFspec(fields);

    const dataSourceId = Buffer.from([1, 2]);
    const todRaw = 500 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    const measuredPos = Buffer.alloc(4);
    measuredPos.writeUInt16BE(20 * 256, 0); // 20 NM
    measuredPos.writeUInt16BE(Math.round(45 * 65536 / 360), 2); // 45 deg

    // I048/161: Track number = 42 (lower 12 bits)
    const trackNum = Buffer.alloc(2);
    trackNum.writeUInt16BE(42, 0);

    // I048/042: Cartesian position
    // x = 10 NM = 10 * 128 = 1280 (signed 16-bit, 1/128 NM resolution)
    // y = -5 NM = -5 * 128 = -640
    const cartesian = Buffer.alloc(4);
    cartesian.writeInt16BE(1280, 0);
    cartesian.writeInt16BE(-640, 2);

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, measuredPos, trackNum, cartesian]);
    const asterixBlock = wrapBlock(48, recordPayload);

    const records = parseCAT048(asterixBlock);
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.trackNumber).toBe(42);
    expect(rec.cartesianPosition).not.toBeNull();
    // x = (1280/128) * 1852 = 10 * 1852 = 18520 meters
    expect(rec.cartesianPosition!.x).toBeCloseTo(18520, 0);
    // y = (-640/128) * 1852 = -5 * 1852 = -9260 meters
    expect(rec.cartesianPosition!.y).toBeCloseTo(-9260, 0);
  });

  it('should ignore non-CAT-048 blocks', () => {
    const payload = Buffer.from([0x00]);
    const block = wrapBlock(62, payload);
    const records = parseCAT048(block);
    expect(records).toHaveLength(0);
  });

  it('should return empty for record without measured position', () => {
    // Only I048/010 present, no I048/040
    const fspec = buildFspec([true, false, false, false, false, false, false]);
    const dataSourceId = Buffer.from([1, 2]);
    const recordPayload = Buffer.concat([fspec, dataSourceId]);
    const block = wrapBlock(48, recordPayload);
    const records = parseCAT048(block);
    expect(records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CAT-062 parser
// ---------------------------------------------------------------------------

describe('parseCAT062', () => {
  it('should parse a record with I062/010, I062/070, I062/105', () => {
    // Fields: I062/010=1, I062/015=0, I062/070=1, I062/105=1, rest=0
    const fspec = buildFspec([true, false, true, true, false, false, false]);

    const dataSourceId = Buffer.from([8, 15]);

    // I062/070: Time = 7200 sec => 7200 * 128 = 921600
    const todRaw = 7200 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    // I062/105: WGS-84 position
    // lat = 32.0 deg => 32.0 / (180 / 2^25) = 32 * 2^25 / 180
    // lon = 34.8 deg => 34.8 * 2^25 / 180
    const latRaw = Math.round(32.0 * Math.pow(2, 25) / 180);
    const lonRaw = Math.round(34.8 * Math.pow(2, 25) / 180);
    const position = Buffer.alloc(8);
    position.writeInt32BE(latRaw, 0);
    position.writeInt32BE(lonRaw, 4);

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, position]);
    const block = wrapBlock(62, recordPayload);

    const records = parseCAT062(block);
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.sac).toBe(8);
    expect(rec.sic).toBe(15);
    expect(rec.timeOfDay).toBeCloseTo(7200, 1);
    expect(rec.position.lat).toBeCloseTo(32.0, 3);
    expect(rec.position.lon).toBeCloseTo(34.8, 3);
    expect(rec.velocity).toBeNull();
    expect(rec.mode3A).toBeNull();
  });

  it('should parse velocity (I062/185)', () => {
    // Fields: I062/010=1, I062/015=0, I062/070=1, I062/105=1, I062/100=0, I062/185=1
    const fspec = buildFspec([true, false, true, true, false, true, false]);

    const dataSourceId = Buffer.from([1, 1]);
    const todRaw = 100 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    const latRaw = Math.round(31.0 * Math.pow(2, 25) / 180);
    const lonRaw = Math.round(35.0 * Math.pow(2, 25) / 180);
    const position = Buffer.alloc(8);
    position.writeInt32BE(latRaw, 0);
    position.writeInt32BE(lonRaw, 4);

    // Velocity: vx=100 m/s => raw = 100/0.25 = 400, vy=-50 m/s => raw = -200
    const velocity = Buffer.alloc(4);
    velocity.writeInt16BE(400, 0);
    velocity.writeInt16BE(-200, 2);

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, position, velocity]);
    const block = wrapBlock(62, recordPayload);

    const records = parseCAT062(block);
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.velocity).not.toBeNull();
    expect(rec.velocity!.vx).toBeCloseTo(100, 1);
    expect(rec.velocity!.vy).toBeCloseTo(-50, 1);
  });

  it('should parse track number and track status', () => {
    // FSPEC byte1: I062/010=1, skip, I062/070=1, I062/105=1, skip, skip, skip
    // FSPEC byte2: skip, skip, skip, I062/040=1, I062/080=1, skip, skip
    const fields = [
      true, false, true, true, false, false, false, // byte 1
      false, false, false, true, true, false, false, // byte 2
    ];
    const fspec = buildFspec(fields);

    const dataSourceId = Buffer.from([2, 3]);
    const todRaw = 500 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    const latRaw = Math.round(30.0 * Math.pow(2, 25) / 180);
    const lonRaw = Math.round(34.0 * Math.pow(2, 25) / 180);
    const position = Buffer.alloc(8);
    position.writeInt32BE(latRaw, 0);
    position.writeInt32BE(lonRaw, 4);

    // I062/040: Track number = 1234
    const trackNum = Buffer.alloc(2);
    trackNum.writeUInt16BE(1234, 0);

    // I062/080: Track status
    // Byte: bit7=0 (multi-sensor), bit1=0 (confirmed), no FX
    const trackStatus = Buffer.from([0x00]);

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, position, trackNum, trackStatus]);
    const block = wrapBlock(62, recordPayload);

    const records = parseCAT062(block);
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.trackNumber).toBe(1234);
    expect(rec.trackStatus.multiSensor).toBe(true);
    expect(rec.trackStatus.confirmed).toBe(true);
    expect(rec.trackStatus.coasting).toBe(false);
  });

  it('should parse mode-3/A code', () => {
    // FSPEC byte1: I062/010=1, skip, I062/070=1, I062/105=1, skip, skip, skip
    // FSPEC byte2: I062/060=1, skip, skip, skip, skip, skip, skip
    const fields = [
      true, false, true, true, false, false, false, // byte 1
      true, false, false, false, false, false, false, // byte 2
    ];
    const fspec = buildFspec(fields);

    const dataSourceId = Buffer.from([1, 1]);
    const todRaw = 200 * 128;
    const timeOfDay = Buffer.alloc(3);
    timeOfDay.writeUInt8((todRaw >> 16) & 0xFF, 0);
    timeOfDay.writeUInt8((todRaw >> 8) & 0xFF, 1);
    timeOfDay.writeUInt8(todRaw & 0xFF, 2);

    const latRaw = Math.round(32.5 * Math.pow(2, 25) / 180);
    const lonRaw = Math.round(35.5 * Math.pow(2, 25) / 180);
    const position = Buffer.alloc(8);
    position.writeInt32BE(latRaw, 0);
    position.writeInt32BE(lonRaw, 4);

    // I062/060: Mode-3/A = 0x0100 (octal 0100)
    const mode3A = Buffer.alloc(2);
    mode3A.writeUInt16BE(0x0100, 0);

    const recordPayload = Buffer.concat([fspec, dataSourceId, timeOfDay, position, mode3A]);
    const block = wrapBlock(62, recordPayload);

    const records = parseCAT062(block);
    expect(records).toHaveLength(1);
    expect(records[0]!.mode3A).toBe(0x0100);
  });

  it('should ignore non-CAT-062 blocks', () => {
    const payload = Buffer.from([0x00]);
    const block = wrapBlock(48, payload);
    const records = parseCAT062(block);
    expect(records).toHaveLength(0);
  });

  it('should return empty for record without position (I062/105)', () => {
    // Only I062/010 present
    const fspec = buildFspec([true, false, false, false, false, false, false]);
    const dataSourceId = Buffer.from([1, 2]);
    const recordPayload = Buffer.concat([fspec, dataSourceId]);
    const block = wrapBlock(62, recordPayload);
    const records = parseCAT062(block);
    expect(records).toHaveLength(0);
  });
});
