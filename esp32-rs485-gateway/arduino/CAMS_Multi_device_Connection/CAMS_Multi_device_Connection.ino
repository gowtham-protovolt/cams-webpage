// ESP32-S3-RS485-CAN (Waveshare) -> Selec PLC Modbus RTU Slave -> WiFi -> MQTT (CAMS Docker API)
// ONE sketch for all devices: only MACHINE_ID (+ WiFi / calibration) changes. MQTT password is auto-built from MACHINE_ID.
// PV registers: FC04, address = ModbusAddr - 30000 (31536 -> 1536), DINT = low word first
//
// Payload matches cams-api/src/schema.js (parseTelemetryMessage):
//   topic : cams/{siteId}/{machineId}/telemetry
//   body  : sequence, timestamp (ISO), status, source, metrics{pressureBar,flowLpm,suctionKpa},
//           raw{pv1,pv2,pv3}, quality{flow,suction,pressure,modbus}
//
// Libraries: PubSubClient (Nick O'Leary)

#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include <PubSubClient.h>

// =====================================================================
//  PER-DEVICE CONFIG  (13 devices ku, intha block mattum maathunga)
// =====================================================================
#define SITE_ID      "plant-01"
#define MACHINE_ID   "CAMS-01"          // format: CAMS-NN (NN = 01..99). Website la ithe ID thaan theriyum

// WiFi (2.4 GHz)
const char* WIFI_SSID = "Office";
const char* WIFI_PASS = "!QW!12qw";

// Per-device calibration (ovvoru PLC / sensor set ku thani-thani measure pannanum)
#define FLOW_OFFSET        2000.09f    // flowLMin    = (PV1 - OFFSET) / SLOPE
#define FLOW_SLOPE         3.95805f
#define SUCTION_OFFSET     6015.44f    // suctionKPa  = (PV3 - OFFSET) / SLOPE
#define SUCTION_SLOPE      41.1673f
#define PRESSURE_ZERO_RAW  1999.0f     // pressureBar = (PV2 - ZERO) * FULL_BAR / SPAN_RAW
#define PRESSURE_FULL_BAR  7.0f
#define PRESSURE_SPAN_RAW  5569.0f

// ================= MQTT (CAMS Docker) =================
const char* MQTT_HOST = "192.168.0.184";                 // Docker host (Mac) LAN IP
const int   MQTT_PORT = 1884;                            // host port mapped to container 1883
const char* MQTT_USER = MACHINE_ID;                      // username = machine ID (broker ACL %u)
#define MQTT_PASS_OVERRIDE ""   // normal ah kaali ah vidunga. devices.txt la custom password irundha mattum fill pannunga
char        MQTT_PASS[40];                               // auto: "cam0" + last 2 digits of MACHINE_ID (CAMS-05 -> cam005)
const char* MQTT_CLIENT_ID = "cams-esp32-" MACHINE_ID;   // unique per device

// Topics auto-build aagum: cams/plant-01/CAMS-02/telemetry
const char* TOPIC_TELEMETRY = "cams/" SITE_ID "/" MACHINE_ID "/telemetry";
const char* TOPIC_STATUS    = "cams/" SITE_ID "/" MACHINE_ID "/status";

#define FIRMWARE_VERSION "cams-esp32-1.1"
// API expects JSON on the status topic: {"status":"online"|"offline", ...}
const char* STATUS_ONLINE  = "{\"status\":\"online\",\"machineId\":\"" MACHINE_ID "\",\"firmwareVersion\":\"" FIRMWARE_VERSION "\"}";
const char* STATUS_OFFLINE = "{\"status\":\"offline\",\"machineId\":\"" MACHINE_ID "\",\"firmwareVersion\":\"" FIRMWARE_VERSION "\"}";

#define PUBLISH_INTERVAL_MS   2000   // keep >= 1000 (sequence = epoch seconds, must be unique)
#define MQTT_RETRY_MS         5000
#define WIFI_RETRY_MS         10000
#define MIN_VALID_EPOCH       1700000000UL   // NTP sync aagiducha nu check

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// ---------- Onboard RS485 ----------
#define RS485_TX     17
#define RS485_RX     18
#define RS485_EN     21
#define EN_TX_LEVEL  HIGH

// ---------- Modbus ----------
#define SLAVE_ID     1
#define BAUD         115200
#define SERIAL_CFG   SERIAL_8N2
#define FUNC_CODE    0x04
#define START_ADDR   1536     // 31536 - 30000
#define NUM_REGS     6        // 3 PV x 2 registers
#define WORD_SWAP    true     // low word first
#define DEBUG_HEX    0        // 1 na TX/RX hex print aagum

// ---------- Sensor -> PV mapping (0 = PV1, 1 = PV2, 2 = PV3) ----------
// PV1 = Flow (SMC), PV2 = Pressure (CKD), PV3 = Suction (SMC)
#define IDX_FLOW      0
#define IDX_PRESSURE  1
#define IDX_SUCTION   2

uint32_t lastPublish = 0;
uint32_t lastMqttTry = 0;
uint32_t lastWifiTry = 0;
uint32_t lastSeq     = 0;

// ================= Modbus =================
uint16_t crc16(const uint8_t *d, size_t n) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < n; i++) {
    crc ^= d[i];
    for (int b = 0; b < 8; b++)
      crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
  }
  return crc;
}

void printHex(const char *label, const uint8_t *d, size_t n) {
  Serial.print(label);
  for (size_t i = 0; i < n; i++) Serial.printf("%02X ", d[i]);
  Serial.println();
}

bool readRegs(uint8_t fc, uint16_t addr, uint16_t qty, uint16_t *out) {
  uint8_t req[8] = {SLAVE_ID, fc, (uint8_t)(addr >> 8), (uint8_t)addr,
                    (uint8_t)(qty >> 8), (uint8_t)qty, 0, 0};
  uint16_t c = crc16(req, 6);
  req[6] = c & 0xFF;
  req[7] = c >> 8;

  while (Serial1.available()) Serial1.read();
  if (DEBUG_HEX) printHex("TX: ", req, 8);

  digitalWrite(RS485_EN, EN_TX_LEVEL);
  delayMicroseconds(100);
  Serial1.write(req, 8);
  Serial1.flush();
  delayMicroseconds(100);
  digitalWrite(RS485_EN, !EN_TX_LEVEL);

  const size_t expected = 5 + qty * 2;
  uint8_t resp[64];
  size_t n = 0;
  uint32_t t0 = millis(), last = t0;
  while (millis() - t0 < 500) {
    while (Serial1.available() && n < sizeof(resp)) { resp[n++] = Serial1.read(); last = millis(); }
    if (n >= expected) break;
    if (n > 0 && millis() - last > 20) break;
  }

  if (n == 0) { Serial.println("No response"); return false; }
  if (DEBUG_HEX) printHex("RX: ", resp, n);
  if (n < 5) { Serial.println("Frame short"); return false; }
  if (resp[0] != SLAVE_ID) { Serial.println("Wrong slave ID"); return false; }
  if (resp[1] & 0x80) { Serial.printf("Modbus exception 0x%02X\n", resp[2]); return false; }
  if (n < expected) { Serial.printf("Incomplete: %d/%d bytes\n", (int)n, (int)expected); return false; }

  uint16_t rc = resp[expected - 2] | (resp[expected - 1] << 8);
  if (rc != crc16(resp, expected - 2)) { Serial.println("CRC error"); return false; }

  for (int i = 0; i < qty; i++)
    out[i] = (resp[3 + i * 2] << 8) | resp[4 + i * 2];
  return true;
}

// ================= WiFi / MQTT =================
void connectWiFi(bool blocking) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (!blocking && millis() - lastWifiTry < WIFI_RETRY_MS) return;
  lastWifiTry = millis();

  Serial.printf("WiFi connecting to %s ...\n", WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  if (blocking) {
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(250);
    if (WiFi.status() == WL_CONNECTED)
      Serial.printf("WiFi OK, IP: %s\n", WiFi.localIP().toString().c_str());
    else
      Serial.println("WiFi not connected yet (will retry)");
  }
}

void connectMQTT() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttTry < MQTT_RETRY_MS) return;
  lastMqttTry = millis();

  Serial.printf("MQTT connecting to %s:%d ...\n", MQTT_HOST, MQTT_PORT);
  // Last Will: connection poyiduchuna broker "offline" nu status publish pannum
  if (mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS,
                   TOPIC_STATUS, 1, true, STATUS_OFFLINE)) {
    Serial.println("MQTT connected");
    mqtt.publish(TOPIC_STATUS, STATUS_ONLINE, true);
  } else {
    // rc: -2 host unreachable, 4 bad user/pass, 5 not authorised
    Serial.printf("MQTT connect failed, rc=%d\n", mqtt.state());
  }
}

// ================= Telemetry =================
// Value range kulla clamp pannum (API range thaandina message reject aagum).
// Range thaandina andha sensor quality = "bad" nu mark aagum.
float clampf(float v, float lo, float hi, bool &bad) {
  if (!isfinite(v)) { bad = true; return 0.0f; }
  if (v < lo) { bad = true; return lo; }
  if (v > hi) { bad = true; return hi; }
  return v;
}

void publishTelemetry(const int32_t pv[3], float flowLMin, float pressureBar, float suctionKPa) {
  time_t now = time(nullptr);
  if ((unsigned long)now < MIN_VALID_EPOCH) {
    Serial.println("Waiting for NTP time (skip publish)");
    return;
  }

  // sequence = epoch seconds -> reboot aanalum duplicate aagaadhu (API: siteId/machineId/sequence unique)
  uint32_t seq = (uint32_t)now;
  if (seq <= lastSeq) seq = lastSeq + 1;
  lastSeq = seq;

  char ts[24];
  struct tm tmv;
  gmtime_r(&now, &tmv);
  strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &tmv);

  bool flowBad = false, pressBad = false, sucBad = false;
  float flow  = clampf(flowLMin,    -500.0f, 500.0f, flowBad);   // API: flowLpm  -500..500
  float press = clampf(pressureBar, -1.5f,   20.0f,  pressBad);  // API: pressureBar -1.5..20
  float suc   = clampf(suctionKPa,  -150.0f, 150.0f, sucBad);    // API: suctionKpa -150..150

  char payload[420];
  int len = snprintf(payload, sizeof(payload),
    "{\"sequence\":%lu,\"timestamp\":\"%s\",\"status\":\"running\","
    "\"source\":\"esp32-s3-rs485\","
    "\"metrics\":{\"pressureBar\":%.2f,\"flowLpm\":%.2f,\"suctionKpa\":%.2f},"
    "\"raw\":{\"pv1\":%ld,\"pv2\":%ld,\"pv3\":%ld},"
    "\"quality\":{\"flow\":\"%s\",\"suction\":\"%s\",\"pressure\":\"%s\",\"modbus\":\"good\"}}",
    (unsigned long)seq, ts,
    press, flow, suc,
    (long)pv[IDX_FLOW], (long)pv[IDX_PRESSURE], (long)pv[IDX_SUCTION],
    flowBad ? "bad" : "good", sucBad ? "bad" : "good", pressBad ? "bad" : "good");

  if (len <= 0 || len >= (int)sizeof(payload)) {
    Serial.println("Payload too long, skipped");
    return;
  }

  bool ok = mqtt.publish(TOPIC_TELEMETRY, payload);
  Serial.printf("MQTT publish %s (seq=%lu)\n", ok ? "OK" : "FAIL", (unsigned long)seq);
}

// ================= Arduino =================
void setup() {
  Serial.begin(115200);

  pinMode(RS485_EN, OUTPUT);
  digitalWrite(RS485_EN, !EN_TX_LEVEL);
  Serial1.begin(BAUD, SERIAL_CFG, RS485_RX, RS485_TX);

  // Password = "cam0" + MACHINE_ID oda last 2 digits (CAMS-05 -> cam005)
  if (strlen(MQTT_PASS_OVERRIDE) > 0)
    snprintf(MQTT_PASS, sizeof(MQTT_PASS), "%s", MQTT_PASS_OVERRIDE);
  else
    snprintf(MQTT_PASS, sizeof(MQTT_PASS), "cam0%s", MACHINE_ID + strlen(MACHINE_ID) - 2);
  Serial.printf("Machine %s, MQTT user %s\n", MACHINE_ID, MQTT_USER);

  WiFi.mode(WIFI_STA);
  connectWiFi(true);

  // NTP (UTC). API ku ISO timestamp venum, server time la irundhu 24h kulla irukkanum
  configTime(0, 0, "pool.ntp.org", "time.google.com");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(30);
  mqtt.setBufferSize(512);   // default 256 podhaadhu, payload ~330 bytes

  delay(500);
  Serial.println("Selec PLC Modbus RTU reader + MQTT started");
}

void loop() {
  // WiFi / MQTT maintenance (non-blocking, Modbus read ah disturb pannaadhu)
  connectWiFi(false);
  connectMQTT();
  mqtt.loop();

  uint16_t r[NUM_REGS];
  if (readRegs(FUNC_CODE, START_ADDR, NUM_REGS, r)) {
    int32_t pv[3];
    for (int i = 0; i < 3; i++) {
      uint16_t hi = WORD_SWAP ? r[i * 2 + 1] : r[i * 2];
      uint16_t lo = WORD_SWAP ? r[i * 2]     : r[i * 2 + 1];
      pv[i] = (int32_t)(((uint32_t)hi << 16) | lo);
    }

    // Calibrations (config block la irukkura per-device values)
    float flowLMin    = (pv[IDX_FLOW]     - FLOW_OFFSET)    / FLOW_SLOPE;
    float suctionKPa  = (pv[IDX_SUCTION]  - SUCTION_OFFSET) / SUCTION_SLOPE;
    float pressureBar = ((pv[IDX_PRESSURE] - PRESSURE_ZERO_RAW) * PRESSURE_FULL_BAR) / PRESSURE_SPAN_RAW;
    if (pressureBar < 0.0f) pressureBar = 0.0f;

    Serial.printf("RAW  PV1=%ld  PV2=%ld  PV3=%ld\n", (long)pv[0], (long)pv[1], (long)pv[2]);
    Serial.printf("Flow=%.2f L/min | Pressure=%.2f bar | Suction=%.2f kPa\n",
                  flowLMin, pressureBar, suctionKPa);

    // ---- MQTT publish ----
    if (mqtt.connected() && millis() - lastPublish >= PUBLISH_INTERVAL_MS) {
      lastPublish = millis();
      publishTelemetry(pv, flowLMin, pressureBar, suctionKPa);
    } else if (!mqtt.connected()) {
      Serial.println("MQTT not connected (skipping publish)");
    }
    Serial.println("-----");
  }

  delay(1000);
}
