import test from "node:test";
import assert from "node:assert/strict";
import { alarmConditions, evaluateMachine } from "../src/monitoring/health.js";
import { parseStatusMessage } from "../src/telemetry/status.js";

const now = new Date("2026-10-07T12:00:00.000Z");
const monitoring = {
  staleAfterSeconds: 10,
  thresholds: {
    pressureBar: { minimum: 6.8, maximum: 7.5 },
    flowLpm: { minimum: 22, maximum: 28 },
    suctionKpa: { minimum: 0.6, maximum: 1.8 }
  }
};

function telemetry(overrides = {}) {
  return {
    receivedAt: now,
    status: "running",
    metrics: { pressureBar: 7.1, flowLpm: 25, suctionKpa: 1.2 },
    errors: { pressure: 0, flow: 0, suction: 0 },
    quality: { pressure: "good", flow: "good", suction: "good", modbus: "good" },
    ...overrides
  };
}

test("calculates healthy, alarm, and stale machine states", () => {
  const healthy = evaluateMachine(telemetry(), { status: "online" }, monitoring, now);
  assert.equal(healthy.status, "running");
  assert.equal(healthy.health, 100);
  assert.equal(healthy.communicationPercent, 100);

  const alarm = evaluateMachine(telemetry({ errors: { pressure: 9, flow: 0, suction: 0 } }), { status: "online" }, monitoring, now);
  assert.equal(alarm.status, "alarm");
  assert.ok(alarm.health <= 55);
  assert.equal(alarm.plcStatus, "alarm");

  const stale = evaluateMachine(telemetry({ receivedAt: new Date(now.getTime() - 11000) }), { status: "online" }, monitoring, now);
  assert.equal(stale.status, "offline");
  assert.equal(stale.health, 0);
});

test("creates threshold and PLC alarm conditions", () => {
  const conditions = alarmConditions(telemetry({
    metrics: { pressureBar: 8, flowLpm: 25, suctionKpa: 1.2 },
    errors: { pressure: 3, flow: 0, suction: 0 }
  }), monitoring);
  assert.deepEqual(conditions.map(item => item.code).sort(), ["pressure-plc-error", "pressureBar-high"]);
});

test("parses retained MQTT online and offline status messages", () => {
  const online = parseStatusMessage("cams/plant-01/CAMS-02/status", Buffer.from('{"status":"online","firmwareVersion":"1.2.0"}'), now);
  assert.equal(online.machineId, "CAMS-02");
  assert.equal(online.status, "online");
  assert.equal(online.firmwareVersion, "1.2.0");
  assert.throws(() => parseStatusMessage("cams/plant-01/CAMS-02/status", Buffer.from('{"status":"unknown"}'), now), /online or offline/);
});
