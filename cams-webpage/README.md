# CAMS — Compressed Air Monitoring System

## Project name and objective

**CAMS Webpage** is a responsive industrial monitoring interface for reviewing
the current condition of a compressed-air network. The prototype presents a
login experience, a plant dashboard, 13 compressor records, machine details,
parameter trends, alarms, and preview screens for later modules.

The objective of this phase is to validate information hierarchy, navigation,
visual design, terminology, engineering units, and alarm workflows before any
backend or equipment integration begins.

## Responsible team member

**Owner:** CAMS Project Team

The project owner is responsible for documentation, issue tracking, test
results, status updates, and helping reviewers understand the UI.

## Status

**In Progress**

The review-stage UI is complete. Functional integration and production
hardening have not started.

## Hardware requirements

No hardware is required to review this UI prototype.

The intended future monitoring system may include:

- Industrial air compressors
- Flow, pressure, suction, and temperature sensors
- PLC with a verified register map
- RS485/Modbus communication where applicable
- ESP32-S3 edge gateway if approved by the final architecture
- Protected plant network and MQTT broker

Do not connect or energize industrial hardware using this prototype. Wiring,
power, isolation, current limits, emergency-stop systems, and supervision must
be reviewed separately by qualified personnel.

## Software requirements

- A current Chrome, Edge, Firefox, or Safari browser
- Node.js 18 or newer for automated validation
- Python 3 or any static-file server for local preview
- Git for version control

No application dependencies or build step are required.

## Installation and setup

Clone the repository and enter the project directory:

```bash
git clone <repository-url>
cd cams-webpage/cams-webpage
```

Run the validation checks:

```bash
npm test
```

Start the local preview server:

```bash
npm start
```

Open <http://localhost:8080>.

The sign-in screen uses a browser-only review session. Enter a username or
email and a password of at least four characters. The password is never stored.
Selecting **Remember me** stores only the review identity and session expiry in
the browser for up to seven days; otherwise the session ends with the browser
session. No value is sent to a server.

## Testing procedure

### Automated test

From `cams-webpage/`, run:

```bash
npm test
```

Expected result: all required files, page metadata, mock machine records,
responsive rules, and core UI modules pass validation.

### Manual UI test

1. Open the page at desktop width and sign in with review values.
2. Reload the page and verify a remembered review session is restored.
3. Open the account menu and verify Sign out clears the session.
4. Verify the dashboard shows 13 machines and four KPI cards.
5. Open Machines and test search and every status filter.
6. Open a machine and verify its sensors, trend, health, service, and alarms.
7. Change machine, parameter, and time range on Trends.
8. Filter alarms and test View, Acknowledge, and Resolve.
9. Review Maintenance, Reports, Settings, and Energy preview screens.
10. Repeat at tablet and mobile widths, including the mobile sidebar.
11. Check the browser console for errors.

### Recorded test result

- **Configuration:** Static UI, mock data, current Chromium browser
- **Date:** 2026-10-05
- **Responsible:** CAMS Project Team
- **Expected result:** All screens render and all review interactions work
- **Observed result:** Passed desktop and responsive visual checks; no browser
  console errors observed

## Current status

- UI design: implemented
- Responsive layout: implemented
- Mock compressor fleet: implemented
- Review interactions: implemented
- E7 powered-by branding: implemented
- Browser review sessions and sign-out: implemented
- Automated structural checks: implemented
- API/backend integration: not started
- MQTT integration: not started
- Database integration: not started
- Production authentication: not started

## Known issues and limitations

- All readings, events, timestamps, and statistics are mock data.
- The browser review session is a UI gate, not production authentication.
- User verification, password recovery email, authorization roles, MFA, and
  audit logging require an approved identity provider or backend service.
- The UI accepts any review identity and password of four or more characters;
  no password is transmitted or stored.
- Alarm acknowledgement and resolution exist only in browser memory.
- Refreshing the page resets all UI state.
- Export buttons demonstrate interactions but do not create files.
- The displayed plant identity is generic to avoid publishing customer data.
- The supplied E7 powered-by logo is included as a compressed UI asset.
- Google Fonts are loaded from the network; system fonts are used if offline.
- The final PLC/ESP32-S3 communication architecture is not yet approved.
- Engineering units, thresholds, retention, roles, and alarm rules require
  stakeholder confirmation.

## Results and observations

The prototype demonstrates that the core P0 workflow can be presented without
overloading operators: current plant health appears first, machine details are
one action away, and red is reserved for critical conditions. The same
information remains usable on desktop, tablet, and mobile layouts.

The next phase should confirm the architecture, real machine inventory,
engineering units, alarm thresholds, user permissions, and data contract before
replacing mock data with APIs.
