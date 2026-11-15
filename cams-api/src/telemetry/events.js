import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";

const CHANNEL = "cams:live-events";

class TelemetryEventBus extends EventEmitter {
  constructor() {
    super();
    this.instanceId = randomUUID();
    this.publisher = null;
    this.subscriber = null;
    // Every SSE browser connection registers several listeners. Four API
    // replicas comfortably support 1,000 concurrent dashboards at this limit.
    this.setMaxListeners(10000);
  }

  async connect(redisUrl) {
    if (!redisUrl || this.publisher) return;
    this.publisher = createClient({ url: redisUrl });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on("error", error => console.error("CAMS Redis publisher error.", error.message));
    this.subscriber.on("error", error => console.error("CAMS Redis subscriber error.", error.message));
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(CHANNEL, message => {
      try {
        const envelope = JSON.parse(message);
        if (envelope.source === this.instanceId || typeof envelope.event !== "string") return;
        super.emit(envelope.event, envelope.data);
      } catch (error) {
        console.warn("Rejected CAMS Redis event.", error.message);
      }
    });
    console.log("CAMS live event bus connected to Redis.");
  }

  emit(event, ...args) {
    const delivered = super.emit(event, ...args);
    if (this.publisher?.isReady && event !== "error") {
      const message = JSON.stringify({ source: this.instanceId, event, data: args[0] });
      this.publisher.publish(CHANNEL, message).catch(error => console.error("CAMS Redis publish failed.", error.message));
    }
    return delivered;
  }

  async close() {
    const clients = [this.subscriber, this.publisher].filter(client => client?.isOpen);
    await Promise.all(clients.map(client => client.quit().catch(() => client.disconnect())));
    this.subscriber = null;
    this.publisher = null;
  }
}

export const telemetryEvents = new TelemetryEventBus();

export function connectTelemetryEvents(redisUrl) {
  return telemetryEvents.connect(redisUrl);
}

export function closeTelemetryEvents() {
  return telemetryEvents.close();
}
