import { formatTicketId } from "../data/tickets.js";
import { connectionStatus, customDatePicker, customSelect, deviceLabel, escapeHtml, fmt, icon, kpi, pageHead, parameterConfig, telemetryUpdateTime, timeRangeSelect } from "./shared.js";
import { renderPowerMonitorPanel } from "./power-monitor.js";

const rangeMilliseconds = {
  "15m": 15 * 60e3,
  "1h": 60 * 60e3,
  "6h": 6 * 60 * 60e3,
  "24h": 24 * 60 * 60e3,
  "7d": 7 * 24 * 60 * 60e3,
  "1mo": 30 * 24 * 60 * 60e3,
  "3mo": 90 * 24 * 60 * 60e3,
  "6mo": 180 * 24 * 60 * 60e3,
  "1y": 365 * 24 * 60 * 60e3
};
const thresholdKeys = { Pressure: "pressureBar", Flow: "flowLpm", Suction: "suctionKpa", Temperature: "temperatureC" };
const qualityFields = { Pressure: "pressure", Flow: "flow", Suction: "suction", Temperature: "temperature" };
const defaultRanges = {
  Pressure: { minimum: 6.8, maximum: 7.5 }, Flow: { minimum: 22, maximum: 28 }, Suction: { minimum: 0.6, maximum: 1.8 }, Temperature: { minimum: 0, maximum: 80 }
};

function sensorMini(label, value, unit, readingState, quality = "unknown", deviceOnline = false, options = {}) {
  const noSignal = quality === "bad" || value === "—";
  const sensorLive = deviceOnline && readingState === "live" && !noSignal;
  const statusLabel = sensorLive ? "Sensor live" : noSignal ? "Sensor disconnected or invalid" : "Sensor offline";
  const displayValue = noSignal ? "No signal" : value;
  const readingLabel = noSignal ? "Sensor disconnected or invalid" : readingState === "live" ? unit : `Last known reading · ${unit}`;
  const interactive = Boolean(options.parameter || options.powerMonitor);
  const tag = interactive ? "button" : "div";
  const action = options.parameter
    ? ` data-dashboard-parameter="${escapeHtml(options.parameter)}" aria-label="Show ${escapeHtml(options.parameter)} dashboard graph" aria-pressed="${options.selected ? "true" : "false"}"`
    : options.powerMonitor
      ? ` data-power-monitor="${escapeHtml(options.powerMonitor)}" aria-label="Open Power Monitor for ${escapeHtml(options.powerMonitor)}"`
      : "";
  const attributes = interactive
    ? ` type="button" class="sensor-mini sensor-mini-action ${options.selected ? "is-selected" : ""} ${sensorLive ? "live" : "not-live"}"${action}`
    : ` class="sensor-mini ${sensorLive ? "live" : "not-live"}"`;
  return `<${tag}${attributes}><div class="sensor-mini-head"><span>${label}</span><span class="sensor-state ${sensorLive ? "live" : "not-live"}" role="img" aria-label="${statusLabel}" title="${statusLabel}"><i></i></span></div><strong>${displayValue}</strong><small>${readingLabel}</small></${tag}>`;
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    path += ` C ${(current.x + (next.x - before.x) / 6).toFixed(2)} ${(current.y + (next.y - before.y) / 6).toFixed(2)}, ${(next.x - (after.x - current.x) / 6).toFixed(2)} ${(next.y - (after.y - current.y) / 6).toFixed(2)}, ${next.x} ${next.y}`;
  }
  return path;
}

function readingValue(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function dashboardStat(label, value, unit) {
  return `<div class="dashboard-chart-stat"><span>${label}</span><strong>${value === null ? "—" : Number(value).toFixed(2)} <small>${unit}</small></strong></div>`;
}

function dashboardProcessChart({ machine, readings, parameter, readingState, thresholds, samplingSeconds, streamConnected }) {
  const config = parameterConfig[parameter] || parameterConfig.Pressure;
  const configuredRange = thresholds?.[thresholdKeys[parameter]] || defaultRanges[parameter];
  const qualityField = qualityFields[parameter] || "pressure";
  const signalDisconnected = machine.quality?.[qualityField] === "bad";
  const normalized = (signalDisconnected ? [] : readings)
    .filter(reading => reading.quality?.[qualityField] !== "bad")
    .map(reading => ({ reading, value: Number(reading.metrics?.[config.field]), time: new Date(reading.observedAt) }))
    .filter(sample => Number.isFinite(sample.value) && !Number.isNaN(sample.time.getTime()));
  const samples = normalized.length <= 120 ? normalized : Array.from({ length: 120 }, (_, index) => normalized[Math.round(index * (normalized.length - 1) / 119)]);
  if (!samples.length) return `<div class="dashboard-chart-empty">${icon("pulse")}<strong>${signalDisconnected ? `${escapeHtml(parameter)} sensor has no valid signal` : `No ${escapeHtml(parameter.toLowerCase())} readings in this time window`}</strong><span>${signalDisconnected ? "Graph and statistics are paused until a valid sensor signal is restored." : "Select a longer range or wait for new MQTT telemetry."}</span></div>`;

  const width = 920;
  const height = 270;
  const plot = { left: 58, right: 20, top: 24, bottom: 43 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const values = samples.map(sample => sample.value);
  const domainMinimum = Math.min(...values, configuredRange.minimum);
  const domainMaximum = Math.max(...values, configuredRange.maximum);
  const span = Math.max(domainMaximum - domainMinimum, config.fallbackSpan);
  const minimum = domainMinimum - span * .15;
  const maximum = domainMaximum + span * .15;
  const x = index => samples.length === 1 ? plot.left + plotWidth / 2 : plot.left + index / (samples.length - 1) * plotWidth;
  const y = value => plot.top + (maximum - value) / (maximum - minimum) * plotHeight;
  const points = samples.map((sample, index) => ({ x: Number(x(index).toFixed(2)), y: Number(y(sample.value).toFixed(2)) }));
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points.at(-1).x} ${plot.top + plotHeight} L ${points[0].x} ${plot.top + plotHeight} Z`;
  const rangeTop = Math.min(y(configuredRange.maximum), y(configuredRange.minimum));
  const rangeHeight = Math.abs(y(configuredRange.minimum) - y(configuredRange.maximum));
  const horizontalGrid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const gridY = plot.top + ratio * plotHeight;
    const label = maximum - ratio * (maximum - minimum);
    return `<line class="process-grid-line" x1="${plot.left}" y1="${gridY}" x2="${width - plot.right}" y2="${gridY}"/><text class="process-axis-label" x="${plot.left - 11}" y="${gridY + 4}" text-anchor="end">${label.toFixed(Math.abs(label) < 10 ? 1 : 0)}</text>`;
  }).join("");
  const labelIndexes = [...new Set([0, .25, .5, .75, 1].map(ratio => Math.round((samples.length - 1) * ratio)))];
  const timeLabels = labelIndexes.map(index => `<text class="process-axis-label" x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === samples.length - 1 ? "end" : "middle"}">${samples[index].time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</text>`).join("");
  const nodeInterval = Math.max(1, Math.ceil(samples.length / 42));
  const nodes = samples.map((sample, index) => {
    if (index % nodeInterval !== 0 && index !== samples.length - 1) return "";
    const metrics = sample.reading.metrics || {};
    const quality = sample.reading.quality?.[qualityFields[parameter]] || "unknown";
    const latestClass = index === samples.length - 1 ? " is-latest" : "";
    const accessibleTime = sample.time.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });
    return `<circle class="process-node${latestClass}" cx="${points[index].x}" cy="${points[index].y}" r="${index === samples.length - 1 ? 5.5 : 4}" tabindex="0" role="button" aria-label="${escapeHtml(`${parameter} ${readingValue(sample.value)} ${config.unit} at ${accessibleTime}`)}" data-observed-at="${escapeHtml(sample.reading.observedAt)}" data-pressure="${readingValue(metrics.pressureBar)}" data-flow="${readingValue(metrics.flowLpm)}" data-suction="${readingValue(metrics.suctionKpa)}" data-status="${escapeHtml(sample.reading.status || machine.status || "Unknown")}" data-quality="${escapeHtml(quality)}"/>`;
  }).join("");
  const statusLabel = readingState === "live" ? "Live" : readingState === "stale" ? "Historical" : "Offline";
  return `<div class="connected-process-chart dashboard-process-chart ${readingState}" id="connected-process-chart"><div class="process-chart-status"><span><i class="pulse-dot"></i>${statusLabel}</span><span>${samplingSeconds} sec target</span><span>${streamConnected ? "Stream connected" : "Stream reconnecting"}</span><small>Hover or tap any point</small></div><div class="process-chart-stage"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Interactive ${escapeHtml(parameter)} dashboard trace"><defs><linearGradient id="dashboard-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#35aa99" stop-opacity=".2"/><stop offset="100%" stop-color="#35aa99" stop-opacity=".015"/></linearGradient></defs><rect class="process-normal-band" x="${plot.left}" y="${rangeTop}" width="${plotWidth}" height="${Math.max(2, rangeHeight)}" rx="5"/>${horizontalGrid}<line class="process-limit-line" x1="${plot.left}" y1="${y(configuredRange.maximum)}" x2="${width - plot.right}" y2="${y(configuredRange.maximum)}"/><path class="dashboard-process-area" d="${areaPath}"/><path class="process-line-shadow" d="${linePath}"/><path class="process-line" d="${linePath}"/><line class="process-crosshair" id="process-crosshair" x1="0" y1="${plot.top}" x2="0" y2="${plot.top + plotHeight}"/>${nodes}${timeLabels}<text class="process-unit-label" x="${plot.left}" y="14">${escapeHtml(config.unit)}</text><text class="process-band-label" x="${plot.left + 10}" y="${rangeTop + 17}">Configured operating range</text></svg><div class="process-tooltip" id="process-tooltip" role="status" aria-live="polite"><div class="process-tooltip-time" data-tooltip-time>—</div><strong>${escapeHtml(deviceLabel(machine))}</strong><dl><div><dt>Flow</dt><dd><span data-tooltip-flow>—</span> L/min</dd></div><div><dt>Pressure</dt><dd><span data-tooltip-pressure>—</span> bar</dd></div><div><dt>Suction</dt><dd><span data-tooltip-suction>—</span> kPa</dd></div></dl><div class="process-tooltip-meta"><span data-tooltip-status>—</span><span data-tooltip-quality>—</span></div></div></div></div>`;
}

export function renderDashboardPage({ state, machines, machineHistory, alarms, tickets = [] }) {
  const running = machines.filter(machine => machine.status === "Running" || machine.status === "Alarm").length;
  const stopped = machines.filter(machine => machine.status === "Stopped" || machine.status === "Offline").length;
  const stoppedCount = machines.filter(machine => machine.status === "Stopped").length;
  const offlineCount = machines.filter(machine => machine.status === "Offline").length;
  const openAlarmCount = alarms.filter(alarm => alarm.status !== "Resolved").length;
  const availability = machines.length ? Math.round(running / machines.length * 100) : 0;
  const snapshot = machines.find(machine => machine.id === state.machineId) || machines[0] || null;
  const staleAfterSeconds = Number(state.settings?.sampling?.staleAfterSeconds || 10);
  const snapshotAge = snapshot?.receivedAt ? Date.now() - new Date(snapshot.receivedAt).getTime() : Infinity;
  const snapshotFresh = snapshot && snapshot.status !== "Offline" && snapshot.gatewayStatus !== "Offline" && snapshotAge <= staleAfterSeconds * 1000;
  const readingState = snapshotFresh ? "live" : snapshot?.receivedAt ? "stale" : "offline";
  const cutoff = Date.now() - (rangeMilliseconds[state.dashboardRange] || rangeMilliseconds["1h"]);
  const rawHistory = snapshot ? (machineHistory.get(snapshot.id) || []).filter(reading => new Date(reading.observedAt).getTime() >= cutoff) : [];
  const config = parameterConfig[state.dashboardParameter] || parameterConfig.Pressure;
  const qualityField = qualityFields[state.dashboardParameter] || "pressure";
  const signalDisconnected = snapshot?.quality?.[qualityField] === "bad";
  const values = (signalDisconnected ? [] : rawHistory)
    .filter(reading => reading.quality?.[qualityField] !== "bad")
    .map(reading => Number(reading.metrics?.[config.field]))
    .filter(Number.isFinite);
  const current = values.at(-1) ?? null;
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const snapshotChart = snapshot ? dashboardProcessChart({ machine: snapshot, readings: rawHistory, parameter: state.dashboardParameter, readingState, thresholds: state.settings?.thresholds, samplingSeconds: Number(state.settings?.sampling?.intervalSeconds || 1), streamConnected: state.telemetryConnected }) : `<div class="dashboard-chart-empty">${icon("pulse")}<strong>No device selected</strong><span>Connect a device to begin live graphing.</span></div>`;
  const compactTickets = tickets.slice(0, 9).map((ticket, index) => {
    const machine = machines.find(item => item.id === ticket.machineId);
    const deviceName = deviceLabel(machine || { id: ticket.machineId, machineName: ticket.machineName });
    return `<button class="machine-compact" type="button" data-page="tickets" aria-label="${escapeHtml(`${formatTicketId(ticket.id)}: ${deviceName}, ${ticket.problem}, ${ticket.ticketStatus || "—"}`)}"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(formatTicketId(ticket.id))}</strong><small>${escapeHtml(deviceName)} · ${escapeHtml(ticket.problem)}</small></span><small>${escapeHtml(ticket.ticketStatus || "—")}</small></button>`;
  }).join("");
  const ticketContent = state.ticketsError
    ? `<div class="empty-state">${escapeHtml(state.ticketsError)}</div>`
    : compactTickets || `<div class="empty-state">${icon("machine")}No problem tickets available.</div>`;
  const liveLabel = readingState === "live"
    ? "Live"
    : snapshot?.receivedAt
      ? `Last update · ${telemetryUpdateTime(snapshot.receivedAt)}`
      : "No telemetry";
  const plantName = state.settings?.plant?.name || "Demo Spinning Plant";
  const snapshotTitle = readingState === "live" ? "Live operating snapshot" : snapshot?.receivedAt ? "Last Known Process State" : "Operating snapshot unavailable";
  const snapshotMeta = snapshot ? `${escapeHtml(deviceLabel(snapshot))}${readingState === "live" ? "" : ` · ${telemetryUpdateTime(snapshot.receivedAt)}`}` : "No connected device";
  const parameters = ["Flow", "Pressure", "Suction", "Temperature"].map(parameter => [parameter, parameter]);
  const ranges = [
    ["15m", "15 Min"], ["1h", "1 Hr"], ["6h", "6 Hr"], ["24h", "1 Day"], ["7d", "1 Week"],
    ["1mo", "1 Month"], ["3mo", "3 Months"], ["6mo", "6 Months"], ["1y", "1 Year"], ["custom", "Custom"]
  ];
  const customDate = state.dashboardRange === "custom" ? customDatePicker(state, "dashboard-custom-date", state.dashboardCustomDate, "Choose dashboard date") : "";
  const deviceOnline = snapshot ? connectionStatus(snapshot) === "Online" : false;
  const standardMonitorPanel = `<article class="panel dashboard-monitor-panel" id="dashboard-operating-trend"><header class="panel-head"><div class="panel-title"><h2>${snapshotTitle}</h2><p>${snapshotMeta}</p></div>${snapshot ? `<button class="panel-link" data-machine="${snapshot.id}">View device →</button>` : ""}</header><div class="panel-body"><div class="sensor-row">${sensorMini("Flow", snapshot ? fmt(snapshot.flow) : "—", "L/min", readingState, snapshot?.quality?.flow, deviceOnline, { parameter: "Flow", selected: state.dashboardParameter === "Flow" })}${sensorMini("Pressure", snapshot ? fmt(snapshot.pressure) : "—", "bar", readingState, snapshot?.quality?.pressure, deviceOnline, { parameter: "Pressure", selected: state.dashboardParameter === "Pressure" })}${sensorMini("Suction", snapshot ? fmt(snapshot.suction) : "—", "kPa", readingState, snapshot?.quality?.suction, deviceOnline, { parameter: "Suction", selected: state.dashboardParameter === "Suction" })}${sensorMini("Temperature", snapshot ? fmt(snapshot.temperature) : "—", "°C", readingState, snapshot?.quality?.temperature, deviceOnline, { parameter: "Temperature", selected: state.dashboardParameter === "Temperature" })}${sensorMini("Power Monitor", snapshot ? fmt(snapshot.powerMonitor?.activePowerW) : "—", "W", readingState, snapshot?.powerMonitor ? "good" : "bad", deviceOnline, { powerMonitor: snapshot?.id })}</div><div class="dashboard-chart-toolbar"><div class="dashboard-parameter"><label for="dashboard-parameter-trigger">Graph reading</label>${customSelect("dashboard-parameter", parameters, state.dashboardParameter, { className: "dashboard-parameter-select", label: "Graph reading" })}</div><div class="dashboard-parameter dashboard-time-range"><label for="dashboard-range-trigger">Time range</label>${timeRangeSelect("dashboard-range", ranges, state.dashboardRange)}${customDate}</div></div>${snapshotChart}<div class="dashboard-chart-stat-grid">${dashboardStat("Current", current, config.unit)}${dashboardStat("Minimum", minimum, config.unit)}${dashboardStat("Maximum", maximum, config.unit)}${dashboardStat("Average", average, config.unit)}</div></div></article>`;
  const monitorPanel = state.powerMonitorOpen && snapshot
    ? renderPowerMonitorPanel({ state, machine: snapshot, history: machineHistory.get(snapshot.id) || [] })
    : standardMonitorPanel;
  return `${pageHead("Plant overview", `Real-time compressor status across ${plantName}`, `<span class="updated-note ${readingState === "live" ? "live" : "not-live"}"><i class="pulse-dot"></i>${liveLabel}</span><button class="secondary-btn${state.dashboardRefreshing ? " refreshing" : ""}" id="refresh-dashboard" type="button" ${state.dashboardRefreshing ? "disabled aria-busy=\"true\"" : ""}>${icon("refresh")} ${state.dashboardRefreshing ? "Refreshing…" : "Refresh"}</button>`)}
    <section class="kpi-grid">${kpi("Total devices", machines.length, "Connected fleet", "machine", "teal", { filter: "all" })}${kpi("Running", running, `${availability}% available`, "gauge", "green", { filter: "running" })}${kpi("Stopped / offline", stopped, `${stoppedCount} stopped · ${offlineCount} offline`, "stop", "slate", { filter: "stopped" })}${kpi("Open alarms", openAlarmCount, openAlarmCount ? `${openAlarmCount} unresolved or acknowledged` : "No open alarms", "alarm", "red", { filter: "alarms", actionLabel: "View alarms" })}</section>
    <section class="dashboard-grid">${monitorPanel}
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Tickets</h2><p>Problem tickets</p></div><button class="panel-link" data-page="tickets">View all ${tickets.length} →</button></header><div class="panel-body"><div class="machine-list">${ticketContent}</div></div></article></section>`;
}
