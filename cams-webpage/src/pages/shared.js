const iconPaths = {
  air: '<path d="M4 8h10.5a3 3 0 1 0-2.7-4.3"/><path d="M3 12h14.5a2.5 2.5 0 1 1-2.2 3.7"/><path d="M4 16h6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  machine: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V4h5v3M3 12h18M7 16h.01M11 16h.01M17 15v2"/>',
  trend: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-7"/>',
  alarm: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  maintenance: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-8.6 8.6a2.1 2.1 0 0 0 3 3l8.6-8.6a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3a4 4 0 0 0-3.2 2Z"/>',
  report: '<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6M9 9h2"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3.1 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  energy: '<path d="m13 2-9 12h8l-1 8 9-12h-8z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>', chevronRight: '<path d="m9 18 6-6-6-6"/>', arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 6v5h-5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.2 2.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.1-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  gauge: '<path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 13 4-4M9 19h6"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>', pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>', filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h5v18h-5"/>', layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};

export const icon = (name, className = "") => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.info}</svg>`;

export function statusPill(status) {
  return `<span class="status-pill status-${String(status).toLowerCase()}">${status}</span>`;
}

export function fmt(value, unit = "") {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(value % 1 ? 1 : 0)}${unit ? ` ${unit}` : ""}`;
}

export function initials(name = "Plant Owner") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "PO";
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

export function relativeTime(value) {
  if (!value) return "No telemetry";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return "Unknown";
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function pageHead(title, subtitle, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
}

export const parameterConfig = {
  Pressure: { field: "pressureBar", unit: "bar", fallbackSpan: 1.2 },
  Flow: { field: "flowLpm", unit: "L/min", fallbackSpan: 10 },
  Suction: { field: "suctionKpa", unit: "kPa", fallbackSpan: 1.2 }
};

export function historyFor(machineHistory, machineId, parameter) {
  const config = parameterConfig[parameter] || parameterConfig.Pressure;
  return (machineHistory.get(machineId) || [])
    .map(reading => ({ value: Number(reading.metrics?.[config.field]), observedAt: reading.observedAt }))
    .filter(point => Number.isFinite(point.value));
}

export function chartSvg(parameter = "Pressure", readings = []) {
  const config = parameterConfig[parameter] || parameterConfig.Pressure;
  if (!readings.length) return `<div class="empty-state">${icon("pulse")}Waiting for live telemetry history.</div>`;
  const pointsToPlot = readings.length === 1 ? [readings[0], readings[0]] : readings;
  const values = pointsToPlot.map(point => point.value);
  const actualMin = Math.min(...values);
  const actualMax = Math.max(...values);
  const padding = Math.max((actualMax - actualMin) * 0.15, config.fallbackSpan * 0.08);
  const min = actualMin - padding;
  const max = actualMax + padding;
  const x = index => 48 + index * (632 / (values.length - 1));
  const y = value => 18 + ((max - value) / (max - min)) * 178;
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const areaPoints = `48,196 ${points} 680,196`;
  const grid = [0, 1, 2, 3, 4].map(index => {
    const gridY = 18 + index * 44.5;
    const label = (max - index * ((max - min) / 4)).toFixed(Math.abs(max) < 10 ? 1 : 0);
    return `<line class="chart-grid-line" x1="48" y1="${gridY}" x2="680" y2="${gridY}"/><text class="chart-label" x="3" y="${gridY + 4}">${label}</text>`;
  }).join("");
  const timeAt = ratio => {
    const index = Math.min(pointsToPlot.length - 1, Math.round((pointsToPlot.length - 1) * ratio));
    const value = pointsToPlot[index].observedAt;
    return value ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  };
  const times = [0, .25, .5, .75, 1].map((ratio, index) => `<text class="chart-label" x="${48 + 632 * ratio}" y="220" text-anchor="${index === 0 ? "start" : index === 4 ? "end" : "middle"}">${timeAt(ratio)}</text>`).join("");
  const lastX = x(values.length - 1);
  const lastY = y(values.at(-1));
  return `<svg viewBox="0 0 700 228" preserveAspectRatio="none" role="img" aria-label="${parameter} trend chart"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#42b7a4" stop-opacity=".34"/><stop offset="100%" stop-color="#42b7a4" stop-opacity=".02"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${areaPoints}"/><polyline class="chart-line" points="${points}"/><circle class="chart-point" cx="${lastX}" cy="${lastY}" r="4"/>${times}<text class="chart-label" x="3" y="12">${config.unit}</text></svg>`;
}

export function kpi(label, value, note, iconName, tone) {
  return `<article class="kpi-card"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon ${tone}">${icon(iconName)}</span></div><div class="kpi-value"><strong>${value}</strong><span>${note}</span></div></article>`;
}

export function phasePage(title, tag, headline, description, features) {
  return `${pageHead(title, "Preview of the planned CAMS capability")}
    <section class="placeholder-layout"><article class="panel phase-card"><span class="phase-tag">${tag}</span><h2>${headline}</h2><p>${description}</p></article><article class="panel"><header class="panel-head"><div class="panel-title"><h2>Planned capabilities</h2><p>For owner discussion and scope review</p></div></header><div class="feature-list">${features.map(([iconName, name, copy]) => `<div class="feature-item">${icon(iconName)}<div><strong>${name}</strong><span>${copy}</span></div></div>`).join("")}</div></article></section>`;
}
