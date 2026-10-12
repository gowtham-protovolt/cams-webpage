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
  assert.deepEqual(telemetry.hierarchy, {
    root: "CAMS",
    device: "CAMS-01",
    date: "2026-10-05",
    time: "17-30-00",
    timezone: "Asia/Kolkata"
  });
});

test("keeps CAMS-01, CAMS-02, and CAMS-03 telemetry identities separate", () => {
  for (const machineId of ["CAMS-01", "CAMS-02", "CAMS-03"]) {
    const telemetry = parseTelemetryMessage(`cams/plant-01/${machineId}/telemetry`, validPayload, now);
    assert.equal(telemetry.series.machineId, machineId);
    assert.equal(telemetry.hierarchy.device, machineId);
  }
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

test("accepts telemetry inside the offline recovery window", () => {
  const stale = Buffer.from(JSON.stringify({
    timestamp: "2026-10-01T12:00:00.000Z",
    sequence: 125,
    status: "running",
    source: "esp32-s3-rs485",
    metrics: { pressureBar: 7, flowLpm: 25, suctionKpa: 1.2 }
  }));
  const telemetry = parseTelemetryMessage("cams/demo/CAMS-01/telemetry", stale, now);
  assert.equal(telemetry.backfilled, true);
});

test("rejects telemetry outside the offline recovery window", () => {
  const stale = Buffer.from(JSON.stringify({
    timestamp: "2026-09-26T12:00:00.000Z",
    sequence: 126,
    status: "running",
    source: "esp32-s3-rs485",
    metrics: { pressureBar: 7, flowLpm: 25, suctionKpa: 1.2 }
  }));
  assert.throws(() => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", stale, now), /8-day recovery/);
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
