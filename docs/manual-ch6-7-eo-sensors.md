## 6. EO Sensor Operations

The ELOC2 system employs two complementary types of electro-optical sensors operating in the Mid-Wave Infrared (MWIR, 3-5 micrometer) band: staring panoramic sensors for continuous wide-area surveillance, and investigator sensors with narrow-FOV gimbals for cueing, identification, and high-precision tracking. Together, they form a layered detection and identification architecture that operates independently of radar or as a complement to it.

### 6.1 Staring Sensors

Staring sensors provide 360-degree panoramic MWIR detection using a fixed, non-gimballed configuration (slew rate = 0). Each staring sensor operates in point-source mode, detecting targets as unresolved IR blobs against the sky background.

**Detector Array and Optics**

The staring sensor uses a cooled Indium Antimonide (InSb) focal plane array with 1280 x 1024 pixels and a pixel pitch of 15 micrometers. The short focal length of 50 mm provides a wide instantaneous field of view (IFOV) of 0.3 mrad per pixel. The effective aperture diameter is 75 mm per sector. Full 360-degree azimuth coverage is achieved through four quadrant sectors (90 degrees each), with a vertical field of view of 20 degrees.

**Thermal Sensitivity**

The cooled InSb detector achieves a Noise Equivalent Temperature Difference (NETD) of 15 mK, representing high-end production-grade sensitivity. This low NETD enables detection of faint IR signatures at extended ranges, including low-RCS targets such as small UAVs and cruise missiles whose IR emission may be modest.

**Frame Rate and Integration**

The staring sensor operates at a 24 Hz frame rate with continuous frame integration. Because the sensor is fixed (no gimbal motion), all photons from a given direction accumulate coherently across frames. The frame-integrated bearing noise achieves approximately 0.014 degrees (one sigma), derived from the square root of 48 integration gain factor. This sub-pixel precision enables high-quality triangulation when bearings from multiple staring sensors are combined.

**Operational Characteristics**

- Detects all targets within coverage simultaneously (no scan latency)
- No mechanical wear or gimbal failure modes
- Continuous detection without gaps or scan revisit delays
- Point-source mode only; does not provide resolved imagery for identification
- Bearing-only measurement (no range from a single sensor)

### 6.2 Investigators

Investigator sensors are narrow-FOV gimbal-mounted MWIR sensors designed for target cueing, tracking, and identification. Each investigator operates in one of two modes, switching between them based on tasking commands and target availability.

**Search/Scan Mode (Wide FOV)**

In search mode, the investigator uses a 35 mm focal length lens providing a 10-degree horizontal FOV and 7.5-degree vertical FOV. The IFOV in this mode is 0.43 mrad per pixel. The sensor sweeps its assigned sector at the gimbal scan speed, scanning for targets that may not yet be detected by the staring network. The 640 x 480 pixel array with 15-micrometer pitch is paired with a 25 mK NETD detector (slightly less sensitive than the staring sensor due to the uncooled or smaller-aperture design).

**Cue/Track Mode (Narrow FOV)**

When a cue is received, the investigator switches to its zoom optics: a 1400 mm focal length lens providing a 0.4-degree horizontal FOV and 0.3-degree vertical FOV. This represents a 40x zoom ratio compared to the wide search mode. The IFOV narrows to 0.011 mrad per pixel, enabling the DRI (Detection, Recognition, Identification) classification pipeline to extract identification-quality imagery at the zoom level.

The gimbal slews to the cued target bearing at up to 60 degrees per second. Tracking accuracy in cue mode is 1 mrad absolute. Bearing noise with partial frame integration is approximately 0.029 degrees (one sigma), derived from the square root of 12 partial integration gain. While this bearing noise is higher than the staring sensor, the investigator provides resolved imagery and identification capability that staring sensors cannot.

**Gimbal Characteristics**

- Slew rate: 60 degrees per second maximum
- Tracking accuracy: 1 mrad absolute (both wide and narrow modes)
- Smooth pursuit tracking with predictive slew based on target trajectory

### 6.3 Search Mode

Search mode activates automatically on investigator sensors when no targets are present in the sensor's coverage area and no cue commands are pending.

**Activation Criteria**

Search mode engages after 3 seconds of idle time with no detected targets. At the system's 15 Hz tick rate, this corresponds to 45 consecutive ticks with no candidates and no active dwell assignments. The sensor transitions from idle to an active sector scan pattern.

**Scan Pattern**

In search mode, the investigator executes a sector scan pattern, sweeping back and forth across its assigned azimuth sector in the wide 10-degree FOV configuration. The scan direction reverses at the sector boundaries, providing continuous coverage of the assigned area.

**Deactivation**

Search mode deactivates immediately under any of the following conditions:

- A target is detected within the sensor's coverage area
- A cue command is received from the EO tasking engine
- An operator manually issues a "Cue EO" command from the track detail panel
- The sensor receives a direct operator override (lock command)

Upon deactivation, the sensor transitions to cue/track mode and slews toward the designated target.

### 6.4 Cue/Track Mode

Cue/track mode is the primary operational mode for investigator sensors when targets are present. It is triggered by either the automated EO tasking engine or by an operator's manual "Cue EO" command.

**Cue Reception and Slew**

When a cue is issued, the investigator receives the target bearing (and optionally an estimated range) from the tasking engine. The gimbal slews toward the target bearing at up to 60 degrees per second. During the slew, the sensor remains in wide FOV mode to maximize the probability of acquiring the target. Once the target is acquired, the sensor switches to narrow (zoom) FOV for detailed investigation.

**Dwell Management**

Each cue assignment includes a dwell time, defaulting to 15 seconds. During the dwell period, the investigator maintains track on the assigned target, continuously generating high-precision bearing measurements and identification-quality imagery. The DRI classification pipeline processes frames during the dwell to determine target type.

**After Dwell Expiration**

When the dwell timer expires, the sensor behavior depends on the current tactical situation:

1. If higher-priority targets are queued by the tasking engine, the sensor slews to the next priority target
2. If the same target remains the highest priority, the dwell may be extended or renewed
3. If no targets remain in coverage, the sensor enters search mode after the 3-second idle threshold

**Operator Override**

Operators can override automated tasking at any time:

- **Lock**: Forces the sensor to remain on a specific target indefinitely, ignoring tasking engine reassignments
- **Release**: Returns the sensor to automated tasking control
- **Priority boost**: Manually elevates a track's priority score, influencing the tasking engine's next assignment

### 6.5 EO Investigation Pipeline

The EO investigation pipeline is the end-to-end process by which raw IR detections are transformed into classified, geolocated system tracks. The pipeline operates in six stages:

**Stage 1: Detection**

Staring sensors detect IR point sources against the sky background. Detection is based on signal-to-noise ratio computed from target IR emission, atmospheric transmission (Beer-Lambert law through the standard atmosphere), sensor NETD, and pixel-level noise characteristics. Detection probability follows a sigmoid curve dependent on range and target IR signature.

**Stage 2: Bearing Generation**

Each detection produces a bearing measurement from the detecting sensor to the target. Staring sensors generate bearings with approximately 0.014-degree noise (frame-integrated), while investigators in cue mode generate bearings with approximately 0.029-degree noise (partial integration). Bearing measurements include timestamp, sensor ID, and confidence metadata.

**Stage 3: Cross-Sensor Matching**

The EO CORE entity aggregates bearing reports from all EO sensors and identifies which bearings correspond to the same physical target. Angular clustering algorithms group bearings that intersect within acceptable spatial tolerance, replacing simpler union-find approaches for improved performance in dense multi-target environments.

**Stage 4: Triangulation**

When two or more sensors provide bearings to the same target, geometric triangulation computes a position fix. The triangulation quality depends on the intersection angle between bearing rays: 90-degree intersections yield the highest accuracy, while near-parallel intersections produce large uncertainty ellipses. A quality score from 0 to 1 is assigned based on the intersection angle (0 degrees = 0, 45 degrees = 0.85, 90 degrees = 1.0).

**Stage 5: Track Formation**

Triangulated positions are fed into the track management system. New detections create tentative tracks. After 5 consecutive updates (approximately 333 ms at 15 Hz), a track is promoted to confirmed status. Tracks that receive no updates for 45 consecutive ticks (approximately 3 seconds) are dropped. The track manager maintains state, velocity estimates, and track history.

**Stage 6: DRI Classification**

When an investigator sensor dwells on a target in narrow FOV mode, the DRI classification pipeline analyzes the resolved imagery to determine target type. Classification categories include ballistic missile (BM), air-breathing threat (ABT), fighter aircraft, helicopter, civil aircraft, and military transport. Classification results are attached to the system track and displayed to the operator.

The investigator provides identification-quality imagery at its 40x zoom level, with an IFOV of 0.011 mrad enabling target feature extraction at operationally relevant ranges.

---

## 7. Sensor Specifications

This section provides the complete technical specifications for all sensor types employed in the ELOC2 system. Values are derived from the system's physics-based IR detection model and sensor profile definitions.

### 7.1 MWIR Staring Sensor

| Parameter | Value |
|-----------|-------|
| Designation | MWIR Staring Panoramic |
| Role | Staring (wide-area surveillance) |
| Array | 1280 x 1024 pixels |
| Spectral Band | 3-5 micrometers (MWIR) |
| Focal Length | 50 mm |
| Pixel Pitch | 15 micrometers |
| NETD | 15 mK (cooled InSb) |
| Aperture | 75 mm effective per sector |
| HFOV | 360 degrees (panoramic, 4 sectors of 90 degrees) |
| VFOV | 20 degrees |
| Frame Rate | 24 Hz |
| IFOV | 0.3 mrad (computed: 15 um / 50 mm x 1000) |
| Slew Rate | 0 (fixed staring, no gimbal) |
| Bearing Noise | 0.014 degrees (1 sigma, frame-integrated) |
| Integration Gain | Square root of 48 |
| Detection Mode | Point-source (unresolved IR blob) |

### 7.2 MWIR Investigator -- Wide (Search)

| Parameter | Value |
|-----------|-------|
| Designation | MWIR Investigator (Search Mode) |
| Role | Investigator (search/scan) |
| Array | 640 x 480 pixels |
| Spectral Band | 3-5 micrometers (MWIR) |
| Focal Length | 35 mm |
| Pixel Pitch | 15 micrometers |
| NETD | 25 mK |
| HFOV | 10 degrees |
| VFOV | 7.5 degrees |
| IFOV | 0.43 mrad (computed: 15 um / 35 mm x 1000) |
| Slew Rate | 60 degrees/sec |
| Tracking Accuracy | 1 mrad absolute |
| Detection Mode | Search sweep across assigned sector |

### 7.3 MWIR Investigator -- Narrow (Zoom/Cue)

| Parameter | Value |
|-----------|-------|
| Designation | MWIR Investigator (Cue/Track Mode) |
| Role | Investigator (identification/tracking) |
| Array | 640 x 480 pixels |
| Spectral Band | 3-5 micrometers (MWIR) |
| Focal Length | 1400 mm |
| Pixel Pitch | 15 micrometers |
| NETD | 25 mK |
| HFOV | 0.4 degrees |
| VFOV | 0.3 degrees |
| IFOV | 0.011 mrad (computed: 15 um / 1400 mm x 1000) |
| Zoom Ratio | 40x (relative to wide mode: 1400 mm / 35 mm) |
| Slew Rate | 60 degrees/sec |
| Tracking Accuracy | 1 mrad absolute |
| Bearing Noise | 0.029 degrees (1 sigma, partial integration) |
| Integration Gain | Square root of 12 |
| Detection Mode | Resolved imagery, DRI classification pipeline |
| Dwell Time | 15 seconds (default, operator-configurable) |

### 7.4 Green Pine Radar (Reference)

The EL/M-2080 Green Pine radar serves as the reference radar sensor in ELOC2 scenarios, providing comparison data against the EO-only pipeline.

| Parameter | Value |
|-----------|-------|
| Designation | EL/M-2080 Green Pine |
| Type | Phased array, S-band |
| Range | 500 km |
| Azimuth Coverage | 120 degrees (mechanical rotation for 360-degree capability) |
| Elevation Coverage | 0-90 degrees |
| Position Accuracy | Approximately 20 m (integrated track) |
| Scan Rate | 6 Hz |
| Detection Probability | Sigmoid function, RCS-dependent via R-fourth-power radar equation |
| Modes | Search, Track, Ballistic Detection |
| Associated System | Arrow weapon system |
| Measurement Type | Range, azimuth, elevation (full 3D position) |

### 7.5 Atmospheric Conditions Reference

Detection range for all EO sensors varies with atmospheric conditions. The system models four standard atmosphere profiles:

| Condition | Visibility | Humidity | Temperature | Effect on EO Range |
|-----------|-----------|----------|-------------|-------------------|
| Standard (MIL-STD-2161) | 23 km | 50% | 15 C | Baseline |
| Good Weather | 40 km | 30% | 20 C | Extended range |
| Hazy | 8 km | 70% | 25 C | Reduced range |
| Rain | 3 km | 95% | 18 C | Significantly reduced range |

Atmospheric transmission is computed using the Beer-Lambert law with slant-path correction through an exponential atmosphere model. The transmission factor accounts for the altitude-dependent extinction coefficient along the sensor-to-target slant path, with analytical integration for non-horizontal geometries.
