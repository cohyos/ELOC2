import { describe, it, expect } from 'vitest';
import { encodeCAT062Record, encodeAsterixBlock } from '../exporter.js';
import { parseCAT062, parseDataBlocks } from '../parser.js';
import type { SystemTrack } from '@eloc2/domain';
import type {
  SystemTrackId,
  SensorId,
  Timestamp,
} from '@eloc2/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<SystemTrack> = {}): SystemTrack {
  return {
    systemTrackId: 'T-42' as SystemTrackId,
    state: { lat: 32.0, lon: 34.8, alt: 10000 },
    velocity: { vx: 100, vy: -50, vz: 0 },
    covariance: [
      [0.001, 0, 0],
      [0, 0.001, 0],
      [0, 0, 100],
    ],
    confidence: 0.9,
    status: 'confirmed',
    lineage: [],
    lastUpdated: Date.UTC(2026, 2, 19, 12, 0, 0) as Timestamp, // noon UTC
    sources: ['radar-1' as SensorId, 'eo-2' as SensorId],
    eoInvestigationStatus: 'none',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// encodeCAT062Record
// ---------------------------------------------------------------------------

describe('encodeCAT062Record', () => {
  it('should produce a non-empty buffer', () => {
    const track = makeTrack();
    const buf = encodeCAT062Record(track);
    expect(buf.length).toBeGreaterThan(3); // At least FSPEC + some data
  });

  it('should start with FSPEC bytes', () => {
    const track = makeTrack();
    const buf = encodeCAT062Record(track);
    // First byte should have bit 7 set (I062/010 present)
    expect(buf.readUInt8(0) & 0x80).toBe(0x80);
  });

  it('should encode without velocity when velocity is undefined', () => {
    const track = makeTrack({ velocity: undefined });
    const bufNoVel = encodeCAT062Record(track);

    const trackWithVel = makeTrack();
    const bufWithVel = encodeCAT062Record(trackWithVel);

    // Record without velocity should be 4 bytes shorter (2x Int16)
    expect(bufWithVel.length - bufNoVel.length).toBe(4);
  });

  it('should encode tentative track status', () => {
    const track = makeTrack({ status: 'tentative' });
    const buf = encodeCAT062Record(track);
    // The buffer should contain track status byte with CNF=1 (bit 1)
    // We can't easily inspect the exact byte position without full parsing,
    // but we can verify it encodes without error
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// encodeAsterixBlock
// ---------------------------------------------------------------------------

describe('encodeAsterixBlock', () => {
  it('should produce a valid ASTERIX block header', () => {
    const record1 = Buffer.from([0x01, 0x02, 0x03]);
    const record2 = Buffer.from([0x04, 0x05]);
    const block = encodeAsterixBlock(62, [record1, record2]);

    // Category
    expect(block.readUInt8(0)).toBe(62);
    // Length = 3 (header) + 3 + 2 = 8
    expect(block.readUInt16BE(1)).toBe(8);
    // Total buffer size
    expect(block.length).toBe(8);
  });

  it('should handle empty record array', () => {
    const block = encodeAsterixBlock(48, []);
    expect(block.readUInt8(0)).toBe(48);
    expect(block.readUInt16BE(1)).toBe(3); // Just the header
    expect(block.length).toBe(3);
  });

  it('should be parseable by parseDataBlocks', () => {
    const record = Buffer.from([0xAA, 0xBB, 0xCC]);
    const block = encodeAsterixBlock(62, [record]);
    const parsed = parseDataBlocks(block);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.category).toBe(62);
    expect(parsed[0]!.payload).toEqual(record);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: encode SystemTrack → CAT-062 → parse back
// ---------------------------------------------------------------------------

describe('encode/decode roundtrip', () => {
  it('should roundtrip position through CAT-062 encode/decode', () => {
    const track = makeTrack({
      state: { lat: 32.0, lon: 34.8, alt: 10668 }, // ~FL350
    });

    const recordBuf = encodeCAT062Record(track, 8, 15);
    const block = encodeAsterixBlock(62, [recordBuf]);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(1);
    const rec = parsed[0]!;

    // SAC/SIC
    expect(rec.sac).toBe(8);
    expect(rec.sic).toBe(15);

    // Position should be close to original (within WGS-84 quantization error)
    // Resolution is 180/2^25 ~= 0.00000536 degrees ~= 0.6m
    expect(rec.position.lat).toBeCloseTo(32.0, 4);
    expect(rec.position.lon).toBeCloseTo(34.8, 4);
  });

  it('should roundtrip velocity through CAT-062 encode/decode', () => {
    const track = makeTrack({
      velocity: { vx: 150, vy: -75, vz: 0 },
    });

    const recordBuf = encodeCAT062Record(track);
    const block = encodeAsterixBlock(62, [recordBuf]);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(1);
    const rec = parsed[0]!;

    expect(rec.velocity).not.toBeNull();
    // Velocity resolution is 0.25 m/s
    expect(rec.velocity!.vx).toBeCloseTo(150, 0);
    expect(rec.velocity!.vy).toBeCloseTo(-75, 0);
  });

  it('should roundtrip track number', () => {
    const track = makeTrack({
      systemTrackId: 'T-999' as SystemTrackId,
    });

    const recordBuf = encodeCAT062Record(track);
    const block = encodeAsterixBlock(62, [recordBuf]);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.trackNumber).toBe(999);
  });

  it('should roundtrip track status for confirmed multi-sensor track', () => {
    const track = makeTrack({
      status: 'confirmed',
      sources: ['r1' as SensorId, 'e2' as SensorId],
    });

    const recordBuf = encodeCAT062Record(track);
    const block = encodeAsterixBlock(62, [recordBuf]);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.trackStatus.multiSensor).toBe(true);
    expect(parsed[0]!.trackStatus.confirmed).toBe(true);
  });

  it('should roundtrip track status for tentative mono-sensor track', () => {
    const track = makeTrack({
      status: 'tentative',
      sources: ['r1' as SensorId], // only one source
    });

    const recordBuf = encodeCAT062Record(track);
    const block = encodeAsterixBlock(62, [recordBuf]);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.trackStatus.multiSensor).toBe(false);
    expect(parsed[0]!.trackStatus.confirmed).toBe(false);
  });

  it('should roundtrip multiple tracks in a single block', () => {
    const track1 = makeTrack({
      systemTrackId: 'T-1' as SystemTrackId,
      state: { lat: 31.0, lon: 34.0, alt: 5000 },
    });
    const track2 = makeTrack({
      systemTrackId: 'T-2' as SystemTrackId,
      state: { lat: 33.0, lon: 36.0, alt: 8000 },
      velocity: undefined,
    });

    const records = [encodeCAT062Record(track1), encodeCAT062Record(track2)];
    const block = encodeAsterixBlock(62, records);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.position.lat).toBeCloseTo(31.0, 4);
    expect(parsed[1]!.position.lat).toBeCloseTo(33.0, 4);
  });

  it('should roundtrip flight level', () => {
    const track = makeTrack({
      state: { lat: 32.0, lon: 34.0, alt: 10668 }, // ~FL350
    });

    const recordBuf = encodeCAT062Record(track);
    const block = encodeAsterixBlock(62, [recordBuf]);
    const parsed = parseCAT062(block);

    expect(parsed).toHaveLength(1);
    // 10668m * (1/30.48) = ~350 FL, quantized to 1/4 FL
    expect(parsed[0]!.flightLevel).not.toBeNull();
    expect(parsed[0]!.flightLevel!).toBeCloseTo(350, 0);
  });
});
