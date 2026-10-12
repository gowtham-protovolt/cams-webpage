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

async function login(baseUrl, origin, identity, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password })
  });
  return response.headers.get("set-cookie")?.split(";", 1)[0];
}

function telemetry(machineId, sequence, now) {
  return parseTelemetryMessage(`cams/plant-01/${machineId}/telemetry`, Buffer.from(JSON.stringify({
    timestamp: now.toISOString(), sequence, status: "running", source: "esp32-s3-rs485",
    metrics: { pressureBar: 7.1, flowLpm: 25.4, suctionKpa: 1.1 },
    raw: { pv1: 2100, pv2: 6065, pv3: 8000 },
    errors: { flow: 0, suction: 0, pressure: 0 },
    quality: { flow: "good", suction: "good", pressure: "good", modbus: "good" }
  })), now);
}

test("owners manage machines while deletion preserves history and blocks MQTT until restore", { skip: !hasDatabase }, async () => {
  const baseConfig = loadConfig();
  const config = { ...baseConfig, mongoDb: `${baseConfig.mongoDb}_test` };
  const db = await connectDatabase(config);
  await Promise.all([
    db.collection("users").deleteMany({}), db.collection("sessions").deleteMany({}),
    db.collection("telemetry").deleteMany({}), db.collection("telemetryReceipts").deleteMany({}),
    db.collection("latestTelemetry").deleteMany({}), db.collection("machines").deleteMany({}),
    db.collection("deviceStatus").deleteMany({}), db.collection("alarms").deleteMany({})
  ]);
  const now = new Date();
  await db.collection("users").insertMany([
    {
      email: "machine.owner@example.test", emailNormalized: "machine.owner@example.test",
      username: "machine.owner", usernameNormalized: "machine.owner", displayName: "Machine Owner",
      passwordHash: await hashPassword("temporary-machine-owner-password"), role: "owner", active: true,
      failedLoginCount: 0, lockUntil: null, createdAt: now, updatedAt: now
    },
    {
      email: "machine.viewer@example.test", emailNormalized: "machine.viewer@example.test",
      username: "machine.viewer", usernameNormalized: "machine.viewer", displayName: "Machine Viewer",
      passwordHash: await hashPassword("temporary-machine-viewer-password"), role: "viewer", active: true,
      failedLoginCount: 0, lockUntil: null, createdAt: now, updatedAt: now
    }
  ]);

  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const origin = config.allowedOrigins[0];
  const ownerCookie = await login(baseUrl, origin, "machine.owner", "temporary-machine-owner-password");
  const viewerCookie = await login(baseUrl, origin, "machine.viewer", "temporary-machine-viewer-password");
  const jsonHeaders = { Origin: origin, "Content-Type": "application/json" };

  try {
    const denied = await fetch(`${baseUrl}/api/machines`, {
      method: "POST", headers: { ...jsonHeaders, Cookie: viewerCookie },
      body: JSON.stringify({ siteId: "plant-01", machineId: "CAMS-17", name: "Compressor 17", zone: "Line B" })
    });
    assert.equal(denied.status, 403);

    const created = await fetch(`${baseUrl}/api/machines`, {
      method: "POST", headers: { ...jsonHeaders, Cookie: ownerCookie },
      body: JSON.stringify({ siteId: "plant-01", machineId: "CAMS-17", name: "Compressor 17", zone: "Line B" })
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).machine.status, "offline");

    const duplicate = await fetch(`${baseUrl}/api/machines`, {
      method: "POST", headers: { ...jsonHeaders, Cookie: ownerCookie },
      body: JSON.stringify({ siteId: "plant-01", machineId: "CAMS-17", name: "Duplicate", zone: "Line B" })
    });
    assert.equal(duplicate.status, 409);

    const invalid = await fetch(`${baseUrl}/api/machines`, {
      method: "POST", headers: { ...jsonHeaders, Cookie: ownerCookie },
      body: JSON.stringify({ siteId: "plant-01", machineId: "compressor-17", name: "Invalid", zone: "Line B" })
    });
    assert.equal(invalid.status, 400);

    const updated = await fetch(`${baseUrl}/api/machines/CAMS-17?siteId=plant-01`, {
      method: "PATCH", headers: { ...jsonHeaders, Cookie: ownerCookie },
      body: JSON.stringify({ name: "Main Compressor 17", zone: "Utility Room" })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).machine.zone, "Utility Room");

    const firstReading = telemetry("CAMS-17", 17001, now);
    assert.equal((await ingestTelemetry(firstReading, config)).ignored, undefined);
    assert.equal(await db.collection("telemetry").countDocuments({ "series.machineId": "CAMS-17" }), 1);

    const removed = await fetch(`${baseUrl}/api/machines/CAMS-17?siteId=plant-01`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerCookie }
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).machine.active, false);
    assert.equal(await db.collection("telemetry").countDocuments({ "series.machineId": "CAMS-17" }), 1);

    const activeList = await fetch(`${baseUrl}/api/machines`, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal((await activeList.json()).machines.length, 0);
    const removedList = await fetch(`${baseUrl}/api/machines/removed?siteId=plant-01`, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal((await removedList.json()).machines[0].id, "CAMS-17");

    const ignored = await ingestTelemetry(telemetry("CAMS-17", 17002, new Date(now.getTime() + 1000)), config);
    assert.deepEqual(ignored, { duplicate: false, ignored: true, reason: "machine-removed" });
    assert.equal(await db.collection("telemetry").countDocuments({ "series.machineId": "CAMS-17" }), 1);

    const restored = await fetch(`${baseUrl}/api/machines/CAMS-17/restore?siteId=plant-01`, {
      method: "POST", headers: { ...jsonHeaders, Cookie: ownerCookie }, body: "{}"
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).machine.active, true);

    const accepted = await ingestTelemetry(telemetry("CAMS-17", 17003, new Date(now.getTime() + 2000)), config);
    assert.equal(accepted.ignored, undefined);
    assert.equal(await db.collection("telemetry").countDocuments({ "series.machineId": "CAMS-17" }), 2);

    const unknown = await ingestTelemetry(telemetry("CAMS-18", 18001, now), config);
    assert.deepEqual(unknown, { duplicate: false, ignored: true, reason: "machine-not-registered" });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
});
