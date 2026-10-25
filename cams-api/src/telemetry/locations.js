import { randomUUID, createHash } from "node:crypto";
import { getDatabase } from "../db.js";
import { assignDeviceLocations } from "./hierarchy.js";

export const locationSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
export function locationName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 80) throw Object.assign(new Error("Enter a name between 1 and 80 characters."), { status: 400 });
  return name;
}
const key = name => name.toLowerCase();
const legacyId = (...parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

export async function ensureLegacyLocations(siteId) {
  const db = getDatabase();
  if (!await db.collection("machines").countDocuments({ siteId, clusterId: { $exists: false } })) return;
  const devices = await db.collection("machines").find({ siteId }).sort({ machineId: 1 }).toArray();
  const assigned = assignDeviceLocations(devices);
  for (const device of assigned) {
    if (device.clusterId && device.areaId) continue;
    const cluster = locationName(device.cluster || "Unassigned");
    const area = locationName(device.zone || "Unassigned");
    const now = new Date();
    const clusters = db.collection("clusters");
    const clusterRecord = await clusters.findOneAndUpdate({ siteId, nameKey: key(cluster) }, {
      $setOnInsert: { _id: legacyId(siteId, key(cluster)), name: cluster, createdAt: now }
    }, { upsert: true, returnDocument: "after" });
    const areaRecord = await db.collection("areas").findOneAndUpdate({ siteId, clusterId: clusterRecord._id, nameKey: key(area) }, {
      $setOnInsert: { _id: legacyId(siteId, clusterRecord._id, key(area)), name: area, createdAt: now }
    }, { upsert: true, returnDocument: "after" });
    await db.collection("machines").updateOne({ _id: device._id, clusterId: { $exists: false } }, {
      $set: { clusterId: clusterRecord._id, areaId: areaRecord._id, cluster: clusterRecord.name, zone: areaRecord.name }
    });
  }
}

export async function resolveLocation(siteId, body, existing = null) {
  const db = getDatabase();
  const clusterId = body.clusterId || existing?.clusterId;
  const areaId = body.areaId || existing?.areaId;
  let cluster, area;
  if (Object.hasOwn(body, "clusterId") || Object.hasOwn(body, "areaId")) {
    if (typeof body.clusterId !== "string" || !body.clusterId || typeof body.areaId !== "string" || !body.areaId) throw Object.assign(new Error("Select a valid cluster and area."), { status: 400 });
    cluster = await db.collection("clusters").findOne({ _id: clusterId, siteId });
    area = await db.collection("areas").findOne({ _id: areaId, siteId, clusterId });
    if (!cluster || !area) throw Object.assign(new Error("Select a valid cluster and an area belonging to that cluster."), { status: 400 });
  } else {
    // Support existing API clients during the transition to ID-based assignments.
    const clusterName = locationName(body.cluster || existing?.cluster || "Unassigned");
    const areaName = locationName(body.zone || existing?.zone || "Unassigned");
    cluster = await db.collection("clusters").findOneAndUpdate({ siteId, nameKey: key(clusterName) }, {
      $setOnInsert: { _id: randomUUID(), name: clusterName, createdAt: new Date() }
    }, { upsert: true, returnDocument: "after" });
    area = await db.collection("areas").findOneAndUpdate({ siteId, clusterId: cluster._id, nameKey: key(areaName) }, {
      $setOnInsert: { _id: randomUUID(), name: areaName, createdAt: new Date() }
    }, { upsert: true, returnDocument: "after" });
  }
  return { clusterId: cluster._id, areaId: area._id, cluster: cluster.name, zone: area.name };
}
