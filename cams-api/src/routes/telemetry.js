import { Router } from "express";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { telemetryEvents } from "../telemetry/events.js";

const MACHINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

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
