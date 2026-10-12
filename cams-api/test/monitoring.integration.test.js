import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import { parseTelemetryMessage } from "../src/telemetry/schema.js";
import { ingestTelemetry } from "../src/telemetry/store.js";

const hasDatabase = Boolean(process.env.MONGODB_URI);

test("serves authoritative live machine health and persistent alarms", { skip: !hasDatabase }, async () => {
  const baseConfig = loadConfig();
  const config = { ...baseConfig, mongoDb: `${baseConfig.mongoDb}_test` };
  const db = await connectDatabase(config);
  await Promise.all([
    db.collection("users").deleteMany({}), db.collection("sessions").deleteMany({}),
    db.collection("telemetry").deleteMany({}), db.collection("telemetryReceipts").deleteMany({}),
    db.collection("latestTelemetry").deleteMany({}), db.collection("machines").deleteMany({}),
    db.collection("deviceStatus").deleteMany({}), db.collection("alarms").deleteMany({}),
    db.collection("alarmAudit").deleteMany({})
  ]);
  const now = new Date();
  await db.collection("users").insertOne({
    email: "monitor.owner@example.test", emailNormalized: "monitor.owner@example.test",
    username: "monitor.owner", usernameNormalized: "monitor.owner", displayName: "Monitor Owner",
    passwordHash: await hashPassword("temporary-monitor-owner-password"), role: "owner", active: true,
    failedLoginCount: 0, lockUntil: null, createdAt: now, updatedAt: now
  });
  await db.collection("machines").insertOne({
    siteId: "plant-01", machineId: "CAMS-01", name: "Compressor 01", zone: "Spinning · Line A",
    active: true, status: "offline", gatewayStatus: "offline", createdAt: now, updatedAt: now
  });
  const payload = Buffer.from(JSON.stringify({
    timestamp: now.toISOString(), sequence: now.getTime(), status: "running", source: "esp32-s3-rs485",
    metrics: { pressureBar: 8.2, flowLpm: 25, suctionKpa: 1.2 },
    raw: { pv1: 2100, pv2: 6065, pv3: 8000 }, errors: { flow: 0, suction: 0, pressure: 0 },
    quality: { flow: "good", suction: "good", pressure: "good", modbus: "good" }
  }));
  await ingestTelemetry(parseTelemetryMessage("cams/plant-01/CAMS-01/telemetry", payload, now), config);

  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const origin = config.allowedOrigins[0];
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ identity: "monitor.owner", password: "temporary-monitor-owner-password" })
    });
    assert.equal(login.status, 200);
    const headers = { Origin: origin, Cookie: login.headers.get("set-cookie").split(";", 1)[0] };

    const machineResponse = await fetch(`${baseUrl}/api/machines`, { headers });
    assert.equal(machineResponse.status, 200);
    const machine = (await machineResponse.json()).machines[0];
    assert.equal(machine.id, "CAMS-01");
    assert.equal(machine.monitoring.status, "running");
    assert.equal(machine.monitoring.health, 90);
    assert.equal(machine.telemetry.metrics.pressureBar, 8.2);

    const alarmResponse = await fetch(`${baseUrl}/api/alarms`, { headers });
    assert.equal(alarmResponse.status, 200);
    const alarm = (await alarmResponse.json()).alarms.find(item => item.code === "pressureBar-high");
    assert.equal(alarm.status, "Active");

    const acknowledged = await fetch(`${baseUrl}/api/alarms/${encodeURIComponent(alarm.id)}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Acknowledged", comment: "Operator inspected the pressure reading." })
    });
    assert.equal(acknowledged.status, 200);
    assert.equal((await acknowledged.json()).alarm.status, "Acknowledged");

    const resolved = await fetch(`${baseUrl}/api/alarms/${encodeURIComponent(alarm.id)}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Resolved", comment: "Pressure was corrected and verified at the machine." })
    });
    assert.equal(resolved.status, 200);
    assert.equal((await resolved.json()).alarm.status, "Resolved");

    const historyResponse = await fetch(`${baseUrl}/api/alarms/${encodeURIComponent(alarm.id)}/history`, { headers });
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()).history;
    assert.equal(history.length, 2);
    assert.equal(history[0].action, "Resolved");
    assert.equal(history[0].comment, "Pressure was corrected and verified at the machine.");
    assert.equal(history[0].actor.displayName, "Monitor Owner");
    assert.equal(history[0].actor.role, "owner");
    assert.ok(history[0].createdAt);
    assert.equal(history[1].action, "Acknowledged");
    assert.equal(history[1].comment, "Operator inspected the pressure reading.");
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
});
