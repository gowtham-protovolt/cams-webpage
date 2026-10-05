import { EventEmitter } from "node:events";

export const telemetryEvents = new EventEmitter();
telemetryEvents.setMaxListeners(100);
