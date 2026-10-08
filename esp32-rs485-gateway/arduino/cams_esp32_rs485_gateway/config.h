#pragma once

#include <Arduino.h>

// Confirm these pins against the exact ESP32-S3 RS485/CAN board schematic.
constexpr int PLC_RX_PIN = 18;
constexpr int PLC_TX_PIN = 17;
constexpr int PLC_DE_RE_PIN = 16;

// Confirm the PLC serial settings before connecting production equipment.
constexpr uint32_t PLC_BAUD_RATE = 9600;
constexpr uint32_t PLC_SERIAL_CONFIG = SERIAL_8E1;
constexpr uint8_t PLC_SLAVE_ID = 1;

// The screenshot shows 31536/31538/31540 as DINT input-register references.
// ModbusMaster expects zero-based PDU offsets, so 31536 becomes 1535 when
// the PLC follows the conventional 30001-based reference notation.
constexpr uint16_t PV_START_REGISTER = 1535;
constexpr uint16_t PV_REGISTER_COUNT = 6;
constexpr uint16_t ERROR_START_REGISTER = 767;
constexpr uint16_t ERROR_REGISTER_COUNT = 3;

enum class DintWordOrder { HighWordFirst, LowWordFirst };
constexpr DintWordOrder PLC_DINT_WORD_ORDER = DintWordOrder::HighWordFirst;

constexpr uint32_t SAMPLE_INTERVAL_MS = 1000;
constexpr uint32_t WIFI_RETRY_MS = 5000;
constexpr uint32_t MQTT_RETRY_MS = 3000;

constexpr char SITE_ID[] = "plant-01";
constexpr char MACHINE_ID[] = "CAMS-01";
constexpr char MQTT_CLIENT_ID[] = "cams-esp32-001";
constexpr char TELEMETRY_TOPIC[] = "cams/plant-01/CAMS-01/telemetry";
constexpr char STATUS_TOPIC[] = "cams/plant-01/CAMS-01/status";
constexpr char CALIBRATION_VERSION[] = "empirical-2026-10-06-v1";
