import { connectionStatus, deviceLabel, escapeHtml, icon, timeRangeSelect } from "./shared.js";

const metrics = [
  ["Voltage", "voltageV", "V"], ["Current", "currentA", "A"],
  ["Active Power", "activePowerW", "W"], ["Power Factor", "powerFactor", ""],
  ["Frequency", "frequencyHz", "Hz"], ["Apparent Power", "apparentPowerVa", "VA"],
  ["Reactive Power", "reactivePowerVar", "var"], ["Power (Total)", "powerTotalKwh", "kWh"]
];
const ranges = [
  ["15m", "15 Min"], ["1h", "1 Hr"], ["6h", "6 Hr"], ["24h", "1 Day"],
  ["7d", "1 Week"], ["1mo", "1 Month"], ["3mo", "3 Months"], ["6mo", "6 Months"], ["1y", "1 Year"]
];
const rangeMilliseconds = {
  "15m": 15 * 60e3, "1h": 60 * 60e3, "6h": 6 * 60 * 60e3, "24h": 24 * 60 * 60e3,
  "7d": 7 * 24 * 60 * 60e3, "1mo": 30 * 24 * 60 * 60e3, "3mo": 90 * 24 * 60 * 60e3,
  "6mo": 180 * 24 * 60 * 60e3, "1y": 365 * 24 * 60 * 60e3
};

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function formatted(value) { return value === null ? "No signal" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
function stat(label, value, unit) {
  return `<div class="dashboard-chart-stat"><span>${label}</span><strong>${value === null ? "—" : value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} <small>${escapeHtml(unit)}</small></strong></div>`;
}

function powerGraph(samples, label, unit, live) {
  if (!samples.length) return `<div class="dashboard-chart-empty power-chart-empty">${icon("pulse")}<strong>No ${escapeHtml(label.toLowerCase())} readings in this time window</strong><span>Power Monitor graph will appear when valid telemetry is received.</span></div>`;
  const width = 920, height = 270;
  const plot = { left: 58, right: 20, top: 25, bottom: 43 };
  const plotWidth = width - plot.left - plot.right, plotHeight = height - plot.top - plot.bottom;
  const values = samples.map(sample => sample.value);
  const low = Math.min(...values), high = Math.max(...values);
  const span = Math.max(high - low, Math.abs(high || low) * .1, 1);
  const minimum = low - span * .15, maximum = high + span * .15;
  const x = index => samples.length === 1 ? plot.left + plotWidth / 2 : plot.left + index / (samples.length - 1) * plotWidth;
  const y = value => plot.top + (maximum - value) / (maximum - minimum) * plotHeight;
  const points = samples.map((sample, index) => `${x(index).toFixed(2)},${y(sample.value).toFixed(2)}`).join(" ");
  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4, gridY = plot.top + ratio * plotHeight;
    const gridValue = maximum - ratio * (maximum - minimum);
    return `<line class="process-grid-line" x1="${plot.left}" y1="${gridY}" x2="${width - plot.right}" y2="${gridY}"/><text class="process-axis-label" x="${plot.left - 11}" y="${gridY + 4}" text-anchor="end">${gridValue.toFixed(Math.abs(gridValue) < 10 ? 1 : 0)}</text>`;
  }).join("");
  const labelIndexes = [...new Set([0, .25, .5, .75, 1].map(ratio => Math.round((samples.length - 1) * ratio)))];
  const timeLabels = labelIndexes.map(index => `<text class="process-axis-label" x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === samples.length - 1 ? "end" : "middle"}">${samples[index].time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</text>`).join("");
  const nodes = samples.map((sample, index) => `<circle class="process-node${index === samples.length - 1 ? " is-latest" : ""}" cx="${x(index).toFixed(2)}" cy="${y(sample.value).toFixed(2)}" r="${index === samples.length - 1 ? 5.5 : 3.5}"><title>${escapeHtml(`${label}: ${formatted(sample.value)} ${unit}`)}</title></circle>`).join("");
  return `<div class="connected-process-chart power-process-chart"><div class="process-chart-status"><span><i class="pulse-dot"></i>${live ? "Live" : "Historical"}</span><span>Power Monitor</span><small>${escapeHtml(label)} history</small></div><div class="process-chart-stage"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)} power monitor graph">${grid}<polyline class="process-line" points="${points}"/>${nodes}${timeLabels}<text class="process-unit-label" x="${plot.left}" y="14">${escapeHtml(unit)}</text></svg></div></div>`;
}

export function renderPowerMonitorPanel({ state, machine, history = [] }) {
  const selected = metrics.find(([, field]) => field === state.powerMonitorMetric) || metrics[0];
  const [selectedLabel, selectedField, selectedUnit] = selected;
  const cutoff = Date.now() - (rangeMilliseconds[state.powerMonitorRange] || rangeMilliseconds["1h"]);
  const samples = history.map(reading => ({ value: number(reading.metrics?.powerMonitor?.[selectedField]), time: new Date(reading.observedAt) }))
    .filter(sample => sample.value !== null && !Number.isNaN(sample.time.getTime()) && sample.time.getTime() >= cutoff);
  const values = samples.map(sample => sample.value);
  const current = values.at(-1) ?? null;
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const live = connectionStatus(machine) === "Online";
  const cards = metrics.map(([label, field, unit]) => {
    const value = number(machine.powerMonitor?.[field]), active = field === selectedField;
    return `<button class="power-reading-card ${active ? "selected" : ""} ${value === null ? "no-signal" : ""}" type="button" data-power-metric="${field}" aria-pressed="${active}"><div class="power-reading-head"><span>${escapeHtml(label)}</span><span class="sensor-state ${live && value !== null ? "live" : "not-live"}" aria-label="${live && value !== null ? "Live reading" : "No signal"}"><i></i></span></div><strong>${formatted(value)}${value !== null && unit ? ` <small>${escapeHtml(unit)}</small>` : ""}</strong></button>`;
  }).join("");
  return `<article class="panel dashboard-monitor-panel power-monitor-workspace"><header class="panel-head"><div class="panel-title"><h2>Power Monitor</h2><p>${escapeHtml(deviceLabel(machine))} · Select a measurement to update the graph</p></div><button class="secondary-btn" id="power-monitor-back" type="button">${icon("arrowLeft")} Back</button></header><div class="panel-body"><div class="power-reading-grid">${cards}</div><div class="power-monitor-toolbar"><div><span>Selected reading</span><strong>${escapeHtml(selectedLabel)}</strong></div><div class="dashboard-parameter dashboard-time-range"><label for="power-monitor-range-trigger">Time range</label>${timeRangeSelect("power-monitor-range", ranges, state.powerMonitorRange)}</div></div>${powerGraph(samples, selectedLabel, selectedUnit, live)}<div class="dashboard-chart-stat-grid">${stat("Current", current, selectedUnit)}${stat("Minimum", minimum, selectedUnit)}${stat("Maximum", maximum, selectedUnit)}${stat("Average", average, selectedUnit)}</div></div></article>`;
}
