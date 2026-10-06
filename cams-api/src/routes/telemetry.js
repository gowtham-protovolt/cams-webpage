import { Router } from "express";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { telemetryEvents } from "../telemetry/events.js";

const MACHINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TREE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function treeValue(reading) {
  return {
    flow: reading.metrics.flowLpm,
    pressure: reading.metrics.pressureBar,
    suction: reading.metrics.suctionKpa,
    units: { flow: "L/min", pressure: "bar", suction: "kPa" },
    raw: reading.raw || null,
    errors: reading.errors || null,
    quality: reading.quality || null,
    status: reading.status,
    timestamp: reading.observedAt,
    receivedAt: reading.receivedAt,
    source: reading.source
  };
}

export function telemetryRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/machines", async (_request, response, next) => {
    try {
      const db = getDatabase();
      const [machines, latest] = await Promise.all([
        db.collection("machines").find({ active: true }).sort({ siteId: 1, machineId: 1 }).toArray(),
        db.collection("latestTelemetry").find({}).toArray()
      ]);
      const latestByMachine = new Map(latest.map(item => [`${item.siteId}/${item.machineId}`, item]));
      response.json({
        machines: machines.map(machine => ({
          id: machine.machineId,
          siteId: machine.siteId,
          name: machine.name,
          zone: machine.zone,
          status: machine.status || "offline",
          lastSeenAt: machine.lastSeenAt || null,
          telemetry: latestByMachine.get(`${machine.siteId}/${machine.machineId}`) || null
        }))
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
      const machineId = String(request.query.machineId || "CAMS-01");
      const siteId = String(request.query.siteId || "plant-01");
      const date = request.query.date === undefined ? undefined : String(request.query.date);
      if (!MACHINE_ID.test(machineId) || !MACHINE_ID.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      if (date !== undefined && !TREE_DATE.test(date)) return response.status(400).json({ error: "Date must use YYYY-MM-DD." });
      const limit = Math.min(Math.max(Number.parseInt(request.query.limit || "1000", 10) || 1000, 1), 2000);
      const query = {
        "series.siteId": siteId,
        "series.machineId": machineId,
        ...(date ? { "hierarchy.date": date } : {})
      };
      const readings = await getDatabase().collection("telemetry").find(query).sort({ observedAt: -1 }).limit(limit).toArray();
      const deviceTree = {};
      for (const reading of readings.reverse()) {
        const readingDate = reading.hierarchy?.date;
        const readingTime = reading.hierarchy?.time;
        if (!readingDate || !readingTime) continue;
        deviceTree[readingDate] ||= {};
        deviceTree[readingDate][readingTime] = treeValue(reading);
      }
      response.json({ CAMS: { [machineId]: deviceTree } });
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
    const send = data => response.write(`event: telemetry\ndata: ${JSON.stringify(data)}\n\n`);
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20000);
    telemetryEvents.on("telemetry", send);
    request.on("close", () => {
      clearInterval(heartbeat);
      telemetryEvents.off("telemetry", send);
    });
  });

  return router;
}
