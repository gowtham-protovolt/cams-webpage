import { getDatabase } from "../db.js";
import { telemetryEvents } from "./events.js";

export async function ingestTelemetry(telemetry, retentionDays) {
  const db = getDatabase();
  const { siteId, machineId } = telemetry.series;
  const receiptId = `${siteId}/${machineId}/${telemetry.sequence}`;
  try {
    await db.collection("telemetryReceipts").insertOne({
      _id: receiptId,
      receivedAt: telemetry.receivedAt,
      expiresAt: new Date(telemetry.receivedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    if (error.code === 11000) return { duplicate: true };
    throw error;
  }

  try {
    await db.collection("telemetry").insertOne(telemetry);
    const latest = {
      siteId,
      machineId,
      hierarchy: telemetry.hierarchy,
      observedAt: telemetry.observedAt,
      receivedAt: telemetry.receivedAt,
      sequence: telemetry.sequence,
      status: telemetry.status,
      metrics: telemetry.metrics,
      raw: telemetry.raw || null,
      errors: telemetry.errors || null,
      quality: telemetry.quality || null,
      calibrationVersion: telemetry.calibrationVersion || null,
      source: telemetry.source
    };
    await Promise.all([
      db.collection("latestTelemetry").updateOne(
        { siteId, machineId },
        { $set: latest },
        { upsert: true }
      ),
      db.collection("machines").updateOne(
        { siteId, machineId },
        {
          $set: { status: telemetry.status, lastSeenAt: telemetry.receivedAt, updatedAt: telemetry.receivedAt },
          $setOnInsert: { name: machineId, zone: "Unassigned", active: true, createdAt: telemetry.receivedAt }
        },
        { upsert: true }
      )
    ]);
    telemetryEvents.emit("telemetry", latest);
    return { duplicate: false, latest };
  } catch (error) {
    await db.collection("telemetryReceipts").deleteOne({ _id: receiptId });
    throw error;
  }
}
