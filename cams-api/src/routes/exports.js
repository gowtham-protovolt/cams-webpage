import { Router } from "express";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { createPdf, createXlsx } from "../exports/documents.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const machineColumns = [
  { key: "machineId", label: "Machine ID", width: 14 },
  { key: "name", label: "Name", width: 20 },
  { key: "zone", label: "Zone", width: 22 },
  { key: "status", label: "Status", width: 12 },
  { key: "pressureBar", label: "Pressure (bar)", width: 16 },
  { key: "flowLpm", label: "Flow (L/min)", width: 16 },
  { key: "suctionKpa", label: "Suction (kPa)", width: 16 },
  { key: "voltageV", label: "Voltage (V)", width: 14 },
  { key: "currentA", label: "Current (A)", width: 14 },
  { key: "activePowerW", label: "Active power (W)", width: 18 },
  { key: "powerFactor", label: "Power factor", width: 14 },
  { key: "frequencyHz", label: "Frequency (Hz)", width: 16 },
  { key: "apparentPowerVa", label: "Apparent power (VA)", width: 20 },
  { key: "reactivePowerVar", label: "Reactive power (var)", width: 20 },
  { key: "powerTotalKwh", label: "Power total (kWh)", width: 18 },
  { key: "receivedAt", label: "Last received", width: 24 }
];

const telemetryColumns = [
  { key: "observedAt", label: "Observed at", width: 24 },
  { key: "sequence", label: "Sequence", width: 14 },
  { key: "status", label: "Status", width: 12 },
  { key: "pressureBar", label: "Pressure (bar)", width: 16 },
  { key: "flowLpm", label: "Flow (L/min)", width: 16 },
  { key: "suctionKpa", label: "Suction (kPa)", width: 16 },
  { key: "pv1", label: "Raw PV1", width: 14 },
  { key: "pv2", label: "Raw PV2", width: 14 },
  { key: "pv3", label: "Raw PV3", width: 14 },
  { key: "err1", label: "ERR1", width: 12 },
  { key: "err2", label: "ERR2", width: 12 },
  { key: "err3", label: "ERR3", width: 12 }
];

const alarmColumns = [
  { key: "createdAt", label: "Event time", width: 24 },
  { key: "machineId", label: "Machine ID", width: 14 },
  { key: "parameter", label: "Alarm point", width: 18 },
  { key: "severity", label: "Severity", width: 12 },
  { key: "value", label: "Value", width: 16 },
  { key: "message", label: "Message", width: 42 },
  { key: "action", label: "Action", width: 16 },
  { key: "status", label: "Status", width: 14 },
  { key: "comment", label: "Comment", width: 42 },
  { key: "actor", label: "Actor", width: 24 }
];

function iso(value) {
  return value ? new Date(value).toISOString() : "";
}

export function telemetryExportRow(reading) {
  return {
    observedAt: iso(reading.observedAt),
    sequence: reading.sequence,
    status: reading.status,
    pressureBar: reading.metrics.pressureBar,
    flowLpm: reading.metrics.flowLpm,
    suctionKpa: reading.metrics.suctionKpa,
    voltageV: reading.metrics.powerMonitor?.voltageV ?? "",
    currentA: reading.metrics.powerMonitor?.currentA ?? "",
    activePowerW: reading.metrics.powerMonitor?.activePowerW ?? "",
    powerFactor: reading.metrics.powerMonitor?.powerFactor ?? "",
    frequencyHz: reading.metrics.powerMonitor?.frequencyHz ?? "",
    apparentPowerVa: reading.metrics.powerMonitor?.apparentPowerVa ?? "",
    reactivePowerVar: reading.metrics.powerMonitor?.reactivePowerVar ?? "",
    powerTotalKwh: reading.metrics.powerMonitor?.powerTotalKwh ?? "",
    pv1: reading.raw?.pv1 ?? "",
    pv2: reading.raw?.pv2 ?? "",
    pv3: reading.raw?.pv3 ?? "",
    err1: reading.errors?.flow ?? "",
    err2: reading.errors?.pressure ?? "",
    err3: reading.errors?.suction ?? ""
  };
}

function documentResponse(response, format, filename, buffer) {
  const contentType = format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/pdf";
  response.status(200).set({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}.${format}"`,
    "Cache-Control": "private, no-store",
    "Content-Length": String(buffer.length)
  }).send(buffer);
}

async function buildDocument(format, options) {
  if (format === "xlsx") return createXlsx(options);
  if (format === "pdf") return createPdf(options);
  return null;
}

export function exportsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/exports/machines/:format", async (request, response, next) => {
    try {
      const format = request.params.format;
      if (!["xlsx", "pdf"].includes(format)) return response.status(404).json({ error: "Unsupported export format." });
      const db = getDatabase();
      const [machines, latest] = await Promise.all([
        db.collection("machines").find({ active: true }).sort({ siteId: 1, machineId: 1 }).toArray(),
        db.collection("latestTelemetry").find({}).toArray()
      ]);
      const latestByMachine = new Map(latest.map(item => [`${item.siteId}/${item.machineId}`, item]));
      const rows = machines.map(machine => {
        const reading = latestByMachine.get(`${machine.siteId}/${machine.machineId}`);
        return {
          machineId: machine.machineId,
          name: machine.name,
          zone: machine.zone,
          status: reading?.status || machine.status || "offline",
          pressureBar: reading?.metrics?.pressureBar ?? "",
          flowLpm: reading?.metrics?.flowLpm ?? "",
          suctionKpa: reading?.metrics?.suctionKpa ?? "",
          receivedAt: iso(reading?.receivedAt || machine.lastSeenAt)
        };
      });
      const buffer = await buildDocument(format, {
        sheetName: "Machine Fleet",
        title: "CAMS Machine Fleet",
        subtitle: "Current registered machines and latest telemetry",
        columns: machineColumns,
        rows
      });
      documentResponse(response, format, "cams-machine-fleet", buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/exports/telemetry/:format", async (request, response, next) => {
    try {
      const format = request.params.format;
      if (!["xlsx", "pdf"].includes(format)) return response.status(404).json({ error: "Unsupported export format." });
      const machineId = String(request.query.machineId || "");
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(machineId) || !IDENTIFIER.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      const from = request.query.from ? new Date(String(request.query.from)) : new Date(Date.now() - 60 * 60 * 1000);
      const to = request.query.to ? new Date(String(request.query.to)) : new Date();
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return response.status(400).json({ error: "Invalid telemetry time range." });
      const readings = await getDatabase().collection("telemetry").find({
        "series.siteId": siteId,
        "series.machineId": machineId,
        observedAt: { $gte: from, $lte: to }
      }).project({ observedAt: 1, sequence: 1, status: 1, metrics: 1, raw: 1, errors: 1 })
        .sort({ observedAt: 1 }).limit(5000).toArray();
      const rows = readings.map(telemetryExportRow);
      const buffer = await buildDocument(format, {
        sheetName: machineId,
        title: `CAMS Telemetry · ${machineId}`,
        subtitle: `${iso(from)} to ${iso(to)} · ${rows.length} readings`,
        columns: telemetryColumns,
        rows
      });

      documentResponse(response, format, `cams-${machineId.toLowerCase()}-telemetry`, buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/exports/alarms/:format", async (request, response, next) => {
    try {
      const format = request.params.format;
      if (format !== "xlsx") return response.status(404).json({ error: "Unsupported export format." });
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      const db = getDatabase();
      const [alarms, auditEntries] = await Promise.all([
        db.collection("alarms").find({ siteId }).sort({ lastSeenAt: -1 }).limit(5000).toArray(),
        db.collection("alarmAudit").find({ siteId }).sort({ createdAt: -1 }).limit(5000).toArray()
      ]);
      const alarmById = new Map(alarms.map(alarm => [alarm._id, alarm]));
      const rows = auditEntries.map(entry => {
        const alarm = alarmById.get(entry.alarmId);
        return {
          createdAt: iso(entry.createdAt),
          machineId: entry.machineId || alarm?.machineId || "",
          parameter: alarm?.parameter || "",
          severity: alarm?.severity || "",
          value: alarm?.value || "",
          message: alarm?.message || "",
          action: entry.action || "",
          status: entry.status || alarm?.status || "",
          comment: entry.comment || "",
          actor: entry.actor?.displayName || entry.source || "system"
        };
      });
      const auditedAlarmIds = new Set(auditEntries.map(entry => entry.alarmId));
      rows.push(...alarms.filter(alarm => !auditedAlarmIds.has(alarm._id)).map(alarm => ({
        createdAt: iso(alarm.lastSeenAt || alarm.firstSeenAt),
        machineId: alarm.machineId,
        parameter: alarm.parameter,
        severity: alarm.severity,
        value: alarm.value,
        message: alarm.message,
        action: "Alarm",
        status: alarm.status,
        comment: "",
        actor: "system"
      })));
      const buffer = await buildDocument(format, {
        sheetName: "Alarm History",
        title: "CAMS Alarm and Event History",
        subtitle: `${siteId} · ${rows.length} events`,
        columns: alarmColumns,
        rows
      });
      documentResponse(response, format, "cams-alarm-history", buffer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
