# CAMS ESP32-S3 RS485 Gateway

## Project name and objective

This project reads three PLC DINT process values over Modbus RTU every 500 ms,
applies the measured flow, suction, and pressure calibrations, and publishes raw
and engineering values to the CAMS MQTT ingestion service with QoS 1.

## Responsible team member

**Owner:** CAMS Project Team

## Hardware requirements

- ESP32-S3 development board
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
3. Confirm the GPIO assignments, PLC serial settings, slave ID, Modbus offsets,
   and DINT word order in `include/config.h`.
4. Build with `pio run` and upload with `pio run --target upload`.
5. Open the serial monitor with `pio device monitor`.

The current assumptions are FC04 input-register reads, PV start offset 1535,
error start offset 767, high-word-first DINT values, slave ID 1, 9600 baud,
8E1, and GPIO 18/17/16 for RX/TX/direction. These are commissioning defaults,
not confirmed production values.

## MQTT contract

The gateway publishes to `cams/plant-01/CAMS-01/telemetry`. Each payload includes
the UTC timestamp, epoch-millisecond sequence, status, raw PV values, PLC error
codes, converted metrics, calibration version, and per-sensor quality.

## Testing procedure

1. Keep the ESP32 disconnected from production equipment and verify the RS485
   transceiver direction signal with a safe bench setup.
2. Confirm PV1/PV2/PV3 in PLC software and compare them with the serial output.
3. If the DINT values are incorrect, verify offset convention and word order.
4. Compare all conversions against the supplied calibration points.
5. Confirm one MQTT message every 500 ms and zero rejected backend messages.
6. Confirm raw values, converted values, timestamps, and error codes in MongoDB.
7. Compare the live webpage values with the PLC display under supervised operation.

## Current status

**Testing**

- Firmware structure and 500 ms scheduler: implemented
- Three-value contiguous Modbus read: implemented with unverified configuration
- Empirical calibration equations: implemented
- MQTT QoS 1 payload: implemented
- Physical PLC communication: unverified
- Production MQTT credentials and TLS: not configured

## Known issues and limitations

- The exact ESP32-S3 board pins and PLC serial parameters have not been supplied.
- The Modbus reference-to-offset convention and DINT word order require a bench test.
- Pressure is calibrated only from 0–7 bar, flow from about -22–50 L/min, and
  suction from 0.6–1.8 kPa. Values outside these ranges are marked uncertain.
- Samples read while Wi-Fi/MQTT is unavailable are logged but not buffered yet.
- Local commissioning uses plaintext MQTT on a protected LAN; production must
  use authenticated TLS and per-device access control.

## Results and observations

The conversion equations reproduce the provided measurements with a flow RMSE
of approximately 0.67 L/min and suction RMSE of approximately 0.020 kPa. Final
hardware results must be recorded after PLC register addressing, byte order,
units, and electrical connections are confirmed on the supervised bench.
