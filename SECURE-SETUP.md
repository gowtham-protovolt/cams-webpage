# CAMS secure setup checklist

This source package deliberately contains no real passwords, Wi-Fi details,
API keys, access tokens, certificates, customer data, or sensor history.

## Docker API, MongoDB, and Mosquitto

1. Copy `cams-api/.env.example` to `cams-api/.env`.
2. Replace every `replace-with-...` value with a unique local secret.
3. Keep the following values paired:
   - `MQTT_USERNAME` and `MQTT_PASSWORD` are used by the CAMS backend.
   - `MQTT_DEVICE_USERNAME` and `MQTT_DEVICE_PASSWORD` are used by CAMS-01.
4. From `cams-api`, run `docker compose up -d --build`.
5. Create the owner account with the documented `npm run create-admin` command.

Local endpoints:

- CAMS webpage/API: `http://localhost:3100`
- MongoDB from the host: `mongodb://127.0.0.1:27018`
- ESP32 MQTT broker: `<docker-host-LAN-IP>:1884`
- Device topic: `cams/plant-01/CAMS-01/telemetry`
- Authenticated tree API: `/api/telemetry/tree?machineId=CAMS-01`

## ESP32-S3

For PlatformIO, copy `esp32-rs485-gateway/include/secrets.example.h` to
`secrets.h` in the same directory. For Arduino IDE, use the corresponding
template inside the Arduino sketch folder.

The ESP32 MQTT password must match `MQTT_DEVICE_PASSWORD` in the API `.env`.
Use the Docker host's current LAN address for `MQTT_HOST`. Local commissioning
uses port 1884; use MQTT over TLS for production or any untrusted network.

Never put real secrets into GitHub, a public ZIP, screenshots, or support
messages. This package provides all required variable names and placeholders;
the actual values must be supplied securely for each installation.

