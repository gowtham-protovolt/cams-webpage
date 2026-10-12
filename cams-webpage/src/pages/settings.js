import { pageHead } from "./shared.js";

const defaults = {
  plant: { name: "Demo Spinning Plant", area: "Spinning", shift: "General" },
  thresholds: { pressureBar: { minimum: 6.8, maximum: 7.5 }, flowLpm: { minimum: 22, maximum: 28 }, suctionKpa: { minimum: 0.6, maximum: 1.8 } },
  sampling: { intervalSeconds: 1, staleAfterSeconds: 10 }, retentionDays: 7,
  notifications: { browserEnabled: true, critical: true, warning: true, info: false }
};

function field(name, label, value, options = {}) {
  return `<label class="settings-field"><span>${label}</span><div class="settings-input-wrap"><input name="${name}" type="${options.type || "text"}" value="${value ?? ""}" ${options.required ? "required" : ""} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.step ? `step="${options.step}"` : ""}><small>${options.unit || ""}</small></div></label>`;
}

function thresholdRow(key, title, copy, range, unit, bounds) {
  return `<div class="threshold-row"><div><strong>${title}</strong><span>${copy}</span></div>${field(`thresholds.${key}.minimum`, "Minimum", range.minimum, { type: "number", step: "0.01", unit, ...bounds })}${field(`thresholds.${key}.maximum`, "Maximum", range.maximum, { type: "number", step: "0.01", unit, ...bounds })}</div>`;
}

function check(name, title, copy, checked) {
  return `<label class="preference-row"><span><strong>${title}</strong><small>${copy}</small></span><input name="${name}" type="checkbox" ${checked ? "checked" : ""}><i aria-hidden="true"></i></label>`;
}

export function renderSettingsPage({ state }) {
  const settings = state.settings || defaults;
  const disabled = !state.currentUser?.isOwner || state.settingsSaving ? "disabled" : "";
  const action = state.currentUser?.isOwner ? `<button class="primary-btn" id="save-settings" type="submit" form="settings-form" ${disabled}>${state.settingsSaving ? "Saving…" : "Save changes"}</button>` : "";
  return `${pageHead("Settings", "Configure plant identity, operating limits and monitoring preferences", action)}
    ${state.settingsError ? `<div class="inline-error">${state.settingsError}</div>` : ""}
    <form id="settings-form" class="settings-layout">
      <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Plant</span><h2>Plant profile</h2><p>Information shown across the CAMS dashboard and reports.</p></div><span class="settings-saved-state">${settings.updatedAt ? `Last saved ${new Date(settings.updatedAt).toLocaleString("en-IN")}` : "Using system defaults"}</span></div><div class="settings-fields three">${field("plant.name", "Plant name", settings.plant.name, { required: true })}${field("plant.area", "Area / department", settings.plant.area)}${field("plant.shift", "Default shift", settings.plant.shift)}</div></section>
      <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Monitoring</span><h2>Operating limits</h2><p>Readings outside these ranges affect live status, health and alarms.</p></div><span class="settings-badge">Applied live</span></div><div class="threshold-list">${thresholdRow("pressureBar", "Pressure", "Safe discharge pressure range", settings.thresholds.pressureBar, "bar", { min: -5, max: 100 })}${thresholdRow("flowLpm", "Flow", "Expected air-flow range", settings.thresholds.flowLpm, "L/min", { min: -10000, max: 10000 })}${thresholdRow("suctionKpa", "Suction", "Safe suction pressure range", settings.thresholds.suctionKpa, "kPa", { min: -1000, max: 1000 })}</div></section>
      <div class="settings-split">
        <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Data</span><h2>Sampling & retention</h2><p>Control dashboard refresh, offline detection and stored history.</p></div></div><div class="settings-fields">${field("sampling.intervalSeconds", "Dashboard refresh", settings.sampling.intervalSeconds, { type: "number", min: 1, max: 60, step: "1", unit: "sec" })}${field("sampling.staleAfterSeconds", "Offline timeout", settings.sampling.staleAfterSeconds, { type: "number", min: 3, max: 600, step: "1", unit: "sec" })}${field("retentionDays", "Telemetry retention", settings.retentionDays, { type: "number", min: 1, max: 3650, step: "1", unit: "days" })}</div></section>
        <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Alerts</span><h2>Notification preferences</h2><p>Select which live alarms may create browser notifications.</p></div></div><div class="preference-list">${check("notifications.browserEnabled", "Browser notifications", "Allow CAMS alerts on this browser", settings.notifications.browserEnabled)}${check("notifications.critical", "Critical alarms", "Immediate safety and connectivity issues", settings.notifications.critical)}${check("notifications.warning", "Warning alarms", "Operating readings approaching limits", settings.notifications.warning)}${check("notifications.info", "Information events", "Lower-priority operating updates", settings.notifications.info)}</div></section>
      </div>
      ${!state.currentUser?.isOwner ? '<p class="settings-readonly">Settings are read-only. An owner account is required to make changes.</p>' : ""}
    </form>`;
}
