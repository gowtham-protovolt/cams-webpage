import "dotenv/config";

function integer(name, fallback, minimum = 1) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function boolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function sameSite(value) {
  if (!["lax", "strict", "none"].includes(value)) {
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
  }
  return value;
}

export function loadConfig() {
  const production = process.env.NODE_ENV === "production";
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error("MONGODB_URI is required.");

  const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:8080")
    .split(",")
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (!allowedOrigins.length) throw new Error("At least one CORS_ORIGINS value is required.");

  const cookieSecure = boolean("COOKIE_SECURE", production);
  const cookieSameSite = sameSite(process.env.COOKIE_SAME_SITE || (production ? "none" : "lax"));
  if (cookieSameSite === "none" && !cookieSecure) {
    throw new Error("COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.");
  }

  const mqttEnabled = boolean("MQTT_ENABLED", false);
  const mqttUrl = process.env.MQTT_URL?.trim() || "mqtt://127.0.0.1:1884";
  if (mqttEnabled && production && !mqttUrl.startsWith("mqtts://") && !mqttUrl.startsWith("wss://")) {
    throw new Error("Production MQTT_URL must use mqtts:// or wss://.");
  }

  return {
    environment: process.env.NODE_ENV || "development",
    production,
    port: integer("PORT", 3000),
    mongoUri,
    mongoDb: process.env.MONGODB_DB?.trim() || "cams",
    allowedOrigins,
    cookie: {
      name: process.env.COOKIE_NAME?.trim() || "cams_session",
      secure: cookieSecure,
      sameSite: cookieSameSite
    },
    sessionHours: integer("SESSION_HOURS", 8),
    rememberedSessionDays: integer("REMEMBER_SESSION_DAYS", 7),
    telemetryRetentionDays: integer("TELEMETRY_RETENTION_DAYS", 90),
    mqtt: {
      enabled: mqttEnabled,
      url: mqttUrl,
      username: process.env.MQTT_USERNAME?.trim() || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
      topic: process.env.MQTT_TOPIC?.trim() || "cams/+/+/telemetry",
      clientId: process.env.MQTT_CLIENT_ID?.trim() || "cams-api"
    }
  };
}
