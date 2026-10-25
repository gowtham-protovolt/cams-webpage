import { connectionLastUpdate, connectionStatus, connectionStatusDisplay, customDatePicker, customSelect, deviceDisplayName, downloadMenu, escapeHtml, historyFor, icon, pageHead, parameterConfig, statusPill, timeRangeSelect } from "./shared.js";
import { connectedProcessChart, trendStat } from "./trends.js";

function sensorCard(label, value, range, live) {
  return `<article class="sensor-card"><div class="sensor-card-top"><span class="sensor-card-label">${label}</span><span class="live-tag ${live ? "" : "offline"}"><i class="live-dot"></i> ${live ? "LIVE" : "STALE"}</span></div><div class="sensor-card-value">${value}</div><div class="sensor-range">${range}</div></article>`;
}

function diagnosticValue(label, value, detail, quality) {
  const normalized = quality || "unknown";
  return `<div class="diagnostic-value"><span>${label}</span><strong>${value ?? "—"}</strong><small>${detail} · <b class="quality-${normalized}">${normalized}</b></small></div>`;
}

function limitField(name, label, value, unit, disabled) {
  return `<label class="settings-field"><span>${label}</span><div class="settings-input-wrap"><input name="${name}" type="number" value="${value}" step="0.01" ${disabled ? "disabled" : ""}><small>${unit}</small></div></label>`;
}

function limitRow(key, title, copy, range, unit, disabled) {
  return `<div class="threshold-row"><div><strong>${title}</strong><span>${copy}</span></div>${limitField(`limits.${key}.minimum`, "Minimum", range.minimum, unit, disabled)}${limitField(`limits.${key}.maximum`, "Maximum", range.maximum, unit, disabled)}</div>`;
}

export function renderMachineDetailPage({ state, machines, machineHistory, alarms }) {
  const machine = machines.find(item => item.id === state.machineId) || machines[0];
  if (!machine) return `${pageHead("Device details", "No device is currently available")}<div class="empty-state">${icon("machine")}Register a device and publish telemetry to view details.</div>`;
  const value = (key, unit) => machine[key] === null || machine[key] === undefined ? "—" : `${machine[key]} <small>${unit}</small>`;
  const related = alarms.filter(alarm => alarm.machine === machine.id).slice(0, 3);
  const detailHistory = historyFor(machineHistory, machine.id, state.detailParameter);
  const detailValues = detailHistory.map(point => point.value);
  const current = detailValues.at(-1) ?? null;
  const minimum = detailValues.length ? Math.min(...detailValues) : null;
  const maximum = detailValues.length ? Math.max(...detailValues) : null;
  const average = detailValues.length ? detailValues.reduce((sum, item) => sum + item, 0) / detailValues.length : null;
  const detailUnit = (parameterConfig[state.detailParameter] || parameterConfig.Pressure).unit;
  const rawReadings = machineHistory.get(machine.id) || [];
  const localLimits = state.machineLimitOverrides?.[machine.id] || {};
  const thresholds = { ...(machine.monitoring?.thresholds || {}), ...localLimits };
  const deviceLimits = {
    pressureBar: thresholds.pressureBar || { minimum: 6.8, maximum: 7.5 },
    flowLpm: thresholds.flowLpm || { minimum: 22, maximum: 28 },
    suctionKpa: thresholds.suctionKpa || { minimum: 0.6, maximum: 1.8 },
    temperatureC: thresholds.temperatureC || { minimum: 0, maximum: 80 }
  };
  const rangeText = (field, unit, fallback) => thresholds[field] ? `${thresholds[field].minimum}–${thresholds[field].maximum} ${unit}` : fallback;
  const live = connectionStatus(machine) === "Online";
  const lastUpdateValue = connectionLastUpdate(machine);
  const lastUpdate = live || lastUpdateValue === "No telemetry" ? lastUpdateValue : `Last update · ${lastUpdateValue}`;
  const parameters = ["Pressure", "Flow", "Suction"].map(parameter => [parameter, parameter]);
  const ranges = [["15m", "15 min"], ["1h", "1 hr"], ["6h", "6 hr"], ["24h", "1 day"], ["7d", "1 week"], ["1mo", "1 month"], ["3mo", "3 months"], ["6mo", "6 months"], ["1y", "1 year"], ["custom", "Custom"]];
  const customDate = state.detailRange === "custom" ? customDatePicker(state, "detail-custom-date", state.detailCustomDate, "Choose operating trend date") : "";
  const canEditLimits = Boolean(state.currentUser?.isOwner);
  const limitsEditing = canEditLimits && state.machineLimitsEditing;
  const limitsDisabled = !limitsEditing;
  const limitsAction = canEditLimits ? `<button class="secondary-btn" id="edit-machine-limits" type="button" ${limitsEditing ? "disabled" : ""}>Edit</button><button class="primary-btn" type="submit" ${limitsEditing ? "" : "disabled"}>Save changes</button>` : "";
  return `<button class="back-link" data-page="machines">${icon("arrowLeft")} Back to devices</button>
    ${pageHead(`<span class="machine-head-title">${escapeHtml(deviceDisplayName(machine))} ${connectionStatusDisplay(machine)}</span>`, [machine.id, machine.cluster, machine.zone].filter(Boolean).map(escapeHtml).join(" · "), `<button class="icon-btn" id="machine-settings" type="button" aria-label="Device settings">${icon("settings")}</button>${downloadMenu([{ id: "export-machine-pdf", label: "PDF", format: "pdf" }, { id: "export-machine-xlsx", label: "Excel", format: "xlsx" }])}`)}
    <div class="meta-line">${lastUpdate}</div><div style="height:18px"></div>
    <section class="sensor-card-grid">${sensorCard("Flow", value("flow", "L/min"), `Configured range ${rangeText("flowLpm", "L/min", "22–28 L/min")}`, live)}${sensorCard("Pressure", value("pressure", "bar"), `Configured range ${rangeText("pressureBar", "bar", "6.8–7.5 bar")}`, live)}${sensorCard("Suction", value("suction", "kPa"), `Configured range ${rangeText("suctionKpa", "kPa", "0.6–1.8 kPa")}`, live)}${sensorCard("Temperature", value("temperature", "°C"), `Configured range ${rangeText("temperatureC", "°C", "0–80 °C")}`, live)}</section>
    <section class="panel diagnostics-panel"><header class="panel-head"><div class="panel-title"><h2>PLC diagnostics</h2><p>Raw Modbus registers and conversion traceability</p></div><span class="updated-note">${machine.source || "Waiting for gateway"}</span></header>
      <div class="diagnostic-grid">${diagnosticValue("PV1 · Flow", machine.raw?.pv1, `ERR1 ${machine.errors?.flow ?? "—"}`, machine.quality?.flow)}${diagnosticValue("PV2 · Pressure", machine.raw?.pv2, `ERR2 ${machine.errors?.suction ?? "—"}`, machine.quality?.suction)}${diagnosticValue("PV3 · Suction", machine.raw?.pv3, `ERR3 ${machine.errors?.pressure ?? "—"}`, machine.quality?.pressure)}${diagnosticValue("Calibration", machine.calibrationVersion || "—", "1-second sampling", machine.quality?.modbus)}</div>
    </section>
    <section class="detail-grid">
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Operating trend</h2><p>${state.detailParameter} · last ${state.detailRange}</p></div></header><div class="dashboard-chart-toolbar machine-detail-chart-toolbar"><div class="dashboard-parameter"><label for="detail-parameter-trigger">Graph reading</label>${customSelect("detail-parameter", parameters, state.detailParameter, { className: "dashboard-parameter-select", label: "Graph reading" })}</div><div class="dashboard-parameter dashboard-time-range"><label for="detail-range-trigger">Time range</label>${timeRangeSelect("detail-range", ranges, state.detailRange)}${customDate}</div></div><div class="panel-body process-panel-body">${connectedProcessChart(machine, rawReadings, state.detailParameter)}</div><div class="trend-stat-grid">${trendStat("Current", current, detailUnit)}${trendStat("Minimum", minimum, detailUnit)}${trendStat("Maximum", maximum, detailUnit)}${trendStat("Average", average, detailUnit)}</div></article>
      <div class="info-stack">
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Device health</h2><p>${machine.reasons.length ? machine.reasons.join(" · ") : "All configured checks are normal"}</p></div></header><div class="state-list"><div class="state-row"><span>Operation</span>${connectionStatusDisplay(machine)}</div><div class="state-row"><span>PLC link</span>${statusPill(machine.plcStatus)}</div><div class="state-row"><span>Gateway</span>${statusPill(machine.gatewayStatus)}</div><div class="state-row"><span>Overall health</span><strong>${Number.isFinite(machine.health) ? `${machine.health}%` : "—"}</strong></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Service summary</h2><p>Preventive maintenance</p></div></header><div class="service-progress"><div class="service-big"><strong>${machine.hours === null ? "—" : `${machine.hours.toLocaleString()} h`}</strong><span>Running hours</span></div><div class="progress-track"><span style="width:0%"></span></div><div class="service-dates"><span>Service records not connected</span><span>Maintenance module · next phase</span></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Alarm summary</h2><p>${related.length} recent event${related.length === 1 ? "" : "s"}</p></div><button class="panel-link" data-page="alarms">View all →</button></header><div class="alarm-list">${related.length ? related.map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon("alarm")}</span><div><strong>${alarm.parameter} · ${alarm.value}</strong><p>${alarm.message}</p></div></div>`).join("") : `<div class="empty-state">${icon("check")}No recent alarms for this device.</div>`}</div></article>
      </div>
    </section>
    <form id="machine-limits-form" class="settings-layout">
      <section class="panel settings-section"><div class="settings-section-head"><div><h2>Operating limits</h2><p>Configure the safe reading ranges shown for this device.</p></div><div class="page-actions">${limitsAction}</div></div><div class="threshold-list">${limitRow("pressureBar", "Pressure", "Safe discharge pressure range", deviceLimits.pressureBar, "bar", limitsDisabled)}${limitRow("flowLpm", "Flow", "Expected air-flow range", deviceLimits.flowLpm, "L/min", limitsDisabled)}${limitRow("suctionKpa", "Suction", "Safe suction pressure range", deviceLimits.suctionKpa, "kPa", limitsDisabled)}${limitRow("temperatureC", "Temperature", "Safe compressor temperature range", deviceLimits.temperatureC, "°C", limitsDisabled)}</div></section>
    </form>`;
}
