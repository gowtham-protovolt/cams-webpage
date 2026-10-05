import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { closeDatabase, connectDatabase } from "./db.js";

const config = loadConfig();
await connectDatabase(config);
const app = createApp(config);
const server = app.listen(config.port, () => {
  console.log(`CAMS API listening on port ${config.port}.`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down CAMS API.`);
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
