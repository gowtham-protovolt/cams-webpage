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
  await ensureIndexes(database);
  return database;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ emailNormalized: 1 }, { unique: true, name: "unique_user_email" }),
    db.collection("users").createIndex({ usernameNormalized: 1 }, { unique: true, name: "unique_username" }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true, name: "unique_session_token" }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expire_sessions" }),
    db.collection("sessions").createIndex({ userId: 1 }, { name: "sessions_by_user" })
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
