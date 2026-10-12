import { historyFor, icon, pageHead, parameterConfig, statusPill } from "./shared.js";
import { connectedProcessChart, trendStat } from "./trends.js";

function sensorCard(label, value, range, live) {
  return `<article class="sensor-card"><div class="sensor-card-top"><span class="sensor-card-label">${label}</span><span class="live-tag ${live ? "" : "offline"}"><i class="live-dot"></i> ${live ? "LIVE" : "STALE"}</span></div><div class="sensor-card-value">${value}</div><div class="sensor-range">${range}</div></article>`;
}

function diagnosticValue(label, value, detail, quality) {
  const normalized = quality || "unknown";
  return `<div class="diagnostic-value"><span>${label}</span><strong>${value ?? "—"}</strong><small>${detail} · <b class="quality-${normalized}">${normalized}</b></small></div>`;
}

export function renderMachineDetailPage({ state, machines, machineHistory, alarms }) {
  const machine = machines.find(item => item.id === state.machineId) || machines[0];
  if (!machine) return `${pageHead("Machine details", "No machine is currently available")}<div class="empty-state">${icon("machine")}Register a machine and publish telemetry to view details.</div>`;
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
  const thresholds = machine.monitoring?.thresholds || {};
  const rangeText = (field, unit, fallback) => thresholds[field] ? `${thresholds[field].minimum}–${thresholds[field].maximum} ${unit}` : fallback;
  const live = machine.gatewayStatus === "Online" && machine.status !== "Offline";
  const parameters = ["Pressure", "Flow", "Suction"].map(parameter => `<option value="${parameter}" ${parameter === state.detailParameter ? "selected" : ""}>${parameter}</option>`).join("");
  const ranges = ["15m", "1h", "6h", "24h"].map(range => `<button class="${state.detailRange === range ? "active" : ""}" data-detail-range="${range}">${range}</button>`).join("");
  return `<button class="back-link" data-page="machines">${icon("arrowLeft")} Back to machines</button>
    ${pageHead(`<span class="machine-head-title">${machine.id} ${statusPill(machine.status)}</span>`, `${machine.name} · ${machine.zone}`, `<button class="secondary-btn" id="export-machine-pdf">${icon("report")} PDF</button><button class="secondary-btn" id="export-machine-xlsx">${icon("download")} Excel</button>`)}
    <div class="meta-line"><span>${icon("gauge")} Mode: ${machine.status}</span><span>${icon("clock")} Last update: ${machine.updated}</span><span>${icon("wifi")} Communication: ${machine.communicationPercent}%</span></div><div style="height:18px"></div>
    <section class="sensor-card-grid">${sensorCard("Flow", value("flow", "L/min"), `Configured range ${rangeText("flowLpm", "L/min", "22–28 L/min")}`, live)}${sensorCard("Pressure", value("pressure", "bar"), `Configured range ${rangeText("pressureBar", "bar", "6.8–7.5 bar")}`, live)}${sensorCard("Suction", value("suction", "kPa"), `Configured range ${rangeText("suctionKpa", "kPa", "0.6–1.8 kPa")}`, live)}</section>
    <section class="panel diagnostics-panel"><header class="panel-head"><div class="panel-title"><h2>PLC diagnostics</h2><p>Raw Modbus registers and conversion traceability</p></div><span class="updated-note">${machine.source || "Waiting for gateway"}</span></header>
      <div class="diagnostic-grid">${diagnosticValue("PV1 · Flow", machine.raw?.pv1, `ERR1 ${machine.errors?.flow ?? "—"}`, machine.quality?.flow)}${diagnosticValue("PV2 · Pressure", machine.raw?.pv2, `ERR2 ${machine.errors?.suction ?? "—"}`, machine.quality?.suction)}${diagnosticValue("PV3 · Suction", machine.raw?.pv3, `ERR3 ${machine.errors?.pressure ?? "—"}`, machine.quality?.pressure)}${diagnosticValue("Calibration", machine.calibrationVersion || "—", "1-second sampling", machine.quality?.modbus)}</div>
    </section>
    <section class="detail-grid">
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Operating trend</h2><p>${state.detailParameter} · last ${state.detailRange}</p></div></header><div class="dashboard-chart-toolbar machine-detail-chart-toolbar"><div class="dashboard-parameter"><label for="detail-parameter">Graph reading</label><div class="select-wrap"><select id="detail-parameter">${parameters}</select>${icon("chevronDown")}</div></div><div class="segment-control">${ranges}</div></div><div class="panel-body process-panel-body">${connectedProcessChart(machine, rawReadings, state.detailParameter)}</div><div class="trend-stat-grid">${trendStat("Current", current, detailUnit)}${trendStat("Minimum", minimum, detailUnit)}${trendStat("Maximum", maximum, detailUnit)}${trendStat("Average", average, detailUnit)}</div></article>
      <div class="info-stack">
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>${machine.reasons.length ? machine.reasons.join(" · ") : "All configured checks are normal"}</p></div></header><div class="state-list"><div class="state-row"><span>Operation</span>${statusPill(machine.status)}</div><div class="state-row"><span>PLC link</span>${statusPill(machine.plcStatus)}</div><div class="state-row"><span>Gateway</span>${statusPill(machine.gatewayStatus)}</div><div class="state-row"><span>Overall health</span><strong>${Number.isFinite(machine.health) ? `${machine.health}%` : "—"}</strong></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Service summary</h2><p>Preventive maintenance</p></div></header><div class="service-progress"><div class="service-big"><strong>${machine.hours === null ? "—" : `${machine.hours.toLocaleString()} h`}</strong><span>Running hours</span></div><div class="progress-track"><span style="width:0%"></span></div><div class="service-dates"><span>Service records not connected</span><span>Maintenance module · next phase</span></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Alarm summary</h2><p>${related.length} recent event${related.length === 1 ? "" : "s"}</p></div><button class="panel-link" data-page="alarms">View all →</button></header><div class="alarm-list">${related.length ? related.map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon("alarm")}</span><div><strong>${alarm.parameter} · ${alarm.value}</strong><p>${alarm.message}</p></div></div>`).join("") : `<div class="empty-state">${icon("check")}No recent alarms for this machine.</div>`}</div></article>
      </div>
    </section>`;
}
