import test from "node:test";
import assert from "node:assert/strict";
import { parseTelemetryMessage } from "../src/telemetry/schema.js";

const now = new Date("2026-10-05T12:00:00.000Z");
const validPayload = Buffer.from(JSON.stringify({
  timestamp: now.toISOString(),
  sequence: 123,
  status: "running",
  source: "esp32-s3-rs485",
  calibrationVersion: "empirical-2026-10-06-v1",
  metrics: { pressureBar: 7.2, flowLpm: -21.5, suctionKpa: 1.2 },
  raw: { pv1: 1915, pv2: 6066, pv3: 7173 },
  errors: { flow: 0, suction: 0, pressure: 0 },
  quality: { flow: "good", suction: "good", pressure: "uncertain", modbus: "good" }
}));

test("parses a valid CAMS MQTT telemetry message", () => {
  const telemetry = parseTelemetryMessage("cams/demo/CAMS-01/telemetry", validPayload, now);
  assert.deepEqual(telemetry.series, { siteId: "demo", machineId: "CAMS-01" });
  assert.equal(telemetry.metrics.pressureBar, 7.2);
  assert.equal(telemetry.metrics.flowLpm, -21.5);
  assert.equal(telemetry.raw.pv2, 6066);
  assert.equal(telemetry.source, "esp32-s3-rs485");
  assert.equal(telemetry.status, "running");
});

test("rejects malformed topics and out-of-range values", () => {
  assert.throws(() => parseTelemetryMessage("bad/topic", validPayload, now), /topic/);
  const invalid = Buffer.from(JSON.stringify({
    timestamp: now.toISOString(),
    sequence: 124,
    status: "running",
    source: "esp32-s3-rs485",
    metrics: { pressureBar: 100, flowLpm: 25, suctionKpa: 1.2 }
  }));
  assert.throws(() => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", invalid, now), /pressureBar/);
});

test("rejects stale device timestamps", () => {
  const stale = Buffer.from(JSON.stringify({
    timestamp: "2026-10-01T12:00:00.000Z",
    sequence: 125,
    status: "running",
    source: "esp32-s3-rs485",
    metrics: { pressureBar: 7, flowLpm: 25, suctionKpa: 1.2 }
  }));
  assert.throws(() => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", stale, now), /24 hours/);
});

test("rejects incomplete PLC diagnostics", () => {
  const invalid = JSON.parse(validPayload.toString("utf8"));
  delete invalid.errors.pressure;
  assert.throws(
    () => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", Buffer.from(JSON.stringify(invalid)), now),
    /errors.pressure/
  );
});

test("rejects non-ESP32 telemetry sources", () => {
  const invalid = JSON.parse(validPayload.toString("utf8"));
  invalid.source = "simulator";
  assert.throws(
    () => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", Buffer.from(JSON.stringify(invalid)), now),
    /source must be esp32-s3-rs485/
  );
});
