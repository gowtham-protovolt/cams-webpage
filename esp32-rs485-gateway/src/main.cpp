#include <Arduino.h>
#include <ArduinoJson.h>
#include <ModbusMaster.h>
#include <MQTT.h>
#include <WiFi.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"
#include "offline_queue.h"
#include "secrets.h"

#ifndef CAMS_MQTT_USERNAME
#define CAMS_MQTT_USERNAME MQTT_USERNAME_CAMS_01
#endif
#ifndef CAMS_MQTT_PASSWORD
#define CAMS_MQTT_PASSWORD MQTT_PASSWORD_CAMS_01
#endif

HardwareSerial plcSerial(2);
ModbusMaster plc;
WiFiClient networkClient;
MQTTClient mqttClient(1536);
OfflineTelemetryQueue telemetryQueue;

struct PlcSample {
  int32_t pv1;
  int32_t pv2;
  int32_t pv3;
  uint16_t err1;
  uint16_t err2;
  uint16_t err3;
};

uint32_t nextSampleAt = 0;
uint32_t lastWifiAttempt = 0;
uint32_t lastMqttAttempt = 0;
uint32_t lastBufferSendAttempt = 0;
uint32_t bufferPublishStartedAt = 0;
bool awaitingStorageAck = false;
uint64_t inFlightSequence = 0;

void enableRs485Transmit() {
  digitalWrite(PLC_DE_RE_PIN, HIGH);
}

void enableRs485Receive() {
  digitalWrite(PLC_DE_RE_PIN, LOW);
}

int32_t decodeDint(uint16_t firstWord, uint16_t secondWord) {
  const uint32_t combined = PLC_DINT_WORD_ORDER == DintWordOrder::HighWordFirst
    ? (static_cast<uint32_t>(firstWord) << 16) | secondWord
    : (static_cast<uint32_t>(secondWord) << 16) | firstWord;
  return static_cast<int32_t>(combined);
}

bool readPlcSample(PlcSample &sample) {
  uint8_t result = plc.readInputRegisters(PV_START_REGISTER, PV_REGISTER_COUNT);
  if (result != ModbusMaster::ku8MBSuccess) {
    Serial.printf("[modbus] PV read failed: 0x%02X\n", result);
    return false;
  }
  sample.pv1 = decodeDint(plc.getResponseBuffer(0), plc.getResponseBuffer(1));
  sample.pv2 = decodeDint(plc.getResponseBuffer(2), plc.getResponseBuffer(3));
  sample.pv3 = decodeDint(plc.getResponseBuffer(4), plc.getResponseBuffer(5));

  result = plc.readInputRegisters(ERROR_START_REGISTER, ERROR_REGISTER_COUNT);
  if (result != ModbusMaster::ku8MBSuccess) {
    Serial.printf("[modbus] error-register read failed: 0x%02X\n", result);
    return false;
  }
  sample.err1 = plc.getResponseBuffer(0);
  sample.err2 = plc.getResponseBuffer(1);
  sample.err3 = plc.getResponseBuffer(2);
  return true;
}

float pressureBarFromPv(int32_t pv2) {
  return ((static_cast<float>(pv2) - 1999.0f) * 7.0f) / 5569.0f;
}

float flowLpmFromPv(int32_t pv1) {
  return (static_cast<float>(pv1) - 2000.09f) / 3.95805f;
}

float suctionKpaFromPv(int32_t pv3) {
  return (static_cast<float>(pv3) - 6015.44f) / 41.1673f;
}

const char *calibrationQuality(float value, float verifiedMinimum, float verifiedMaximum, uint16_t errorCode) {
  if (errorCode != 0 || !isfinite(value)) return "bad";
  if (value < verifiedMinimum || value > verifiedMaximum) return "uncertain";
  return "good";
}

bool currentUtc(char *buffer, size_t size, uint64_t &epochMilliseconds) {
  timeval now{};
  gettimeofday(&now, nullptr);
  if (now.tv_sec < 1700000000) return false;
  tm utc{};
  gmtime_r(&now.tv_sec, &utc);
  const int milliseconds = now.tv_usec / 1000;
  snprintf(
    buffer,
    size,
    "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
    utc.tm_year + 1900,
    utc.tm_mon + 1,
    utc.tm_mday,
    utc.tm_hour,
    utc.tm_min,
    utc.tm_sec,
    milliseconds
  );
  epochMilliseconds = static_cast<uint64_t>(now.tv_sec) * 1000ULL + milliseconds;
  return true;
}

void formatUtc(uint64_t epochMilliseconds, char *buffer, size_t size) {
  const time_t seconds = static_cast<time_t>(epochMilliseconds / 1000ULL);
  tm utc{};
  gmtime_r(&seconds, &utc);
  snprintf(
    buffer,
    size,
    "%04d-%02d-%02dT%02d:%02d:%02d.%03lluZ",
    utc.tm_year + 1900,
    utc.tm_mon + 1,
    utc.tm_mday,
    utc.tm_hour,
    utc.tm_min,
    utc.tm_sec,
    epochMilliseconds % 1000ULL
  );
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  const uint32_t now = millis();
  if (now - lastWifiAttempt < WIFI_RETRY_MS) return;
  lastWifiAttempt = now;
  Serial.println("[wifi] connecting");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;
  const uint32_t now = millis();
  if (now - lastMqttAttempt < MQTT_RETRY_MS) return;
  lastMqttAttempt = now;
  Serial.println("[mqtt] connecting");
  if (mqttClient.connect(MQTT_CLIENT_ID, CAMS_MQTT_USERNAME, CAMS_MQTT_PASSWORD)) {
    mqttClient.subscribe(ACK_TOPIC, 1);
    mqttClient.publish(STATUS_TOPIC, ONLINE_STATUS_PAYLOAD, true, 1);
    awaitingStorageAck = false;
    Serial.println("[mqtt] connected");
  }
}

bool publishRecord(const BufferedTelemetryRecord &record) {
  char timestamp[32];
  formatUtc(record.observedAtMs, timestamp, sizeof(timestamp));

  const float flowLpm = flowLpmFromPv(record.pv1);
  const float pressureBar = pressureBarFromPv(record.pv2);
  const float suctionKpa = suctionKpaFromPv(record.pv3);
  const bool hasAlarm = record.err1 != 0 || record.err2 != 0 || record.err3 != 0;
  timeval now{};
  gettimeofday(&now, nullptr);
  const uint64_t nowMilliseconds = static_cast<uint64_t>(now.tv_sec) * 1000ULL + now.tv_usec / 1000;
  const bool backfilled = nowMilliseconds > static_cast<uint64_t>(record.observedAtMs) + 120000ULL;

  JsonDocument document;
  document["timestamp"] = timestamp;
  document["sequence"] = record.sequence;
  document["status"] = hasAlarm ? "alarm" : "running";
  document["source"] = "esp32-s3-rs485";
  document["calibrationVersion"] = CALIBRATION_VERSION;
  document["backfilled"] = backfilled;

  JsonObject raw = document["raw"].to<JsonObject>();
  raw["pv1"] = record.pv1;
  raw["pv2"] = record.pv2;
  raw["pv3"] = record.pv3;

  JsonObject errors = document["errors"].to<JsonObject>();
  errors["flow"] = record.err1;
  errors["pressure"] = record.err2;
  errors["suction"] = record.err3;

  JsonObject metrics = document["metrics"].to<JsonObject>();
  metrics["flowLpm"] = roundf(flowLpm * 1000.0f) / 1000.0f;
  metrics["suctionKpa"] = roundf(suctionKpa * 1000.0f) / 1000.0f;
  metrics["pressureBar"] = roundf(pressureBar * 1000.0f) / 1000.0f;

  JsonObject quality = document["quality"].to<JsonObject>();
  quality["flow"] = calibrationQuality(flowLpm, -22.0f, 50.0f, record.err1);
  quality["pressure"] = calibrationQuality(pressureBar, 0.0f, 7.0f, record.err2);
  quality["suction"] = calibrationQuality(suctionKpa, 0.6f, 1.8f, record.err3);
  quality["modbus"] = "good";

  char payload[1400];
  const size_t length = serializeJson(document, payload, sizeof(payload));
  if (length == 0 || length >= sizeof(payload)) {
    Serial.println("[mqtt] payload serialization failed");
    return false;
  }
  const bool published = mqttClient.publish(TELEMETRY_TOPIC, payload, false, 1);
  if (published) {
    Serial.printf(
      "[telemetry] seq=%llu pv=%ld,%ld,%ld flow=%.3f suction=%.3f pressure=%.3f\n",
      record.sequence,
      static_cast<long>(record.pv1),
      static_cast<long>(record.pv2),
      static_cast<long>(record.pv3),
      flowLpm,
      suctionKpa,
      pressureBar
    );
  }
  return published;
}

void handleMqttMessage(String &topic, String &payload) {
  if (topic != ACK_TOPIC) return;
  JsonDocument document;
  if (deserializeJson(document, payload) || !document["stored"].as<bool>()) return;
  const uint64_t sequence = document["sequence"].as<uint64_t>();
  if (!awaitingStorageAck || sequence != inFlightSequence) return;
  if (telemetryQueue.acknowledge(sequence)) {
    Serial.printf("[buffer] stored seq=%llu, %u pending\n", sequence, static_cast<unsigned>(telemetryQueue.pending()));
  }
  awaitingStorageAck = false;
}

void sendBufferedTelemetry() {
  if (!mqttClient.connected() || !telemetryQueue.ready()) {
    awaitingStorageAck = false;
    return;
  }
  const uint32_t now = millis();
  if (awaitingStorageAck) {
    if (now - bufferPublishStartedAt < BUFFER_RETRY_MS) return;
    awaitingStorageAck = false;
    Serial.println("[buffer] storage acknowledgement timed out; retrying");
  }
  if (now - lastBufferSendAttempt < BUFFER_SEND_INTERVAL_MS) return;
  lastBufferSendAttempt = now;
  BufferedTelemetryRecord record{};
  if (!telemetryQueue.peek(record)) return;
  if (publishRecord(record)) {
    inFlightSequence = record.sequence;
    bufferPublishStartedAt = now;
    awaitingStorageAck = true;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PLC_DE_RE_PIN, OUTPUT);
  enableRs485Receive();
  plcSerial.begin(PLC_BAUD_RATE, PLC_SERIAL_CONFIG, PLC_RX_PIN, PLC_TX_PIN);
  plc.begin(PLC_SLAVE_ID, plcSerial);
  plc.preTransmission(enableRs485Transmit);
  plc.postTransmission(enableRs485Receive);

  WiFi.mode(WIFI_STA);
  mqttClient.begin(MQTT_HOST, MQTT_PORT, networkClient);
  mqttClient.onMessage(handleMqttMessage);
  mqttClient.setWill(STATUS_TOPIC, OFFLINE_STATUS_PAYLOAD, true, 1);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  telemetryQueue.begin();
  connectWifi();
  nextSampleAt = millis() + SAMPLE_INTERVAL_MS;
}

void loop() {
  connectWifi();
  connectMqtt();
  mqttClient.loop();
  sendBufferedTelemetry();

  const uint32_t now = millis();
  if (static_cast<int32_t>(now - nextSampleAt) < 0) {
    delay(2);
    return;
  }
  nextSampleAt += SAMPLE_INTERVAL_MS;
  if (static_cast<int32_t>(now - nextSampleAt) >= 0) nextSampleAt = now + SAMPLE_INTERVAL_MS;

  PlcSample sample{};
  if (!readPlcSample(sample)) return;
  char timestamp[32];
  uint64_t sequence = 0;
  if (!currentUtc(timestamp, sizeof(timestamp), sequence)) {
    Serial.println("[time] waiting for NTP synchronization");
    return;
  }
  BufferedTelemetryRecord record{};
  record.sequence = sequence;
  record.observedAtMs = static_cast<int64_t>(sequence);
  record.pv1 = sample.pv1;
  record.pv2 = sample.pv2;
  record.pv3 = sample.pv3;
  record.err1 = sample.err1;
  record.err2 = sample.err2;
  record.err3 = sample.err3;
  if (!telemetryQueue.enqueue(record)) {
    Serial.println("[buffer] failed to persist telemetry sample");
    return;
  }
  Serial.printf("[buffer] queued seq=%llu, %u pending\n", sequence, static_cast<unsigned>(telemetryQueue.pending()));
  sendBufferedTelemetry();
}
