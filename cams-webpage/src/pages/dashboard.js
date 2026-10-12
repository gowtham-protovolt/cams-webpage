import { escapeHtml, fmt, icon, kpi, pageHead, parameterConfig, relativeTime, statusPill } from "./shared.js";

const rangeMilliseconds = { "15m": 15 * 60e3, "1h": 60 * 60e3, "6h": 6 * 60 * 60e3, "24h": 24 * 60 * 60e3 };
const thresholdKeys = { Pressure: "pressureBar", Flow: "flowLpm", Suction: "suctionKpa" };
const qualityFields = { Pressure: "pressure", Flow: "flow", Suction: "suction" };
const defaultRanges = {
  Pressure: { minimum: 6.8, maximum: 7.5 }, Flow: { minimum: 22, maximum: 28 }, Suction: { minimum: 0.6, maximum: 1.8 }
};

function sensorMini(label, value, unit, readingState) {
  const isLive = readingState === "live";
  const statusLabel = isLive ? "Receiving live data" : "Live data unavailable; showing the last known reading";
  return `<div class="sensor-mini ${isLive ? "live" : "not-live"}"><div class="sensor-mini-head"><span>${label}</span><span class="sensor-state ${isLive ? "live" : "not-live"}" role="img" aria-label="${statusLabel}" title="${statusLabel}"><i></i></span></div><strong>${value}</strong><small>${unit}</small></div>`;
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
  const normalized = readings.map(reading => ({ reading, value: Number(reading.metrics?.[config.field]), time: new Date(reading.observedAt) }))
    .filter(sample => Number.isFinite(sample.value) && !Number.isNaN(sample.time.getTime()));
  const samples = normalized.length <= 120 ? normalized : Array.from({ length: 120 }, (_, index) => normalized[Math.round(index * (normalized.length - 1) / 119)]);
  if (!samples.length) return `<div class="dashboard-chart-empty">${icon("pulse")}<strong>No ${escapeHtml(parameter.toLowerCase())} readings in this time window</strong><span>Select a longer range or wait for new MQTT telemetry.</span></div>`;

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
  return `<div class="connected-process-chart dashboard-process-chart ${readingState}" id="connected-process-chart"><div class="process-chart-status"><span><i class="pulse-dot"></i>${statusLabel}</span><span>${samplingSeconds} sec target</span><span>${streamConnected ? "Stream connected" : "Stream reconnecting"}</span><small>Hover or tap any point</small></div><div class="process-chart-stage"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Interactive ${escapeHtml(parameter)} dashboard trace"><defs><linearGradient id="dashboard-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#35aa99" stop-opacity=".2"/><stop offset="100%" stop-color="#35aa99" stop-opacity=".015"/></linearGradient></defs><rect class="process-normal-band" x="${plot.left}" y="${rangeTop}" width="${plotWidth}" height="${Math.max(2, rangeHeight)}" rx="5"/>${horizontalGrid}<line class="process-limit-line" x1="${plot.left}" y1="${y(configuredRange.maximum)}" x2="${width - plot.right}" y2="${y(configuredRange.maximum)}"/><path class="dashboard-process-area" d="${areaPath}"/><path class="process-line-shadow" d="${linePath}"/><path class="process-line" d="${linePath}"/><line class="process-crosshair" id="process-crosshair" x1="0" y1="${plot.top}" x2="0" y2="${plot.top + plotHeight}"/>${nodes}${timeLabels}<text class="process-unit-label" x="${plot.left}" y="14">${escapeHtml(config.unit)}</text><text class="process-band-label" x="${plot.left + 10}" y="${rangeTop + 17}">Configured operating range</text></svg><div class="process-tooltip" id="process-tooltip" role="status" aria-live="polite"><div class="process-tooltip-time" data-tooltip-time>—</div><strong>${escapeHtml(machine.id)}</strong><dl><div><dt>Pressure</dt><dd><span data-tooltip-pressure>—</span> bar</dd></div><div><dt>Flow</dt><dd><span data-tooltip-flow>—</span> L/min</dd></div><div><dt>Suction</dt><dd><span data-tooltip-suction>—</span> kPa</dd></div></dl><div class="process-tooltip-meta"><span data-tooltip-status>—</span><span data-tooltip-quality>—</span></div></div></div></div>`;
}

export function renderDashboardPage({ state, machines, machineHistory, alarms }) {
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
  const values = rawHistory.map(reading => Number(reading.metrics?.[config.field])).filter(Number.isFinite);
  const current = values.at(-1) ?? null;
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const snapshotChart = snapshot ? dashboardProcessChart({ machine: snapshot, readings: rawHistory, parameter: state.dashboardParameter, readingState, thresholds: state.settings?.thresholds, samplingSeconds: Number(state.settings?.sampling?.intervalSeconds || 1), streamConnected: state.telemetryConnected }) : `<div class="dashboard-chart-empty">${icon("pulse")}<strong>No machine selected</strong><span>Connect a machine to begin live graphing.</span></div>`;
  const compactMachines = machines.slice(0, 6).map((machine, index) => `<button class="machine-compact" data-machine="${machine.id}"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${machine.id}</strong><small>${machine.zone}</small></span>${statusPill(machine.status)}</button>`).join("");
  const alarmItems = alarms.slice(0, 4).map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon(alarm.severity === "Critical" ? "alarm" : "info")}</span><div><strong>${alarm.machine} · ${alarm.parameter}</strong><p>${alarm.message}</p></div><div class="alarm-time"><strong>${alarm.time}</strong><span>${alarm.date}</span></div></div>`).join("");
  const liveLabel = readingState === "live" ? `Live · ${relativeTime(snapshot.receivedAt)}` : snapshot?.receivedAt ? `Last update · ${relativeTime(snapshot.receivedAt)}` : "No telemetry received for selected machine";
  const plantName = state.settings?.plant?.name || "Demo Spinning Plant";
  const snapshotTitle = readingState === "live" ? "Live operating snapshot" : snapshot?.receivedAt ? "Last known operating snapshot" : "Operating snapshot unavailable";
  const snapshotMeta = snapshot ? `${snapshot.id} · ${snapshot.name}${readingState === "live" ? "" : ` · ${relativeTime(snapshot.receivedAt)}`}` : "No connected machine";
  const parameters = ["Pressure", "Flow", "Suction"].map(parameter => `<option value="${parameter}" ${parameter === state.dashboardParameter ? "selected" : ""}>${parameter}</option>`).join("");
  const ranges = ["15m", "1h", "6h", "24h"].map(range => `<button class="${state.dashboardRange === range ? "active" : ""}" data-dashboard-range="${range}">${range}</button>`).join("");
  return `${pageHead("Plant overview", `Real-time compressor status across ${plantName}`, `<span class="updated-note ${readingState === "live" ? "live" : "not-live"}"><i class="pulse-dot"></i>${liveLabel}</span><button class="secondary-btn" id="refresh-dashboard">${icon("refresh")} Refresh</button>`)}
    <section class="kpi-grid">${kpi("Total machines", machines.length, "Connected fleet", "machine", "teal")}${kpi("Running", running, `${availability}% available`, "gauge", "green")}${kpi("Stopped / offline", stopped, `${stoppedCount} stopped · ${offlineCount} offline`, "stop", "slate")}${kpi("Open alarms", openAlarmCount, openAlarmCount ? `${openAlarmCount} unresolved or acknowledged` : "No open alarms", "alarm", "red")}</section>
    <section class="dashboard-grid"><article class="panel dashboard-monitor-panel"><header class="panel-head"><div class="panel-title"><h2>${snapshotTitle}</h2><p>${snapshotMeta}</p></div>${snapshot ? `<button class="panel-link" data-machine="${snapshot.id}">View machine →</button>` : ""}</header><div class="panel-body"><div class="sensor-row">${sensorMini("Flow", snapshot ? fmt(snapshot.flow) : "—", "L/min", readingState)}${sensorMini("Pressure", snapshot ? fmt(snapshot.pressure) : "—", "bar", readingState)}${sensorMini("Suction", snapshot ? fmt(snapshot.suction) : "—", "kPa", readingState)}</div><div class="dashboard-chart-toolbar"><div class="dashboard-parameter"><label for="dashboard-parameter">Graph reading</label><div class="select-wrap"><select id="dashboard-parameter">${parameters}</select>${icon("chevronDown")}</div></div><div class="segment-control">${ranges}</div></div>${snapshotChart}<div class="dashboard-chart-stat-grid">${dashboardStat("Current", current, config.unit)}${dashboardStat("Minimum", minimum, config.unit)}${dashboardStat("Maximum", maximum, config.unit)}${dashboardStat("Average", average, config.unit)}</div></div></article>
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>Fleet status at a glance</p></div><button class="panel-link" data-page="machines">View all ${machines.length} →</button></header><div class="panel-body"><div class="machine-list">${compactMachines || `<div class="empty-state">${icon("machine")}No machines are registered.</div>`}</div></div></article></section>
    <section class="panel"><header class="panel-head"><div class="panel-title"><h2>Recent alarms & events</h2><p>Latest operating exceptions from all machines</p></div><button class="panel-link" data-page="alarms">Open alarm centre →</button></header><div class="alarm-list">${alarmItems || `<div class="empty-state">${icon("check")}No alarm events recorded.</div>`}</div></section>`;
}
