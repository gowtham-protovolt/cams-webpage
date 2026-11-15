import { Router } from "express";
import { MongoServerError } from "mongodb";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { telemetryEvents } from "../telemetry/events.js";
import { buildTelemetryTree } from "../telemetry/tree.js";
import { evaluateMachine } from "../monitoring/health.js";
import { publicAlarm, publicAuditEntry, recordAlarmAudit } from "../telemetry/alarms.js";
import { getSiteSettings } from "../settings/service.js";
import { listTickets, reconcileMachineTickets, recordMachineTicketActivity } from "../tickets/service.js";
import { assignDeviceLocations, buildClusterHierarchy } from "../telemetry/hierarchy.js";
import { ensureLegacyLocations, resolveLocation } from "../telemetry/locations.js";

const MACHINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DEVICE_MACHINE_ID = /^CAMS-(?:0[1-9]|[1-9][0-9])$/;
const TREE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireOwner(request, response, next) {
  if (request.auth?.user.role !== "owner") return response.status(403).json({ error: "Owner access required." });
  next();
}

function cleanMachineFields(body) {
  const name = String(body?.name || "").trim();
  const zone = String(body?.zone || "").trim();
  const cluster = body?.cluster === undefined ? undefined : String(body.cluster).trim();
  if (!name || name.length > 80) return { error: "Machine name is required and must not exceed 80 characters." };
  if ((!zone && !body?.areaId) || zone.length > 80) return { error: "Device area is required and must not exceed 80 characters." };
  if (cluster !== undefined && (!cluster || cluster.length > 80)) return { error: "Cluster is required and must not exceed 80 characters." };
  return { name, zone, ...(cluster === undefined ? {} : { cluster }) };
}

function managedMachine(machine) {
  return {
    id: machine.machineId,
    siteId: machine.siteId,
    name: machine.name,
    zone: machine.zone,
    cluster: machine.cluster || "",
    clusterId: machine.clusterId || null,
    areaId: machine.areaId || null,
    active: machine.active,
    status: machine.status || "offline",
    createdAt: machine.createdAt || null,
    updatedAt: machine.updatedAt || null,
    removedAt: machine.removedAt || null
  };
}

function requireAlarmWrite(request, response, next) {
  if (!new Set(["owner", "operator"]).has(request.auth?.user.role)) return response.status(403).json({ error: "Owner or operator access required." });
  next();
}

function cleanAlarmComment(body) {
  const comment = String(body?.comment || "").trim();
  if (!comment || comment.length > 500) return { error: "An audit comment is required and must not exceed 500 characters." };
  return { comment };
}

async function activeMachineViews(config, siteId) {
  const db = getDatabase();
  const sites = siteId ? [siteId] : [...new Set((await db.collection("machines").find({}, { projection: { siteId: 1 } }).toArray()).map(machine => machine.siteId))];
  for (const id of sites) await ensureLegacyLocations(id);
  const query = { active: true, ...(siteId ? { siteId } : {}) };
  const [machines, latest, deviceStatuses] = await Promise.all([
    db.collection("machines").find(query).sort({ siteId: 1, cluster: 1, zone: 1, machineId: 1 }).toArray(),
    db.collection("latestTelemetry").find(siteId ? { siteId } : {}).toArray(),
    db.collection("deviceStatus").find(siteId ? { siteId } : {}).toArray()
  ]);
  const latestByMachine = new Map(latest.map(item => [`${item.siteId}/${item.machineId}`, item]));
  const statusByMachine = new Map(deviceStatuses.map(item => [`${item.siteId}/${item.machineId}`, item]));
  const siteSettings = new Map();
  await Promise.all([...new Set(machines.map(machine => machine.siteId))].map(async machineSiteId => {
    siteSettings.set(machineSiteId, await getSiteSettings(config, machineSiteId));
  }));
  const views = machines.map(machine => {
    const key = `${machine.siteId}/${machine.machineId}`;
    const telemetry = latestByMachine.get(key) || null;
    const monitoring = evaluateMachine(telemetry, statusByMachine.get(key), {
      staleAfterSeconds: siteSettings.get(machine.siteId).sampling.staleAfterSeconds,
      thresholds: {
        ...siteSettings.get(machine.siteId).thresholds,
        ...(machine.configuration?.sensors?.powerMonitor
          ? { powerMonitor: machine.configuration.sensors.powerMonitor }
          : {})
      }
    });
    return {
      id: machine.machineId,
      siteId: machine.siteId,
      name: machine.name,
      zone: machine.zone,
      cluster: machine.cluster || "",
      clusterId: machine.clusterId,
      areaId: machine.areaId,
      status: monitoring.status,
      lastSeenAt: machine.lastSeenAt || null,
      telemetry: telemetry ? { ...telemetry, monitoring } : null,
      monitoring
    };
  });
  const viewsBySite = new Map();
  for (const view of views) {
    if (!viewsBySite.has(view.siteId)) viewsBySite.set(view.siteId, []);
    viewsBySite.get(view.siteId).push(view);
  }
  return [...viewsBySite.values()].flatMap(siteViews => assignDeviceLocations(siteViews));
}

function alarmDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function alarmText(value, maximum = 80) {
  const text = String(value || "").trim();
  return text && text.length <= maximum ? text : undefined;
}

export function telemetryRouter(config) {
  const router = Router();
  router.use(requireAuth);

  router.get("/machines", async (_request, response, next) => {
    try {
      response.json({ machines: await activeMachineViews(config) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/summary", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      const db = getDatabase();
      const [machines, alarms, tickets] = await Promise.all([
        activeMachineViews(config),
        db.collection("alarms")
          .find({ siteId, status: { $in: ["Active", "Acknowledged"] } })
          .sort({ lastSeenAt: -1 })
          .limit(500)
          .toArray(),
        listTickets(siteId)
      ]);
      response.json({ machines, alarms: alarms.map(publicAlarm), tickets });
    } catch (error) {
      next(error);
    }
  });

  router.get("/clusters", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01").trim();
      if (!MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      const devices = await activeMachineViews(config, siteId);
      response.json({ siteId, clusters: buildClusterHierarchy(devices) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/machines/removed", requireOwner, async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      const machines = await getDatabase().collection("machines")
        .find({ siteId, active: false })
        .sort({ removedAt: -1, machineId: 1 })
        .toArray();
      response.json({ machines: machines.map(managedMachine) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/machines", requireOwner, async (request, response, next) => {
    try {
      const siteId = String(request.body?.siteId || "plant-01").trim();
      const machineId = String(request.body?.machineId || "").trim().toUpperCase();
      const fields = cleanMachineFields(request.body);
      if (!MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      if (machineId && !DEVICE_MACHINE_ID.test(machineId)) return response.status(400).json({ error: "Machine ID must use CAMS-01 through CAMS-99." });
      if (fields.error) return response.status(400).json({ error: fields.error });
      if (!machineId && !fields.cluster && !request.body?.clusterId) return response.status(400).json({ error: "Cluster is required." });
      const location = await resolveLocation(siteId, request.body);
      const now = new Date();
      const machine = {
        siteId,
        machineId,
        ...fields,
        ...location,
        active: true,
        status: "offline",
        gatewayStatus: "offline",
        createdAt: now,
        updatedAt: now,
        createdBy: request.auth.user.id
      };
      const collection = getDatabase().collection("machines");
      if (machineId) {
        await collection.insertOne(machine);
      } else {
        let inserted = false;
        for (let number = 1; number <= 99; number += 1) {
          machine.machineId = `CAMS-${String(number).padStart(2, "0")}`;
          delete machine._id;
          try {
            await collection.insertOne(machine);
            inserted = true;
            break;
          } catch (error) {
            if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
          }
        }
        if (!inserted) return response.status(409).json({ error: "All 99 device IDs are reserved. Restore a removed device or use another site." });
      }
      const event = managedMachine(machine);
      telemetryEvents.emit("machine-created", event);
      response.status(201).json({ machine: event });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await getDatabase().collection("machines").findOne({
          siteId: String(request.body?.siteId || "plant-01").trim(),
          machineId: String(request.body?.machineId || "").trim().toUpperCase()
        });
        return response.status(409).json({ error: existing?.active ? "That machine is already registered." : "That machine was removed. Restore it instead of creating a duplicate." });
      }
      next(error);
    }
  });

  router.patch("/machines/:machineId", requireOwner, async (request, response, next) => {
    try {
      const machineId = String(request.params.machineId).toUpperCase();
      const siteId = String(request.query.siteId || "plant-01");
      const fields = cleanMachineFields(request.body);
      if (!DEVICE_MACHINE_ID.test(machineId) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      if (fields.error) return response.status(400).json({ error: fields.error });
      await ensureLegacyLocations(siteId);
      const existing = await getDatabase().collection("machines").findOne({ siteId, machineId, active: true });
      if (!existing) return response.status(404).json({ error: "Active device not found." });
      const location = await resolveLocation(siteId, request.body, existing);
      const updates = { ...fields, ...location, updatedAt: new Date(), updatedBy: request.auth.user.id };
      if (existing.configuration) {
        const cluster = location.cluster ?? existing.cluster ?? "";
        const zone = location.zone ?? existing.zone ?? "";
        updates.configuration = {
          ...existing.configuration,
          general: {
            ...existing.configuration.general,
            deviceName: fields.name,
            machineId,
            location: [cluster, zone].filter(Boolean).join(" · ") || "Unassigned"
          }
        };
      }
      const machine = await getDatabase().collection("machines").findOneAndUpdate(
        { siteId, machineId, active: true },
        { $set: updates },
        { returnDocument: "after" }
      );
      if (!machine) return response.status(404).json({ error: "Active machine not found." });
      const event = managedMachine(machine);
      telemetryEvents.emit("machine-updated", event);
      response.json({ machine: event });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/machines/:machineId", requireOwner, async (request, response, next) => {
    try {
      const machineId = String(request.params.machineId).toUpperCase();
      const siteId = String(request.query.siteId || "plant-01");
      if (!DEVICE_MACHINE_ID.test(machineId) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      const now = new Date();
      const db = getDatabase();
      const machine = await db.collection("machines").findOneAndUpdate(
        { siteId, machineId, active: true },
        { $set: { active: false, status: "offline", gatewayStatus: "offline", removedAt: now, removedBy: request.auth.user.id, updatedAt: now } },
        { returnDocument: "after" }
      );
      if (!machine) return response.status(404).json({ error: "Active machine not found." });
      const openAlarms = await db.collection("alarms").find({ siteId, machineId, status: { $ne: "Resolved" } }).toArray();
      await Promise.all([
        db.collection("latestTelemetry").deleteOne({ siteId, machineId }),
        db.collection("deviceStatus").deleteOne({ siteId, machineId }),
        db.collection("alarms").updateMany(
          { siteId, machineId, status: { $ne: "Resolved" } },
          { $set: { status: "Resolved", resolvedAt: now, updatedAt: now } }
        )
      ]);
      await Promise.all(openAlarms.map(alarm => recordAlarmAudit({ ...alarm, status: "Resolved" }, {
        action: "Resolved",
        status: "Resolved",
        comment: `Machine ${machineId} was removed from active monitoring.`,
        actor: request.auth.user,
        source: "user",
        createdAt: now
      })));
      await reconcileMachineTickets(siteId, machineId, now);
      const event = managedMachine(machine);
      telemetryEvents.emit("machine-removed", event);
      response.json({ machine: event });
    } catch (error) {
      next(error);
    }
  });

  router.post("/machines/:machineId/restore", requireOwner, async (request, response, next) => {
    try {
      const machineId = String(request.params.machineId).toUpperCase();
      const siteId = String(request.query.siteId || "plant-01");
      if (!DEVICE_MACHINE_ID.test(machineId) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      const now = new Date();
      const machine = await getDatabase().collection("machines").findOneAndUpdate(
        { siteId, machineId, active: false },
        {
          $set: { active: true, status: "offline", gatewayStatus: "offline", lastSeenAt: null, lastStatusAt: null, updatedAt: now, restoredAt: now, restoredBy: request.auth.user.id },
          $unset: { removedAt: "", removedBy: "" }
        },
        { returnDocument: "after" }
      );
      if (!machine) return response.status(404).json({ error: "Removed machine not found." });
      const event = managedMachine(machine);
      telemetryEvents.emit("machine-restored", event);
      response.json({ machine: event });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/machines/:machineId/permanent", requireOwner, async (request, response, next) => {
    try {
      const machineId = String(request.params.machineId).toUpperCase();
      const siteId = String(request.query.siteId || "plant-01");
      if (!DEVICE_MACHINE_ID.test(machineId) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      const db = getDatabase();
      const machine = await db.collection("machines").findOneAndDelete({
        siteId,
        machineId,
        active: false,
        removedAt: { $exists: true }
      });
      if (!machine) return response.status(404).json({ error: "Removed machine not found." });
      await Promise.all([
        db.collection("latestTelemetry").deleteOne({ siteId, machineId }),
        db.collection("deviceStatus").deleteOne({ siteId, machineId }),
        db.collection("ticketMachineState").deleteOne({ _id: `${siteId}/${machineId}` })
      ]);
      telemetryEvents.emit("machine-permanently-deleted", { id: machineId, siteId });
      response.json({ deleted: true, machine: { id: machineId, siteId } });
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
      const readings = await getDatabase().collection("telemetry").aggregate([
        {
          $match: {
            "series.siteId": siteId,
            "series.machineId": machineId,
            observedAt: { $gte: from, $lte: to }
          }
        },
        { $sort: { observedAt: 1 } },
        { $bucketAuto: { groupBy: "$observedAt", buckets: limit, output: { reading: { $last: "$$ROOT" } } } }
      ]).toArray();
      response.json({ readings: readings.map(bucket => bucket.reading) });
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
    const sendTicket = data => response.write(`event: ticket\ndata: ${JSON.stringify(data)}\n\n`);
    const machineEventNames = ["machine-created", "machine-updated", "machine-removed", "machine-restored", "machine-permanently-deleted"];
    const machineListeners = new Map(machineEventNames.map(name => [name, data => response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)]));
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20000);
    telemetryEvents.on("telemetry", sendTelemetry);
    telemetryEvents.on("machine-status", sendStatus);
    telemetryEvents.on("alarm", sendAlarm);
    telemetryEvents.on("ticket", sendTicket);
    for (const [name, listener] of machineListeners) telemetryEvents.on(name, listener);
    request.on("close", () => {
      clearInterval(heartbeat);
      telemetryEvents.off("telemetry", sendTelemetry);
      telemetryEvents.off("machine-status", sendStatus);
      telemetryEvents.off("alarm", sendAlarm);
      telemetryEvents.off("ticket", sendTicket);
      for (const [name, listener] of machineListeners) telemetryEvents.off(name, listener);
    });
  });

  router.get("/alarms", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01").trim();
      if (!MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      const cluster = request.query.cluster === undefined ? "" : alarmText(request.query.cluster);
      const area = request.query.area === undefined ? "" : alarmText(request.query.area);
      const machineId = request.query.machineId === undefined ? "" : String(request.query.machineId).trim().toUpperCase();
      const parameter = request.query.parameter === undefined ? "" : alarmText(request.query.parameter);
      const severity = request.query.severity === undefined ? "" : String(request.query.severity).trim();
      const status = request.query.status === undefined ? "" : String(request.query.status).trim();
      const from = alarmDate(request.query.from);
      const to = alarmDate(request.query.to);
      const limit = Math.min(500, Math.max(1, Number.parseInt(request.query.limit || "500", 10) || 500));
      if (request.query.cluster !== undefined && cluster === undefined) return response.status(400).json({ error: "Invalid cluster filter." });
      if (request.query.area !== undefined && area === undefined) return response.status(400).json({ error: "Invalid area filter." });
      if (request.query.machineId !== undefined && !DEVICE_MACHINE_ID.test(machineId)) return response.status(400).json({ error: "Invalid device filter." });
      if (request.query.parameter !== undefined && parameter === undefined) return response.status(400).json({ error: "Invalid alarm point filter." });
      if (severity && !new Set(["Critical", "Warning", "Info"]).has(severity)) return response.status(400).json({ error: "Invalid severity filter." });
      if (status && !new Set(["Active", "Acknowledged", "Resolved"]).has(status)) return response.status(400).json({ error: "Invalid status filter." });
      if (request.query.from !== undefined && from === undefined) return response.status(400).json({ error: "Invalid From date." });
      if (request.query.to !== undefined && to === undefined) return response.status(400).json({ error: "Invalid To date." });
      if (from && to && from > to) return response.status(400).json({ error: "From date must be before To date." });

      const query = {
        siteId,
        ...(machineId ? { machineId } : {}),
        ...(parameter ? { parameter } : {}),
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
        ...((from || to) ? { lastSeenAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {})
      };
      if (cluster || area) {
        const devices = await activeMachineViews(config, siteId);
        const matchingIds = devices
          .filter(device => (!cluster || device.cluster === cluster) && (!area || device.zone === area))
          .map(device => device.id);
        if (machineId && !matchingIds.includes(machineId)) return response.json({ alarms: [], filters: { siteId, cluster, area, machineId, parameter, severity, status, from, to } });
        if (!machineId) query.machineId = { $in: matchingIds };
      }
      const alarms = await getDatabase().collection("alarms").find(query).sort({ lastSeenAt: -1 }).limit(limit).toArray();
      response.json({ alarms: alarms.map(publicAlarm), filters: { siteId, cluster, area, machineId, parameter, severity, status, from, to, limit } });
    } catch (error) { next(error); }
  });

  router.get("/alarms/:alarmId/history", async (request, response, next) => {
    try {
      const alarm = await getDatabase().collection("alarms").findOne({ _id: request.params.alarmId });
      if (!alarm) return response.status(404).json({ error: "Alarm not found." });
      const history = await getDatabase().collection("alarmAudit")
        .find({ alarmId: alarm._id })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();
      response.json({ alarm: publicAlarm(alarm), history: history.map(publicAuditEntry) });
    } catch (error) { next(error); }
  });

  router.patch("/alarms/:alarmId", requireAlarmWrite, async (request, response, next) => {
    try {
      const status = String(request.body?.status || "");
      if (!new Set(["Acknowledged", "Resolved"]).has(status)) return response.status(400).json({ error: "Alarm status must be Acknowledged or Resolved." });
      const comment = cleanAlarmComment(request.body);
      if (comment.error) return response.status(400).json({ error: comment.error });
      const now = new Date();
      const allowedCurrentStatuses = status === "Acknowledged" ? ["Active"] : ["Active", "Acknowledged"];
      const alarm = await getDatabase().collection("alarms").findOneAndUpdate(
        { _id: request.params.alarmId, status: { $in: allowedCurrentStatuses } },
        { $set: {
          status,
          ...(status === "Acknowledged"
            ? { acknowledgedAt: now, acknowledgedBy: request.auth.user }
            : { resolvedAt: now, resolvedBy: request.auth.user }),
          updatedAt: now
        } },
        { returnDocument: "after" }
      );
      if (!alarm) {
        const exists = await getDatabase().collection("alarms").findOne({ _id: request.params.alarmId }, { projection: { status: 1 } });
        if (!exists) return response.status(404).json({ error: "Alarm not found." });
        return response.status(409).json({ error: `Alarm is already ${String(exists.status).toLowerCase()} and cannot be marked ${status.toLowerCase()}.` });
      }
      const audit = await recordAlarmAudit(alarm, {
        action: status,
        status,
        comment: comment.comment,
        actor: request.auth.user,
        source: "user",
        createdAt: now
      });
      await recordMachineTicketActivity(alarm.siteId, alarm.machineId, {
        action: status === "Acknowledged" ? "Alarm acknowledged" : "Alarm resolved",
        actor: request.auth.user,
        details: `Alarm: ${alarm.parameter} · ${alarm.message}`,
        at: now
      });
      const event = publicAlarm(alarm);
      telemetryEvents.emit("alarm", event);
      await reconcileMachineTickets(alarm.siteId, alarm.machineId, now);
      response.json({ alarm: event, audit });
    } catch (error) { next(error); }
  });

  return router;
}
