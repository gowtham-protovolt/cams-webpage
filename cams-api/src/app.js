import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { authenticate } from "./middleware/auth.js";
import { publicUser } from "./auth/session.js";
import { telemetryRouter } from "./routes/telemetry.js";
import { getMqttStatus } from "./telemetry/mqtt.js";

export function createApp(config) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.locals.publicUser = publicUser;

  app.use(helmet());
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin.replace(/\/$/, ""))) return callback(null, true);
      callback(new Error("Origin is not allowed."));
    }
  }));
  app.use(express.json({ limit: "64kb", strict: true }));
  app.use(cookieParser());
  app.use((request, response, next) => {
    const origin = request.get("origin")?.replace(/\/$/, "");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && !config.allowedOrigins.includes(origin)) {
      return response.status(403).json({ error: "Origin is not allowed." });
    }
    next();
  });
  app.use(authenticate(config));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "cams-api", mqtt: getMqttStatus(), timestamp: new Date().toISOString() });
  });
  app.use("/api/auth", authRouter(config));
  app.use("/api", telemetryRouter());

  app.use((_request, response) => response.status(404).json({ error: "Not found." }));
  app.use((error, _request, response, _next) => {
    if (error.message === "Origin is not allowed.") return response.status(403).json({ error: error.message });
    console.error(error);
    response.status(500).json({ error: "Internal server error." });
  });
  return app;
}
