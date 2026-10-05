import { MongoClient, ServerApiVersion } from "mongodb";

let client;
let database;

export async function connectDatabase(config) {
  if (database) return database;
  client = new MongoClient(config.mongoUri, {
    appName: "cams-api",
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    }
  });
  await client.connect();
  database = client.db(config.mongoDb);
  await database.command({ ping: 1 });
  await ensureCollections(database, config);
  await ensureIndexes(database);
  return database;
}

async function ensureCollections(db, config) {
  const telemetryExists = await db.listCollections({ name: "telemetry" }, { nameOnly: true }).hasNext();
  if (!telemetryExists) {
    await db.createCollection("telemetry", {
      timeseries: {
        timeField: "observedAt",
        metaField: "series",
        granularity: "seconds"
      },
      expireAfterSeconds: config.telemetryRetentionDays * 24 * 60 * 60
    });
  }
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ emailNormalized: 1 }, { unique: true, name: "unique_user_email" }),
    db.collection("users").createIndex({ usernameNormalized: 1 }, { unique: true, name: "unique_username" }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "unique_session_token" }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_sessions" }),
    db.collection("sessions").createIndex({ userId: 1 }, { name: "sessions_by_user" }),
    db.collection("machines").createIndex({ siteId: 1, machineId: 1 }, { unique: true, name: "unique_machine" }),
    db.collection("latestTelemetry").createIndex({ siteId: 1, machineId: 1 }, { unique: true, name: "unique_latest_machine" }),
    db.collection("telemetryReceipts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_receipts" }),
    db.collection("telemetry").createIndex({ "series.siteId": 1, "series.machineId": 1, observedAt: -1 }, { name: "telemetry_by_machine_time" })
  ]);
}

export function getDatabase() {
  if (!database) throw new Error("Database is not connected.");
  return database;
}

export async function closeDatabase() {
  if (client) await client.close();
  client = undefined;
  database = undefined;
}
