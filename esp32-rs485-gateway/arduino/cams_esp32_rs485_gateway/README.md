# CAMS Arduino IDE sketch

This folder contains the Arduino IDE version of the CAMS ESP32-S3 RS485
gateway. It is functionally equivalent to `src/main.cpp` in the PlatformIO
project.

## Required libraries

- ArduinoJson
- ModbusMaster
- MQTT by Joel Gaehwiler
- ESP32 board package by Espressif Systems

## Setup

1. Copy `secrets.example.h` to `secrets.h` in this folder.
2. Enter the plant Wi-Fi SSID/password and the device MQTT credentials in
   `secrets.h`. Do not share or commit that file.
3. Confirm the GPIOs, PLC slave ID, baud rate, parity, register offsets, and
   DINT word order in `config.h`.
4. Open `cams_esp32_rs485_gateway.ino` in Arduino IDE.
5. Select the exact ESP32-S3 board and its USB port, compile, and upload.
6. Open Serial Monitor at 115200 baud.

The sketch reads PV1/PV2/PV3 and ERR1/ERR2/ERR3 every 1 second, uses NTP for an
ISO UTC timestamp, converts the three sensor values, and publishes to
`cams/plant-01/CAMS-01/telemetry` with MQTT QoS 1.
