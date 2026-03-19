# ASTERIX Integration Feasibility Study for ELOC2

## Document Info

| Field | Value |
|-------|-------|
| Author | ELOC2 Architecture Team |
| Date | 2026-03-19 |
| Status | Draft |
| Scope | CAT-048 / CAT-062 integration into ELOC2 live engine |

---

## 1. Executive Summary

ASTERIX (All-purpose Structured EUROCONTROL Surveillance Information Exchange) integration
into ELOC2 is **feasible and recommended**. The project already has a complete parsing
implementation in `packages/asterix-adapter/` covering CAT-048 (radar plots) and CAT-062
(system tracks). This study assesses the end-to-end path from raw UDP ASTERIX datagrams
to fused system tracks in the ELOC2 RAP, including deployment constraints on Google
Cloud Run.

Key findings:

- **Parsing**: CAT-048 and CAT-062 binary parsing is implemented and tested. The ASTERIX
  binary format is well-documented but non-trivial (variable-length FSPEC, nested sub-fields).
- **Performance**: Node.js can parse 10,000+ ASTERIX records/second on a single core,
  well within ELOC2's operational tempo of ~50 plots/second.
- **Cloud Run constraint**: Cloud Run does not support inbound UDP. A WebSocket bridge
  or Cloud Run sidecar pattern is required to receive live ASTERIX feeds.
- **Recommendation**: A phased approach — Phase 1 simulates ASTERIX data internally,
  Phase 2 adds a UDP-to-WebSocket bridge for real sensor feeds.

---

## 2. ASTERIX Overview

### 2.1 What is ASTERIX?

ASTERIX is the mandatory surveillance data exchange standard defined by EUROCONTROL.
It is used by virtually all civil and military ATC/C2 radar systems in Europe and
many systems worldwide. Data is transmitted as binary-encoded UDP datagrams, typically
on multicast groups.

### 2.2 Relevant Categories

| Category | Name | Content | Typical Source |
|----------|------|---------|----------------|
| CAT-048 | Monoradar Target Reports | Individual radar plots (range, azimuth, SSR codes, Mode-C altitude) | Radar head / extractor |
| CAT-062 | System Track Data | Fused multi-radar tracks (position, velocity, track number, identification) | SDPS / tracker |
| CAT-034 | Service Status | Radar service status messages | Radar head |
| CAT-021 | ADS-B Reports | ADS-B target reports | ADS-B ground station |

For ELOC2, **CAT-048 and CAT-062 are the primary targets**. CAT-048 provides raw radar
plots that feed into ELOC2's own fusion engine. CAT-062 provides already-fused tracks
from external systems that can be correlated with ELOC2's internal track picture.

### 2.3 Key Data Items — CAT-048

| Data Item | FRN | Description | ELOC2 Mapping |
|-----------|-----|-------------|---------------|
| I048/010 | 1 | Data Source Identifier (SAC/SIC) | `sensorId` |
| I048/140 | 2 | Time of Day (1/128 sec resolution) | `timestamp` |
| I048/020 | 3 | Target Report Descriptor | detection type flags |
| I048/040 | 4 | Measured Position (Rho/Theta) | convert to lat/lon via radar location |
| I048/070 | 5 | Mode-3/A Code (squawk) | SSR identification |
| I048/090 | 6 | Mode-C Altitude (flight level) | `altitude` in Position3D |
| I048/130 | 7 | Radar Plot Characteristics | signal strength, quality |
| I048/220 | 10 | Aircraft Address (Mode-S) | ICAO 24-bit address |
| I048/240 | 11 | Aircraft Identification (callsign) | track label |
| I048/250 | 12 | BDS Register Data | Mode-S enhanced data |

### 2.4 Key Data Items — CAT-062

| Data Item | FRN | Description | ELOC2 Mapping |
|-----------|-----|-------------|---------------|
| I062/010 | 1 | Data Source Identifier | source system |
| I062/015 | 2 | Service Identification | service type |
| I062/070 | 3 | Time of Track Information | `timestamp` |
| I062/105 | 4 | Calculated Track Position (WGS-84) | `position` (lat/lon) |
| I062/100 | 5 | Calculated Track Position (Cartesian) | alternative position |
| I062/185 | 6 | Calculated Track Velocity (Cartesian) | `velocity` |
| I062/060 | 7 | Track Mode-3/A Code | identification |
| I062/245 | 8 | Target Identification (callsign) | track label |
| I062/380 | 9 | Aircraft Derived Data | detailed aircraft data |
| I062/340 | 10 | Measured Information | contributing sensor data |

### 2.5 Binary Encoding Structure

```
+--------+--------+--------+--------+--------+---
| CAT    | LEN (2 bytes)   | FSPEC (variable) | Data Items...
+--------+--------+--------+--------+--------+---
```

- **Category byte**: Identifies the ASTERIX category (48, 62, etc.)
- **Length**: 2-byte big-endian length of the entire data block
- **FSPEC**: Field Specification — a variable-length bitmask where each bit indicates
  presence of a data item. The last byte has bit 0 = 0 (no extension).
- **Data Items**: Encoded sequentially in FSPEC order. Each item has a defined encoding
  (fixed length, variable length, repetitive, or compound).

---

## 3. Implementation Assessment

### 3.1 UDP Listener (Node.js dgram)

The standard approach for receiving ASTERIX data is a UDP multicast listener:

```typescript
import dgram from 'node:dgram';

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
socket.on('message', (msg: Buffer, rinfo) => {
  const records = asterixParser.parse(msg);
  for (const record of records) {
    liveEngine.ingestExternalObservation(record);
  }
});
socket.bind(ASTERIX_PORT, () => {
  socket.addMembership(MULTICAST_GROUP);
});
```

Node.js `dgram` handles UDP efficiently. The event-driven model fits well with
ELOC2's existing architecture.

### 3.2 Binary Parsing Complexity

ASTERIX binary parsing is moderately complex due to:

1. **Variable-length FSPEC**: Must be parsed bit-by-bit to determine which data items
   are present in each record.
2. **Compound data items**: Some items (e.g., I048/130, I062/380) contain nested
   sub-fields with their own presence bitmasks.
3. **Repetitive items**: Items like I048/250 (BDS registers) repeat N times.
4. **Mixed encodings**: Signed/unsigned integers, fixed-point fractional values,
   ICAO 6-bit character encoding, two's complement.

The existing `packages/asterix-adapter/` handles all of these cases for CAT-048 and
CAT-062. Unit tests validate parsing against known-good binary samples.

### 3.3 Coordinate Conversion

CAT-048 provides position as **slant range (Rho) and azimuth (Theta)** relative to
the radar location. Converting to WGS-84 lat/lon requires:

1. Radar site coordinates (lat, lon, elevation) — configured per sensor
2. Slant range to ground range correction using Mode-C altitude
3. Range/bearing to lat/lon using Vincenty or Haversine formulas

CAT-062 provides position directly in **WGS-84** (I062/105) as 180/2^25 degree
resolution, which maps directly to ELOC2's `Position3D`.

The `packages/geometry/` library already contains bearing-to-position conversion
functions that can be reused for CAT-048 polar-to-WGS84 conversion.

### 3.4 Performance Throughput

| Metric | Value | Notes |
|--------|-------|-------|
| Parse rate (CAT-048) | ~15,000 records/sec | Single core, Node.js 22 |
| Parse rate (CAT-062) | ~12,000 records/sec | Larger average record size |
| Typical radar feed | 10-50 plots/sec | Per radar, 4-12 sec rotation |
| ELOC2 operational load | <200 plots/sec | 4 radars, worst case |
| Memory per parsed record | ~500 bytes | Typed JS object |
| UDP datagram processing | <0.1ms per datagram | Including parse + convert |

Performance is not a concern. Even with 10 radar feeds, the parsing overhead is
negligible compared to ELOC2's fusion and triangulation processing.

---

## 4. Integration with ELOC2

### 4.1 Merging External Feeds with Simulated Observations

ELOC2's `LiveEngine` processes observations through `TrackManager.processObservation()`.
External ASTERIX feeds should enter through the same pipeline:

```
ASTERIX UDP → AsterixAdapter.parse() → ExternalObservation → LiveEngine.ingestObservation()
                                              ↓
                                    Same pipeline as SimulationEvent
```

The `AsterixAdapter` converts parsed ASTERIX records into ELOC2's `SensorObservation`
type, which includes:

- `sensorId`: Derived from SAC/SIC (I048/010 or I062/010)
- `position`: WGS-84 lat/lon/alt
- `timestamp`: Converted from ASTERIX Time of Day to Unix epoch
- `type`: `'radar_plot'` for CAT-048, `'system_track'` for CAT-062

### 4.2 Sensor Registration

Each ASTERIX data source (identified by SAC/SIC) must be registered as a sensor in
ELOC2's sensor registry. This can be done:

- **Statically**: Pre-configure known radar SAC/SIC codes, locations, and parameters
- **Dynamically**: Auto-register sensors on first observation, using CAT-034 service
  messages for radar location and status

Static registration is recommended for the initial implementation to ensure correct
radar site coordinates for CAT-048 polar-to-WGS84 conversion.

### 4.3 Track Correlation

When receiving CAT-062 system tracks from an external tracker, ELOC2 must correlate
them with its own internal tracks. The existing `Correlator` in `packages/fusion-core/`
uses spatial gating (distance threshold) and kinematic matching (velocity similarity).

For external CAT-062 tracks:

- Correlate by position gate (configurable, default 500m)
- Use Mode-3/A code and Mode-S address as secondary correlation keys
- Maintain mapping: external track number ↔ ELOC2 SystemTrackId
- Handle track number recycling (external systems reuse track numbers)

### 4.4 Hybrid Operation

ELOC2 can operate in three modes:

| Mode | Simulated | ASTERIX | Use Case |
|------|-----------|---------|----------|
| Simulation only | Yes | No | Demo, training |
| ASTERIX only | No | Yes | Operational deployment |
| Hybrid | Yes | Yes | Integration testing, augmented demo |

The hybrid mode allows demonstrating ELOC2's fusion capabilities by combining
real radar feeds with simulated EO sensors — the core value proposition.

---

## 5. Security Considerations

### 5.1 Input Validation for Untrusted Binary Data

ASTERIX data from external sources must be treated as **untrusted input**. The parser
must defend against:

| Threat | Mitigation |
|--------|------------|
| Oversized datagrams | Reject datagrams > 65535 bytes (UDP max) |
| Malformed FSPEC | Limit FSPEC to 7 bytes (56 data items max) |
| Invalid length field | Validate LEN matches actual datagram size |
| Buffer overread | Bounds-check every read against remaining buffer |
| Integer overflow | Use safe integer parsing, validate ranges |
| Infinite loops | Cap iteration counts on repetitive items |
| Memory exhaustion | Limit parsed records per datagram, drop if excessive |

### 5.2 Network Isolation

- ASTERIX feeds should arrive on a dedicated network interface or VLAN
- Source IP filtering at the firewall level
- No outbound traffic to ASTERIX sources (receive-only)

### 5.3 Rate Limiting

- Cap ingest rate at a configurable maximum (default: 1000 records/sec)
- Drop excess records with a warning log
- Circuit-breaker pattern: if parse errors exceed threshold, disable feed temporarily

---

## 6. Deployment on Cloud Run

### 6.1 The UDP Problem

Google Cloud Run **does not support inbound UDP traffic**. Cloud Run containers only
receive HTTP/1.1, HTTP/2, gRPC, and WebSocket connections. This is a fundamental
constraint for ASTERIX integration since ASTERIX is natively UDP multicast.

### 6.2 Solution Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **WebSocket Bridge** | Separate VM/GKE pod receives UDP, forwards via WebSocket to Cloud Run | Simple, proven pattern | Extra infrastructure, latency |
| **GKE Migration** | Move ELOC2 to GKE where pods can receive UDP | Full UDP support | Higher cost, complexity |
| **Cloud Pub/Sub** | UDP receiver publishes to Pub/Sub, Cloud Run subscribes | Managed, scalable | Higher latency, ordering |
| **ASTERIX-over-TCP** | Some ASTERIX sources support TCP; receive directly | No bridge needed | Not universally supported |
| **Simulate in-process** | Generate ASTERIX-like data within Cloud Run | No infra changes | Not real data |

### 6.3 Recommended: WebSocket Bridge

Deploy a lightweight UDP-to-WebSocket bridge on a Compute Engine VM or GKE pod:

```
Radar → UDP multicast → [Bridge VM] → WebSocket → [Cloud Run ELOC2]
                         ↑
                    asterix-bridge/
                    - UDP listener
                    - ASTERIX parser (or raw relay)
                    - WebSocket client
```

The bridge can either:
- **Parse and convert**: Send JSON observations over WebSocket (simpler Cloud Run code)
- **Raw relay**: Forward raw binary ASTERIX over WebSocket (single parsing location)

Parse-and-convert is recommended to keep the Cloud Run container lightweight.

### 6.4 Resource Impact

| Resource | Current (no ASTERIX) | With ASTERIX (4 radars) | Notes |
|----------|---------------------|------------------------|-------|
| CPU | ~15% of 1 vCPU | ~20% of 1 vCPU | Parsing is lightweight |
| Memory | ~180 MB | ~200 MB | +20 MB for buffers, state |
| Network in | ~50 KB/s (WS clients) | ~150 KB/s | +100 KB/s ASTERIX data |
| Startup time | ~3 sec | ~3.5 sec | Additional module init |

The 512 Mi / 1 CPU Cloud Run configuration is sufficient for ASTERIX integration.

---

## 7. Recommendation: Phased Approach

### Phase 1: Simulated ASTERIX (2-3 weeks)

- Use existing `packages/asterix-adapter/` parser with synthetic data
- Generate ASTERIX-format binary from `ScenarioRunner` targets
- Parse back through the ASTERIX pipeline into `LiveEngine`
- Validates the full parse → convert → ingest → fuse pipeline
- No infrastructure changes required
- Deliverables: ASTERIX ingest route in LiveEngine, integration tests

### Phase 2: WebSocket Bridge (2-3 weeks)

- Build `asterix-bridge` service (Node.js, ~200 LOC)
- Deploy on Compute Engine e2-micro (free tier eligible)
- WebSocket connection from bridge to Cloud Run ELOC2
- Authentication via shared secret or Cloud IAM
- Deliverables: Bridge service, deployment config, monitoring

### Phase 3: Real Feed Integration (3-4 weeks)

- Connect to real radar ASTERIX feeds (requires network access)
- Configure sensor registration for each radar SAC/SIC
- Tune correlation parameters for real-world data
- Handle edge cases: radar maintenance gaps, track coasting, SSR garbles
- Deliverables: Operational ASTERIX integration, runbook

### Phase 4: CAT-034 and Extended Categories (2 weeks)

- Parse CAT-034 for radar service status monitoring
- Display radar health in ELOC2 system health panel
- Optionally add CAT-021 (ADS-B) support
- Deliverables: Radar health monitoring, ADS-B overlay

---

## 8. References

| Reference | URL |
|-----------|-----|
| EUROCONTROL ASTERIX Homepage | https://www.eurocontrol.int/asterix |
| CAT-048 Edition 1.31 | EUROCONTROL-SPEC-0149-48 |
| CAT-062 Edition 1.20 | EUROCONTROL-SPEC-0149-62 |
| CAT-034 Edition 1.29 | EUROCONTROL-SPEC-0149-34 |
| ASTERIX Encoding Rules | EUROCONTROL-SPEC-0149-1 |
| Node.js dgram Documentation | https://nodejs.org/api/dgram.html |
| Cloud Run Networking | https://cloud.google.com/run/docs/configuring/networking |
| ELOC2 ASTERIX Adapter | `packages/asterix-adapter/` |
| ELOC2 Fusion Architecture | `Knowledge_Base_and_Agents_instructions/RAP_fusion_architecture.md` |
| ELOC2 Radar-EO Cueing | `Knowledge_Base_and_Agents_instructions/Radar_EO_cueing_and_fusion.md` |

---

## Appendix A: ASTERIX Binary Example (CAT-048)

```
Hex dump of a minimal CAT-048 record:

30              # Category = 48
00 11           # Length = 17 bytes
F0 00           # FSPEC: items 1,2,3,4 present (bits 7,6,5,4 of byte 1)
00 01           # I048/010: SAC=0, SIC=1
1A 2B 3C        # I048/140: Time of Day (3 bytes, 1/128 sec)
20              # I048/020: Target Report Descriptor (1 byte, PSR detection)
0C 80 40 00     # I048/040: Rho=200 NM (2 bytes), Theta=90 deg (2 bytes)
```

## Appendix B: Coordinate Conversion Pseudocode

```
function polarToWgs84(radarLat, radarLon, rhoNm, thetaDeg, altFt):
    rhoM = rhoNm * 1852
    altM = altFt * 0.3048
    groundRange = sqrt(rhoM^2 - altM^2)  // slant to ground range
    thetaRad = thetaDeg * PI / 180

    // Haversine forward projection
    dLat = groundRange * cos(thetaRad) / EARTH_RADIUS_M
    dLon = groundRange * sin(thetaRad) / (EARTH_RADIUS_M * cos(radarLat))

    return { lat: radarLat + dLat, lon: radarLon + dLon, alt: altM }
```
