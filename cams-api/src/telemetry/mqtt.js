import mqtt from "mqtt";
import { parseTelemetryMessage } from "./schema.js";
import { ingestTelemetry } from "./store.js";

const status = {
  enabled: false,
  connected: false,
  lastMessageAt: null,
  lastError: null
};

export function getMqttStatus() {
  return { ...status };
}

export function startMqtt(config) {
  status.enabled = config.mqtt.enabled;
  if (!config.mqtt.enabled) return null;

  const client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 30,
    protocolVersion: 4,
    rejectUnauthorized: true
  });

  client.on("connect", async () => {
    status.connected = true;
    status.lastError = null;
    try {
      await client.subscribeAsync(config.mqtt.topic, { qos: 1 });
      console.log(`CAMS MQTT subscribed to ${config.mqtt.topic}.`);
    } catch (error) {
      status.lastError = error.message;
      console.error("CAMS MQTT subscription failed.", error.message);
    }
  });
  client.on("reconnect", () => { status.connected = false; });
  client.on("close", () => { status.connected = false; });
  client.on("error", error => {
    status.lastError = error.message;
    console.error("CAMS MQTT connection error.", error.message);
  });
  client.on("message", async (topic, payload) => {
    try {
      const telemetry = parseTelemetryMessage(topic, payload);
      const result = await ingestTelemetry(telemetry, config.telemetryRetentionDays);
      if (!result.duplicate) status.lastMessageAt = telemetry.receivedAt.toISOString();
    } catch (error) {
      status.lastError = error.message;
      console.warn(`Rejected MQTT message on ${topic}: ${error.message}`);
    }
  });
  return client;
}

export async function stopMqtt(client) {
  if (client) await client.endAsync();
}
