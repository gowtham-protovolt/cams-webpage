import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import { parseTelemetryMessage } from "../src/telemetry/schema.js";
import { ingestTelemetry } from "../src/telemetry/store.js";

const hasDatabase = Boolean(process.env.MONGODB_URI || (process.env.MONGODB_APP_USERNAME && process.env.MONGODB_APP_PASSWORD));

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
      body: JSON.stringify({ siteId: "plant-01", machineId: "CAMS-17", name: "Compressor 17", cluster: "Cluster 04", zone: "Area 01" })
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).machine.status, "offline");

    const configurationUrl = `${baseUrl}/api/machines/CAMS-17/configuration?siteId=plant-01`;
    const configurationResponse = await fetch(configurationUrl, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal(configurationResponse.status, 200);
    const deviceConfiguration = (await configurationResponse.json()).configuration;
    assert.equal(deviceConfiguration.general.deviceName, "Compressor 17");
    deviceConfiguration.general.deviceName = "Compressor 17 configured";
    const deniedConfigurationUpdate = await fetch(configurationUrl, {
      method: "PUT", headers: { ...jsonHeaders, Cookie: viewerCookie },
      body: JSON.stringify(deviceConfiguration)
    });
    assert.equal(deniedConfigurationUpdate.status, 403);
    const savedConfiguration = await fetch(configurationUrl, {
      method: "PUT", headers: { ...jsonHeaders, Cookie: ownerCookie },
      body: JSON.stringify(deviceConfiguration)
    });
    assert.equal(savedConfiguration.status, 200);
    assert.equal((await savedConfiguration.json()).configuration.general.deviceName, "Compressor 17 configured");
    const persistedConfiguration = await fetch(configurationUrl, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal((await persistedConfiguration.json()).configuration.general.deviceName, "Compressor 17 configured");
    const rejectedSecret = {
      ...deviceConfiguration,
      data: { ...deviceConfiguration.data, brokerPassword: "never-accept-secrets" }
    };
    const invalidConfiguration = await fetch(configurationUrl, {
      method: "PUT", headers: { ...jsonHeaders, Cookie: ownerCookie },
      body: JSON.stringify(rejectedSecret)
    });
    assert.equal(invalidConfiguration.status, 400);

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
      body: JSON.stringify({ name: "Main Compressor 17", zone: "Area 01" })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).machine.zone, "Area 01");
    const configurationAfterDeviceEdit = await fetch(configurationUrl, { headers: { Origin: origin, Cookie: ownerCookie } });
    const updatedDeviceConfiguration = (await configurationAfterDeviceEdit.json()).configuration;
    assert.equal(updatedDeviceConfiguration.general.deviceName, "Main Compressor 17");
    assert.equal(updatedDeviceConfiguration.general.location, "Cluster 04 · Area 01");

    const clusterResponse = await fetch(`${baseUrl}/api/clusters?siteId=plant-01`, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal(clusterResponse.status, 200);
    const clusterPayload = await clusterResponse.json();
    assert.equal(clusterPayload.clusters[0].name, "Cluster 04");
    assert.equal(clusterPayload.clusters[0].areas[0].name, "Area 01");
    assert.equal(clusterPayload.clusters[0].areas[0].devices[0].id, "CAMS-17");

    await db.collection("alarms").insertMany([
      {
        _id: "plant-01/CAMS-17/high-pressure", siteId: "plant-01", machineId: "CAMS-17",
        code: "high-pressure", parameter: "Pressure", severity: "Critical", value: 8.1,
        message: "Pressure is above the configured operating range.", status: "Active",
        firstSeenAt: now, lastSeenAt: now, acknowledgedAt: null, resolvedAt: null
      },
      {
        _id: "plant-01/CAMS-17/low-flow", siteId: "plant-01", machineId: "CAMS-17",
        code: "low-flow", parameter: "Flow", severity: "Warning", value: 19,
        message: "Flow is below the configured operating range.", status: "Acknowledged",
        firstSeenAt: now, lastSeenAt: now, acknowledgedAt: now, resolvedAt: null
      }
    ]);
    const alarmFilters = new URLSearchParams({
      siteId: "plant-01", cluster: "Cluster 04", area: "Area 01", machineId: "CAMS-17",
      parameter: "Pressure", severity: "Critical", status: "Active"
    });
    const filteredAlarms = await fetch(`${baseUrl}/api/alarms?${alarmFilters}`, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal(filteredAlarms.status, 200);
    assert.deepEqual((await filteredAlarms.json()).alarms.map(alarm => alarm.code), ["high-pressure"]);
    const wrongArea = await fetch(`${baseUrl}/api/alarms?siteId=plant-01&cluster=Cluster%2004&area=Area%2002`, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal(wrongArea.status, 200);
    assert.equal((await wrongArea.json()).alarms.length, 0);

    const locationRequest = async (path, method = "GET", body, cookie = ownerCookie) => {
      const result = await fetch(`${baseUrl}/api/locations${path}`, {
        method, headers: { ...jsonHeaders, Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: result.status, body: await result.json() };
    };
    assert.equal((await locationRequest("/clusters", "POST", { name: "Denied" }, viewerCookie)).status, 403);
    const newCluster = await locationRequest("/clusters", "POST", { name: "Test Cluster 10" });
    assert.equal(newCluster.status, 201);
    assert.equal((await locationRequest("/clusters", "POST", { name: "test cluster 10" })).status, 409);
    const newArea = await locationRequest("/areas", "POST", { name: "Test Area", clusterId: newCluster.body.id });
    assert.equal(newArea.status, 201);
    const locations = (await locationRequest("")).body.clusters;
    const oldCluster = locations.find(c => c.name === "Cluster 04");
    const oldArea = oldCluster.areas.find(a => a.name === "Area 01");
    assert.equal((await locationRequest("/assign", "POST", { clusterId: oldCluster.id, areaId: newArea.body.id, deviceIds: ["CAMS-17"] })).status, 400);
    assert.equal((await locationRequest("/assign", "POST", { clusterId: newCluster.body.id, areaId: newArea.body.id, deviceIds: ["CAMS-17"] })).status, 200);
    assert.equal((await locationRequest(`/areas/${newArea.body.id}`, "DELETE")).status, 409);
    assert.equal((await locationRequest(`/clusters/${newCluster.body.id}`, "PATCH", { name: "Test Cluster 11" })).status, 200);
    const moved = await db.collection("machines").findOne({ siteId: "plant-01", machineId: "CAMS-17" });
    assert.equal(moved.clusterId, newCluster.body.id);
    assert.equal(moved.cluster, "Test Cluster 11");
    assert.equal(moved.areaId, newArea.body.id);
    assert.equal((await locationRequest(`/areas/${newArea.body.id}`, "PATCH", { name: "Renamed Area" })).status, 200);
    assert.equal((await db.collection("machines").findOne({ siteId: "plant-01", machineId: "CAMS-17" })).zone, "Renamed Area");
    assert.equal((await locationRequest("/assign", "POST", { clusterId: oldCluster.id, areaId: oldArea.id, deviceIds: ["CAMS-17"] })).status, 200);
    assert.equal((await locationRequest(`/clusters/${newCluster.body.id}`, "DELETE")).status, 409);
    assert.equal((await locationRequest(`/areas/${newArea.body.id}`, "DELETE")).status, 200);
    assert.equal((await locationRequest(`/clusters/${newCluster.body.id}`, "DELETE")).status, 200);

    await db.collection("machines").insertOne({ siteId: "legacy-test", machineId: "CAMS-01", name: "Legacy", zone: "Spinning", active: true });
    const legacy = (await locationRequest("?siteId=legacy-test")).body.clusters;
    assert.equal(legacy[0].areas[0].name, "Spinning");
    const legacyDevice = await db.collection("machines").findOne({ siteId: "legacy-test" });
    assert.equal(typeof legacyDevice.clusterId, "string");
    await db.collection("machines").insertOne({ siteId: "legacy-test", machineId: "CAMS-99", name: "Later device", active: true });
    await locationRequest("?siteId=legacy-test");
    assert.equal((await db.collection("machines").findOne({ siteId: "legacy-test", machineId: "CAMS-01" })).clusterId, legacyDevice.clusterId);
    await db.collection("machines").deleteMany({ siteId: "legacy-test" });

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
    const dashboardSummary = await fetch(`${baseUrl}/api/dashboard/summary?siteId=plant-01`, { headers: { Origin: origin, Cookie: ownerCookie } });
    assert.equal(dashboardSummary.status, 200);
    const dashboardData = await dashboardSummary.json();
    assert.ok(Array.isArray(dashboardData.machines));
    assert.ok(Array.isArray(dashboardData.alarms));
    assert.ok(Array.isArray(dashboardData.tickets));
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

    const historyFrom = new Date(now.getTime() - 1000).toISOString();
    const historyTo = new Date(now.getTime() + 3000).toISOString();
    const rangedHistory = await fetch(
      `${baseUrl}/api/machines/CAMS-17/telemetry?siteId=plant-01&from=${encodeURIComponent(historyFrom)}&to=${encodeURIComponent(historyTo)}&limit=1`,
      { headers: { Origin: origin, Cookie: ownerCookie } }
    );
    assert.equal(rangedHistory.status, 200);
    assert.equal((await rangedHistory.json()).readings[0].sequence, 17003);

    const retainedTicketGeneration = `permanent-delete-machine-${process.pid}`;
    const retainedAlarmId = `permanent-delete-machine-alarm-${process.pid}`;
    await Promise.all([
      db.collection("tickets").insertOne({ siteId: "plant-01", id: retainedTicketGeneration, generationKey: retainedTicketGeneration, machineId: "CAMS-17" }),
      db.collection("alarmAudit").insertOne({ alarmId: retainedAlarmId, machineId: "CAMS-17", action: "History retained", createdAt: now })
    ]);
    const activePermanentDelete = await fetch(`${baseUrl}/api/machines/CAMS-17/permanent?siteId=plant-01`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerCookie }
    });
    assert.equal(activePermanentDelete.status, 404);
    const removedAgain = await fetch(`${baseUrl}/api/machines/CAMS-17?siteId=plant-01`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerCookie }
    });
    assert.equal(removedAgain.status, 200);
    const permanentDelete = await fetch(`${baseUrl}/api/machines/CAMS-17/permanent?siteId=plant-01`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerCookie }
    });
    assert.equal(permanentDelete.status, 200);
    assert.equal(await db.collection("machines").countDocuments({ siteId: "plant-01", machineId: "CAMS-17" }), 0);
    assert.equal(await db.collection("telemetry").countDocuments({ "series.machineId": "CAMS-17" }), 2);
    assert.equal(await db.collection("tickets").countDocuments({ generationKey: retainedTicketGeneration }), 1);
    assert.equal(await db.collection("alarmAudit").countDocuments({ alarmId: retainedAlarmId }), 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
});
