import test from "node:test";
import assert from "node:assert/strict";
import { defaultDeviceConfiguration, mergeDeviceConfiguration, validateDeviceConfiguration } from "../src/devices/configuration.js";

const machine = {
  siteId: "plant-01",
  machineId: "CAMS-17",
  name: "Compressor 17",
  cluster: "Cluster 04",
  zone: "Area 01"
};
const siteSettings = {
  thresholds: {
    flowLpm: { minimum: 22, maximum: 28 },
    pressureBar: { minimum: 6.8, maximum: 7.5 },
    suctionKpa: { minimum: 0.6, maximum: 1.8 }
  }
};

test("device configuration defaults validate and retain only supported settings", () => {
  const defaults = defaultDeviceConfiguration(machine, siteSettings);
  assert.equal(defaults.general.machineId, machine.machineId);
  assert.equal(defaults.data.mqttTopic, "cams/plant-01/CAMS-17/telemetry");
  assert.deepEqual(validateDeviceConfiguration(defaults, machine), defaults);
});

test("device configuration responses use current identity and exclude unknown stored fields", () => {
  const defaults = defaultDeviceConfiguration(machine, siteSettings);
  const merged = mergeDeviceConfiguration(defaults, {
    general: { deviceName: "Stale name", machineId: "CAMS-99", location: "Other" },
    data: { samplingInterval: 5, mqttPassword: "not-public" },
    brokerPassword: "not-public"
  });
  assert.equal(merged.general.deviceName, machine.name);
  assert.equal(merged.general.machineId, machine.machineId);
  assert.equal(merged.general.location, "Cluster 04 · Area 01");
  assert.equal(merged.data.samplingInterval, 5);
  assert.equal(merged.data.mqttPassword, undefined);
  assert.equal(merged.brokerPassword, undefined);
});

test("device configuration rejects unsafe or inconsistent field values", () => {
  const defaults = defaultDeviceConfiguration(machine, siteSettings);
  assert.throws(() => validateDeviceConfiguration({
    ...defaults,
    sensors: { ...defaults.sensors, pressure: { minimum: 8, maximum: 7 } }
  }, machine), /minimum must be lower/);
  assert.throws(() => validateDeviceConfiguration({
    ...defaults,
    general: { ...defaults.general, machineId: "CAMS-18" }
  }, machine), /Machine ID cannot be changed/);
  assert.throws(() => validateDeviceConfiguration({
    ...defaults,
    data: { ...defaults.data, mqttPassword: "not-allowed" }
  }, machine), /unsupported field/);
  assert.throws(() => validateDeviceConfiguration({
    ...defaults,
    alarms: { ...defaults.alarms, highPressure: 6 }
  }, machine), /Low pressure threshold/);
});

test("power monitor limits are optional and validate when configured", () => {
  const defaults = defaultDeviceConfiguration(machine, siteSettings);
  assert.equal(defaults.sensors.powerMonitor, undefined);
  const configuration = validateDeviceConfiguration({
    ...defaults,
    sensors: {
      ...defaults.sensors,
      powerMonitor: {
        voltageV: { minimum: 220, maximum: 240 },
        currentA: { minimum: 0, maximum: 10 },
        powerFactor: { minimum: 0.8, maximum: 1 }
      }
    }
  }, machine);
  assert.deepEqual(configuration.sensors.powerMonitor.powerFactor, { minimum: 0.8, maximum: 1 });
  assert.throws(() => validateDeviceConfiguration({
    ...defaults,
    sensors: {
      ...defaults.sensors,
      powerMonitor: {
        voltageV: { minimum: 240, maximum: 220 }
      }
    }
  }, machine), /minimum must be lower/);
});
