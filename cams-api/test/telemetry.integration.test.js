import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import { parseTelemetryMessage } from "../src/telemetry/schema.js";
import { ingestTelemetry } from "../src/telemetry/store.js";

const hasDatabase = Boolean(process.env.MONGODB_URI);

test("stores telemetry, updates latest data, and rejects a duplicate sequence", { skip: !hasDatabase }, async () => {
  const config = loadConfig();
  const db = await connectDatabase(config);
  await Promise.all([
    db.collection("telemetry").deleteMany({}),
    db.collection("telemetryReceipts").deleteMany({}),
    db.collection("latestTelemetry").deleteMany({}),
    db.collection("machines").deleteMany({})
  ]);
  const now = new Date();
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
    assert.deepEqual(await ingestTelemetry(telemetry, 90), {
      duplicate: false,
      latest: {
        siteId: "demo",
        machineId: "CAMS-01",
        observedAt: now,
        receivedAt: now,
        sequence: 987654,
        status: "running",
        metrics: telemetry.metrics,
        raw: telemetry.raw,
        errors: telemetry.errors,
        quality: telemetry.quality,
        calibrationVersion: telemetry.calibrationVersion,
        source: telemetry.source
      }
    });
    assert.deepEqual(await ingestTelemetry(telemetry, 90), { duplicate: true });
    assert.equal(await db.collection("telemetry").countDocuments({}), 1);
    assert.equal((await db.collection("latestTelemetry").findOne({ machineId: "CAMS-01" })).metrics.flowLpm, 25.6);
  } finally {
    await closeDatabase();
  }
});
