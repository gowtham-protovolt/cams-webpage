import { customSelect, escapeHtml, icon } from "./shared.js";

function field(name, label, value, { type = "text", unit = "", readOnly = false, minimum, maximum, step = "any", maxLength } = {}) {
  const bounds = `${minimum === undefined ? "" : ` min="${minimum}"`}${maximum === undefined ? "" : ` max="${maximum}"`}`;
  const length = maxLength === undefined ? "" : ` maxlength="${maxLength}"`;
  return `<label class="device-config-field"><span>${label}</span><div class="device-config-input-wrap"><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${readOnly ? "readonly" : "required"}${type === "number" ? ` step="${step}"${bounds}` : ""}${length}><small>${unit}</small></div></label>`;
}

function selectField(name, label, value, options) {
  const selectOptions = options.map(([option, text]) => [String(option), text]);
  const selectId = `device-config-${name.replaceAll(".", "-")}`;
  const select = customSelect(selectId, selectOptions, String(value), {
    className: "device-config-select",
    label,
    ariaLabel: label,
    nativeData: `name="${escapeHtml(name)}" required`
  });
  return `<label class="device-config-field"><span>${label}</span>${select}</label>`;
}

function rangeFields(key, label, range, unit, minimum, maximum, step = "any") {
  return `<div class="device-config-range"><strong>${label}</strong><div class="device-config-range-fields">${field(`sensors.${key}.minimum`, "Minimum", range.minimum, { type: "number", unit, minimum, maximum, step })}${field(`sensors.${key}.maximum`, "Maximum", range.maximum, { type: "number", unit, minimum, maximum, step })}</div></div>`;
}

function optionalRangeFields(key, label, range = {}, unit, minimum, maximum, step = "any") {
  return `<div class="device-config-range"><strong>${label}</strong><div class="device-config-range-fields">${field(`sensors.powerMonitor.${key}.minimum`, "Minimum", range.minimum ?? "", { type: "number", unit, minimum, maximum, step, required: false })}${field(`sensors.powerMonitor.${key}.maximum`, "Maximum", range.maximum ?? "", { type: "number", unit, minimum, maximum, step, required: false })}</div></div>`;
}

function tabPanel(name, title, content, active) {
  return `<section class="device-config-panel" id="device-config-panel-${name}" role="tabpanel" data-device-config-panel="${name}" ${active ? "" : "hidden"}><h3>${title}</h3>${content}</section>`;
}

export function renderDeviceConfiguration(state, machine) {
  if (!state.machineConfigurationOpen) return "";
  const configuration = state.machineConfiguration;
  const canEdit = Boolean(state.currentUser?.isOwner);
  const disabled = !canEdit || state.machineConfigurationLoading || state.machineConfigurationSaving;
  const activeTab = state.machineConfigurationTab || "general";
  const tabs = [["general", "General"], ["sensors", "Sensors"], ["plc", "PLC / Modbus"], ["data", "Data & MQTT"], ["alarms", "Alarms"]];
  const tabButtons = tabs.map(([id, label]) => `<button class="device-config-tab ${activeTab === id ? "active" : ""}" type="button" role="tab" aria-selected="${activeTab === id}" aria-controls="device-config-panel-${id}" data-device-config-tab="${id}">${label}</button>`).join("");
  if (state.machineConfigurationLoading) {
    return `<div class="device-config-backdrop" id="device-configuration-backdrop"><section class="device-config-dialog" role="dialog" aria-modal="true" aria-labelledby="device-config-title"><header class="device-config-header"><div><span class="device-config-kicker">DEVICE SETTINGS</span><h2 id="device-config-title">Device configuration</h2><p>Loading saved configuration…</p></div><button class="icon-btn" type="button" data-device-config-close aria-label="Close">${icon("close")}</button></header><div class="device-config-loading">${icon("machine")}Loading configuration…</div></section></div>`;
  }
  if (!configuration) {
    return `<div class="device-config-backdrop" id="device-configuration-backdrop"><section class="device-config-dialog" role="dialog" aria-modal="true" aria-labelledby="device-config-title"><header class="device-config-header"><div><span class="device-config-kicker">DEVICE SETTINGS</span><h2 id="device-config-title">Device configuration</h2><p>${escapeHtml(machine.name)}</p></div><button class="icon-btn" type="button" data-device-config-close aria-label="Close">${icon("close")}</button></header><p class="device-config-error">${escapeHtml(state.machineConfigurationError || "Configuration could not be loaded.")}</p><footer class="device-config-footer"><button type="button" class="secondary-btn" data-device-config-close>Close</button><button type="button" class="primary-btn" id="device-config-retry">Retry</button></footer></section></div>`;
  }

  const config = configuration;
  const general = `<div class="device-config-grid device-config-grid-three">${field("general.deviceName", "Device name", config.general.deviceName, { maxLength: 80 })}${field("general.machineId", "Machine ID", config.general.machineId, { readOnly: true })}${field("general.location", "Location / cluster", config.general.location, { readOnly: true })}</div>`;
  const powerMonitor = config.sensors.powerMonitor || {};
  const sensors = `<div class="device-config-range-list">${rangeFields("flow", "Flow", config.sensors.flow, "L/min", -10000, 10000, "0.1")}${rangeFields("pressure", "Pressure", config.sensors.pressure, "bar", -5, 100, "0.01")}${rangeFields("suction", "Suction", config.sensors.suction, "kPa", -1000, 1000, "0.1")}${rangeFields("temperature", "Temperature", config.sensors.temperature, "°C", -50, 250, "0.1")}<h4 class="device-config-subheading">Power Monitor operating limits</h4>${optionalRangeFields("voltageV", "Voltage", powerMonitor.voltageV, "V", 0, 1000, "0.01")}${optionalRangeFields("currentA", "Current", powerMonitor.currentA, "A", 0, 10000, "0.01")}${optionalRangeFields("activePowerW", "Active power", powerMonitor.activePowerW, "W", -1000000000, 1000000000, "0.01")}${optionalRangeFields("reactivePowerVar", "Reactive power", powerMonitor.reactivePowerVar, "var", -1000000000, 1000000000, "0.01")}${optionalRangeFields("apparentPowerVa", "Apparent power", powerMonitor.apparentPowerVa, "VA", 0, 1000000000, "0.01")}${optionalRangeFields("powerFactor", "Power factor", powerMonitor.powerFactor, "", -1, 1, "0.01")}${optionalRangeFields("frequencyHz", "Frequency", powerMonitor.frequencyHz, "Hz", 0, 1000, "0.01")}${optionalRangeFields("powerTotalKwh", "Power total", powerMonitor.powerTotalKwh, "kWh", 0, 1000000000000, "0.01")}</div><p class="device-config-note">Power Monitor limits are optional. Power alarms remain disabled until a complete minimum and maximum range is saved.</p>`;
  const plc = `<div class="device-config-grid">${selectField("plc.protocol", "Protocol", config.plc.protocol, [["Modbus RTU", "Modbus RTU"], ["Modbus TCP", "Modbus TCP"]])}${selectField("plc.baudRate", "Baud rate", config.plc.baudRate, [[9600, "9,600"], [19200, "19,200"], [38400, "38,400"], [57600, "57,600"], [115200, "115,200"]])}${selectField("plc.serialFormat", "Serial format", config.plc.serialFormat, [["8N1", "8N1"], ["8E1", "8E1"], ["8O1", "8O1"]])}${field("plc.slaveId", "Slave ID", config.plc.slaveId, { type: "number", minimum: 1, maximum: 247, step: "1" })}<p class="device-config-note">Saved settings are stored in CAMS; they are not sent to or applied on the PLC.</p></div>`;
  const data = `<div class="device-config-grid">${selectField("data.samplingInterval", "Sampling interval", config.data.samplingInterval, [[1, "1 second"], [5, "5 seconds"], [10, "10 seconds"]])}${field("data.mqttTopic", "MQTT topic", config.data.mqttTopic, { readOnly: true })}<p class="device-config-note">Sampling interval is saved as a device preference; it does not change the publisher schedule. Broker credentials are managed securely by the server and are not shown here.</p></div>`;
  const alarms = `<label class="device-config-toggle"><span><strong>Threshold alerts</strong><small>Enable alert thresholds for this device.</small></span><input name="alarms.thresholdAlerts" type="checkbox" ${config.alarms.thresholdAlerts ? "checked" : ""}><i aria-hidden="true"></i></label><div class="device-config-grid device-config-grid-three">${field("alarms.highPressure", "High pressure", config.alarms.highPressure, { type: "number", unit: "bar", minimum: -5, maximum: 100, step: "0.01" })}${field("alarms.lowPressure", "Low pressure", config.alarms.lowPressure, { type: "number", unit: "bar", minimum: -5, maximum: 100, step: "0.01" })}${selectField("alarms.offlineDelaySeconds", "Offline delay", config.alarms.offlineDelaySeconds, [[10, "10 seconds"], [30, "30 seconds"], [60, "60 seconds"], [120, "120 seconds"]])}<p class="device-config-note">These per-device alarm preferences are saved in CAMS; live alarm evaluation currently follows plant-level settings.</p></div>`;
  return `<div class="device-config-backdrop" id="device-configuration-backdrop"><section class="device-config-dialog device-config-dialog-ready" role="dialog" aria-modal="true" aria-labelledby="device-config-title"><header class="device-config-header"><div><span class="device-config-kicker">DEVICE SETTINGS</span><h2 id="device-config-title">Device configuration</h2><p>Configure device details, sensors, communication, and alerts.</p></div><button class="icon-btn" type="button" data-device-config-close aria-label="Close">${icon("close")}</button></header>${state.machineConfigurationError ? `<p class="device-config-error">${escapeHtml(state.machineConfigurationError)}</p>` : ""}<nav class="device-config-tabs" role="tablist" aria-label="Device configuration sections">${tabButtons}</nav><form id="device-configuration-form"><fieldset class="device-config-fields" ${disabled ? "disabled" : ""}><div class="device-config-panels">${tabPanel("general", "General information", general, activeTab === "general")}${tabPanel("sensors", "Sensor ranges", sensors, activeTab === "sensors")}${tabPanel("plc", "PLC / Modbus", plc, activeTab === "plc")}${tabPanel("data", "Data & MQTT", data, activeTab === "data")}${tabPanel("alarms", "Alarm thresholds", alarms, activeTab === "alarms")}</div></fieldset><footer class="device-config-footer"><span>${canEdit ? "Changes are saved to this device in CAMS." : "View-only access. Ask an owner to change this configuration."}</span><div><button type="button" class="secondary-btn" data-device-config-close>Cancel</button>${canEdit ? `<button type="submit" class="primary-btn" ${state.machineConfigurationSaving ? "disabled" : ""}>${state.machineConfigurationSaving ? "Saving…" : "Save configuration"}</button>` : ""}</div></footer></form></section></div>`;
}
