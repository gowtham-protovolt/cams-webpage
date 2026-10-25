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
    db.collection("clusters").createIndex({ siteId: 1, nameKey: 1 }, { unique: true }),
    db.collection("areas").createIndex({ siteId: 1, clusterId: 1, nameKey: 1 }, { unique: true }),
    db.collection("users").createIndex({ emailNormalized: 1 }, { unique: true, name: "unique_user_email" }),
    db.collection("users").createIndex({ usernameNormalized: 1 }, { unique: true, name: "unique_username" }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "unique_session_token" }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_sessions" }),
    db.collection("sessions").createIndex({ userId: 1 }, { name: "sessions_by_user" }),
    db.collection("passwordResetTokens").createIndex({ tokenHash: 1 }, { unique: true, name: "unique_password_reset_token" }),
    db.collection("passwordResetTokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_password_reset_tokens" }),
    db.collection("passwordResetTokens").createIndex({ userId: 1 }, { name: "password_reset_by_user" }),
    db.collection("machines").createIndex({ siteId: 1, machineId: 1 }, { unique: true, name: "unique_machine" }),
    db.collection("machines").createIndex({ siteId: 1, active: 1, cluster: 1, zone: 1, machineId: 1 }, { name: "machines_by_cluster_area" }),
    db.collection("serviceTickets").createIndex({ number: 1 }, { unique: true, name: "unique_service_ticket_number" }),
    db.collection("serviceTickets").createIndex({ status: 1, serviceDate: 1 }, { name: "service_tickets_by_status_date" }),
    db.collection("serviceTickets").createIndex({ status: 1, endDate: 1 }, { name: "service_tickets_by_status_end_date" }),
    db.collection("deviceStatus").createIndex({ siteId: 1, machineId: 1 }, { unique: true, name: "unique_device_status" }),
    db.collection("alarms").createIndex({ siteId: 1, machineId: 1, status: 1, lastSeenAt: -1 }, { name: "alarms_by_machine_status" }),
    db.collection("alarms").createIndex({ status: 1, siteId: 1, machineId: 1 }, { name: "alarms_by_status_machine" }),
    db.collection("tickets").createIndex({ siteId: 1, id: 1 }, { unique: true, name: "unique_ticket_id_per_site" }),
    db.collection("tickets").createIndex({ generationKey: 1 }, { unique: true, name: "unique_ticket_generation" }),
    db.collection("tickets").createIndex({ siteId: 1, raisedAt: -1 }, { name: "tickets_by_site_time" }),
    db.collection("tickets").createIndex({ siteId: 1, machineId: 1, ticketStatus: 1 }, { name: "tickets_by_machine_status" }),
    db.collection("ticketActivity").createIndex({ siteId: 1, ticketId: 1, at: -1 }, { name: "ticket_activity_by_ticket_time" }),
    db.collection("ticketMachineState").createIndex({ active: 1, siteId: 1, machineId: 1 }, { name: "ticket_state_by_machine" }),
    db.collection("alarms").createIndex({ siteId: 1, severity: 1, status: 1, parameter: 1, lastSeenAt: -1 }, { name: "alarms_by_filters" }),
    db.collection("alarmAudit").createIndex({ alarmId: 1, createdAt: -1 }, { name: "alarm_audit_by_alarm_time" }),
    db.collection("alarmAudit").createIndex({ siteId: 1, createdAt: -1 }, { name: "alarm_audit_by_site_time" }),
    db.collection("latestTelemetry").createIndex({ siteId: 1, machineId: 1 }, { unique: true, name: "unique_latest_machine" }),
    db.collection("telemetryReceipts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_receipts" }),
    db.collection("telemetry").createIndex({ "series.siteId": 1, "series.machineId": 1, observedAt: -1 }, { name: "telemetry_by_machine_time" }),
    db.collection("telemetry").createIndex({ "series.siteId": 1, "series.machineId": 1, "hierarchy.date": -1, observedAt: -1 }, { name: "telemetry_by_tree_date" })
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
