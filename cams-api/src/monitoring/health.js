export const DEFAULT_MONITORING = Object.freeze({
  staleAfterSeconds: 10,
  thresholds: Object.freeze({
    pressureBar: Object.freeze({ minimum: 6.8, maximum: 7.5 }),
    flowLpm: Object.freeze({ minimum: 22, maximum: 28 }),
    suctionKpa: Object.freeze({ minimum: 0.6, maximum: 1.8 })
  })
});

const SENSOR_FIELDS = [
  ["pressure", "pressureBar"],
  ["flow", "flowLpm"],
  ["suction", "suctionKpa"]
];

export function evaluateMachine(telemetry, deviceStatus, monitoring = DEFAULT_MONITORING, now = new Date()) {
  const receivedAt = telemetry?.receivedAt ? new Date(telemetry.receivedAt) : null;
  const ageMs = receivedAt && !Number.isNaN(receivedAt.getTime()) ? Math.max(0, now.getTime() - receivedAt.getTime()) : null;
  const staleAfterMs = monitoring.staleAfterSeconds * 1000;
  const retainedOffline = deviceStatus?.status === "offline";
  const stale = ageMs === null || ageMs > staleAfterMs;
  const gatewayOnline = !retainedOffline && (deviceStatus?.status === "online" || !stale);
  const reasons = [];

  if (!gatewayOnline || stale) {
    reasons.push(retainedOffline ? "ESP32 gateway reported offline" : "Telemetry is stale or unavailable");
    return {
      status: "offline",
      health: 0,
      gatewayStatus: gatewayOnline ? "online" : "offline",
      plcStatus: "offline",
      communicationPercent: 0,
      telemetryAgeMs: ageMs,
      stale,
      reasons,
      thresholds: monitoring.thresholds
    };
  }

  let score = 100;
  const errors = telemetry?.errors || {};
  const quality = telemetry?.quality || {};
  const hasPlcError = SENSOR_FIELDS.some(([name]) => Number(errors[name] || 0) !== 0) || quality.modbus === "bad";
  const hasBadQuality = SENSOR_FIELDS.some(([name]) => quality[name] === "bad");
  const hasUncertainQuality = SENSOR_FIELDS.some(([name]) => quality[name] === "uncertain");

  if (hasPlcError) {
    score -= 35;
    reasons.push("PLC or Modbus error detected");
  }
  if (hasBadQuality) {
    score -= 20;
    reasons.push("One or more sensor readings have bad quality");
  } else if (hasUncertainQuality) {
    score -= 8;
    reasons.push("One or more sensor readings are uncertain");
  }

  for (const [label, field] of SENSOR_FIELDS) {
    const value = telemetry?.metrics?.[field];
    const range = monitoring.thresholds[field];
    if (Number.isFinite(value) && (value < range.minimum || value > range.maximum)) {
      score -= 10;
      reasons.push(`${label} is outside its configured range`);
    }
  }

  const reportedStatus = String(telemetry?.status || "running").toLowerCase();
  let status = reportedStatus === "stopped" ? "stopped" : "running";
  if (reportedStatus === "alarm" || hasPlcError || hasBadQuality) status = "alarm";
  if (status === "stopped") score = Math.min(score, 85);
  if (status === "alarm") score = Math.min(score, 55);
  const communicationPercent = Math.max(1, Math.min(100, Math.round(100 - ((ageMs || 0) / staleAfterMs) * 100)));

  return {
    status,
    health: Math.max(0, score),
    gatewayStatus: "online",
    plcStatus: hasPlcError ? "alarm" : "online",
    communicationPercent,
    telemetryAgeMs: ageMs,
    stale: false,
    reasons,
    thresholds: monitoring.thresholds
  };
}

export function alarmConditions(telemetry, monitoring = DEFAULT_MONITORING) {
  const conditions = [];
  for (const [label, field] of SENSOR_FIELDS) {
    const value = telemetry?.metrics?.[field];
    const range = monitoring.thresholds[field];
    if (!Number.isFinite(value)) continue;
    if (value < range.minimum) conditions.push({ code: `${field}-low`, parameter: label, severity: "Warning", value, message: `${label} is below ${range.minimum}.` });
    if (value > range.maximum) conditions.push({ code: `${field}-high`, parameter: label, severity: "Warning", value, message: `${label} is above ${range.maximum}.` });
  }
  for (const [label] of SENSOR_FIELDS) {
    const errorCode = Number(telemetry?.errors?.[label] || 0);
    if (errorCode !== 0) conditions.push({ code: `${label}-plc-error`, parameter: label, severity: "Critical", value: errorCode, message: `PLC ${label} error code ${errorCode}.` });
    if (telemetry?.quality?.[label] === "bad") conditions.push({ code: `${label}-bad-quality`, parameter: label, severity: "Critical", value: "bad", message: `${label} sensor quality is bad.` });
  }
  if (telemetry?.quality?.modbus === "bad") conditions.push({ code: "modbus-bad", parameter: "PLC link", severity: "Critical", value: "bad", message: "Modbus communication quality is bad." });
  return conditions;
}
