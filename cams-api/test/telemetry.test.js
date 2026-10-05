import test from "node:test";
import assert from "node:assert/strict";
import { parseTelemetryMessage } from "../src/telemetry/schema.js";

const now = new Date("2026-10-05T12:00:00.000Z");
const validPayload = Buffer.from(JSON.stringify({
  timestamp: now.toISOString(),
  sequence: 123,
  status: "running",
  metrics: { pressureBar: 7.2, flowLpm: 25.6, suctionBar: -0.8, temperatureC: 38.5 }
}));

test("parses a valid CAMS MQTT telemetry message", () => {
  const telemetry = parseTelemetryMessage("cams/demo/CAMS-01/telemetry", validPayload, now);
  assert.deepEqual(telemetry.series, { siteId: "demo", machineId: "CAMS-01" });
  assert.equal(telemetry.metrics.pressureBar, 7.2);
  assert.equal(telemetry.status, "running");
});

test("rejects malformed topics and out-of-range values", () => {
  assert.throws(() => parseTelemetryMessage("bad/topic", validPayload, now), /topic/);
  const invalid = Buffer.from(JSON.stringify({
    timestamp: now.toISOString(),
    sequence: 124,
    status: "running",
    metrics: { pressureBar: 100, flowLpm: 25, suctionBar: -0.8, temperatureC: 38 }
  }));
  assert.throws(() => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", invalid, now), /pressureBar/);
});

test("rejects stale device timestamps", () => {
  const stale = Buffer.from(JSON.stringify({
    timestamp: "2026-10-01T12:00:00.000Z",
    sequence: 125,
    status: "running",
    metrics: { pressureBar: 7, flowLpm: 25, suctionBar: -0.8, temperatureC: 38 }
  }));
  assert.throws(() => parseTelemetryMessage("cams/demo/CAMS-01/telemetry", stale, now), /24 hours/);
});
