const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const STATUSES = new Set(["running", "stopped", "alarm", "offline"]);

function boundedNumber(value, name, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite number from ${minimum} to ${maximum}.`);
  }
  return value;
}

export function parseTelemetryMessage(topic, payload, receivedAt = new Date()) {
  if (!Buffer.isBuffer(payload)) throw new Error("Telemetry payload must be a buffer.");
  if (payload.length > 16 * 1024) throw new Error("Telemetry payload exceeds 16 KB.");
  const parts = String(topic).split("/");
  if (parts.length !== 4 || parts[0] !== "cams" || parts[3] !== "telemetry") {
    throw new Error("Telemetry topic must use cams/{siteId}/{machineId}/telemetry.");
  }
  const [, siteId, machineId] = parts;
  if (!ID_PATTERN.test(siteId) || !ID_PATTERN.test(machineId)) throw new Error("Telemetry topic contains an invalid identifier.");

  let body;
  try {
    body = JSON.parse(payload.toString("utf8"));
  } catch {
    throw new Error("Telemetry payload must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Telemetry payload must be a JSON object.");
  if (!Number.isSafeInteger(body.sequence) || body.sequence < 0) throw new Error("Telemetry sequence must be a non-negative safe integer.");
  const observedAt = new Date(body.timestamp);
  if (Number.isNaN(observedAt.getTime())) throw new Error("Telemetry timestamp must be a valid ISO date.");
  if (Math.abs(observedAt.getTime() - receivedAt.getTime()) > 24 * 60 * 60 * 1000) {
    throw new Error("Telemetry timestamp differs from server time by more than 24 hours.");
  }
  const status = String(body.status || "").toLowerCase();
  if (!STATUSES.has(status)) throw new Error("Telemetry status is invalid.");
  const metrics = body.metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) throw new Error("Telemetry metrics are required.");

  return {
    series: { siteId, machineId },
    observedAt,
    receivedAt,
    sequence: body.sequence,
    status,
    metrics: {
      pressureBar: boundedNumber(metrics.pressureBar, "pressureBar", -1.5, 20),
      flowLpm: boundedNumber(metrics.flowLpm, "flowLpm", 0, 500),
      suctionBar: boundedNumber(metrics.suctionBar, "suctionBar", -1.5, 1),
      temperatureC: boundedNumber(metrics.temperatureC, "temperatureC", -40, 150)
    },
    source: "mqtt"
  };
}
