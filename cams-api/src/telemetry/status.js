import { getDatabase } from "../db.js";
import { evaluateMachine } from "../monitoring/health.js";
import { setGatewayAlarm } from "./alarms.js";
import { telemetryEvents } from "./events.js";
import { getSiteSettings } from "../settings/service.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function parseStatusMessage(topic, payload, receivedAt = new Date()) {
  const parts = String(topic).split("/");
  if (parts.length !== 4 || parts[0] !== "cams" || parts[3] !== "status") throw new Error("Status topic must use cams/{siteId}/{machineId}/status.");
  const [, siteId, machineId] = parts;
  if (!IDENTIFIER.test(siteId) || !IDENTIFIER.test(machineId)) throw new Error("Status topic contains an invalid identifier.");
  if (!Buffer.isBuffer(payload) || payload.length > 4096) throw new Error("Status payload must be a buffer smaller than 4 KB.");
  let body;
  try { body = JSON.parse(payload.toString("utf8")); } catch { throw new Error("Status payload must be valid JSON."); }
  const status = String(body?.status || "").toLowerCase();
  if (!new Set(["online", "offline"]).has(status)) throw new Error("Status must be online or offline.");
  return { siteId, machineId, status, receivedAt, firmwareVersion: body.firmwareVersion ? String(body.firmwareVersion).slice(0, 80) : null };
}

export async function ingestDeviceStatus(deviceStatus, config) {
  const db = getDatabase();
  const { siteId, machineId } = deviceStatus;
  const registeredMachine = await db.collection("machines").findOne({ siteId, machineId }, { projection: { active: 1 } });
  if (!registeredMachine?.active) {
    return { ignored: true, reason: registeredMachine ? "machine-removed" : "machine-not-registered" };
  }
  await Promise.all([
    db.collection("deviceStatus").updateOne({ siteId, machineId }, { $set: deviceStatus }, { upsert: true }),
    db.collection("machines").updateOne(
      { siteId, machineId, active: true },
      {
        $set: {
          gatewayStatus: deviceStatus.status,
          lastStatusAt: deviceStatus.receivedAt,
          ...(deviceStatus.status === "offline" ? { status: "offline" } : {}),
          updatedAt: deviceStatus.receivedAt
        },
      }
    )
  ]);
  await setGatewayAlarm(siteId, machineId, deviceStatus.status === "offline", deviceStatus.receivedAt);
  const telemetry = await db.collection("latestTelemetry").findOne({ siteId, machineId });
  const settings = await getSiteSettings(config, siteId);
  const monitoring = evaluateMachine(telemetry, deviceStatus, { staleAfterSeconds: settings.sampling.staleAfterSeconds, thresholds: settings.thresholds }, deviceStatus.receivedAt);
  const event = { siteId, machineId, ...monitoring, lastStatusAt: deviceStatus.receivedAt, firmwareVersion: deviceStatus.firmwareVersion };
  telemetryEvents.emit("machine-status", event);
  return event;
}

export async function markStaleMachines(config, now = new Date()) {
  const cutoff = new Date(now.getTime() - 3000);
  const machines = await getDatabase().collection("machines").find({
    active: true,
    lastSeenAt: { $lt: cutoff },
    $or: [{ status: { $ne: "offline" } }, { gatewayStatus: { $ne: "offline" } }]
  }).toArray();
  for (const machine of machines) {
    const settings = await getSiteSettings(config, machine.siteId);
    if (now.getTime() - new Date(machine.lastSeenAt).getTime() <= settings.sampling.staleAfterSeconds * 1000) continue;
    const [telemetry, deviceStatus] = await Promise.all([
      getDatabase().collection("latestTelemetry").findOne({ siteId: machine.siteId, machineId: machine.machineId }),
      getDatabase().collection("deviceStatus").findOne({ siteId: machine.siteId, machineId: machine.machineId })
    ]);
    const monitoring = evaluateMachine(telemetry, deviceStatus, { staleAfterSeconds: settings.sampling.staleAfterSeconds, thresholds: settings.thresholds }, now);
    await getDatabase().collection("machines").updateOne(
      { _id: machine._id },
      { $set: { status: monitoring.status, gatewayStatus: monitoring.gatewayStatus, updatedAt: now } }
    );
    await setGatewayAlarm(machine.siteId, machine.machineId, true, now);
    telemetryEvents.emit("machine-status", {
      siteId: machine.siteId,
      machineId: machine.machineId,
      ...monitoring
    });
  }
  return machines.length;
}

export function startStaleMonitor(config) {
  const run = () => markStaleMachines(config).catch(error => console.error("CAMS stale monitor failed.", error.message));
  run();
  return setInterval(run, Math.min(5000, config.monitoring.staleAfterSeconds * 500));
}

export function stopStaleMonitor(timer) {
  if (timer) clearInterval(timer);
}
