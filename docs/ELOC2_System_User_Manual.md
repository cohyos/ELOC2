# ELOC2 System User Manual
## EO C2 Air Defense Demonstrator

**Version**: 0.4.0 | **Date**: 2026-03-26

---

## 1. Introduction

### 1.1 System Purpose

ELOC2 is an Electro-Optical Command and Control (EO C2) demonstrator designed for air defense operations. Its primary mission is to fuse data from multiple passive infrared (EO/IR) sensors and active radar sources into a unified air picture, enabling operators to detect, track, classify, and investigate airborne threats in real time. By emphasizing passive EO sensing, the system offers a fundamental tactical advantage: targets can be detected and tracked without emitting any electromagnetic energy, making the sensor network invisible to hostile electronic support measures (ESM) and radar warning receivers.

The system implements bearing-only triangulation as its core geolocation technique. Each EO sensor measures a bearing (azimuth) toward a detected target but cannot determine range from a single observation. When two or more geographically separated EO sensors observe the same target, ELOC2 computes a triangulated position by intersecting their bearing lines. This passive-only mode of operation, combined with multi-sensor fusion algorithms that can also incorporate active radar data when available, provides a layered detection architecture suited to modern air defense environments where threat platforms increasingly carry radar warning systems and anti-radiation missiles.

ELOC2 goes beyond simple track display. It provides a complete operational workflow that includes automated EO sensor tasking (cueing sensors toward high-priority tracks), investigation management (dwell timers, DRI-based classification), quality assessment (measuring track accuracy before and after EO contribution), deployment planning (optimizing sensor placement across terrain), and scenario simulation for training and evaluation. The workstation presents all of this through a dark-themed map-centric interface with real-time WebSocket updates, giving operators immediate situational awareness across the defended area.

### 1.2 Key Capabilities

- **Passive IR Detection**: Electro-optical sensors detect targets via infrared emission without active transmission, providing covert surveillance capability.
- **Bearing-Only Triangulation**: When two or more EO sensors observe the same target, the system computes a geographic position by intersecting bearing lines, with quality scoring based on intersection angle and sensor geometry.
- **Multi-Sensor Fusion**: Correlates and fuses observations from radar, EO, and C4ISR sources into unified system tracks using information-matrix fusion. Automatically selects fusion mode (centralized, conservative, or basic) based on sensor registration health.
- **EO Investigation with DRI**: Manages sensor dwell time on targets with Detection, Recognition, and Identification (DRI) range modeling. Supports standard investigation, ground-truth comparison, and pyrite (false-target) investigation modes.
- **Automated EO Tasking**: Scores candidate targets based on threat priority, track age, and geometric suitability, then assigns available EO sensors to highest-value tracks via a policy engine. Operators can override assignments or boost priority on specific tracks.
- **Track Management**: Full track lifecycle from tentative (initial detection) through confirmed (3+ updates) to dropped (8 consecutive misses), with NATO APP-6 symbology and ballistic missile / air-breathing threat classification.
- **Scenario Simulation**: Built-in scenario runner generates realistic radar and EO observations for predefined scenarios (e.g., central Israel defense). Supports variable-speed playback (1x to 10x), pause, reset, and timeline scrubbing.
- **Deployment Planning**: Optimizes sensor placement using grid-based scoring across terrain, accounting for line-of-sight (LOS) using SRTM elevation data, coverage overlap, and operational zone constraints.
- **Sensor Registration and Health**: Continuously estimates spatial bias and clock drift for each sensor. Registration health determines whether full fusion or conservative fallback modes are used.
- **Live Injection**: Instructors can inject targets into a running scenario in real time to test operator response.
- **Reports**: Generates PDF scenario reports covering track summaries, sensor utilization, and quality metrics over a selected time range.
- **Weather and Environment**: Models weather effects (rain, fog, dust) on sensor detection ranges, and simulates radar clutter in the observation pipeline.
- **3D Visualization**: Optional Deck.gl overlay for altitude extrusion and ballistic trajectory display.
- **ASTERIX Integration**: Supports ingestion and export of EUROCONTROL CAT-048 (radar plots) and CAT-062 (system tracks) binary data.

### 1.3 System Architecture Overview

ELOC2 is built as a TypeScript monorepo containing 21 packages and 3 applications:

- **Backend** (`apps/api`): A Fastify HTTP server running on port 3001 that hosts the simulation engine, REST API endpoints, and a WebSocket server for real-time data push. The live engine runs the simulation loop internally at approximately 15 Hz, processing sensor observations, running the fusion pipeline, managing EO tasking, and evaluating track quality each tick.

- **Frontend** (`apps/workstation`): A React 19 single-page application rendered via Leaflet (Canvas 2D) for map display. State management uses Zustand 5 stores. The workstation connects to the backend via WebSocket and receives Recognized Air Picture (RAP) updates at approximately 2 Hz (throttled to a maximum of 4 broadcasts per second at high simulation speeds). All map symbols, coverage areas, bearing rays, and triangulation geometry are rendered through native Leaflet layers.

- **Simulator** (`apps/simulator`): A ScenarioRunner that generates time-stepped simulation events (radar observations, EO bearings, sensor faults) based on predefined scenario definitions. Scenarios define sensor positions, target waypoint paths, threat profiles, and environmental conditions.

- **Domain Packages**: The remaining 18 packages provide domain logic including fusion algorithms (`fusion-core`), geometry and triangulation (`geometry`), EO investigation and tasking (`eo-investigation`, `eo-tasking`), sensor registration (`registration`), terrain line-of-sight checking (`terrain`), event sourcing (`events`), and a distributed sensor bus architecture (`sensor-bus`, `sensor-instances`, `eo-core`, `system-fuser`).

The system is deployed as a single Docker container on Google Cloud Run, with the API serving both the backend endpoints and the frontend static files. When authentication is enabled, user and session data are stored in PostgreSQL via Cloud SQL.

---

## 2. Getting Started

### 2.1 Accessing the System

Open a web browser and navigate to the ELOC2 deployment URL. For local development, this is typically `http://localhost:3000` (Vite dev server) or `http://localhost:3001` (direct API server). For production deployments on Google Cloud Run, use the assigned service URL (e.g., `https://eloc2-820514480393.me-west1.run.app`).

**Supported Browsers**:
- Google Chrome (recommended, version 90+)
- Mozilla Firefox (version 90+)
- Microsoft Edge (Chromium-based, version 90+)

The workstation uses Canvas 2D rendering via Leaflet, which is compatible with all modern browsers without requiring WebGL support. The optional Deck.gl 3D overlay does require WebGL 2.0, but the system operates fully without it.

**Responsive Layout**: The workstation detects viewport width and switches to a mobile-optimized layout when the screen is narrower than 768 pixels. On mobile, the map occupies the full screen with a collapsible bottom sheet for track details. For the full operational experience, a desktop display of 1280 pixels or wider is recommended.

### 2.2 Role Selection

ELOC2 supports two operator roles that determine which controls are available:

**Instructor** (full control):
- Start, pause, resume, and reset simulation scenarios
- Select and switch between scenarios
- Adjust simulation speed (1x, 2x, 5x, 10x)
- Open the Scenario Editor to create and modify scenarios
- Inject targets into a running simulation in real time
- Toggle ground truth overlay to see actual target positions
- Access the User Management page to create and manage operator accounts
- Access the Decision Chain Log for pipeline tracing
- Activate Demo/Presenter mode
- All operator capabilities listed below

**Operator** (observe and interact):
- View the live air picture with tracks, sensors, and geometry
- Select tracks to view details (position, velocity, classification, sources, confidence)
- Classify tracks and set operator-assigned threat categories
- Cue EO sensors toward tracks of interest ("Investigate" action)
- Boost track priority for EO tasking ("Mark Priority" action)
- Open Task, Investigation, Quality, and Sector Scan panels
- Toggle map layers (tracks, sensors, coverage, EO rays, triangulation, etc.)
- Switch between dark and light map themes
- Generate PDF reports
- Resize and show/hide the detail panel and timeline

**How role selection works**:

- **When authentication is enabled** (`AUTH_ENABLED=true`): Your role is determined by your user account, assigned by an administrator. After login, your username and role badge appear in the top-right corner of the header. Instructor-only controls are grayed out and show "Instructor role required" tooltips for operator-role users.

- **When authentication is disabled** (`AUTH_ENABLED=false`, the default for local development): A role dropdown appears in the top-right corner of the header, defaulting to "Operator." You can switch to "Instructor" at any time using this dropdown. Switching to Operator automatically hides instructor-only features such as the ground truth overlay.

### 2.3 Initial View

When you first load the workstation, the interface presents:

**Header Bar** (top, 40px height): A single horizontal bar containing, from left to right:
- **Logo and version**: "ELOC2" in bold white text, followed by "EO C2 Air Defense Demonstrator" in gray, and a monospace revision hash (e.g., `rev:a3b4c5d`) that shows build details on hover.
- **Instructor controls** (separated by a vertical divider): Scenario selector dropdown, Start/Pause button (green when idle, red when running), Reset button, speed selectors (1x/2x/5x/10x), elapsed time counter (T+0:00), simulation state badge (idle/running/paused), and buttons for Editor, Users, Log, Demo, Live Inject, and GT toggle.
- **Common controls** (separated by a second vertical divider, right-aligned): Track count summary with filter toggles (confirmed in green, tentative in yellow, dropped in red), EO Module status badge, panel toggle buttons (Tasks, Investigation, Quality, Sector Scan), Dark/Light theme toggle, Show/Hide Panel, Show/Hide Timeline, Report button, Help button, WebSocket connection indicator (green dot = connected), and role selector or user info.

**Map Area** (center, fills remaining space): A full-screen Leaflet map using CARTO Dark Matter tiles by default, centered on the Negev region of southern Israel at approximately 31.5 degrees North, 34.8 degrees East, at zoom level 8. The map shows:
- Zoom controls in the top-right corner
- A metric scale bar in the bottom-left corner
- No tracks, sensors, or geometry until a scenario is loaded and started

**Layer Filter Panel** (floating, top-left of map): A collapsible panel that controls visibility of individual map layers: tracks, track labels, track ellipses, sensors, sensor labels, radar coverage, EO field of regard, EO field of view, EO rays, triangulation lines, bearing lines, ambiguity markers, NATO symbols toggle, 3D overlay, and ballistic estimates. Labels are off by default; most other layers are on.

**Detail Panel** (right side, 380px default width, resizable): When visible, shows context-dependent content. With nothing selected, it displays the **Overview** panel containing:
- Track summary (total, confirmed, tentative counts with clickable track list)
- Sensor summary (radar count, EO count, online/offline status)
- System health (dominant fusion mode, registration health, latency avg/max)
- Connected users (total, instructors, operators, anonymous)
- EO tasking status (active task count)
- EO Module status (mode, active pipelines, enriched tracks)
- System load (tick time, observations/sec, active tracks, WS messages/sec, memory usage, uptime)
- Fusion configuration sliders
- Build info (Git SHA, branch, build timestamp)

**Timeline Panel** (bottom, 150px default height, resizable): A horizontal timeline showing simulation progress. Can be hidden via the "Hide Timeline" button to maximize map space.

**Simulation State**: The system starts in the **idle** state. The state badge in the header displays "idle" in gray. The Start button is green and ready. No simulation data flows until an instructor presses Start.

### 2.4 Authentication

ELOC2 supports two authentication modes:

**Authentication Disabled** (`AUTH_ENABLED=false`, default):
When authentication is not configured, the workstation loads directly into the main interface without any login step. A role dropdown in the header allows switching between Instructor and Operator roles. This mode is suitable for local development, single-user demos, and environments where network-level access control is already in place.

**Authentication Enabled** (`AUTH_ENABLED=true`):
When authentication is enabled, the system requires a PostgreSQL database connection (`DATABASE_URL` environment variable) for user and session storage.

Upon navigating to the workstation URL, you are presented with the **Login Page**: a centered card on a dark background (#0d0d1a) containing:
- The ELOC2 logo and subtitle
- A username field (auto-focused)
- A password field
- A "Sign In" button (blue, #4a9eff)
- An error message area (red background) that appears on failed login attempts

To sign in, enter your username and password, then click "Sign In" or press Enter. The button shows "Signing in..." and disables during the authentication request. On success, a session cookie is set and you are redirected to the main workstation view. On failure, an error message appears below the title.

**Default Administrator Account**: On first startup with authentication enabled, the system creates a default admin account with the username `admin`. The password must be provided via the `ADMIN_DEFAULT_PASSWORD` environment variable and must be at least 12 characters long. If this variable is not set, no default user is created and accounts must be provisioned through other means.

**Password Policy**: Passwords must be between 8 and 128 characters. The system uses bcryptjs with 12 salt rounds for password hashing.

**Session Management**: Sessions are maintained via HTTP cookies. In production (`NODE_ENV=production`), cookies are marked with the `Secure` flag to prevent transmission over unencrypted connections. Sessions are validated on each protected API request by the authentication middleware.

**User Management**: Administrators with the instructor role can access the User Management page via the "Users" button in the header. From this page, instructors can create new user accounts, assign roles (instructor or operator), reset passwords, and delete accounts. Operators do not have access to this page.

**Signing Out**: When authenticated, a "Logout" button appears in the top-right corner of the header next to your username and role badge. Clicking it clears your session and returns you to the login page.

---
