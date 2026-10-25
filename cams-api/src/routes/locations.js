import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureLegacyLocations, locationName, locationSort, resolveLocation } from "../telemetry/locations.js";
import { telemetryEvents } from "../telemetry/events.js";

export function locationsRouter() {
  const router = Router();
  router.use(requireAuth);
  const owner = (req, res, next) => req.auth.user.role === "owner" ? next() : res.status(403).json({ error: "Owner access required." });
  const wrap = fn => async (req, res, next) => {
    try {
      const siteId = String(req.query.siteId || req.body?.siteId || "plant-01");
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(siteId)) return res.status(400).json({ error: "Invalid site identifier." });
      await ensureLegacyLocations(siteId);
      await fn(req, res, getDatabase(), siteId);
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: "That name already exists in this location." });
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
  router.get("/locations", wrap(async (_req, res, db, siteId) => {
    const [clusters, areas] = await Promise.all([db.collection("clusters").find({ siteId }).toArray(), db.collection("areas").find({ siteId }).toArray()]);
    res.json({ siteId, clusters: clusters.sort(locationSort).map(c => ({ id: c._id, name: c.name, areas: areas.filter(a => a.clusterId === c._id).sort(locationSort).map(a => ({ id: a._id, name: a.name })) })) });
  }));
  for (const kind of ["clusters", "areas"]) {
    router.post(`/locations/${kind}`, owner, wrap(async (req, res, db, siteId) => {
      const name = locationName(req.body?.name);
      const clusterId = req.body?.clusterId;
      if (kind === "areas" && (typeof clusterId !== "string" || !await db.collection("clusters").findOne({ _id: clusterId, siteId }))) return res.status(400).json({ error: "Select a valid cluster." });
      const record = { _id: randomUUID(), siteId, name, nameKey: name.toLowerCase(), createdAt: new Date(), ...(kind === "areas" ? { clusterId } : {}) };
      await db.collection(kind).insertOne(record);
      res.status(201).json({ id: record._id, name });
    }));
    router.patch(`/locations/${kind}/:id`, owner, wrap(async (req, res, db, siteId) => {
      const name = locationName(req.body?.name);
      const record = await db.collection(kind).findOneAndUpdate({ _id: req.params.id, siteId }, { $set: { name, nameKey: name.toLowerCase(), updatedAt: new Date() } }, { returnDocument: "after" });
      if (!record) return res.status(404).json({ error: "Location not found." });
      await db.collection("machines").updateMany({ siteId, [kind === "clusters" ? "clusterId" : "areaId"]: record._id }, { $set: { [kind === "clusters" ? "cluster" : "zone"]: name } });
      telemetryEvents.emit("machine-updated", { siteId });
      res.json({ id: record._id, name });
    }));
    router.delete(`/locations/${kind}/:id`, owner, wrap(async (req, res, db, siteId) => {
      const id = req.params.id;
      if (await db.collection("machines").countDocuments({ siteId, [kind === "clusters" ? "clusterId" : "areaId"]: id })) return res.status(409).json({ error: "Move all devices (including removed devices) before deleting this location." });
      if (kind === "clusters" && await db.collection("areas").countDocuments({ siteId, clusterId: id })) return res.status(409).json({ error: "Delete or empty the areas before deleting this cluster." });
      const result = await db.collection(kind).deleteOne({ _id: id, siteId });
      if (!result.deletedCount) return res.status(404).json({ error: "Location not found." });
      res.json({ deleted: true });
    }));
  }
  router.post("/locations/assign", owner, wrap(async (req, res, db, siteId) => {
    const ids = req.body?.deviceIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 99 || ids.some(id => typeof id !== "string" || !/^CAMS-\d{2}$/.test(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ error: "Select 1–99 unique devices." });
    if (typeof req.body.clusterId !== "string" || typeof req.body.areaId !== "string") return res.status(400).json({ error: "Select a cluster and area." });
    const location = await resolveLocation(siteId, req.body);
    if (await db.collection("machines").countDocuments({ siteId, active: true, machineId: { $in: ids } }) !== ids.length) return res.status(400).json({ error: "Some selected devices are unavailable. Refresh and select again." });
    await db.collection("machines").updateMany({ siteId, active: true, machineId: { $in: ids } }, { $set: { ...location, updatedAt: new Date(), updatedBy: req.auth.user.id } });
    telemetryEvents.emit("machine-updated", { siteId });
    res.json({ assigned: ids.length });
  }));
  return router;
}
