# CAMS Webpage Projects

This repository contains the review-stage user interface for **CAMS —
Compressed Air Monitoring System**.

The application is intentionally stored inside its own project directory. No
application source files are placed directly in the repository root.

## Repository structure

```text
cams-webpage/
├── .github/workflows/validate.yml
├── .gitignore
├── CONTRIBUTING.md
├── README.md
├── shared/
│   └── README.md
├── cams-api/
│   ├── README.md
│   ├── docker-compose.yml
│   ├── package.json
│   ├── scripts/
│   ├── src/
│   └── test/
├── esp32-rs485-gateway/
│   ├── arduino/cams_esp32_rs485_gateway/
│   │   └── cams_esp32_rs485_gateway.ino
│   ├── include/
│   ├── src/
│   └── platformio.ini
└── cams-webpage/
    ├── README.md
    ├── app.js
    ├── index.html
    ├── package.json
    ├── scripts/
    │   └── validate.mjs
    └── styles.css
```

## Project

See [cams-webpage/README.md](cams-webpage/README.md) for objectives,
requirements, setup, testing, current status, limitations, and observations.

## Status

**In Progress** — the E7-branded UI, real authentication API, MongoDB storage,
MQTT ingestion, protected telemetry APIs, and live dashboard integration are
implemented locally. Authenticated PDF/XLSX exports are also implemented;
production deployment remains the final infrastructure step.
The repository now includes a same-origin production container so the API and
webpage can be deployed together without third-party session cookies.
Owner-only user administration is implemented for listing accounts, creating
operator/viewer users, and enabling or disabling access.
The ESP32-S3 gateway firmware now reads PLC PV1/PV2/PV3 over Modbus RTU every
500 ms, applies the measured calibrations, and publishes raw and converted
values through a device-restricted MQTT topic. Hardware wiring and PLC serial
settings still require supervised commissioning.
The obsolete simulator/dashboard Docker project and its simulated-data volumes
were removed. The maintained Docker stack now contains the CAMS webpage/API,
MongoDB, and authenticated Mosquitto broker only.

## Implementation roadmap

1. **Real authentication and API foundation — local implementation complete**
2. **MongoDB operational data models — local implementation complete**
3. **MQTT ingestion and live telemetry API — local implementation complete**
4. **Dashboard API integration — local implementation complete**
5. **Alarm workflows — planned**
6. **PDF/Excel exports — local implementation complete**
7. **Deployment container and security validation — local implementation complete**
8. **Owner user administration — local implementation complete**
9. **Managed-service provisioning and production verification — external setup required**
10. **ESP32-S3 RS485 gateway and three-sensor payload — compile-verified; hardware test required**

Step 1 is intentionally not described as production-complete until a managed
MongoDB deployment, HTTPS API host, secrets, real owner account, and production
domain/cookie configuration are verified.

## Contribution workflow

All changes must be made on a clearly named feature, fix, experiment, or
project branch. Test changes locally, open a pull request, and obtain review
before merging to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Confidentiality

This repository contains application code and ESP32-S3 gateway firmware. It
does not include a fake telemetry publisher. Do not commit passwords, tokens, certificates, personal
information, customer data, real plant readings, or confidential documents.
