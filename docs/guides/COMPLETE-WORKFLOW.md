# CAMS Complete Workflow and File Paths

## Runtime flow

```text
PLC sensors
  → RS485 / CAN
ESP32-S3 gateway
  → Wi-Fi / authenticated MQTT
Mosquitto broker
  → MQTT subscriber
CAMS API
  → validation and conversion
MongoDB
  → authenticated API and SSE
CAMS dashboard
```

## Important paths

- Docker Compose: `cams-api/docker-compose.yml`
- API image: `cams-api/Dockerfile`
- Environment: `cams-api/.env`
- Mosquitto: `cams-api/docker/mosquitto.conf`
- MQTT handler: `cams-api/src/telemetry/mqtt.js`
- Telemetry schema: `cams-api/src/telemetry/schema.js`
- MongoDB store: `cams-api/src/telemetry/store.js`
- API routes: `cams-api/src/routes/`
- Web controller: `cams-webpage/app.js`
- Separate pages: `cams-webpage/src/pages/`
- ESP32 source: `esp32-rs485-gateway/src/main.cpp`
- ESP32 secrets: `esp32-rs485-gateway/include/secrets.h`

## Containers

- `CAMS`: API and webpage, port 3100
- `CAMS-MongoDB`: database, local port 27018
- `CAMS-Mosquitto`: MQTT broker, port 1884
- `CAMS-MQTT-Config`: one-time MQTT credential setup; Exited (0) is normal

## MongoDB tree

```text
CAMS
└── CAMS-01
    └── YYYY-MM-DD
        └── HH-mm-ss
            ├── flow
            ├── pressure
            └── suction
```

## Common commands

```bash
cd cams-api
docker compose up -d --build
docker compose ps
docker compose logs -f app
docker compose down
```
