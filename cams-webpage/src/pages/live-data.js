import { escapeHtml, icon, pageHead, relativeTime } from "./shared.js";

function treeValue(label, value) {
  const display = value === null || value === undefined ? "—" : `${value}`;
  return `<div class="data-tree-value"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></div>`;
}

export function renderLiveDataPage({ state, machines, machineHistory }) {
  const machine = machines.find(item => item.id === state.machineId) || machines[0];
  const readings = machine ? [...(machineHistory.get(machine.id) || [])].slice(-100).reverse() : [];
  const byDate = new Map();
  for (const reading of readings) {
    const observed = new Date(reading.observedAt);
    if (Number.isNaN(observed.getTime())) continue;
    const date = observed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ reading, observed });
  }
  const dates = [...byDate].map(([date, entries], dateIndex) => `<details class="data-tree-node data-tree-date" ${dateIndex === 0 ? "open" : ""}><summary>${icon("calendar")}<strong>${date}</strong><span>${entries.length} sample${entries.length === 1 ? "" : "s"}</span></summary><div class="data-tree-children">${entries.map(({ reading, observed }, sampleIndex) => {
    const time = observed.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).replaceAll(":", "-");
    return `<details class="data-tree-node data-tree-sample" ${dateIndex === 0 && sampleIndex === 0 ? "open" : ""}><summary>${icon("clock")}<strong>${time}</strong><span>${escapeHtml(reading.status || "unknown")}</span></summary><div class="data-tree-values">${treeValue("flow", reading.metrics?.flowLpm)}${treeValue("pressure", reading.metrics?.pressureBar)}${treeValue("suction", reading.metrics?.suctionKpa)}</div></details>`;
  }).join("")}</div></details>`).join("");
  return `${pageHead("Live sensor data", "Stored MQTT readings from the authenticated ESP32-S3 gateway", `<span class="updated-note"><i class="pulse-dot"></i>${state.lastTelemetryAt ? `Last sample · ${relativeTime(state.lastTelemetryAt)}` : "Waiting for ESP32"}</span><button class="secondary-btn" id="refresh-live-data">${icon("refresh")} Refresh</button>`)}
    <section class="panel data-tree-panel"><div class="data-tree-root"><div class="data-tree-root-label">${icon("database")}<strong>CAMS</strong><span>MongoDB telemetry</span></div><div class="data-tree-children"><details class="data-tree-node data-tree-device" open><summary>${icon("machine")}<strong>${escapeHtml(machine?.id || state.machineId)}</strong><span>${machine ? machine.status : "Waiting"}</span></summary><div class="data-tree-children">${dates || `<div class="empty-state">${icon("pulse")}No sensor values received. Connect PLC → ESP32-S3 RS485 → MQTT.</div>`}</div></details></div></div></section>`;
}
