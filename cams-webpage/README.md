# CAMS — Compressed Air Monitoring System

## Project name and objective

**CAMS Webpage** is a responsive industrial monitoring interface for reviewing
the current condition of a compressed-air network. The prototype presents a
login experience, a plant dashboard, 13 compressor records, machine details,
parameter trends, alarms, and preview screens for later modules.

The objective is to deliver the monitoring interface in controlled stages. The
current branch connects the login screen to the CAMS API and its MongoDB-backed
server sessions while retaining mock compressor data until MQTT integration.

## Responsible team member

**Owner:** CAMS Project Team

The project owner is responsible for documentation, issue tracking, test
results, status updates, and helping reviewers understand the UI.

## Status

**In Progress**

The review-stage UI is complete. Real authentication works in the local
integration environment. Production API and MongoDB hosting are not configured.

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

The sign-in screen now requires the CAMS API. For local work, start `cams-api`
on port 3100 after configuring MongoDB and creating an owner account. Passwords
are verified by the API and are never stored in the browser. Authentication is
maintained with an `HttpOnly` server session cookie.

## Testing procedure

### Automated test

From `cams-webpage/`, run:

```bash
npm test
```

Expected result: all required files, page metadata, mock machine records,
responsive rules, and core UI modules pass validation.

### Manual UI test

1. Start MongoDB and the CAMS API, then open the page at desktop width.
2. Verify an incorrect password is rejected.
3. Sign in with a real account stored in MongoDB.
4. Reload the page and verify the server session is restored.
5. Open the account menu and verify Sign out revokes the server session.
6. Verify the dashboard shows 13 machines and four KPI cards.
7. Open Machines and test search and every status filter.
8. Open a machine and verify its sensors, trend, health, service, and alarms.
9. Change machine, parameter, and time range on Trends.
10. Filter alarms and test View, Acknowledge, and Resolve.
11. Review Maintenance, Reports, Settings, and Energy preview screens.
12. Repeat at tablet and mobile widths, including the mobile sidebar.
13. Check the browser console for errors.

### Recorded test result

- **Configuration:** Local CAMS API, MongoDB 7.0.43, static UI, mock telemetry,
  current Chromium browser
- **Date:** 2026-10-05
- **Responsible:** CAMS Project Team
- **Expected result:** Invalid credentials fail; a valid MongoDB account signs
  in, survives reload, and is revoked on logout
- **Observed result:** Passed the full browser authentication flow and all 18
  UI structural checks

## Current status

- UI design: implemented
- Responsive layout: implemented
- Mock compressor fleet: implemented
- Review interactions: implemented
- Compact E7 powered-by mark: implemented
- MongoDB-backed login and server sign-out: implemented locally
- Automated structural checks: implemented
- Authentication API integration: implemented locally
- MQTT integration: not started
- Authentication database integration: implemented locally
- Production authentication deployment: not started

## Known issues and limitations

- All readings, events, timestamps, and statistics are mock data.
- Production login remains unavailable until the API and MongoDB are hosted and
  the GitHub repository variable `CAMS_API_URL` is configured.
- Password-reset email, MFA, user administration, and authentication audit
  events are not implemented yet.
- Alarm acknowledgement and resolution exist only in browser memory.
- Refreshing the page resets all UI state.
- Export buttons demonstrate interactions but do not create files.
- The displayed plant identity is generic to avoid publishing customer data.
- The compact top-right powered-by mark identifies E7 without adding a large
  logo panel to the login screen.
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
