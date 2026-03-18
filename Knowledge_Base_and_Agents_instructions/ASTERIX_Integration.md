# ASTERIX Integration Architecture

## Overview

The `@eloc2/asterix-adapter` package provides an adapter layer for ingesting real radar surveillance data in EUROCONTROL ASTERIX binary format. It supports two categories:

- **CAT-048** — Monoradar Target Reports (raw radar plots with range/azimuth)
- **CAT-062** — System Track Data (fused multi-sensor tracks from an SDPS)

The adapter converts incoming ASTERIX records into the standard `SourceObservation` type used by the ELOC2 fusion pipeline, allowing seamless integration of live radar feeds alongside the existing simulation engine.

## Data Flow

```
Real Radar / SDPS
      │
      ▼
  UDP Multicast
      │
      ▼
┌─────────────────────┐
│  AsterixListener    │  Binds UDP socket, receives datagrams
│  (udp-listener.ts)  │
└─────────┬───────────┘
          │ raw Buffer
          ▼
┌─────────────────────┐
│  parseCAT048/062    │  Parses ASTERIX binary frames into typed records
│  (parser.ts)        │
└─────────┬───────────┘
          │ Cat048Record / Cat062Record
          ▼
┌─────────────────────┐
│  cat048ToObservation │  Converts to SourceObservation
│  cat062ToObservation │  (polar→WGS84 for CAT-048, covariance assignment)
│  (adapter.ts)        │
└─────────┬───────────┘
          │ SourceObservation
          ▼
┌─────────────────────┐
│  AsterixAdapter     │  Top-level orchestrator with enable/disable gate
│  (asterix-adapter)  │
└─────────┬───────────┘
          │ onObservation callback
          ▼
┌─────────────────────┐
│  LiveEngine         │  Feeds into TrackManager.processObservation()
│  (live-engine.ts)   │  Standard fusion pipeline from here on
└─────────────────────┘
```

## Enabling ASTERIX Feed Ingestion

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASTERIX_ENABLED` | `false` | Master switch — set to `true` to activate |
| `ASTERIX_PORT` | `30001` | UDP port for incoming ASTERIX datagrams |
| `ASTERIX_MULTICAST_GROUP` | _(none)_ | Multicast group to join (e.g. `239.1.1.1`) |
| `ASTERIX_CATEGORY` | `48` | ASTERIX category: `48` or `62` |
| `ASTERIX_SENSOR_LAT` | `31.5` | Radar position latitude (WGS-84) |
| `ASTERIX_SENSOR_LON` | `34.8` | Radar position longitude (WGS-84) |
| `ASTERIX_SENSOR_ALT` | `100` | Radar position altitude (meters MSL) |

### Integration with LiveEngine

To wire the adapter into the API server, add the following to `live-engine.ts` (or a dedicated initialization module):

```typescript
import { AsterixAdapter } from '@eloc2/asterix-adapter';

const asterix = new AsterixAdapter({
  enabled: process.env.ASTERIX_ENABLED === 'true',
  port: parseInt(process.env.ASTERIX_PORT ?? '30001', 10),
  multicastGroup: process.env.ASTERIX_MULTICAST_GROUP,
  sensorPosition: {
    lat: parseFloat(process.env.ASTERIX_SENSOR_LAT ?? '31.5'),
    lon: parseFloat(process.env.ASTERIX_SENSOR_LON ?? '34.8'),
    alt: parseFloat(process.env.ASTERIX_SENSOR_ALT ?? '100'),
  },
  category: (parseInt(process.env.ASTERIX_CATEGORY ?? '48', 10) as 48 | 62),
});

asterix.onObservation((obs) => {
  // Feed into the existing fusion pipeline
  trackManager.processObservation(obs);
});

asterix.connect();
```

When `ASTERIX_ENABLED` is not `true`, the adapter's `connect()` is a no-op — zero overhead, no socket opened, no impact on the simulation-driven flow.

## Testing with Recorded ASTERIX Feeds

### Option 1: Replay a PCAP capture

If you have a PCAP file containing recorded ASTERIX traffic:

```bash
# Extract UDP payloads and replay to localhost
tcpreplay --intf1=lo --topspeed recorded-asterix.pcap

# Or use a purpose-built ASTERIX replay tool
asterix-replay --file recording.ast --dest 127.0.0.1:30001
```

### Option 2: Synthetic test datagrams

Create a simple Node.js script that sends crafted ASTERIX-format UDP datagrams:

```typescript
import { createSocket } from 'node:dgram';

const socket = createSocket('udp4');

// Minimal ASTERIX CAT-048 frame: [category=48, length=3, empty payload]
// (Will trigger the "not yet implemented" warning in the parser)
const frame = Buffer.from([48, 0, 3]);

socket.send(frame, 30001, '127.0.0.1', () => {
  console.log('Sent test ASTERIX frame');
  socket.close();
});
```

### Option 3: Unit tests

The parser and adapter functions can be tested directly without a UDP socket:

```typescript
import { cat048ToObservation } from '@eloc2/asterix-adapter';
import type { Cat048Record } from '@eloc2/asterix-adapter';

const record: Cat048Record = {
  sac: 1, sic: 2,
  measuredPosition: { rho: 50, theta: 45 },
  mode3A: 1234,
  flightLevel: 350,
  cartesianPosition: null,
  timeOfDay: 43200, // noon
  trackNumber: 42,
};

const obs = cat048ToObservation(record, { lat: 31.5, lon: 34.8, alt: 100 });
// obs is now a standard SourceObservation
```

## Binary Decoding Status

The parser module (`parser.ts`) currently provides:

- Correct ASTERIX data-block envelope parsing (category byte + 2-byte length)
- Complete TypeScript interfaces for CAT-048 and CAT-062 record fields
- Stub implementations that log warnings when real data is received

**TODO**: Implement full FSPEC-driven field decoding per the EUROCONTROL ASTERIX specifications. The key specs are:

- CAT-048: SUR.ET1.ST05.2000-STD-48-01
- CAT-062: SUR.ET1.ST05.2000-STD-62-01

Alternatively, consider integrating an existing ASTERIX decoding library (e.g., `node-asterix` or a C/Rust library via FFI) for production use.

## Package Structure

```
packages/asterix-adapter/
  src/
    index.ts              — Public exports
    parser.ts             — ASTERIX binary frame parsing (CAT-048/062)
    adapter.ts            — Record → SourceObservation conversion
    udp-listener.ts       — UDP socket listener with multicast support
    asterix-adapter.ts    — Top-level adapter class with enable/disable gate
  package.json
  tsconfig.json
```
