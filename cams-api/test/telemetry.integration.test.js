import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import { parseTelemetryMessage } from "../src/telemetry/schema.js";
import { ingestTelemetry } from "../src/telemetry/store.js";

const hasDatabase = Boolean(process.env.MONGODB_URI);

test("stores telemetry, updates latest data, and rejects a duplicate sequence", { skip: !hasDatabase }, async () => {
  const baseConfig = loadConfig();
  const config = { ...baseConfig, mongoDb: `${baseConfig.mongoDb}_test` };
  const db = await connectDatabase(config);
  await Promise.all([
    db.collection("telemetry").deleteMany({}),
    db.collection("telemetryReceipts").deleteMany({}),
    db.collection("latestTelemetry").deleteMany({}),
    db.collection("machines").deleteMany({}),
    db.collection("deviceStatus").deleteMany({}),
    db.collection("alarms").deleteMany({})
  ]);
  const now = new Date();
  await db.collection("machines").insertOne({
    siteId: "demo", machineId: "CAMS-01", name: "Compressor 01", zone: "Test Bay",
    active: true, status: "offline", gatewayStatus: "offline", createdAt: now, updatedAt: now
  });
  const payload = Buffer.from(JSON.stringify({
    timestamp: now.toISOString(),
    sequence: 987654,
    status: "running",
    source: "esp32-s3-rs485",
    calibrationVersion: "empirical-2026-10-06-v1",
    metrics: { pressureBar: 7.2, flowLpm: 25.6, suctionKpa: 1.2 },
    raw: { pv1: 2101, pv2: 6065, pv3: 7726 },
    errors: { flow: 0, suction: 0, pressure: 0 },
    quality: { flow: "good", suction: "good", pressure: "uncertain", modbus: "good" }
  }));
  const telemetry = parseTelemetryMessage("cams/demo/CAMS-01/telemetry", payload, now);

  try {
    const stored = await ingestTelemetry(telemetry, 90);
    assert.equal(stored.duplicate, false);
    assert.equal(stored.latest.monitoring.status, "running");
    assert.equal(stored.latest.monitoring.health, 92);
    assert.deepEqual({ ...stored.latest, monitoring: undefined }, {
        siteId: "demo",
        machineId: "CAMS-01",
        hierarchy: telemetry.hierarchy,
        observedAt: now,
        receivedAt: now,
        sequence: 987654,
        status: "running",
        metrics: telemetry.metrics,
        raw: telemetry.raw,
        errors: telemetry.errors,
        quality: telemetry.quality,
        calibrationVersion: telemetry.calibrationVersion,
        source: telemetry.source,
        backfilled: false,
        monitoring: undefined
    });
    assert.deepEqual(await ingestTelemetry(telemetry, 90), { duplicate: true });
    assert.equal(await db.collection("telemetry").countDocuments({}), 1);
    assert.equal((await db.collection("telemetry").findOne({})).hierarchy.root, "CAMS");
    assert.equal((await db.collection("telemetry").findOne({})).hierarchy.device, "CAMS-01");
    assert.equal((await db.collection("latestTelemetry").findOne({ machineId: "CAMS-01" })).metrics.flowLpm, 25.6);

    const olderPayload = Buffer.from(JSON.stringify({
      timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      sequence: 987653,
      status: "alarm",
      source: "esp32-s3-rs485",
      metrics: { pressureBar: 6.5, flowLpm: 20, suctionKpa: 0.5 }
    }));
    const older = parseTelemetryMessage("cams/demo/CAMS-01/telemetry", olderPayload, now);
    const backfilled = await ingestTelemetry(older, 90);
    assert.equal(backfilled.backfilled, true);
    assert.equal((await db.collection("latestTelemetry").findOne({ machineId: "CAMS-01" })).metrics.flowLpm, 25.6);
    assert.equal(await db.collection("telemetry").countDocuments({}), 2);
  } finally {
    await closeDatabase();
  }
});
