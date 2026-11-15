import { getDatabase } from "../db.js";
import { telemetryEvents } from "./events.js";
import { evaluateMachine } from "../monitoring/health.js";
import { setGatewayAlarm, syncTelemetryAlarms } from "./alarms.js";
import { getSiteSettings } from "../settings/service.js";

async function findOrRegisterMachine(db, siteId, machineId, options, receivedAt) {
  const existing = await db.collection("machines").findOne({ siteId, machineId }, { projection: { active: 1, configuration: 1 } });
  if (existing || options?.autoRegisterDevices !== true) return existing;
  await db.collection("machines").updateOne(
    { siteId, machineId },
    { $setOnInsert: {
      siteId, machineId, name: machineId, cluster: "Unassigned", zone: "Unassigned",
      active: true, status: "offline", gatewayStatus: "offline", createdAt: receivedAt, updatedAt: receivedAt,
      createdBy: "mqtt-auto-registration"
    } },
    { upsert: true }
  );
  return db.collection("machines").findOne({ siteId, machineId }, { projection: { active: 1, configuration: 1 } });
}

export async function ingestTelemetry(telemetry, options) {
  const db = getDatabase();
  const { siteId, machineId } = telemetry.series;
  const registeredMachine = await findOrRegisterMachine(db, siteId, machineId, options, telemetry.receivedAt);
  if (!registeredMachine?.active) {
    return { duplicate: false, ignored: true, reason: registeredMachine ? "machine-removed" : "machine-not-registered" };
  }
  const siteSettings = typeof options === "number" ? null : await getSiteSettings(options, siteId);
  const retentionDays = typeof options === "number" ? options : siteSettings.retentionDays;
  const monitoringConfig = typeof options === "number" ? undefined : {
    staleAfterSeconds: siteSettings.sampling.staleAfterSeconds,
    thresholds: {
      ...siteSettings.thresholds,
      ...(registeredMachine.configuration?.sensors?.powerMonitor
        ? { powerMonitor: registeredMachine.configuration.sensors.powerMonitor }
        : {})
    }
  };
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
    const deviceStatus = { siteId, machineId, status: "online", receivedAt: telemetry.receivedAt };
    const monitoring = evaluateMachine(telemetry, deviceStatus, monitoringConfig, telemetry.receivedAt);
    const previousLatest = await db.collection("latestTelemetry").findOne(
      { siteId, machineId },
      { projection: { observedAt: 1 } }
    );
    const updatesCurrentState = !telemetry.backfilled
      && (!previousLatest?.observedAt || telemetry.observedAt >= previousLatest.observedAt);
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
      source: telemetry.source,
      backfilled: telemetry.backfilled,
      monitoring
    };
    await db.collection("deviceStatus").updateOne(
      { siteId, machineId },
      { $set: deviceStatus },
      { upsert: true }
    );
    if (!updatesCurrentState) return { duplicate: false, backfilled: true, latest: null };

    await Promise.all([
      db.collection("latestTelemetry").updateOne(
        { siteId, machineId },
        { $set: latest },
        { upsert: true }
      ),
      db.collection("machines").updateOne(
        { siteId, machineId, active: true },
        { $set: { status: monitoring.status, gatewayStatus: "online", lastSeenAt: telemetry.receivedAt, updatedAt: telemetry.receivedAt } }
      )
    ]);
    await Promise.all([
      syncTelemetryAlarms(telemetry, monitoringConfig),
      setGatewayAlarm(siteId, machineId, false, telemetry.receivedAt)
    ]);
    telemetryEvents.emit("telemetry", latest);
    return { duplicate: false, backfilled: false, latest };
  } catch (error) {
    await db.collection("telemetryReceipts").deleteOne({ _id: receiptId });
    throw error;
  }
}
