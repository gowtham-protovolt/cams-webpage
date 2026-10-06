const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const STATUSES = new Set(["running", "stopped", "alarm", "offline"]);
const QUALITY_VALUES = new Set(["good", "uncertain", "bad"]);

function boundedNumber(value, name, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a finite number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function optionalObject(value, name) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function qualityValue(value, name) {
  const normalized = String(value || "").toLowerCase();
  if (!QUALITY_VALUES.has(normalized)) throw new Error(`${name} must be good, uncertain, or bad.`);
  return normalized;
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
  const legacySuctionBar = metrics.suctionBar === undefined
    ? undefined
    : boundedNumber(metrics.suctionBar, "suctionBar", -1.5, 1);
  const suctionKpa = metrics.suctionKpa === undefined
    ? legacySuctionBar === undefined ? undefined : legacySuctionBar * 100
    : boundedNumber(metrics.suctionKpa, "suctionKpa", -150, 150);
  if (suctionKpa === undefined) throw new Error("suctionKpa is required.");

  const raw = optionalObject(body.raw, "raw");
  const errors = optionalObject(body.errors, "errors");
  const quality = optionalObject(body.quality, "quality");
  const calibrationVersion = body.calibrationVersion === undefined ? undefined : String(body.calibrationVersion).trim();
  if (calibrationVersion !== undefined && (!calibrationVersion || calibrationVersion.length > 80)) {
    throw new Error("calibrationVersion must contain 1–80 characters.");
  }
  const source = String(body.source || "").trim();
  if (source !== "esp32-s3-rs485") throw new Error("source must be esp32-s3-rs485.");

  return {
    series: { siteId, machineId },
    observedAt,
    receivedAt,
    sequence: body.sequence,
    status,
    metrics: {
      pressureBar: boundedNumber(metrics.pressureBar, "pressureBar", -1.5, 20),
      flowLpm: boundedNumber(metrics.flowLpm, "flowLpm", -500, 500),
      suctionKpa,
      ...(metrics.temperatureC === undefined ? {} : { temperatureC: boundedNumber(metrics.temperatureC, "temperatureC", -40, 150) })
    },
    ...(raw ? { raw: {
      pv1: boundedInteger(raw.pv1, "raw.pv1", -2147483648, 2147483647),
      pv2: boundedInteger(raw.pv2, "raw.pv2", -2147483648, 2147483647),
      pv3: boundedInteger(raw.pv3, "raw.pv3", -2147483648, 2147483647)
    } } : {}),
    ...(errors ? { errors: {
      flow: boundedInteger(errors.flow, "errors.flow", 0, 65535),
      suction: boundedInteger(errors.suction, "errors.suction", 0, 65535),
      pressure: boundedInteger(errors.pressure, "errors.pressure", 0, 65535)
    } } : {}),
    ...(quality ? { quality: {
      flow: qualityValue(quality.flow, "quality.flow"),
      suction: qualityValue(quality.suction, "quality.suction"),
      pressure: qualityValue(quality.pressure, "quality.pressure"),
      modbus: qualityValue(quality.modbus, "quality.modbus")
    } } : {}),
    ...(calibrationVersion ? { calibrationVersion } : {}),
    source,
    transport: "mqtt"
  };
}
