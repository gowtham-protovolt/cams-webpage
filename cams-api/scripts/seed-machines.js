import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const inventory = [
  ["CAMS-01", "Compressor 01", "Spinning · Line A"]
];

const config = loadConfig();
const db = await connectDatabase(config);
const now = new Date();
await db.collection("machines").bulkWrite(inventory.map(([machineId, name, zone]) => ({
  updateOne: {
    filter: { siteId: "plant-01", machineId },
    update: {
      $set: { name, zone, active: true, updatedAt: now },
      $setOnInsert: { status: "offline", createdAt: now }
    },
    upsert: true
  }
})));
console.log("Registered CAMS-01 for live ESP32 telemetry.");
await closeDatabase();
