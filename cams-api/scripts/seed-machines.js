import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const inventory = [
  ["CAMS-01", "Compressor 01", "Spinning · Line A"],
  ["CAMS-02", "Compressor 02", "Spinning · Line A"],
  ["CAMS-03", "Compressor 03", "Carding · Line B"],
  ["CAMS-04", "Compressor 04", "Carding · Line B"],
  ["CAMS-05", "Compressor 05", "Winding · Line C"],
  ["CAMS-06", "Compressor 06", "Winding · Line C"],
  ["CAMS-07", "Compressor 07", "Utility · North"],
  ["CAMS-08", "Compressor 08", "Utility · North"],
  ["CAMS-09", "Compressor 09", "Packing · South"],
  ["CAMS-10", "Compressor 10", "Packing · South"],
  ["CAMS-11", "Compressor 11", "Blow Room"],
  ["CAMS-12", "Compressor 12", "Blow Room"],
  ["CAMS-13", "Compressor 13", "Standby Bay"]
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
console.log(`Seeded ${inventory.length} CAMS machine records.`);
await closeDatabase();
