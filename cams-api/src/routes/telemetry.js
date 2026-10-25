import { Router } from "express";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { telemetryEvents } from "../telemetry/events.js";
import { buildTelemetryTree } from "../telemetry/tree.js";
import { evaluateMachine } from "../monitoring/health.js";
import { publicAlarm } from "../telemetry/alarms.js";
import { getSiteSettings } from "../settings/service.js";

const MACHINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TREE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireAlarmWrite(request, response, next) {
  if (!new Set(["owner", "operator"]).has(request.auth?.user.role)) return response.status(403).json({ error: "Owner or operator access required." });
  next();
}

export function telemetryRouter(config) {
  const router = Router();
  router.use(requireAuth);

  router.get("/machines", async (_request, response, next) => {
    try {
      const db = getDatabase();
      const [machines, latest, deviceStatuses] = await Promise.all([
        db.collection("machines").find({ active: true }).sort({ siteId: 1, machineId: 1 }).toArray(),
        db.collection("latestTelemetry").find({}).toArray(),
        db.collection("deviceStatus").find({}).toArray()
      ]);
      const latestByMachine = new Map(latest.map(item => [`${item.siteId}/${item.machineId}`, item]));
      const statusByMachine = new Map(deviceStatuses.map(item => [`${item.siteId}/${item.machineId}`, item]));
      const siteSettings = new Map();
      for (const siteId of new Set(machines.map(machine => machine.siteId))) {
        siteSettings.set(siteId, await getSiteSettings(config, siteId));
      }
      response.json({
        machines: machines.map(machine => {
          const key = `${machine.siteId}/${machine.machineId}`;
          const telemetry = latestByMachine.get(key) || null;
          const monitoring = evaluateMachine(telemetry, statusByMachine.get(key), {
            staleAfterSeconds: siteSettings.get(machine.siteId).sampling.staleAfterSeconds,
            thresholds: siteSettings.get(machine.siteId).thresholds
          });
          return {
            id: machine.machineId,
            siteId: machine.siteId,
            name: machine.name,
            zone: machine.zone,
            status: monitoring.status,
            lastSeenAt: machine.lastSeenAt || null,
            telemetry: telemetry ? { ...telemetry, monitoring } : null,
            monitoring
          };
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/machines/:machineId/telemetry", async (request, response, next) => {
    try {
      const machineId = request.params.machineId;
      const siteId = String(request.query.siteId || "plant-01");
      if (!MACHINE_ID.test(machineId) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit || "300", 10) || 300, 1), 2000);
      const from = request.query.from ? new Date(String(request.query.from)) : new Date(Date.now() - 60 * 60 * 1000);
      const to = request.query.to ? new Date(String(request.query.to)) : new Date();
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return response.status(400).json({ error: "Invalid telemetry time range." });
      const readings = await getDatabase().collection("telemetry").find({
        "series.siteId": siteId,
        "series.machineId": machineId,
        observedAt: { $gte: from, $lte: to }
      }).sort({ observedAt: -1 }).limit(limit).toArray();
      response.json({ readings: readings.reverse() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/telemetry/tree", async (request, response, next) => {
    try {
      const machineId = request.query.machineId === undefined ? undefined : String(request.query.machineId);
      const siteId = String(request.query.siteId || "plant-01");
      const date = request.query.date === undefined ? undefined : String(request.query.date);
      if ((machineId !== undefined && !MACHINE_ID.test(machineId)) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      if (date !== undefined && !TREE_DATE.test(date)) return response.status(400).json({ error: "Date must use YYYY-MM-DD." });
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit || "1000", 10) || 1000, 1), 2000);
      const query = {
        "series.siteId": siteId,
        ...(machineId ? { "series.machineId": machineId } : {}),
        ...(date ? { "hierarchy.date": date } : {})
      };
      const readings = await getDatabase().collection("telemetry").find(query).sort({ observedAt: -1 }).limit(limit).toArray();
      const tree = buildTelemetryTree(readings.reverse());
      if (machineId) tree.CAMS[machineId] ||= {};
      response.json(tree);
    } catch (error) {
      next(error);
    }
  });

  router.get("/telemetry/stream", (request, response) => {
    response.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders();
    response.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    const sendTelemetry = data => response.write(`event: telemetry\ndata: ${JSON.stringify(data)}\n\n`);
    const sendStatus = data => response.write(`event: machine-status\ndata: ${JSON.stringify(data)}\n\n`);
    const sendAlarm = data => response.write(`event: alarm\ndata: ${JSON.stringify(data)}\n\n`);
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20000);
    telemetryEvents.on("telemetry", sendTelemetry);
    telemetryEvents.on("machine-status", sendStatus);
    telemetryEvents.on("alarm", sendAlarm);
    request.on("close", () => {
      clearInterval(heartbeat);
      telemetryEvents.off("telemetry", sendTelemetry);
      telemetryEvents.off("machine-status", sendStatus);
      telemetryEvents.off("alarm", sendAlarm);
    });
  });

  router.get("/alarms", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      const alarms = await getDatabase().collection("alarms").find({ siteId }).sort({ lastSeenAt: -1 }).limit(500).toArray();
      response.json({ alarms: alarms.map(publicAlarm) });
    } catch (error) { next(error); }
  });

  router.patch("/alarms/:alarmId", requireAlarmWrite, async (request, response, next) => {
    try {
      const status = String(request.body?.status || "");
      if (!new Set(["Acknowledged", "Resolved"]).has(status)) return response.status(400).json({ error: "Alarm status must be Acknowledged or Resolved." });
      const now = new Date();
      const alarm = await getDatabase().collection("alarms").findOneAndUpdate(
        { _id: request.params.alarmId },
        { $set: { status, ...(status === "Acknowledged" ? { acknowledgedAt: now } : { resolvedAt: now }), updatedAt: now } },
        { returnDocument: "after" }
      );
      if (!alarm) return response.status(404).json({ error: "Alarm not found." });
      const event = publicAlarm(alarm);
      telemetryEvents.emit("alarm", event);
      response.json({ alarm: event });
    } catch (error) { next(error); }
  });

  return router;
}
