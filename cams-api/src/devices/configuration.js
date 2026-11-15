const PROTOCOLS = new Set(["Modbus RTU", "Modbus TCP"]);
const BAUD_RATES = new Set([9600, 19200, 38400, 57600, 115200]);
const SERIAL_FORMATS = new Set(["8N1", "8E1", "8O1"]);
const SAMPLE_INTERVALS = new Set([1, 5, 10]);
const OFFLINE_DELAYS = new Set([10, 30, 60, 120]);

function number(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function text(value, label, maximum, required = false) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const parsed = String(value ?? "").trim();
  if ((required && !parsed) || parsed.length > maximum) {
    throw new Error(`${label} is required and must not exceed ${maximum} characters.`);
  }
  return parsed;
}

function sensorRange(value, label, minimum, maximum) {
  rejectExtraFields(value, ["minimum", "maximum"], `${label} range`);
  const low = number(value?.minimum, `${label} minimum`, minimum, maximum);
  const high = number(value?.maximum, `${label} maximum`, minimum, maximum);
  if (low >= high) throw new Error(`${label} minimum must be lower than its maximum.`);
  return { minimum: low, maximum: high };
}

const POWER_RANGES = {
  voltageV: ["Voltage", 0, 1000],
  currentA: ["Current", 0, 10000],
  activePowerW: ["Active power", -1e9, 1e9],
  powerFactor: ["Power factor", -1, 1],
  frequencyHz: ["Frequency", 0, 1000],
  apparentPowerVa: ["Apparent power", 0, 1e9],
  reactivePowerVar: ["Reactive power", -1e9, 1e9],
  powerTotalKwh: ["Power total", 0, 1e12]
};

function optionalSensorRanges(value, label) {
  if (value === undefined) return undefined;
  rejectExtraFields(value, Object.keys(POWER_RANGES), `${label} settings`);
  const configured = {};
  for (const [key, [metricLabel, minimum, maximum]] of Object.entries(POWER_RANGES)) {
    if (value[key] !== undefined) configured[key] = sensorRange(value[key], `${metricLabel} ${label.toLowerCase()}`, minimum, maximum);
  }
  return Object.keys(configured).length ? configured : undefined;
}

function rejectExtraFields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is required.`);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} contains an unsupported field.`);
}

export function defaultDeviceConfiguration(machine, siteSettings) {
  const thresholds = siteSettings.thresholds;
  return {
    general: {
      deviceName: machine.name,
      machineId: machine.machineId,
      location: [machine.cluster, machine.zone].filter(Boolean).join(" · ") || "Unassigned"
    },
    sensors: {
      flow: thresholds.flowLpm,
      pressure: thresholds.pressureBar,
      suction: thresholds.suctionKpa,
      temperature: { minimum: 0, maximum: 80 }
    },
    plc: { protocol: "Modbus RTU", baudRate: 115200, serialFormat: "8E1", slaveId: 2 },
    data: { samplingInterval: 1, mqttTopic: `cams/${machine.siteId}/${machine.machineId}/telemetry` },
    alarms: {
      thresholdAlerts: true,
      highPressure: thresholds.pressureBar.maximum,
      lowPressure: thresholds.pressureBar.minimum,
      offlineDelaySeconds: 30
    }
  };
}

export function mergeDeviceConfiguration(base, stored = {}) {
  return {
    general: {
      ...base.general,
      deviceName: base.general.deviceName,
      machineId: base.general.machineId,
      location: base.general.location
    },
    sensors: {
      flow: stored.sensors?.flow || base.sensors.flow,
      pressure: stored.sensors?.pressure || base.sensors.pressure,
      suction: stored.sensors?.suction || base.sensors.suction,
      temperature: stored.sensors?.temperature || base.sensors.temperature,
      ...(stored.sensors?.powerMonitor ? { powerMonitor: stored.sensors.powerMonitor } : {})
    },
    plc: {
      protocol: stored.plc?.protocol || base.plc.protocol,
      baudRate: stored.plc?.baudRate || base.plc.baudRate,
      serialFormat: stored.plc?.serialFormat || base.plc.serialFormat,
      slaveId: stored.plc?.slaveId || base.plc.slaveId
    },
    data: {
      samplingInterval: stored.data?.samplingInterval || base.data.samplingInterval,
      mqttTopic: base.data.mqttTopic
    },
    alarms: {
      thresholdAlerts: stored.alarms?.thresholdAlerts ?? base.alarms.thresholdAlerts,
      highPressure: stored.alarms?.highPressure ?? base.alarms.highPressure,
      lowPressure: stored.alarms?.lowPressure ?? base.alarms.lowPressure,
      offlineDelaySeconds: stored.alarms?.offlineDelaySeconds || base.alarms.offlineDelaySeconds
    }
  };
}

export function validateDeviceConfiguration(input, machine) {
  rejectExtraFields(input, ["general", "sensors", "plc", "data", "alarms"], "Device configuration");
  rejectExtraFields(input.general, ["deviceName", "machineId", "location"], "General settings");
  rejectExtraFields(input.sensors, ["flow", "pressure", "suction", "temperature", "powerMonitor"], "Sensor settings");
  rejectExtraFields(input.plc, ["protocol", "baudRate", "serialFormat", "slaveId"], "PLC settings");
  rejectExtraFields(input.data, ["samplingInterval", "mqttTopic"], "Data settings");
  rejectExtraFields(input.alarms, ["thresholdAlerts", "highPressure", "lowPressure", "offlineDelaySeconds"], "Alarm settings");
  const general = input?.general || {};
  const machineId = String(machine.machineId);
  if (String(general.machineId || "") !== machineId) throw new Error("Machine ID cannot be changed.");
  if (String(general.location || "") !== ([machine.cluster, machine.zone].filter(Boolean).join(" · ") || "Unassigned")) {
    throw new Error("Device location must be changed from device management.");
  }

  const powerMonitor = optionalSensorRanges(input.sensors?.powerMonitor, "Power monitor");
  const sensors = {
    flow: sensorRange(input.sensors?.flow, "Flow", -10000, 10000),
    pressure: sensorRange(input.sensors?.pressure, "Pressure", -5, 100),
    suction: sensorRange(input.sensors?.suction, "Suction", -1000, 1000),
    temperature: sensorRange(input.sensors?.temperature, "Temperature", -50, 250),
    ...(powerMonitor ? { powerMonitor } : {})
  };
  const protocol = String(input.plc?.protocol || "");
  const baudRate = Number(input.plc?.baudRate);
  const serialFormat = String(input.plc?.serialFormat || "");
  const slaveId = Number(input.plc?.slaveId);
  if (!PROTOCOLS.has(protocol)) throw new Error("PLC protocol is not supported.");
  if (!BAUD_RATES.has(baudRate)) throw new Error("PLC baud rate is not supported.");
  if (!SERIAL_FORMATS.has(serialFormat)) throw new Error("PLC serial format is not supported.");
  if (!Number.isInteger(slaveId) || slaveId < 1 || slaveId > 247) throw new Error("PLC slave ID must be between 1 and 247.");

  const samplingInterval = Number(input.data?.samplingInterval);
  if (!SAMPLE_INTERVALS.has(samplingInterval)) throw new Error("Sampling interval must be 1, 5, or 10 seconds.");
  const expectedTopic = `cams/${machine.siteId}/${machineId}/telemetry`;
  if (typeof input.data?.mqttTopic !== "string") throw new Error("MQTT topic must be text.");
  if (String(input.data?.mqttTopic || "") !== expectedTopic) throw new Error("MQTT topic is managed by CAMS and cannot be changed.");

  const highPressure = number(input.alarms?.highPressure, "High pressure threshold", -5, 100);
  const lowPressure = number(input.alarms?.lowPressure, "Low pressure threshold", -5, 100);
  if (lowPressure >= highPressure) throw new Error("Low pressure threshold must be lower than the high threshold.");
  const offlineDelaySeconds = Number(input.alarms?.offlineDelaySeconds);
  if (!OFFLINE_DELAYS.has(offlineDelaySeconds)) throw new Error("Device offline delay is not supported.");
  if (typeof input.alarms?.thresholdAlerts !== "boolean") throw new Error("Threshold alerts must be enabled or disabled.");

  return {
    general: {
      deviceName: text(general.deviceName, "Device name", 80, true),
      machineId,
      location: [machine.cluster, machine.zone].filter(Boolean).join(" · ") || "Unassigned"
    },
    sensors,
    plc: { protocol, baudRate, serialFormat, slaveId },
    data: { samplingInterval, mqttTopic: expectedTopic },
    alarms: {
      thresholdAlerts: input.alarms?.thresholdAlerts === true,
      highPressure,
      lowPressure,
      offlineDelaySeconds
    }
  };
}
