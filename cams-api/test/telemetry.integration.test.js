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
    metrics: { pressureBar: 7.2, flowLpm: 25.6, suctionBar: -0.8, temperatureC: 38.5 }
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
        metrics: telemetry.metrics
      }
    });
    assert.deepEqual(await ingestTelemetry(telemetry, 90), { duplicate: true });
    assert.equal(await db.collection("telemetry").countDocuments({}), 1);
    assert.equal((await db.collection("latestTelemetry").findOne({ machineId: "CAMS-01" })).metrics.flowLpm, 25.6);
  } finally {
    await closeDatabase();
  }
});
