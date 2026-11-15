import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { closeDatabase, connectDatabase } from "./db.js";
import { startMqtt, stopMqtt } from "./telemetry/mqtt.js";
import { startStaleMonitor, stopStaleMonitor } from "./telemetry/status.js";
import { startTicketMonitor, stopTicketMonitor } from "./tickets/scheduler.js";
import { closeTelemetryEvents, connectTelemetryEvents } from "./telemetry/events.js";

const config = loadConfig();
await connectDatabase(config);
await connectTelemetryEvents(config.redisUrl);
const app = createApp(config);
const mqttClient = startMqtt(config);
const staleMonitor = config.backgroundJobsEnabled ? startStaleMonitor(config) : null;
const ticketMonitor = config.backgroundJobsEnabled ? startTicketMonitor() : null;
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`CAMS API listening on port ${config.port}.`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down CAMS API.`);
  server.close(async () => {
    await stopMqtt(mqttClient);
    stopStaleMonitor(staleMonitor);
    stopTicketMonitor(ticketMonitor);
    await closeTelemetryEvents();
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
