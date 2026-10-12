import { getDatabase } from "../db.js";
import { telemetryEvents } from "./events.js";
import { alarmConditions } from "../monitoring/health.js";
import { randomUUID } from "node:crypto";

function alarmId(siteId, machineId, code) {
  return `${siteId}/${machineId}/${code}`;
}

function publicAlarm(alarm) {
  return {
    id: alarm._id,
    siteId: alarm.siteId,
    machineId: alarm.machineId,
    code: alarm.code,
    parameter: alarm.parameter,
    severity: alarm.severity,
    value: alarm.value,
    message: alarm.message,
    status: alarm.status,
    firstSeenAt: alarm.firstSeenAt,
    lastSeenAt: alarm.lastSeenAt,
    acknowledgedAt: alarm.acknowledgedAt || null,
    resolvedAt: alarm.resolvedAt || null
  };
}

function publicAuditEntry(entry) {
  return {
    id: entry._id,
    alarmId: entry.alarmId,
    action: entry.action,
    status: entry.status,
    comment: entry.comment || "",
    source: entry.source,
    actor: entry.actor,
    createdAt: entry.createdAt
  };
}

export async function recordAlarmAudit(alarm, {
  action,
  status,
  comment = "",
  actor = null,
  source = "system",
  createdAt = new Date()
}) {
  const entry = {
    _id: randomUUID(),
    alarmId: alarm._id,
    siteId: alarm.siteId,
    machineId: alarm.machineId,
    action,
    status,
    comment,
    source,
    actor: actor ? {
      id: actor.id || null,
      displayName: actor.displayName || actor.username || actor.email || "CAMS user",
      username: actor.username || null,
      email: actor.email || null,
      role: actor.role || null
    } : {
      id: null,
      displayName: "CAMS Monitoring",
      username: null,
      email: null,
      role: "system"
    },
    createdAt
  };
  await getDatabase().collection("alarmAudit").insertOne(entry);
  return publicAuditEntry(entry);
}

async function writeAlarm(siteId, machineId, condition, now) {
  const collection = getDatabase().collection("alarms");
  const _id = alarmId(siteId, machineId, condition.code);
  const existing = await collection.findOne({ _id });
  const status = existing?.status === "Acknowledged" ? "Acknowledged" : "Active";
  const alarm = await collection.findOneAndUpdate(
    { _id },
    {
      $set: { siteId, machineId, ...condition, status, lastSeenAt: now, resolvedAt: null },
      $setOnInsert: { firstSeenAt: now, acknowledgedAt: null }
    },
    { upsert: true, returnDocument: "after" }
  );
  telemetryEvents.emit("alarm", publicAlarm(alarm));
}

export async function syncTelemetryAlarms(telemetry, monitoring) {
  const { siteId, machineId } = telemetry.series;
  const now = telemetry.receivedAt;
  const active = alarmConditions(telemetry, monitoring);
  const activeCodes = new Set(active.map(item => item.code));
  await Promise.all(active.map(condition => writeAlarm(siteId, machineId, condition, now)));
  const query = { siteId, machineId, status: { $ne: "Resolved" }, code: { $ne: "gateway-offline" } };
  const existing = await getDatabase().collection("alarms").find(query).toArray();
  const recovered = existing.filter(alarm => !activeCodes.has(alarm.code));
  await Promise.all(recovered.map(async alarm => {
    const updated = await getDatabase().collection("alarms").findOneAndUpdate(
      { _id: alarm._id },
      { $set: { status: "Resolved", resolvedAt: now, lastSeenAt: now } },
      { returnDocument: "after" }
    );
    await recordAlarmAudit(updated, {
      action: "Resolved",
      status: "Resolved",
      comment: "Reading returned to its configured operating range.",
      createdAt: now
    });
    telemetryEvents.emit("alarm", publicAlarm(updated));
  }));
}

export async function setGatewayAlarm(siteId, machineId, offline, now = new Date()) {
  const _id = alarmId(siteId, machineId, "gateway-offline");
  const collection = getDatabase().collection("alarms");
  if (offline) {
    await writeAlarm(siteId, machineId, {
      code: "gateway-offline",
      parameter: "Gateway",
      severity: "Critical",
      value: "offline",
      message: "ESP32 gateway is offline or telemetry is stale."
    }, now);
    return;
  }
  const updated = await collection.findOneAndUpdate(
    { _id, status: { $ne: "Resolved" } },
    { $set: { status: "Resolved", resolvedAt: now, lastSeenAt: now } },
    { returnDocument: "after" }
  );
  if (updated) {
    await recordAlarmAudit(updated, {
      action: "Resolved",
      status: "Resolved",
      comment: "Gateway connection recovered.",
      createdAt: now
    });
    telemetryEvents.emit("alarm", publicAlarm(updated));
  }
}

export { publicAlarm, publicAuditEntry };
