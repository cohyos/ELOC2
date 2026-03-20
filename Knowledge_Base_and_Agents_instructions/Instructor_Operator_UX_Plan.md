# Instructor/Operator UX & Simulation Control Plan (REQ-17 — REQ-23)

> **Status**: DRAFT — Awaiting approval
> **Created**: 2026-03-20
> **Branch**: `claude/review-knowledge-base-FTTzx`
> **Predecessor**: `ELOC2_Corrections_and_Upgrades_Plan.md` (phases 1–7 complete)

---

## 1. Requirements Summary

| REQ | Title | Description |
|-----|-------|-------------|
| REQ-17 | No Auto-Start | Simulation starts only when instructor clicks Start. Auto-loop disabled by default; instructor can enable it manually. Idle map shown on connect. |
| REQ-18 | No Auto-Inject | `scheduleAutoInject()` only runs when instructor explicitly enables auto-inject. No random targets by default. |
| REQ-19 | PDF Report & Dual Types | Report generates PDF (not MD). Direct download on button press (no lingering link). Filename includes timestamp. Two report types: **Operator Report** (session review, user-specified time range) and **Instructor Report** (GT vs. situational awareness + EO effectiveness, same time range input). |
| REQ-20 | Role Selection (Hybrid) | When `AUTH_ENABLED=true`: use login system. When `AUTH_ENABLED=false`: show role-picker dropdown (Instructor/Operator) in header. Only one instructor at a time, enforced via WebSocket tracking in live-engine. |
| REQ-21 | Instructor Button Grouping | Instructor-only controls grouped in a visually separated toolbar section: Editor, Deploy, Live Inject, Demo, User Mgmt, Start/Pause/Reset/Speed, GT, Scenario dropdown. |
| REQ-22 | Operator Mode Restrictions | When in Operator mode: instructor-only buttons are **visible but greyed out** with tooltip "Instructor role required". Scenario controls (Start/Pause/Reset/Speed) are instructor-only. |
| REQ-23 | User Management Page | Separate view (like Editor) accessible from instructor toolbar. CRUD operations: create, delete, change role, enable/disable. Shows currently online users and their roles. |

---

## 2. Architecture Decisions

### 2.1 Role Enforcement Model (Hybrid)

```
AUTH_ENABLED=true (Production)         AUTH_ENABLED=false (Dev/Demo)
┌─────────────────────────┐            ┌─────────────────────────┐
│  Login Page → DB auth   │            │  Role Picker Dropdown   │
│  Role from user record  │            │  in header (no login)   │
│  Max 1 instructor (DB)  │            │  Max 1 instructor (WS)  │
└─────────────────────────┘            └─────────────────────────┘
         │                                       │
         └───────────┬───────────────────────────┘
                     ▼
          Unified role state in
          ui-store: { role, isInstructor }
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   Instructor UI              Operator UI
   (all controls)        (greyed instructor btns)
```

- **No-auth role picker**: Dropdown in header sends role via WS `upgrade` query param.
- **WS enforcement**: `live-engine.ts` tracks instructor count. If a second client requests instructor role, the server rejects and downgrades to operator.
- **Frontend store**: `ui-store` exposes `effectiveRole` derived from either auth-store (when auth enabled) or local role-picker state + WS confirmation.

### 2.2 Header Layout (REQ-21 + REQ-22)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ELOC2 v0.3.1  rev:abc  │ INSTRUCTOR ZONE ─────────────────│ COMMON ──  │
│                         │ [Scenario▼][Start][Pause][Reset] │ [Tracks]   │
│                         │ [1x][2x][5x][10x] T+00:00       │ [Quality]  │
│                         │ [Editor][Deploy][Demo][Inject]   │ [Invest.]  │
│                         │ [GT][Users]                      │ [Dark/Lt]  │
│                         │ ──────────────── visual divider  │ [Report▼]  │
│                         │                                  │ [Help]     │
│                         │                                  │ [Panel]    │
│                         │                                  │ [Timeline] │
│                         │                                  │ ●Connected │
│                         │                                  │ role:Op    │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Left**: Logo, version, revision
- **Center-left** (Instructor Zone): Scenario selector, sim controls, Editor, Deploy, Demo, Live Inject, GT, User Mgmt — all greyed out for operators
- **Center-right** (Common Zone): Track filters, EO badge, panel toggles, Report, Help, connection status, role display

### 2.3 Report System (REQ-19)

```
┌───────────────┐      ┌──────────────────────┐
│ Report Button │─────▶│  Report Dialog/Modal  │
│  (Common)     │      │  ┌─ Type: ──────────┐ │
└───────────────┘      │  │ ○ Operator Report │ │
                       │  │ ○ Instructor Rpt  │ │
                       │  └──────────────────┘ │
                       │  ┌─ Time Range: ─────┐ │
                       │  │ From: [datetime]  │ │
                       │  │ To:   [datetime]  │ │
                       │  └──────────────────┘ │
                       │  [Generate & Download] │
                       └──────────────────────┘
                              │
                              ▼
                       POST /api/report/generate
                       { type: 'operator'|'instructor',
                         timeRange: { from, to },
                         format: 'pdf' }
                              │
                              ▼
                       Browser auto-downloads
                       "ELOC2_Report_2026-03-20_1430.pdf"
```

- **Operator Report**: Session review — tracks seen, track counts over time, sensor status, alert timeline, classification activity.
- **Instructor Report**: Everything in operator report PLUS ground-truth comparison, situational awareness assessment (how many GT targets were tracked, missed, misclassified), EO utilization effectiveness (cue-to-investigation time, triangulation success rate).
- **Instructor Report** only available when role = instructor (greyed out for operators).

### 2.4 User Management Page (REQ-23)

```
┌──────────────────────────────────────────────────────┐
│  USER MANAGEMENT                          [← Back]  │
│ ─────────────────────────────────────────────────── │
│  ONLINE USERS (3)                                    │
│  ┌────────┬──────────┬──────────┬────────────────┐  │
│  │ User   │ Role     │ Status   │ Connected Since│  │
│  ├────────┼──────────┼──────────┼────────────────┤  │
│  │ admin  │ Instruct │ ●Online  │ 14:30          │  │
│  │ op1    │ Operator │ ●Online  │ 14:32          │  │
│  │ anon-3 │ Operator │ ●Online  │ 14:35          │  │
│  └────────┴──────────┴──────────┴────────────────┘  │
│                                                      │
│  ALL USERS (when AUTH_ENABLED)                       │
│  ┌────────┬──────────┬─────────┬─────────────────┐  │
│  │ User   │ Role     │ Enabled │ Actions         │  │
│  ├────────┼──────────┼─────────┼─────────────────┤  │
│  │ admin  │ Instruct │ ✓       │ [Edit] [Delete] │  │
│  │ op1    │ Operator │ ✓       │ [Edit] [Delete] │  │
│  │ op2    │ Operator │ ✗       │ [Edit] [Delete] │  │
│  └────────┴──────────┴─────────┴─────────────────┘  │
│  [+ Create User]                                     │
│                                                      │
│  When AUTH_ENABLED=false: only online users table    │
│  is shown (no DB-backed user CRUD)                   │
└──────────────────────────────────────────────────────┘
```

---

## 3. Implementation Stages

Each stage ends with a **verification checkpoint** where we confirm the system works correctly before proceeding.

---

### Stage 1: Backend — Simulation Control & Role Protocol

**Goal**: Fix auto-loop, auto-inject, and add WS role protocol for no-auth mode.

| Agent | ID | Scope | Files Modified | Test Strategy |
|-------|----|-------|---------------|---------------|
| Agent 1A | `sim-control` | Disable auto-loop on connect. Keep `startAutoLoop()`/`stopAutoLoop()` as instructor-callable methods. Remove auto-start from `onUserConnected()`/`onUserDisconnected()`. | `apps/api/src/simulation/live-engine.ts` | Unit test: connect user → verify engine stays idle. Test: instructor calls `startAutoLoop()` → verify it works. |
| Agent 1B | `auto-inject-gate` | Gate `scheduleAutoInject()` behind an explicit instructor toggle (`enableAutoInject`/`disableAutoInject`). Remove auto-inject from `startAutoLoop()`. Add API endpoint `POST /api/simulation/auto-inject` (enable/disable). | `apps/api/src/simulation/live-engine.ts`, `apps/api/src/routes/editor-routes.ts` | Unit test: auto-loop starts → no random targets injected. Test: instructor enables auto-inject → targets appear. |
| Agent 1C | `ws-role-protocol` | In no-auth mode: accept `?role=instructor\|operator` query param on WS upgrade. Enforce max-1-instructor via `getConnectedUsers()`. If rejected, send `{ type: 'role.downgraded', role: 'operator', reason: 'instructor slot taken' }` message. Add `GET /api/simulation/instructor-available` endpoint. | `apps/api/src/routes/ws-events.ts`, `apps/api/src/simulation/live-engine.ts` | Unit test: 2 clients request instructor → second gets downgraded. Test: instructor disconnects → slot opens. |

**Verification Checkpoint 1**: Start the app → connect browser → map shows idle state, no simulation running. Call `GET /api/simulation/instructor-available` → returns `{ available: true }`. No random targets appear.

---

### Stage 2: Frontend — Role Picker & Header Reorganization

**Goal**: Add role picker UI, reorganize header into instructor/common zones.

| Agent | ID | Scope | Files Modified | Test Strategy |
|-------|----|-------|---------------|---------------|
| Agent 2A | `role-picker-ui` | When `authEnabled=false`: render role dropdown (Instructor/Operator) in header. On selection, reconnect WS with `?role=X`. Handle `role.downgraded` message. Store effective role in `ui-store`. When `authEnabled=true`: derive role from `auth-store`. | `apps/workstation/src/App.tsx`, `apps/workstation/src/stores/ui-store.ts`, `apps/workstation/src/replay/ReplayController.ts` | Manual: select Instructor → WS connects with role. Open second tab as Instructor → gets downgraded to Operator. |
| Agent 2B | `header-layout` | Reorganize header into Instructor Zone (left-center) and Common Zone (right). Add visual divider. Apply `isInstructor` gating: instructor buttons greyed out + tooltip for operators. Move scenario controls, Editor, Deploy, Demo, Inject, GT, User Mgmt to instructor zone. Move track filters, panel toggles, Report, Help, connection, role to common zone. | `apps/workstation/src/App.tsx` | Manual: switch to Operator → instructor buttons greyed. Switch to Instructor → all buttons active. |

**Verification Checkpoint 2**: Open app → see role picker. Select Operator → instructor buttons greyed with tooltip. Select Instructor → all active. Open second tab as Instructor → downgraded to Operator. Click Start (as instructor) → simulation starts. Click Start (as operator) → button disabled.

---

### Stage 3: Reports — PDF Generation & Dual Report Types

**Goal**: Replace MD download with direct PDF download. Add operator/instructor report types with time-range input.

| Agent | ID | Scope | Files Modified | Test Strategy |
|-------|----|-------|---------------|---------------|
| Agent 3A | `report-backend` | Update `generateReport()` to accept `type: 'operator'\|'instructor'` and `timeRange: { from, to }`. Operator report: session review (tracks, alerts, classifications in range). Instructor report: adds GT comparison, SA assessment, EO effectiveness. Always generate PDF. Update download endpoint to return PDF with timestamped filename. | `apps/api/src/reports/report-generator.ts`, `apps/api/src/reports/pdf-generator.ts`, `apps/api/src/routes/report-routes.ts` | Unit test: generate operator report → valid PDF buffer. Generate instructor report → includes GT sections. |
| Agent 3B | `report-frontend` | Replace Report button + download link with a Report button that opens a small modal. Modal has: report type radio (Operator/Instructor — instructor option greyed for operators), time range inputs (from/to datetime), Generate button. On Generate: POST to API, receive PDF blob, trigger browser download with filename `ELOC2_Report_YYYY-MM-DD_HHmm.pdf`. No lingering download link. | `apps/workstation/src/App.tsx` (or new `apps/workstation/src/reports/ReportModal.tsx`) | Manual: click Report → modal appears. Select type, time range → click Generate → PDF downloads. |

**Verification Checkpoint 3**: Click Report → modal opens. Select Operator Report with time range → PDF downloads with timestamp in filename. Select Instructor Report (as instructor) → PDF includes GT comparison. As Operator → Instructor Report option is greyed out.

---

### Stage 4: User Management Page

**Goal**: Build user management view accessible from instructor toolbar.

| Agent | ID | Scope | Files Modified | Test Strategy |
|-------|----|-------|---------------|---------------|
| Agent 4A | `user-mgmt-page` | Create `UserManagementView` component. When `AUTH_ENABLED=true`: shows online users table + DB users table with CRUD. When `AUTH_ENABLED=false`: shows only online users table (from WS connected users). Add "Users" button in instructor zone. Add `GET /api/simulation/connected-users` API endpoint (returns list with roles and connect times). | New: `apps/workstation/src/admin/UserManagementView.tsx`, Modified: `apps/workstation/src/App.tsx`, `apps/api/src/routes/editor-routes.ts` or new route file | Manual: click Users → view opens. See online users. When AUTH: create/edit/delete users. |

**Verification Checkpoint 4**: Click Users (as instructor) → see management view. See online users with roles. When AUTH enabled: CRUD operations work. As Operator → Users button greyed out.

---

### Stage 5: Integration, Documentation & Help Updates

**Goal**: End-to-end verification, update knowledge base, help page, and CLAUDE.md.

| Agent | ID | Scope | Files Modified | Test Strategy |
|-------|----|-------|---------------|---------------|
| Agent 5A | `docs-update` | Update `CLAUDE.md` with new requirements, file references, completion status. Update `HelpPage.tsx` with role system docs, report types, user management. Update `Chunk_index.md` to reference this plan document. | `CLAUDE.md`, `apps/workstation/src/help/HelpPage.tsx`, `Knowledge_Base_and_Agents_instructions/Chunk_index.md` | Review: docs accurate and complete. |
| Agent 5B | `integration-test` | Write integration tests: (1) no auto-start on connect, (2) role enforcement, (3) report generation both types, (4) user management CRUD. | `tests/integration/` | All tests pass. |

**Verification Checkpoint 5 (Final)**: Full end-to-end walkthrough:
1. Open app → idle, no simulation
2. Select Instructor role → all controls active
3. Select scenario, click Start → simulation runs
4. Open second tab → defaults to Operator, instructor buttons greyed
5. Generate Operator Report with time range → PDF downloads
6. Generate Instructor Report → includes GT comparison
7. Open User Management → see both users online
8. Pause simulation → verify controls work
9. Verify help page has updated documentation

---

## 4. Agent Post-Completion Checklist

Every agent MUST perform these steps after completing their task:

1. **Update this plan document**: Mark their agent row with `✅ Complete` in the Status column
2. **Update CLAUDE.md**: Add/modify relevant entries under the appropriate section
3. **Update HelpPage.tsx**: If the change is user-facing, add/update the relevant help section
4. **Run tests**: Ensure existing tests still pass (`pnpm test`)
5. **Build**: Ensure `pnpm build` succeeds
6. **Commit**: With descriptive message referencing the REQ number

---

## 5. Implementation Progress Tracker

| Stage | Agent | REQ | Status | Commit | Date |
|-------|-------|-----|--------|--------|------|
| 1 | 1A: sim-control | REQ-17 | ⬜ Pending | — | — |
| 1 | 1B: auto-inject-gate | REQ-18 | ⬜ Pending | — | — |
| 1 | 1C: ws-role-protocol | REQ-20 | ⬜ Pending | — | — |
| 2 | 2A: role-picker-ui | REQ-20 | ⬜ Pending | — | — |
| 2 | 2B: header-layout | REQ-21, REQ-22 | ⬜ Pending | — | — |
| 3 | 3A: report-backend | REQ-19 | ⬜ Pending | — | — |
| 3 | 3B: report-frontend | REQ-19 | ⬜ Pending | — | — |
| 4 | 4A: user-mgmt-page | REQ-23 | ⬜ Pending | — | — |
| 5 | 5A: docs-update | All | ⬜ Pending | — | — |
| 5 | 5B: integration-test | All | ⬜ Pending | — | — |

---

## 6. Risk Register

| Risk | Mitigation |
|------|-----------|
| PDF generation fails in Cloud Run (missing fonts) | pdfmake bundles Roboto internally — no system font dependency |
| WS role enforcement race condition (two instructors connect simultaneously) | Use synchronous check in `addWsClient()` before emitting confirmation |
| Report time-range has no data (scenario not running during range) | Show "No data available for selected time range" message in report |
| Auth-disabled mode has no persistence for role | Role is session-local (browser tab); re-selecting on refresh is acceptable |
| Header becomes too wide on small screens | Use responsive wrapping; instructor zone collapses to dropdown on narrow viewports |

---

## 7. Glossary

- **Instructor**: Privileged user who controls simulation, edits scenarios, manages users. Max 1 concurrent.
- **Operator**: Standard user who monitors the air picture. Can view panels, generate operator reports. Cannot control simulation.
- **Auto-loop**: Automatic scenario restart after completion. Disabled by default (REQ-17). Instructor can enable.
- **Auto-inject**: Random target injection during auto-loop. Disabled by default (REQ-18). Instructor can enable.
- **Operator Report**: Session review PDF covering tracks, alerts, classifications in a user-specified time range.
- **Instructor Report**: Extended report including GT comparison, situational awareness assessment, and EO effectiveness metrics.
