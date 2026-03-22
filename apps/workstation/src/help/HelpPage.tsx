import React, { useState } from 'react';

const sections = [
  { id: 'overview', title: 'System Overview' },
  { id: 'architecture', title: 'Architecture' },
  { id: 'algorithms', title: 'Algorithmic Reference' },
  { id: 'eo-management', title: 'EO Management' },
  { id: 'fusion', title: 'Fusion & Correlation' },
  { id: 'zones', title: 'Operational Zones' },
  { id: 'demo-guide', title: 'Demo Guide' },
  { id: 'roles', title: 'Roles & Permissions' },
  { id: 'reports', title: 'Reports' },
  { id: 'user-management', title: 'User Management' },
  { id: 'keyboard', title: 'Keyboard Shortcuts' },
  { id: 'glossary', title: 'Glossary' },
] as const;

type SectionId = typeof sections[number]['id'];

const sectionContent: Record<SectionId, string> = {
  overview: `# ELOC2 System Overview

ELOC2 is an Electro-Optical Command & Control (C2) Air Defense Demonstrator. It demonstrates how EO sensor management enhances a traditional radar-based air defense picture.

## Core Concept
The system receives radar observations from multiple sensors, fuses them into a unified air picture (Recognized Air Picture — RAP), and then manages EO sensors to:
- Confirm radar tracks with visual identification
- Provide triangulation-based position refinement using multiple EO bearings
- Classify targets (aircraft, drone, helicopter, missile)
- Maintain track quality through continuous EO observation

## Key Components
- **C4ISR Display**: The main workstation showing the fused air picture on a map
- **Fusion Engine**: Correlates and fuses observations from multiple sensors into system tracks
- **EO Management Module**: Manages EO sensor tasking, dwell time, and pipeline selection
- **Triangulation Engine**: Computes 3D positions from multiple EO bearing measurements
- **Quality Assessor**: Evaluates track quality and EO allocation effectiveness
- **Deployment Planner**: Optimizes sensor placement for maximum coverage

## Data Flow
1. Sensors (radar, EO) generate observations
2. Observations are correlated against existing tracks (Mahalanobis distance)
3. Matched observations are fused using information-matrix fusion
4. New observations create tentative tracks (confirmed after 3 updates)
5. EO sensors are tasked to investigate high-priority tracks
6. EO bearings enable triangulation for position refinement
7. Results are broadcast via WebSocket to the workstation`,

  architecture: `# Architecture

## Monorepo Structure
- **apps/api**: Fastify backend server, WebSocket events, live simulation engine
- **apps/workstation**: React 19 frontend with MapLibre GL JS map
- **apps/simulator**: ScenarioRunner generates synthetic radar/EO observations
- **packages/fusion-core**: TrackManager, correlator, information-matrix fuser
- **packages/geometry**: Bearing math, triangulator, quality scorer
- **packages/eo-management**: Modular EO module with sub-pixel/image pipelines
- **packages/deployment-planner**: Sensor deployment optimization
- **packages/domain**: Shared types (SystemTrack, SensorState, Position3D, etc.)
- **packages/asterix-adapter**: ASTERIX CAT-048/062 real radar feed adapter

## Communication
- **WebSocket**: Backend pushes RAP updates (tracks, sensors, geometry) to frontend
- **REST API**: Frontend sends commands (start, pause, reset, inject, report)
- **Event Store**: All state changes recorded as typed event envelopes

## Rendering
The workstation uses a dual rendering architecture:
- **MapLibre GL JS**: Provides base map tiles (CartoDB Dark Matter)
- **DebugOverlay (HTML/SVG)**: Renders all data layers (tracks, sensors, coverage, geometry)
  - SVG layer (z-index 14): Coverage arcs, EO rays, triangulation lines, corridors
  - HTML layer (z-index 15): Track circles, sensor squares, labels, trail dots

## Simulation Engine
The LiveEngine runs at 1-second ticks, scaled by playback speed:
1. ScenarioRunner.step() generates SimulationEvent[] (observations, bearings, faults)
2. Observations are batch-processed through TrackManager (spatial clustering)
3. Post-tick merge sweep eliminates duplicate tracks
4. EO tasking cycle runs every 5 seconds
5. State is broadcast via WebSocket as rap.update messages`,

  algorithms: `# Algorithmic Reference

## Correlation Algorithm
**Method**: Mahalanobis distance in local ENU (East-North-Up) frame
**Gate threshold**: 16.27 (chi-squared, 3 DOF, 99.9% confidence)
**Process**:
1. Convert track and observation positions to ENU coordinates
2. Compute combined covariance: C_combined = C_track + C_observation
3. Invert combined covariance
4. Compute Mahalanobis distance: d² = dx' * C_inv * dx
5. If d² <= gate threshold → associate with nearest track
6. Otherwise → create new track

## Information-Matrix Fusion
**Method**: Covariance intersection with information matrix
**Modes**:
- **Centralized**: Full fusion when registration is healthy
- **Conservative**: Reduced weight when registration is degraded
- **Confirmation-only**: No position update when sensor is registration-unsafe

## EO Triangulation
**Method**: Multi-bearing intersection using weighted least squares
1. Collect bearing measurements from 2+ EO sensors
2. Convert bearings to unit vectors in ENU frame
3. Set up overdetermined system: each bearing defines a plane
4. Solve using least squares for 3D intersection point
5. Score quality based on:
   - Number of bearings (more = better)
   - Angular diversity (wider baselines = more accurate)
   - Bearing measurement age (newer = more reliable)

## EO Pipeline Selection
**Criterion**: Angular size vs sensor IFOV (Instantaneous Field of View)
- angular_size < IFOV → **Sub-pixel pipeline** (point source detection, bearing + intensity)
- angular_size >= IFOV → **Image pipeline** (resolved target, size estimate, classification)
- Angular size = target_physical_size / range_to_target

## EO Scan Pattern
**Azimuth + Elevation grid sweep**:
- Sweep azimuth from min to max at configurable speed (default 5°/sec)
- On each azimuth sweep completion, step elevation (default 5° steps)
- Elevation bounces between min and max (sawtooth pattern)
- Scan activates after 3 ticks of sensor idle time

## Track Lifecycle
- **Tentative**: New track, created from first observation (confidence 0.3)
- **Confirmed**: After 3 consistent updates (confidence increases with each)
- **Dropped**: After 5 consecutive missed updates

## Deployment Optimization
- Grid-based placement with configurable resolution
- Scoring combines: coverage area, geometry quality, threat proximity
- EO-specific scorers: field-of-regard overlap, triangulation baseline quality
- Constraint-based: exclusion zones, minimum/maximum spacing`,

  'eo-management': `# EO Management

## EO Management Module (REQ-16)
The EoManagementModule encapsulates all EO-related processing:

### Track Ingestion
- Filters incoming system tracks by confidence (min 0.1) and status
- Excludes dropped tracks
- Prioritizes tracks needing EO investigation

### Pipeline Selection
The Mode Controller decides which processing pipeline to use:
- **Sub-pixel pipeline**: For unresolved point targets
  - Measures bearing angle and signal intensity
  - Provides angular position only (no size/shape)
  - Used when target subtends < IFOV (0.3 mrad)
- **Image pipeline**: For resolved targets
  - Measures target extent (pixels × IFOV)
  - Enables shape-based classification
  - Provides size estimate and silhouette
  - Used when target subtends >= IFOV

### Dwell Management
- Each EO sensor has a configurable dwell time per target
- Default dwell: 15 seconds
- Operator can override dwell duration per sensor
- After dwell expires, sensor moves to next priority target

### Search Mode
- Activates when sensor has no assigned target for 3+ ticks
- Performs azimuth + elevation grid sweep
- Configurable scan speed, elevation step size
- Deactivates immediately when a target is assigned

### Operator Controls
- **Lock sensor**: Prevents automatic re-tasking
- **Release sensor**: Returns to automatic tasking
- **Set priority**: Boost/reduce EO tasking score for a track
- **Classify**: Manually set target classification
- **Set dwell**: Override dwell duration for a sensor

### Convergence Monitoring
- Tracks position error estimates over time
- Convergence rate = improvement per measurement
- Track marked "converged" when rate > 50% and error < threshold`,

  fusion: `# Fusion & Correlation

## Multi-Sensor Fusion Architecture
ELOC2 fuses observations from multiple sensor types:

### Radar-to-Radar Fusion
- Multiple radar observations of the same target are correlated by spatial proximity
- Batch processing at each tick prevents ghost tracks
- Observations within 5km are clustered into the same track candidate
- Post-tick merge sweep eliminates residual duplicates (3km threshold)

### Radar-to-EO Fusion
- EO bearings are associated with radar-generated tracks
- Triangulation from 2+ EO sensors refines radar position estimates
- EO classification enriches the fused track

### EO-to-EO Fusion (Triangulation)
- When no radar coverage exists, 2+ EO bearings can establish a track
- Bearing intersection computed using weighted least squares
- Quality score based on angular diversity and baseline distance
- Results in "candidate_3d" geometry status (vs "confirmed_3d" with radar support)

### Fusion Mode Selection
Based on sensor registration health:
- **Centralized**: Full information-matrix fusion (registration healthy)
- **Conservative**: Reduced fusion weight (registration degraded)
- **Confirmation-only**: Position preserved, only confidence updated (registration unsafe)

### Registration Health
Monitors sensor alignment quality:
- Azimuth bias estimation from overlapping observations
- Clock drift detection
- Spatial and timing quality grades: 'nominal', 'degraded'
- fusionSafe flag gates fusion mode selection`,

  zones: `# Operational Zones

Operational zones define tactical areas on the map that affect sensor deployment and provide visual context during operations. All 4 zone types can be drawn and named in the Editor → Zones tab.

## Zone Types

### Threat Corridor (Red)
**System Effect**: The deployment optimizer gives 20% additional weight to sensor placements that cover threat corridors. This steers the optimizer toward maximizing coverage in expected threat approach paths. Rendered with a red dashed outline.

### Exclusion Zone (Red, double-dash)
**System Effect**: Hard constraint in the deployment optimizer — sensors CANNOT be placed inside exclusion zones. Use for no-go areas, civilian zones, or terrain that prevents sensor placement. Rendered with a red double-dashed outline.

### Engagement Zone (Green)
**System Effect**: Visual reference only. Marks the primary engagement area where targets are expected to be intercepted. No algorithmic effect on fusion, tasking, or deployment. Rendered with a green dashed outline.

### Safe Passage (Blue)
**System Effect**: Visual reference only. Marks safe transit corridors for friendly forces. No algorithmic effect. Rendered with a blue dashed outline.

## Drawing Zones
1. Open the Editor and select the **Zones** tab in the right panel
2. Click one of the zone type buttons (Threat, Exclusion, Engagement, Safe Passage)
3. Click on the map to place polygon vertices (minimum 3 required)
4. Click **Finish** to complete the zone polygon
5. The zone appears in the list with an auto-generated name — click to edit the name
6. Press **ESC** to cancel drawing at any time

## Zone Labels
Zone names are displayed at the center of each zone polygon on the map, colored to match the zone type. Edit names in the Zones tab panel.

## Zones in Deployment
When you switch to the **Deploy** tab, all zones from the editor are visible on the deployment map. The optimizer uses threat corridors and exclusion zones as constraints; engagement and safe passage zones are displayed but do not affect optimization.

## Saving & Loading
Zones are included in scenario export/import (JSON). When you save or load a scenario, all zones are preserved with their names, types, and vertices.`,

  'demo-guide': `# Demo Guide

## Starting a Demo

### 1. Select Scenario
Choose from the scenario dropdown in the header:
- **Central Israel Defense Sector**: Full-complexity (6 sensors, 8 targets, faults)
- **Fusion Demo**: Demonstrates all fusion types (radar-radar, radar-EO, EO-only, formation)

### 2. Select Role
- If authentication is disabled, select **Instructor** from the role dropdown in the header
- Only Instructors can start, pause, and control the simulation
- See the **Roles & Permissions** section for details

### 3. Start Simulation
- Click **Start** in the instructor toolbar zone or press **Space**
- The simulation does NOT auto-start on connect -- it stays idle until an instructor clicks Start
- Adjust speed: 1x (real-time), 2x, 5x, 10x

### 4. Key Things to Watch
- **Track creation**: Yellow (tentative) circles appear as sensors detect targets
- **Track confirmation**: Circles turn green after 3 consistent updates
- **EO tasking**: Orange lines show EO sensor gimbals pointing at targets
- **Triangulation**: Green/yellow lines show bearing intersections
- **Uncertainty ellipses**: Toggle in layer panel to see track accuracy

### 5. Interactive Features
- **Click a track**: See details, fusion lineage, action buttons in right panel
- **Click a ground truth target**: See true position vs tracked position
- **Inject a target**: Use injection toolbar (enable via Inject button in header)
- **Generate report**: Click Report button to open the report modal, select type and time range, then download as PDF (see Reports section)

### 6. Demo Mode (Ctrl+D)
- Enables narration panel and annotations
- Guided tour through system capabilities
- Audience presets: military, technical, mixed

## Talking Points

### EO Value Proposition
"The EO system provides three key enhancements to the radar picture:
1. **Classification**: Visual identification of target type
2. **Position refinement**: Triangulation from multiple EO sensors
3. **Passive sensing**: No RF emissions, harder for adversary to detect"

### Fusion Architecture
"Our multi-sensor fusion engine correlates observations using statistical gating
(Mahalanobis distance), then fuses using information-matrix methods that properly
account for sensor accuracy and registration quality."

### Resilience
"When sensor registration degrades, the fusion engine automatically switches
to conservative mode, reducing the weight of uncertain observations rather
than corrupting the air picture."`,

  roles: `# Roles & Permissions

## Role Selection
ELOC2 supports two roles: **Instructor** and **Operator**. Only one instructor may be active at a time.

### When Authentication is Disabled (Demo/Dev Mode)
- A role dropdown appears in the header bar
- Select **Instructor** or **Operator** from the dropdown
- If another user already holds the Instructor role, you will be automatically downgraded to Operator with a notification

### When Authentication is Enabled (Production)
- Roles are assigned via the login system and stored in the database
- The role is determined by the user record, not by manual selection

## Instructor Controls
The following controls are available **only to Instructors**:
- **Scenario Selection**: Choose which scenario to run from the dropdown
- **Simulation Controls**: Start, Pause, Reset, and Speed adjustment (1x/2x/5x/10x)
- **Scenario Editor**: Open the scenario editor view
- **Deployment Planner**: Open the sensor deployment view
- **Demo Mode**: Enable/disable guided demo narration
- **Live Inject**: Toggle random target injection during simulation
- **Ground Truth (GT)**: Toggle ground truth overlay on the map
- **User Management**: Open the user management page

## Operator Mode
- Operators can view the full air picture, interact with tracks, generate operator reports, and use all panel views
- Instructor-only buttons are **visible but greyed out** in Operator mode
- Hovering over a greyed-out button shows a tooltip: "Instructor role required"
- Operators cannot start, pause, reset, or change the simulation speed`,

  reports: `# Reports

## Generating Reports
Click the **Report** button in the header to open the report modal.

## Report Types

### Operator Report
A session review document covering a user-specified time range:
- **Track Timeline**: Tracks detected, confirmed, and dropped over time
- **Sensor Status**: Online/offline/degraded status of each sensor
- **Alert History**: Timeline of system alerts and events
- **Classification Activity**: Summary of target classifications made

### Instructor Report
Includes everything in the Operator Report, plus:
- **Ground Truth Comparison**: How many GT targets were tracked vs. missed vs. misclassified
- **Situational Awareness Assessment**: Measures the completeness and accuracy of the recognized air picture against ground truth
- **EO Effectiveness**: Cue-to-investigation time, triangulation success rate, EO utilization metrics

The Instructor Report option is only available when your role is Instructor. It appears greyed out for Operators.

## Time Range Selection
Both report types require you to specify a time range:
- **From**: Start time for the report period
- **To**: End time for the report period

## Download
- Click **Generate & Download** to create the report
- The report downloads automatically as a PDF file
- Filename format: ELOC2_Report_YYYY-MM-DD_HHmm.pdf
- No lingering download links -- the file downloads directly to your browser`,

  'user-management': `# User Management

## Accessing User Management
Click the **Users** button in the Instructor toolbar zone. This button is only available to Instructors.

## Online Users
The top section shows all currently connected users:
- **User**: Username or anonymous identifier
- **Role**: Instructor or Operator
- **Status**: Online indicator
- **Connected Since**: When the user connected

This section is always visible regardless of authentication mode.

## Registered Users (Auth Enabled Only)
When authentication is enabled (AUTH_ENABLED=true), a second table shows all registered users from the database:
- **Create User**: Add a new user with username, password, and role
- **Edit User**: Change a user's role or enable/disable their account
- **Delete User**: Remove a user from the system
- **Enable/Disable**: Toggle whether a user can log in

## No-Auth Mode
When authentication is disabled (AUTH_ENABLED=false), only the Online Users table is shown. There is no database-backed user CRUD in this mode -- users simply select their role from the header dropdown.`,

  keyboard: `# Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause simulation |
| Ctrl+D | Toggle demo mode |
| Ctrl+G | Toggle ground truth overlay |
| Escape | Close detail panel / deselect |
| L | Toggle labels |
| T | Toggle track layer |
| S | Toggle sensor layer |
| R | Toggle radar coverage |
| E | Toggle EO field of view |
| + / = | Increase simulation speed |
| - | Decrease simulation speed |`,

  glossary: `# Glossary

| Term | Definition |
|------|-----------|
| **C2** | Command and Control |
| **C4ISR** | Command, Control, Communications, Computers, Intelligence, Surveillance, and Reconnaissance |
| **EO** | Electro-Optical (camera/video sensor) |
| **FOR** | Field of Regard — the total angular range a sensor can observe by slewing |
| **FOV** | Field of View — the instantaneous angular extent of the sensor image |
| **IFOV** | Instantaneous Field of View — angular extent of a single pixel |
| **RAP** | Recognized Air Picture — the fused common operational picture |
| **SAC/SIC** | System Area Code / System Identification Code (ASTERIX sensor ID) |
| **SNR** | Signal-to-Noise Ratio |
| **Track** | A maintained state estimate of a target, updated by sensor observations |
| **Tentative Track** | Newly created track, not yet confirmed (< 3 updates) |
| **Confirmed Track** | Track with 3+ consistent updates, high confidence |
| **Dropped Track** | Track that has lost sensor contact (5+ consecutive misses) |
| **Dwell** | The time an EO sensor spends observing a single target |
| **Triangulation** | Computing 3D position from multiple angular (bearing) measurements |
| **Mahalanobis Distance** | Statistical distance accounting for covariance — used for track correlation |
| **Information Matrix** | Inverse of covariance matrix — used for fusion |
| **Bearing** | Angular measurement from a sensor to a target (azimuth in horizontal plane) |
| **Covariance** | Matrix describing the uncertainty of a position estimate |
| **Registration** | Alignment calibration between sensors — ensures observations are geometrically consistent |
| **Fusion Mode** | Operating mode of the fusion engine (centralized, conservative, confirmation-only) |
| **Sub-pixel Detection** | Detecting a target that appears smaller than one pixel — provides bearing only |
| **Image Detection** | Detecting a resolved target — provides shape, size, classification |
| **ASTERIX** | All-purpose Structured EUROCONTROL Surveillance Information Exchange — standard radar data format |
| **CAT-048** | ASTERIX category for radar plot messages |
| **CAT-062** | ASTERIX category for system track messages |`,
};

const styles = {
  container: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: '#0a0a1a',
    color: '#e0e0e0',
    zIndex: 1000,
    display: 'flex',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  sidebar: {
    width: '240px',
    background: '#0e0e24',
    borderRight: '1px solid #333',
    padding: '16px 0',
    overflowY: 'auto' as const,
  },
  sidebarTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#fff',
    padding: '0 16px 12px',
    borderBottom: '1px solid #333',
    marginBottom: '8px',
  },
  navItem: (active: boolean) => ({
    padding: '8px 16px',
    cursor: 'pointer',
    background: active ? '#4a9eff22' : 'transparent',
    color: active ? '#4a9eff' : '#aaa',
    borderLeft: active ? '3px solid #4a9eff' : '3px solid transparent',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
  } as React.CSSProperties),
  content: {
    flex: 1,
    padding: '24px 40px',
    overflowY: 'auto' as const,
    maxWidth: '800px',
  },
  closeBtn: {
    position: 'absolute' as const,
    top: '12px',
    right: '16px',
    background: '#333',
    color: '#fff',
    border: 'none',
    padding: '6px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    zIndex: 1001,
  },
};

/** Simple markdown-to-JSX renderer. */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '20px 0 10px' }}>{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} style={{ fontSize: '17px', fontWeight: 600, color: '#ccc', margin: '16px 0 8px' }}>{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key++} style={{ fontSize: '14px', fontWeight: 600, color: '#aaa', margin: '12px 0 6px' }}>{line.slice(4)}</h3>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={key++} style={{ marginLeft: '16px', fontSize: '13px', lineHeight: '1.6' }}>{renderInline(line.slice(2))}</li>);
    } else if (line.startsWith('| ') && lines[i + 1]?.match(/^\|[\s-|:]+$/)) {
      // Table
      const headerCells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      i++; // skip separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1]?.startsWith('|')) {
        i++;
        rows.push(lines[i].split('|').filter(c => c.trim()).map(c => c.trim()));
      }
      elements.push(
        <table key={key++} style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0', fontSize: '12px' }}>
          <thead>
            <tr>{headerCells.map((c, ci) => <th key={ci} style={{ padding: '6px 10px', borderBottom: '2px solid #444', textAlign: 'left', color: '#ccc', fontWeight: 600 }}>{renderInline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid #222' }}>
                {row.map((c, ci) => <td key={ci} style={{ padding: '5px 10px', color: '#aaa' }}>{renderInline(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else if (line.trim()) {
      elements.push(<p key={key++} style={{ fontSize: '13px', lineHeight: '1.6', margin: '4px 0', color: '#ccc' }}>{renderInline(line)}</p>);
    }
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#e0e0e0', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface HelpPageProps {
  onClose: () => void;
}

export function HelpPage({ onClose }: HelpPageProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');

  return (
    <div style={styles.container}>
      <button style={styles.closeBtn} onClick={onClose}>Close Help</button>
      <div style={styles.sidebar}>
        <div style={styles.sidebarTitle}>Help & Reference</div>
        {sections.map(s => (
          <div
            key={s.id}
            style={styles.navItem(activeSection === s.id)}
            onClick={() => setActiveSection(s.id)}
          >
            {s.title}
          </div>
        ))}
      </div>
      <div style={styles.content}>
        {renderMarkdown(sectionContent[activeSection])}
      </div>
    </div>
  );
}
