# CAMS: 13 devices + live monitoring (merged, v2)

## What is in this package
- Live monitoring code (alarms, health, stale detection, Settings page) from the "worked after 7PM" files.
- Multi-device broker: users CAMS-01 ... CAMS-99 are created automatically.
- Website fixes: Dashboard / Live data follow the selected machine (no fixed CAMS-01), dashboard lists all machines.
- ESP32 sketches that match the API (JSON status messages, NTP timestamp, sequence = epoch seconds).

## Start / update (Mac)
Double-click `RUN-CAMS.command` or:

    cd cams-api
    docker compose run --rm mqtt-config
    docker compose up -d --build
    docker compose restart mqtt

## MQTT login rule
| Machine | MQTT user | MQTT password |
|---|---|---|
| CAMS-05 | CAMS-05 | cam005 |
| CAMS-14 | CAMS-14 | cam014 |

The ESP32 builds the password itself from MACHINE_ID. Nothing to add in Docker for a new device (up to CAMS-99).
Exception: `cams-api/docker/devices.txt` can override a password. It currently holds only CAMS-02 (already flashed with a custom password).

## ESP32
- `esp32-devices/CAMS-device/CAMS-device.ino`: universal sketch. Change only `MACHINE_ID` (and WiFi, calibration).
- `esp32-devices/CAMS-02-custom-password/`: for the CAMS-02 board that already runs with the custom password. Flash it once to get the JSON status messages.
- Later, to move CAMS-02 to the normal rule: empty `devices.txt`, run RUN-CAMS.command, flash CAMS-device.ino with MACHINE_ID "CAMS-02".

## Alarm limits (important)
Default limits (env or Settings page): pressure 6.8-7.5 bar, flow 22-28 L/min, suction 0.6-1.8 kPa.
A machine with no air running (0 bar, flow about -2) will show alarms and a low health score. Change the limits in `.env`
(PRESSURE_BAR_MIN/MAX, FLOW_LPM_MIN/MAX, SUCTION_KPA_MIN/MAX) or on the Settings page.
A machine is marked offline when no telemetry arrives for TELEMETRY_STALE_SECONDS (10 s).

## Secrets
`.env`, `docker/devices.txt` and the sketches contain passwords. Do not share or commit them.
