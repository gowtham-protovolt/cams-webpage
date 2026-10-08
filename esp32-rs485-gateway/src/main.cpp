#include <Arduino.h>
#include <ArduinoJson.h>
#include <ModbusMaster.h>
#include <MQTT.h>
#include <WiFi.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"
#include "secrets.h"

HardwareSerial plcSerial(2);
ModbusMaster plc;
WiFiClient networkClient;
MQTTClient mqttClient(1536);

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

float pressureBarFromPv(int32_t pv3) {
  return ((static_cast<float>(pv3) - 1999.0f) * 7.0f) / 5569.0f;
}

float flowLpmFromPv(int32_t pv1) {
  return (static_cast<float>(pv1) - 2000.09f) / 3.95805f;
}

float suctionKpaFromPv(int32_t pv2) {
  return (static_cast<float>(pv2) - 6015.44f) / 41.1673f;
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
  if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
    mqttClient.publish(STATUS_TOPIC, "{\"status\":\"online\"}", true, 1);
    Serial.println("[mqtt] connected");
  }
}

bool publishSample(const PlcSample &sample) {
  char timestamp[32];
  uint64_t sequence = 0;
  if (!currentUtc(timestamp, sizeof(timestamp), sequence)) {
    Serial.println("[time] waiting for NTP synchronization");
    return false;
  }

  const float flowLpm = flowLpmFromPv(sample.pv1);
  const float suctionKpa = suctionKpaFromPv(sample.pv2);
  const float pressureBar = pressureBarFromPv(sample.pv3);
  const bool hasAlarm = sample.err1 != 0 || sample.err2 != 0 || sample.err3 != 0;

  JsonDocument document;
  document["timestamp"] = timestamp;
  document["sequence"] = sequence;
  document["status"] = hasAlarm ? "alarm" : "running";
  document["source"] = "esp32-s3-rs485";
  document["calibrationVersion"] = CALIBRATION_VERSION;

  JsonObject raw = document["raw"].to<JsonObject>();
  raw["pv1"] = sample.pv1;
  raw["pv2"] = sample.pv2;
  raw["pv3"] = sample.pv3;

  JsonObject errors = document["errors"].to<JsonObject>();
  errors["flow"] = sample.err1;
  errors["suction"] = sample.err2;
  errors["pressure"] = sample.err3;

  JsonObject metrics = document["metrics"].to<JsonObject>();
  metrics["flowLpm"] = roundf(flowLpm * 1000.0f) / 1000.0f;
  metrics["suctionKpa"] = roundf(suctionKpa * 1000.0f) / 1000.0f;
  metrics["pressureBar"] = roundf(pressureBar * 1000.0f) / 1000.0f;

  JsonObject quality = document["quality"].to<JsonObject>();
  quality["flow"] = calibrationQuality(flowLpm, -22.0f, 50.0f, sample.err1);
  quality["suction"] = calibrationQuality(suctionKpa, 0.6f, 1.8f, sample.err2);
  quality["pressure"] = calibrationQuality(pressureBar, 0.0f, 7.0f, sample.err3);
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
      sequence,
      static_cast<long>(sample.pv1),
      static_cast<long>(sample.pv2),
      static_cast<long>(sample.pv3),
      flowLpm,
      suctionKpa,
      pressureBar
    );
  }
  return published;
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
  mqttClient.setWill(STATUS_TOPIC, "{\"status\":\"offline\"}", true, 1);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  connectWifi();
  nextSampleAt = millis() + SAMPLE_INTERVAL_MS;
}

void loop() {
  connectWifi();
  connectMqtt();
  mqttClient.loop();

  const uint32_t now = millis();
  if (static_cast<int32_t>(now - nextSampleAt) < 0) {
    delay(2);
    return;
  }
  nextSampleAt += SAMPLE_INTERVAL_MS;
  if (static_cast<int32_t>(now - nextSampleAt) >= 0) nextSampleAt = now + SAMPLE_INTERVAL_MS;

  PlcSample sample{};
  if (!readPlcSample(sample)) return;
  if (!mqttClient.connected()) {
    Serial.println("[mqtt] sample read but broker is unavailable");
    return;
  }
  publishSample(sample);
}
