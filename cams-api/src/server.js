import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { closeDatabase, connectDatabase } from "./db.js";
import { startMqtt, stopMqtt } from "./telemetry/mqtt.js";

const config = loadConfig();
await connectDatabase(config);
const app = createApp(config);
const mqttClient = startMqtt(config);
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`CAMS API listening on port ${config.port}.`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down CAMS API.`);
  server.close(async () => {
    await stopMqtt(mqttClient);
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
