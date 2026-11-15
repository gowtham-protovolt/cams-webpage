import { connectionLastUpdate, connectionStatus, connectionStatusDisplay, customDatePicker, customSelect, deviceDisplayName, downloadMenu, escapeHtml, historyFor, icon, pageHead, parameterConfig, statusPill, timeRangeSelect } from "./shared.js";
import { connectedProcessChart, trendStat } from "./trends.js";
import { renderDeviceConfiguration } from "./device-configuration.js";
import { renderPowerMonitorPanel } from "./power-monitor.js";

const qualityFields = { Pressure: "pressure", Flow: "flow", Suction: "suction", Temperature: "temperature" };

function sensorCard(label, value, range, live, quality = "good", options = {}) {
  const noSignal = quality === "bad" || value === "—";
  const stateLabel = noSignal ? "NO SIGNAL" : live ? "LIVE" : "STALE";
  const interactive = Boolean(options.parameter || options.powerMonitor);
  const tag = interactive ? "button" : "article";
  const action = options.parameter
    ? ` data-detail-parameter="${escapeHtml(options.parameter)}" aria-label="Show ${escapeHtml(options.parameter)} graph" aria-pressed="${options.selected ? "true" : "false"}"`
    : options.powerMonitor
      ? ` data-power-monitor="${escapeHtml(options.powerMonitor)}" aria-label="Open Power Monitor for ${escapeHtml(options.powerMonitor)}"`
      : "";
  const attributes = interactive ? ` type="button"${action}` : "";
  return `<${tag}${attributes} class="sensor-card ${interactive ? "sensor-card-action" : ""} ${options.selected ? "is-selected" : ""} ${noSignal ? "no-signal" : ""}"><div class="sensor-card-top"><span class="sensor-card-label">${label}</span><span class="live-tag ${noSignal ? "bad" : live ? "" : "offline"}"><i class="live-dot"></i> ${stateLabel}</span></div><div class="sensor-card-value">${noSignal ? "No signal" : value}</div><div class="sensor-range">${noSignal ? "Sensor disconnected or signal invalid" : range}</div></${tag}>`;
}

function diagnosticValue(label, value, detail, quality) {
  const normalized = quality || "unknown";
  return `<div class="diagnostic-value"><span>${label}</span><strong>${value ?? "—"}</strong><small>${detail} · <b class="quality-${normalized}">${normalized}</b></small></div>`;
}

function limitField(name, label, value, unit, disabled) {
  const required = value !== "" && value !== undefined && value !== null;
  return `<label class="settings-field"><span>${label}</span><div class="settings-input-wrap"><input name="${name}" type="number" value="${value ?? ""}" step="0.01" ${required ? "required" : ""} ${disabled ? "disabled" : ""}><small>${unit}</small></div></label>`;
}

function limitRow(key, title, copy, range, unit, disabled) {
  return `<div class="threshold-row"><div><strong>${title}</strong><span>${copy}</span></div>${limitField(`limits.${key}.minimum`, "Minimum", range.minimum, unit, disabled)}${limitField(`limits.${key}.maximum`, "Maximum", range.maximum, unit, disabled)}</div>`;
}

export function renderMachineDetailPage({ state, machines, machineHistory, alarms }) {
  const machine = machines.find(item => item.id === state.machineId) || machines[0];
  if (!machine) return `${pageHead("Device details", "No device is currently available")}<div class="empty-state">${icon("machine")}Register a device and publish telemetry to view details.</div>`;
  const value = (key, unit) => machine[key] === null || machine[key] === undefined ? "—" : `${machine[key]} <small>${unit}</small>`;
  const related = alarms.filter(alarm => alarm.machine === machine.id).slice(0, 3);
  const detailQualityField = qualityFields[state.detailParameter] || "pressure";
  const detailHistory = machine.quality?.[detailQualityField] === "bad" ? [] : historyFor(machineHistory, machine.id, state.detailParameter);
  const detailValues = detailHistory.map(point => point.value);
  const current = detailValues.at(-1) ?? null;
  const minimum = detailValues.length ? Math.min(...detailValues) : null;
  const maximum = detailValues.length ? Math.max(...detailValues) : null;
  const average = detailValues.length ? detailValues.reduce((sum, item) => sum + item, 0) / detailValues.length : null;
  const detailUnit = (parameterConfig[state.detailParameter] || parameterConfig.Pressure).unit;
  const rawReadings = machineHistory.get(machine.id) || [];
  if (state.machinePowerMonitorOpen) return renderPowerMonitorPanel({ state, machine, history: rawReadings });
  const localLimits = state.machineLimitOverrides?.[machine.id] || {};
  const savedConfiguration = state.machineConfiguration?.general?.machineId === machine.id ? state.machineConfiguration : null;
  const thresholds = { ...(machine.monitoring?.thresholds || {}), ...localLimits };
  const deviceLimits = {
    pressureBar: savedConfiguration?.sensors.pressure || thresholds.pressureBar || { minimum: 6.8, maximum: 7.5 },
    flowLpm: savedConfiguration?.sensors.flow || thresholds.flowLpm || { minimum: 22, maximum: 28 },
    suctionKpa: savedConfiguration?.sensors.suction || thresholds.suctionKpa || { minimum: 0.6, maximum: 1.8 },
    temperatureC: savedConfiguration?.sensors.temperature || thresholds.temperatureC || { minimum: 0, maximum: 80 }
  };
  // Prefer device-specific limits, but show the plant-level Power Monitor
  // thresholds when this device has not overridden them yet.
  const powerLimits = savedConfiguration?.sensors?.powerMonitor || thresholds.powerMonitor || {};
  const rangeText = (field, unit, fallback) => {
    const range = deviceLimits[field];
    return range ? `${range.minimum}–${range.maximum} ${unit}` : fallback;
  };
  const live = connectionStatus(machine) === "Online";
  const lastUpdateValue = connectionLastUpdate(machine);
  const lastUpdate = live || lastUpdateValue === "No telemetry" ? lastUpdateValue : `Last update · ${lastUpdateValue}`;
  const parameters = ["Flow", "Pressure", "Suction", "Temperature"].map(parameter => [parameter, parameter]);
  const ranges = [["15m", "15 Min"], ["1h", "1 Hr"], ["6h", "6 Hr"], ["24h", "1 Day"], ["7d", "1 Week"], ["1mo", "1 Month"], ["3mo", "3 Months"], ["6mo", "6 Months"], ["1y", "1 Year"], ["custom", "Custom"]];
  const customDate = state.detailRange === "custom" ? customDatePicker(state, "detail-custom-date", state.detailCustomDate, "Choose operating trend date") : "";
  const canEditLimits = Boolean(state.currentUser?.isOwner);
  const limitsEditing = canEditLimits && state.machineLimitsEditing;
  const limitsDisabled = !limitsEditing;
  const limitsAction = canEditLimits ? `<button class="secondary-btn" id="edit-machine-limits" type="button" ${limitsEditing ? "disabled" : ""}>Edit</button><button class="primary-btn" type="submit" ${limitsEditing && !state.machineLimitsSaving ? "" : "disabled"}>${state.machineLimitsSaving ? "Saving…" : "Save changes"}</button>` : "";
  const optionalLimitRow = (key, title, copy, unit) => {
    const range = powerLimits[key] || {};
    return `<div class="threshold-row"><div><strong>${title}</strong><span>${copy}</span></div>${limitField(`limits.powerMonitor.${key}.minimum`, "Minimum", range.minimum ?? "", unit, limitsDisabled)}${limitField(`limits.powerMonitor.${key}.maximum`, "Maximum", range.maximum ?? "", unit, limitsDisabled)}</div>`;
  };
  const powerValue = Number.isFinite(machine.powerMonitor?.activePowerW) ? `${machine.powerMonitor.activePowerW} <small>W</small>` : "—";
  return `<button class="back-link" data-page="machines">${icon("arrowLeft")} Back to devices</button>
    ${pageHead(`<span class="machine-head-title">${escapeHtml(deviceDisplayName(machine))} ${connectionStatusDisplay(machine)}</span>`, [machine.cluster, machine.zone].filter(Boolean).map(escapeHtml).join(" · "), `<button class="icon-btn" id="machine-settings" type="button" aria-label="Device settings">${icon("settings")}</button>${downloadMenu([{ id: "export-machine-pdf", label: "PDF", format: "pdf" }, { id: "export-machine-xlsx", label: "Excel", format: "xlsx" }])}`)}
    <div class="meta-line">${lastUpdate}</div><div style="height:18px"></div>
    <section class="sensor-card-grid">${sensorCard("Flow", value("flow", "L/min"), `Configured range ${rangeText("flowLpm", "L/min", "22–28 L/min")}`, live, machine.quality?.flow, { parameter: "Flow", selected: state.detailParameter === "Flow" })}${sensorCard("Pressure", value("pressure", "bar"), `Configured range ${rangeText("pressureBar", "bar", "6.8–7.5 bar")}`, live, machine.quality?.pressure, { parameter: "Pressure", selected: state.detailParameter === "Pressure" })}${sensorCard("Suction", value("suction", "kPa"), `Configured range ${rangeText("suctionKpa", "kPa", "0.6–1.8 kPa")}`, live, machine.quality?.suction, { parameter: "Suction", selected: state.detailParameter === "Suction" })}${sensorCard("Temperature", value("temperature", "°C"), `Configured range ${rangeText("temperatureC", "°C", "0–80 °C")}`, live, machine.quality?.temperature, { parameter: "Temperature", selected: state.detailParameter === "Temperature" })}${sensorCard("Power Monitor", powerValue, "Open electrical measurements", live, machine.powerMonitor ? "good" : "bad", { powerMonitor: machine.id })}</section>
    <section class="panel diagnostics-panel"><header class="panel-head"><div class="panel-title"><h2>PLC diagnostics</h2><p>Raw Modbus registers and conversion traceability</p></div><span class="updated-note">${machine.source || "Waiting for gateway"}</span></header>
      <div class="diagnostic-grid">${diagnosticValue("PV1 · Flow", machine.raw?.pv1, `ERR1 ${machine.errors?.flow ?? "—"}`, machine.quality?.flow)}${diagnosticValue("PV2 · Pressure", machine.raw?.pv2, `ERR2 ${machine.errors?.pressure ?? "—"}`, machine.quality?.pressure)}${diagnosticValue("PV3 · Suction", machine.raw?.pv3, `ERR3 ${machine.errors?.suction ?? "—"}`, machine.quality?.suction)}${diagnosticValue("Calibration", machine.calibrationVersion || "—", "1-second sampling", machine.quality?.modbus)}</div>
    </section>
    <section class="detail-grid">
      <article class="panel" id="machine-operating-trend"><header class="panel-head"><div class="panel-title"><h2>Operating trend</h2><p>${state.detailParameter} · last ${state.detailRange}</p></div></header><div class="dashboard-chart-toolbar machine-detail-chart-toolbar"><div class="dashboard-parameter"><label for="detail-parameter-trigger">Graph reading</label>${customSelect("detail-parameter", parameters, state.detailParameter, { className: "dashboard-parameter-select", label: "Graph reading" })}</div><div class="dashboard-parameter dashboard-time-range"><label for="detail-range-trigger">Time range</label>${timeRangeSelect("detail-range", ranges, state.detailRange)}${customDate}</div></div><div class="panel-body process-panel-body">${connectedProcessChart(machine, rawReadings, state.detailParameter)}</div><div class="trend-stat-grid">${trendStat("Current", current, detailUnit)}${trendStat("Minimum", minimum, detailUnit)}${trendStat("Maximum", maximum, detailUnit)}${trendStat("Average", average, detailUnit)}</div></article>
      <div class="info-stack">
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Device health</h2><p>${machine.reasons.length ? machine.reasons.join(" · ") : "All configured checks are normal"}</p></div></header><div class="state-list"><div class="state-row"><span>Operation</span>${connectionStatusDisplay(machine)}</div><div class="state-row"><span>PLC link</span>${statusPill(machine.plcStatus)}</div><div class="state-row"><span>Gateway</span>${statusPill(machine.gatewayStatus)}</div><div class="state-row"><span>Overall health</span><strong>${Number.isFinite(machine.health) ? `${machine.health}%` : "—"}</strong></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Alarm summary</h2><p>${related.length} recent event${related.length === 1 ? "" : "s"}</p></div><button class="panel-link" data-page="alarms">View all →</button></header><div class="alarm-list">${related.length ? related.map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon("alarm")}</span><div><strong>${alarm.parameter} · ${alarm.value}</strong><p>${alarm.message}</p></div></div>`).join("") : `<div class="empty-state">${icon("check")}No recent alarms for this device.</div>`}</div></article>
      </div>
    </section>
    <form id="machine-limits-form" class="settings-layout machine-detail-limits">
      <section class="panel settings-section"><div class="settings-section-head"><div><h2>Operating limits</h2><p>Configure the safe reading ranges shown for this device.</p></div><div class="page-actions">${limitsAction}</div></div><div class="threshold-list">${limitRow("flowLpm", "Flow", "Expected air-flow range", deviceLimits.flowLpm, "L/min", limitsDisabled)}${limitRow("pressureBar", "Pressure", "Safe discharge pressure range", deviceLimits.pressureBar, "bar", limitsDisabled)}${limitRow("suctionKpa", "Suction", "Safe suction pressure range", deviceLimits.suctionKpa, "kPa", limitsDisabled)}${limitRow("temperatureC", "Temperature", "Safe compressor temperature range", deviceLimits.temperatureC, "°C", limitsDisabled)}${optionalLimitRow("voltageV", "Voltage", "Power monitor voltage range", "V")}${optionalLimitRow("currentA", "Current", "Power monitor current range", "A")}${optionalLimitRow("activePowerW", "Active power", "Power monitor active power range", "W")}${optionalLimitRow("reactivePowerVar", "Reactive power", "Power monitor reactive power range", "var")}${optionalLimitRow("apparentPowerVa", "Apparent power", "Power monitor apparent power range", "VA")}${optionalLimitRow("powerFactor", "Power factor", "Power monitor power factor range", "")}${optionalLimitRow("frequencyHz", "Frequency", "Power monitor frequency range", "Hz")}${optionalLimitRow("powerTotalKwh", "Power total", "Power monitor total energy range", "kWh")}</div></section>
    </form>${renderDeviceConfiguration(state, machine)}`;
}
