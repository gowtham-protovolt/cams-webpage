import test from "node:test";
import assert from "node:assert/strict";
import { alarmConditions, evaluateMachine } from "../src/monitoring/health.js";
import { parseStatusMessage } from "../src/telemetry/status.js";
import { alarmNeedsTicketReconciliation } from "../src/telemetry/alarms.js";

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

test("does not score invalid sensor values as additional range violations", () => {
  const disconnected = evaluateMachine(telemetry({
    metrics: { pressureBar: 0, flowLpm: 25, suctionKpa: 1.2 },
    errors: { pressure: 1001, flow: 0, suction: 0 },
    quality: { pressure: "bad", flow: "good", suction: "good", modbus: "good" }
  }), { status: "online" }, monitoring, now);
  assert.equal(disconnected.health, 45);
});

test("creates threshold and PLC alarm conditions", () => {
  const conditions = alarmConditions(telemetry({
    metrics: { pressureBar: 8, flowLpm: 25, suctionKpa: 1.2 },
    errors: { pressure: 0, flow: 3, suction: 0 }
  }), monitoring);
  assert.deepEqual(conditions.map(item => item.code).sort(), ["flow-plc-error", "pressureBar-high"]);
});

test("does not add a threshold warning for a sensor with bad quality or a PLC error", () => {
  const conditions = alarmConditions(telemetry({
    metrics: { pressureBar: 2, flowLpm: 25, suctionKpa: 1.2 },
    errors: { pressure: 1001, flow: 0, suction: 0 },
    quality: { pressure: "bad", flow: "good", suction: "good", modbus: "good" }
  }), monitoring);
  assert.deepEqual(conditions.map(item => item.code), ["pressure-plc-error", "pressure-bad-quality"]);
});

test("power threshold alarms stay disabled until a power range is configured", () => {
  const reading = telemetry({
    metrics: {
      pressureBar: 7.1,
      flowLpm: 25,
      suctionKpa: 1.2,
      powerMonitor: { voltageV: 250, currentA: 12 }
    }
  });
  assert.deepEqual(alarmConditions(reading, monitoring).map(item => item.code), []);
  const configured = {
    ...monitoring,
    thresholds: {
      ...monitoring.thresholds,
      powerMonitor: {
        voltageV: { minimum: 220, maximum: 240 },
        currentA: { minimum: 0, maximum: 10 }
      }
    }
  };
  assert.deepEqual(
    alarmConditions(reading, configured).map(item => item.code).sort(),
    ["power-currentA-high", "power-voltageV-high"]
  );
});

test("reconciles tickets only when an alarm is created or its problem changes", () => {
  const condition = { severity: "Critical", message: "Pressure is above range." };
  assert.equal(alarmNeedsTicketReconciliation(null, condition), true);
  assert.equal(alarmNeedsTicketReconciliation({ status: "Active", ...condition }, condition), false);
  assert.equal(alarmNeedsTicketReconciliation({ status: "Acknowledged", ...condition }, condition), false);
  assert.equal(alarmNeedsTicketReconciliation({ status: "Resolved", ...condition }, condition), true);
  assert.equal(alarmNeedsTicketReconciliation({ status: "Active", ...condition, severity: "Warning" }, condition), true);
  assert.equal(alarmNeedsTicketReconciliation({ status: "Active", ...condition, message: "Different problem." }, condition), true);
});

test("parses retained MQTT online and offline status messages", () => {
  const online = parseStatusMessage("cams/plant-01/CAMS-02/status", Buffer.from('{"status":"online","firmwareVersion":"1.2.0"}'), now);
  assert.equal(online.machineId, "CAMS-02");
  assert.equal(online.status, "online");
  assert.equal(online.firmwareVersion, "1.2.0");
  assert.throws(() => parseStatusMessage("cams/plant-01/CAMS-02/status", Buffer.from('{"status":"unknown"}'), now), /online or offline/);
});
