import { Router } from "express";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { defaultDeviceConfiguration, mergeDeviceConfiguration, validateDeviceConfiguration } from "../devices/configuration.js";
import { getSiteSettings } from "../settings/service.js";
import { telemetryEvents } from "../telemetry/events.js";

const MACHINE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function requireOwner(request, response, next) {
  if (request.auth?.user.role !== "owner") return response.status(403).json({ error: "Owner access required." });
  next();
}

async function findMachine(siteId, machineId) {
  return getDatabase().collection("machines").findOne({ siteId, machineId, active: true });
}

export function deviceConfigurationRouter(config) {
  const router = Router();
  router.use(requireAuth);

  router.get("/machines/:machineId/configuration", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01").trim();
      const machineId = String(request.params.machineId || "").trim();
      if (!MACHINE_ID.test(siteId) || !MACHINE_ID.test(machineId)) return response.status(400).json({ error: "Invalid device identifier." });
      const machine = await findMachine(siteId, machineId);
      if (!machine) return response.status(404).json({ error: "Active device not found." });
      const base = defaultDeviceConfiguration(machine, await getSiteSettings(config, siteId));
      response.json({
        configuration: mergeDeviceConfiguration(base, machine.configuration),
        saved: Boolean(machine.configuration)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/machines/:machineId/configuration", requireOwner, async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01").trim();
      const machineId = String(request.params.machineId || "").trim();
      if (!MACHINE_ID.test(siteId) || !MACHINE_ID.test(machineId)) return response.status(400).json({ error: "Invalid device identifier." });
      const machine = await findMachine(siteId, machineId);
      if (!machine) return response.status(404).json({ error: "Active device not found." });
      let configuration;
      try {
        configuration = validateDeviceConfiguration(request.body, machine);
      } catch (error) {
        return response.status(400).json({ error: error.message });
      }
      const updatedAt = new Date();
      const machines = getDatabase().collection("machines");
      const result = await machines.updateOne(
        { siteId, machineId, active: true },
        { $set: { name: configuration.general.deviceName, configuration, updatedAt, updatedBy: request.auth.user.id } }
      );
      if (!result.matchedCount) return response.status(404).json({ error: "Active device not found." });
      const updated = await machines.findOne({ siteId, machineId, active: true });
      telemetryEvents.emit("machine-updated", {
        id: machineId,
        siteId,
        name: updated.name,
        zone: updated.zone,
        cluster: updated.cluster || "",
        clusterId: updated.clusterId || null,
        areaId: updated.areaId || null,
        active: updated.active,
        status: updated.status || "offline",
        createdAt: updated.createdAt || null,
        updatedAt: updated.updatedAt || null,
        removedAt: updated.removedAt || null
      });
      response.json({ configuration, saved: true, updatedAt });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
