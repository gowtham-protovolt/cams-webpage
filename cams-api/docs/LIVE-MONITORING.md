# CAMS Live Monitoring

## Overview

CAMS receives one-second PLC readings through ESP32-S3 gateways and MQTT. The API validates and stores every accepted reading, calculates an authoritative machine state and health score, maintains alarms, and broadcasts updates to authenticated browsers using Server-Sent Events (SSE).

```text
PLC → ESP32-S3 → Mosquitto → CAMS API → MongoDB → SSE → Dashboard
```

No live value is generated in the browser. Pressure, flow, suction, diagnostics, status, health, and alarms originate from MQTT and the backend monitoring rules.

## MQTT topics

Each gateway uses its own authenticated identity and topics:

```text
cams/plant-01/CAMS-01/telemetry
cams/plant-01/CAMS-01/status
cams/plant-01/CAMS-02/telemetry
cams/plant-01/CAMS-02/status
cams/plant-01/CAMS-03/telemetry
cams/plant-01/CAMS-03/status
```

The retained status message is `online` while the gateway is connected. Its MQTT Last Will publishes `offline` if the connection is lost unexpectedly. A stale-data timer independently marks the machine offline when no telemetry arrives within `TELEMETRY_STALE_SECONDS`.

## Machine states

- `running`: fresh telemetry, gateway available, and no critical PLC/sensor error.
- `stopped`: fresh telemetry explicitly reports stopped.
- `alarm`: fresh telemetry reports alarm, contains a PLC error, or has bad sensor quality.
- `offline`: telemetry is stale/unavailable or the gateway Last Will reports offline.

Gateway and PLC-link states remain separate. A gateway can remain online while PLC telemetry is stale; the machine is then offline, gateway online, and PLC link offline.

## Health score

The backend starts at 100 and applies deterministic deductions:

- PLC/Modbus error: −35
- Bad sensor quality: −20
- Uncertain sensor quality: −8
- Each parameter outside its configured range: −10
- Stopped state: maximum 85
- Alarm state: maximum 55
- Offline state: 0

Every `/api/machines` response and live telemetry event carries `monitoring.status`, `health`, gateway/PLC states, communication percentage, reasons, telemetry age, and the active thresholds.

## Configuration

Set these only in the ignored `cams-api/.env` file when plant-approved limits are available:

```env
TELEMETRY_STALE_SECONDS=10
PRESSURE_BAR_MIN=6.8
PRESSURE_BAR_MAX=7.5
FLOW_LPM_MIN=22
FLOW_LPM_MAX=28
SUCTION_KPA_MIN=0.6
SUCTION_KPA_MAX=1.8
MQTT_STATUS_TOPIC=cams/+/+/status
```

Rebuild after changing Docker environment values:

```bash
docker compose up -d --build
```

## Alarms

CAMS stores active, acknowledged, and resolved alarms in MongoDB. Conditions include parameter limit violations, PLC error codes, bad sensor quality, bad Modbus quality, gateway Last Will, and stale telemetry. An alarm uses a stable machine/condition identifier so repeated one-second readings update the same event instead of creating duplicates. Recovery resolves the event automatically. Owners and operators can acknowledge or resolve events through the protected API and UI.

## APIs

Authenticated endpoints:

```text
GET   /api/machines
GET   /api/machines/:machineId/telemetry
GET   /api/telemetry/stream
GET   /api/alarms
PATCH /api/alarms/:alarmId
```

The SSE stream emits `telemetry`, `machine-status`, and `alarm` events. The frontend updates the Machines table, machine detail page, trends, status filters, notification count, and alarm list without a page reload.

## Verification

```bash
cd "/Users/gowtham/Desktop/CAMS-VSCode-Workspace/cams-api"
npm test
docker compose up -d --build
docker compose ps
curl http://localhost:3100/api/health
```

Real commissioning still requires validating PLC register offsets, DINT word order, engineering conversions, and threshold limits against the physical equipment under supervised conditions.
