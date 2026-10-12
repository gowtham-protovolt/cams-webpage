import { escapeHtml, historyFor, icon, pageHead, parameterConfig } from "./shared.js";

const operatingRanges = {
  Pressure: { minimum: 6.8, maximum: 7.5 },
  Flow: { minimum: 22, maximum: 28 },
  Suction: { minimum: 0.6, maximum: 1.8 }
};

const qualityFields = { Pressure: "pressure", Flow: "flow", Suction: "suction" };

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const control1X = current.x + (next.x - before.x) / 6;
    const control1Y = current.y + (next.y - before.y) / 6;
    const control2X = next.x - (after.x - current.x) / 6;
    const control2Y = next.y - (after.y - current.y) / 6;
    path += ` C ${control1X.toFixed(2)} ${control1Y.toFixed(2)}, ${control2X.toFixed(2)} ${control2Y.toFixed(2)}, ${next.x} ${next.y}`;
  }
  return path;
}

function readingValue(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

export function connectedProcessChart(machine, readings, parameter) {
  const config = parameterConfig[parameter] || parameterConfig.Pressure;
  const range = operatingRanges[parameter] || operatingRanges.Pressure;
  const normalizedSamples = readings
    .map(reading => ({ reading, value: Number(reading.metrics?.[config.field]), time: new Date(reading.observedAt) }))
    .filter(sample => Number.isFinite(sample.value) && !Number.isNaN(sample.time.getTime()));

  const samples = normalizedSamples.length <= 160 ? normalizedSamples : Array.from({ length: 160 }, (_, index) => {
    const sourceIndex = Math.round(index * (normalizedSamples.length - 1) / 159);
    return normalizedSamples[sourceIndex];
  });

  if (!samples.length) {
    return `<div class="process-chart-empty">${icon("pulse")}<strong>Waiting for live telemetry history</strong><span>The connected trace will begin when the ESP32 publishes readings.</span></div>`;
  }

  const width = 920;
  const height = 300;
  const plot = { left: 62, right: 22, top: 24, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const values = samples.map(sample => sample.value);
  const domainMinimum = Math.min(...values, range.minimum);
  const domainMaximum = Math.max(...values, range.maximum);
  const span = Math.max(domainMaximum - domainMinimum, config.fallbackSpan);
  const minimum = domainMinimum - span * 0.16;
  const maximum = domainMaximum + span * 0.16;
  const x = index => samples.length === 1 ? plot.left + plotWidth / 2 : plot.left + (index / (samples.length - 1)) * plotWidth;
  const y = value => plot.top + ((maximum - value) / (maximum - minimum)) * plotHeight;
  const points = samples.map((sample, index) => ({ x: Number(x(index).toFixed(2)), y: Number(y(sample.value).toFixed(2)) }));
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L ${points.at(-1).x} ${plot.top + plotHeight} L ${points[0].x} ${plot.top + plotHeight} Z`;
  const rangeTop = Math.min(y(range.maximum), y(range.minimum));
  const rangeHeight = Math.abs(y(range.minimum) - y(range.maximum));

  const horizontalGrid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const gridY = plot.top + ratio * plotHeight;
    const label = maximum - ratio * (maximum - minimum);
    return `<line class="process-grid-line" x1="${plot.left}" y1="${gridY}" x2="${width - plot.right}" y2="${gridY}"/><text class="process-axis-label" x="${plot.left - 12}" y="${gridY + 4}" text-anchor="end">${label.toFixed(Math.abs(label) < 10 ? 1 : 0)}</text>`;
  }).join("");

  const labelIndexes = [...new Set([0, .25, .5, .75, 1].map(ratio => Math.round((samples.length - 1) * ratio)))];
  const timeLabels = labelIndexes.map(index => `<text class="process-axis-label" x="${x(index)}" y="${height - 14}" text-anchor="${index === 0 ? "start" : index === samples.length - 1 ? "end" : "middle"}">${samples[index].time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</text>`).join("");

  const nodeInterval = Math.max(1, Math.ceil(samples.length / 48));
  const nodes = samples.map((sample, index) => {
    if (index % nodeInterval !== 0 && index !== samples.length - 1) return "";
    const metrics = sample.reading.metrics || {};
    const quality = sample.reading.quality?.[qualityFields[parameter]] || "good";
    const latestClass = index === samples.length - 1 ? " is-latest" : "";
    const accessibleTime = sample.time.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });
    return `<circle class="process-node${latestClass}" cx="${points[index].x}" cy="${points[index].y}" r="${index === samples.length - 1 ? 5.5 : 4}" tabindex="0" role="button" aria-label="${escapeHtml(`${parameter} ${readingValue(sample.value)} ${config.unit} at ${accessibleTime}`)}" data-observed-at="${escapeHtml(sample.reading.observedAt)}" data-pressure="${readingValue(metrics.pressureBar)}" data-flow="${readingValue(metrics.flowLpm)}" data-suction="${readingValue(metrics.suctionKpa)}" data-status="${escapeHtml(sample.reading.status || machine.status || "Unknown")}" data-quality="${escapeHtml(quality)}"/>`;
  }).join("");

  return `<div class="connected-process-chart" id="connected-process-chart">
    <div class="process-chart-status"><span><i class="pulse-dot"></i>LIVE</span><span>1 SEC sampling</span><span>MQTT connected</span><small>Hover or tap any node</small></div>
    <div class="process-chart-stage">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Interactive ${escapeHtml(parameter)} connected process trace">
        <defs><linearGradient id="process-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#35aa99" stop-opacity=".18"/><stop offset="100%" stop-color="#35aa99" stop-opacity=".015"/></linearGradient></defs>
        <rect class="process-normal-band" x="${plot.left}" y="${rangeTop}" width="${plotWidth}" height="${Math.max(2, rangeHeight)}" rx="5"/>
        ${horizontalGrid}
        <line class="process-limit-line" x1="${plot.left}" y1="${y(range.maximum)}" x2="${width - plot.right}" y2="${y(range.maximum)}"/>
        <path class="process-area" d="${areaPath}"/>
        <path class="process-line-shadow" d="${linePath}"/>
        <path class="process-line" d="${linePath}"/>
        <line class="process-crosshair" id="process-crosshair" x1="0" y1="${plot.top}" x2="0" y2="${plot.top + plotHeight}"/>
        ${nodes}${timeLabels}
        <text class="process-unit-label" x="${plot.left}" y="14">${escapeHtml(config.unit)}</text>
        <text class="process-band-label" x="${plot.left + 10}" y="${rangeTop + 17}">Normal operating range</text>
      </svg>
      <div class="process-tooltip" id="process-tooltip" role="status" aria-live="polite">
        <div class="process-tooltip-time" data-tooltip-time>—</div>
        <strong>${escapeHtml(machine.id)}</strong>
        <dl><div><dt>Pressure</dt><dd><span data-tooltip-pressure>—</span> bar</dd></div><div><dt>Flow</dt><dd><span data-tooltip-flow>—</span> L/min</dd></div><div><dt>Suction</dt><dd><span data-tooltip-suction>—</span> kPa</dd></div></dl>
        <div class="process-tooltip-meta"><span data-tooltip-status>—</span><span data-tooltip-quality>—</span></div>
      </div>
    </div>
  </div>`;
}

export function trendStat(label, value, unit) {
  return `<div class="trend-stat"><span>${label}</span><strong>${value === null ? "—" : Number(value).toFixed(1)} <small>${unit}</small></strong></div>`;
}

export function renderTrendsPage({ state, machines, machineHistory }) {
  const machine = machines.find(item => item.id === state.trendMachine) || machines[0];
  if (!machine) return `${pageHead("Trends & analytics", "No machine telemetry is available")}<div class="empty-state">${icon("trend")}Publish telemetry to begin charting.</div>`;
  const history = historyFor(machineHistory, machine.id, state.trendParameter);
  const values = history.map(point => point.value);
  const current = values.at(-1) ?? null;
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const unit = (parameterConfig[state.trendParameter] || parameterConfig.Pressure).unit;
  const rawReadings = machineHistory.get(machine.id) || [];
  const selects = machines.map(item => `<option value="${item.id}" ${item.id === state.trendMachine ? "selected" : ""}>${item.id} · ${item.name}</option>`).join("");
  const parameters = ["Pressure", "Flow", "Suction"].map(parameter => `<option value="${parameter}" ${parameter === state.trendParameter ? "selected" : ""}>${parameter}</option>`).join("");
  const ranges = ["15m", "1h", "6h", "24h", "7d", "Custom"].map(range => `<button class="${state.trendRange === range ? "active" : ""}" data-range="${range}">${range}</button>`).join("");
  return `${pageHead("Trends & analytics", "Explore live and historical operating parameters", `<button class="secondary-btn" id="export-trend-pdf">${icon("report")} PDF</button><button class="secondary-btn" id="export-trend-xlsx">${icon("download")} Excel</button>`)}
    <section class="trend-controls"><div class="control-group grow"><label>Machine</label><div class="select-wrap"><select id="trend-machine">${selects}</select>${icon("chevronDown")}</div></div><div class="control-group"><label>Parameter</label><div class="select-wrap"><select id="trend-parameter">${parameters}</select>${icon("chevronDown")}</div></div><div class="control-group grow"><label>Time range</label><div class="range-pills">${ranges}</div></div></section>
    <article class="panel"><header class="panel-head"><div class="panel-title"><h2>${state.trendParameter} history</h2><p>${machine.id} · ${state.trendRange === "Custom" ? "custom range preview" : `last ${state.trendRange}`}</p></div><span class="updated-note"><i class="pulse-dot"></i>Live sampling</span></header>
      <div class="panel-body process-panel-body">${connectedProcessChart(machine, rawReadings, state.trendParameter)}</div><div class="trend-stat-grid">${trendStat("Current", current, unit)}${trendStat("Minimum", minimum, unit)}${trendStat("Maximum", maximum, unit)}${trendStat("Average", average, unit)}</div>
    </article>`;
}
