# CAMS — Compressed Air Monitoring System

## Project name and objective

**CAMS Webpage** is a responsive industrial monitoring interface for reviewing
the current condition of a compressed-air network. The prototype presents a
login experience, a plant dashboard, 13 compressor records, machine details,
parameter trends, alarms, and preview screens for later modules.

The objective is to deliver the monitoring interface in controlled stages. The
current branch connects login, machine inventory, current readings, and
historical trend charts to the CAMS API. Live MQTT readings reach the browser
through an authenticated server-sent event stream.

## Responsible team member

**Owner:** CAMS Project Team

The project owner is responsible for documentation, issue tracking, test
results, status updates, and helping reviewers understand the UI.

## Status

**In Progress**

The review-stage UI and its local real-data path are complete. Authentication,
MongoDB, MQTT ingestion, protected telemetry APIs, and live dashboard updates
work in the local integration environment. Production services are not configured.
Authenticated machine-fleet and telemetry exports are available in XLSX and PDF.

## Hardware requirements

No hardware is required to review this UI prototype.

The intended future monitoring system may include:

- Industrial air compressors
- Flow, pressure, and suction sensors
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

Expected result: all required files, page metadata, API and event-stream
connections, responsive rules, and core UI modules pass validation.

### Manual UI test

1. Start MongoDB and the CAMS API, then open the page at desktop width.
2. Verify an incorrect password is rejected.
3. Sign in with a real account stored in MongoDB.
4. Reload the page and verify the server session is restored.
5. Open the account menu and verify Sign out revokes the server session.
6. Start the telemetry simulator and verify CAMS-01 updates at 500 ms intervals.
7. Open Machines and test search and every status filter.
8. Open CAMS-01 and verify flow, pressure, suction, raw PV1/PV2/PV3, ERR1/ERR2/ERR3,
   conversion quality, and calibration version.
9. Change machine, parameter, and time range on Trends and verify the chart and
   statistics use stored telemetry readings.
10. Filter alarms and test View, Acknowledge, and Resolve.
11. Review Maintenance, Reports, Settings, and Energy preview screens.
12. Repeat at tablet and mobile widths, including the mobile sidebar.
13. Check the browser console for errors.
14. Open Reports and download telemetry and fleet files in both XLSX and PDF.

### Recorded test result

- **Configuration:** Local CAMS API, MongoDB 7.0.43, Mosquitto 2.0.22, MQTT
  simulator, static UI, current Chromium browser
- **Date:** 2026-10-06
- **Responsible:** CAMS Project Team
- **Expected result:** Invalid credentials fail; a valid MongoDB account signs
  in; MQTT data appears in the machine list and charts; the session survives
  reload and is revoked on logout
- **Observed result:** The authenticated browser loaded 13 MongoDB machines and
  displayed CAMS-01 flow, pressure, suction, raw PLC values, error registers,
  calibration version, and quality. Five bounded samples were stored with
  501–503 ms intervals.

## Current status

- UI design: implemented
- Responsive layout: implemented
- MongoDB-backed compressor fleet: implemented locally
- Review interactions: implemented
- Compact E7 powered-by mark: implemented
- MongoDB-backed login and server sign-out: implemented locally
- Automated structural checks: implemented
- Authentication API integration: implemented locally
- MQTT integration: implemented locally
- Three calibrated sensor fields and PLC diagnostics: implemented locally
- Live dashboard and stored trend integration: implemented locally
- Authenticated XLSX and PDF exports: implemented locally
- Same-origin production web/API container: implemented locally
- Authentication database integration: implemented locally
- Owner-only user list, account creation, and access controls: implemented locally
- Production authentication deployment: not started

## Known issues and limitations

- The included simulator produces synthetic readings for local testing; no
  production sensor data is included in the repository.
- Production login remains unavailable until the API and MongoDB are hosted and
  the GitHub repository variable `CAMS_API_URL` is configured.
- Password-reset email, MFA, role editing, account deletion, and authentication
  audit events are not implemented yet.
- Alarm acknowledgement and resolution exist only in browser memory.
- Refreshing the page resets all UI state.
- Alarm exports remain disabled until real alarm persistence is implemented.
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

The next phase should connect alarm workflows and exports, then confirm the real
machine inventory, engineering units, thresholds, permissions, device identity,
and production hosting configuration before commissioning.
