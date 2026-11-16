# CAMS — Compressed Air Monitoring System

CAMS is an industrial monitoring platform for receiving ESP32/PLC telemetry,
tracking compressor health, managing alarms and maintenance, and presenting
real-time plant information through a browser dashboard.

This repository is the complete, deployable project. Application components
are separated by responsibility so frontend, backend, firmware, infrastructure,
and documentation can be reviewed independently.

## System architecture

```text
ESP32-S3 / PLC sensors
          |
          | MQTT over TLS (8883)
          v
      Mosquitto
          |
          v
  Dedicated MQTT worker ---- Redis Pub/Sub
          |                       |
          v                       v
       MongoDB          API-1  API-2  API-3  API-4
                              |
                              v
                    Nginx least-connection
                              |
                              v
                      CAMS browser users
```

- **Frontend:** HTML, CSS and JavaScript ES modules.
- **Backend:** Node.js, Express and MongoDB.
- **Live telemetry:** MQTT over TLS, one dedicated ingestion worker and SSE.
- **Horizontal API scaling:** Nginx distributes requests across four API replicas.
- **Cross-replica events:** Redis Pub/Sub.
- **Deployment:** Docker Compose with persistent MongoDB and MQTT volumes.

## Repository structure

```text
.
├── cams-api/                 Backend API, tests and Docker infrastructure
│   ├── docker/               MongoDB, Mosquitto, Nginx and certificate templates
│   ├── docs/                 Backend live-monitoring notes
│   ├── scripts/              Administrative and database utilities
│   ├── src/                  API and telemetry source code
│   └── test/                 Unit and integration tests
├── cams-webpage/             Browser dashboard and UI validation
├── esp32-devices/            Legacy/example device sketches
├── esp32-rs485-gateway/      Maintained ESP32-S3 RS485 gateway firmware
├── load-tests/               k6 concurrent-user test
├── docs/
│   ├── API.md                API groups and request flow
│   ├── ARCHITECTURE.md       Runtime services and data flow
│   ├── deployment/           Secure deployment and Nginx guides
│   ├── firmware/             Multi-device firmware guide
│   └── guides/               Development and handover workflows
├── .github/workflows/        UI, API, Docker and Nginx validation
└── README.md                 Project entry point
```

## Quick start

Requirements: Docker Desktop/Engine with Compose v2.

```bash
cp cams-api/.env.example cams-api/.env
```

Set strong local values in `cams-api/.env`, install the correct MQTT TLS
certificate files, then start the complete stack:

```bash
cd cams-api
docker compose up -d --build
docker compose ps
```

Open `http://localhost:3100`. For the current on-premise server, use
`http://192.168.0.128:3100` while connected to the plant network.

See [deployment/start guide](docs/deployment/START-HERE.md) and
[secure setup](docs/deployment/SECURE-SETUP.md) before production use.

## Validation

```bash
cd cams-webpage && npm test
cd ../cams-api && npm ci && npm test
docker compose config --quiet
```

The CI workflow also builds the production image and validates the Nginx
configuration. The included k6 scenario is documented in
[NGINX-1000-USERS.md](docs/deployment/NGINX-1000-USERS.md). Four replicas make
the service ready for load testing; they do not by themselves guarantee a
1,000-user capacity. Confirm capacity on production-equivalent hardware.

## API documentation

The backend is fully isolated in [`cams-api/`](cams-api/). Start with:

- [API overview](docs/API.md)
- [Backend README](cams-api/README.md)
- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Live monitoring](cams-api/docs/LIVE-MONITORING.md)

## Security

Never commit `.env` files, passwords, device credentials, private keys,
production certificates, database exports, or customer telemetry. Only example
configuration belongs in Git. Rotate any secret that has previously appeared in
a commit, ZIP archive, terminal output, or screenshot.

## Current status

The frontend, authenticated API, MongoDB persistence, MQTT ingestion, alarms,
tickets, exports, four-replica Nginx stack and Redis event distribution are
implemented. Live online status and health values are derived from actual ESP32
telemetry; the application does not manufacture online readings.
