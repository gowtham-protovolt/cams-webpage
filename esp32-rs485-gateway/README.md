# CAMS ESP32-S3 RS485 Gateway

## Project name and objective

This project reads three PLC DINT process values over Modbus RTU every 1 second,
applies the measured flow, suction, and pressure calibrations, and publishes raw
and engineering values to the CAMS MQTT ingestion service with QoS 1. Every
sample is first persisted in the ESP32-S3's LittleFS partition, so a temporary
Wi-Fi, broker, or API outage does not discard telemetry.

## Responsible team member

**Owner:** CAMS Project Team

## Hardware requirements

- ESP32-S3 development board
- 16 MB flash (the partition layout reserves about 9.9 MB for LittleFS)
- Isolated, 3.3 V-compatible RS485 transceiver
- PLC with Modbus RTU slave support
- Correct A/B polarity, common reference as required, shielding, and termination
- Supervised access to the machine panel and emergency-stop system

Do not connect RS485 A/B directly to ESP32 GPIO pins. CAMS is monitoring only;
it must not write PLC registers or replace PLC interlocks and safety logic.

## Software requirements

- Visual Studio Code with PlatformIO, or PlatformIO Core
- Espressif Arduino framework
- ModbusMaster, MQTT, and ArduinoJson libraries installed by PlatformIO

## Installation and setup

1. Copy `include/secrets.example.h` to `include/secrets.h`.
2. Put the plant Wi-Fi and device-specific MQTT credentials in `secrets.h`.
   The MQTT username must equal the machine ID (`CAMS-01`, `CAMS-02`, and so
   on), because the broker ACL restricts each account to its own topic.
3. Confirm the GPIO assignments, PLC serial settings, slave ID, Modbus offsets,
   and DINT word order in `include/config.h`.
4. Build and upload the target matching the physical compressor:
   `pio run -e cams-01 --target upload`, `pio run -e cams-02 --target upload`,
   or `pio run -e cams-03 --target upload`.
5. Open the serial monitor with `pio device monitor`.

Use the PlatformIO project for this firmware. `partitions.csv` is required for
the offline queue and is selected by `platformio.ini`. The first upload using
this layout creates the LittleFS partition. Do not use a generic Arduino IDE
partition layout for this build.

The current assumptions are FC04 input-register reads, PV start offset 1535,
error start offset 767, high-word-first DINT values, slave ID 1, 9600 baud,
8E1, and GPIO 18/17/16 for RX/TX/direction. These are commissioning defaults,
not confirmed production values.

## MQTT contract

The three firmware targets publish to `cams/plant-01/CAMS-01/telemetry`,
`cams/plant-01/CAMS-02/telemetry`, or `cams/plant-01/CAMS-03/telemetry`.
Each target has a unique MQTT client ID and broker identity. Each payload includes
the UTC timestamp, epoch-millisecond sequence, status, raw PV values, PLC error
codes, converted metrics, calibration version, and per-sensor quality.

After MongoDB accepts a sample, the API publishes a QoS 1 acknowledgement to
`cams/plant-01/<machine-id>/ack`. Firmware removes a queued record only when the
acknowledgement contains its matching sequence and `stored: true`. Duplicate
replays are safe because the backend deduplicates by site, machine, and sequence.

## Offline store-and-forward

- Sampling continues once per second while MQTT or Wi-Fi is unavailable.
- Samples are stored as compact checksummed binary records in LittleFS.
- The queue retains up to 86,400 samples, approximately 24 hours at 1 Hz.
- After reconnection, records replay oldest-first at up to 20 samples per second
  while new 1-second samples continue to be collected.
- Recovered historical samples are added to telemetry history and graphs, but an
  older recovered sample cannot replace the machine's newer live snapshot or
  create a current alarm from old data.
- If the queue reaches its fixed capacity, the oldest hour is removed to preserve
  space for current data, and the event is reported through the serial log.

The clock must have synchronized successfully before an outage. If the device
reboots while it has no network time, it waits for valid time before creating
new records. Already queued records remain available and replay after reconnect.

## Testing procedure

1. Keep the ESP32 disconnected from production equipment and verify the RS485
   transceiver direction signal with a safe bench setup.
2. Confirm PV1/PV2/PV3 in PLC software and compare them with the serial output.
3. If the DINT values are incorrect, verify offset convention and word order.
4. Compare all conversions against the supplied calibration points.
5. Confirm one MQTT message every 1 second and zero rejected backend messages.
6. Confirm raw values, converted values, timestamps, and error codes in MongoDB.
7. Compare the live webpage values with the PLC display under supervised operation.
8. Disconnect Wi-Fi for at least 60 seconds and confirm the serial monitor shows
   an increasing `[buffer] ... pending` count.
9. Restore Wi-Fi and confirm the pending count returns to zero only after storage
   acknowledgements arrive.
10. In MongoDB and the webpage trend, confirm every outage timestamp appears once,
    in timestamp order, and the current machine status remains based on the newest
    sample.

## Current status

**Testing**

- Firmware structure and 1-second scheduler: implemented
- Three-value contiguous Modbus read: implemented with unverified configuration
- Empirical calibration equations: implemented
- MQTT QoS 1 payload: implemented
- 24-hour LittleFS offline queue: implemented
- Backend storage acknowledgement and idempotent replay: implemented
- Physical PLC communication: unverified
- Production MQTT credentials and TLS: not configured

## Known issues and limitations

- The exact ESP32-S3 board pins and PLC serial parameters have not been supplied.
- The Modbus reference-to-offset convention and DINT word order require a bench test.
- Pressure is calibrated only from 0–7 bar, flow from about -22–50 L/min, and
  suction from 0.6–1.8 kPa. Values outside these ranges are marked uncertain.
- A device reboot during a network outage cannot timestamp new samples until its
  clock is valid; adding the board RTC as a trusted boot-time source is future work.
- The 24-hour capacity assumes one sample per second and the supplied 16 MB flash
  layout. Changing sample rate or partitions requires recalculating capacity.
- Local commissioning uses plaintext MQTT on a protected LAN; production must
  use authenticated TLS and per-device access control.

## Results and observations

The conversion equations reproduce the provided measurements with a flow RMSE
of approximately 0.67 L/min and suction RMSE of approximately 0.020 kPa. Final
hardware results must be recorded after PLC register addressing, byte order,
units, and electrical connections are confirmed on the supervised bench.
