import { customSelect, pageHead } from "./shared.js";

const defaults = {
  plant: { name: "Demo Spinning Plant", area: "Spinning", shift: "General Shift" },
  thresholds: { pressureBar: { minimum: 6.8, maximum: 7.5 }, flowLpm: { minimum: 22, maximum: 28 }, suctionKpa: { minimum: 0.6, maximum: 1.8 }, powerMonitor: { voltageV: { minimum: 0, maximum: 1000 }, currentA: { minimum: 0, maximum: 10000 }, activePowerW: { minimum: -1000000000, maximum: 1000000000 }, powerFactor: { minimum: -1, maximum: 1 }, frequencyHz: { minimum: 0, maximum: 1000 }, apparentPowerVa: { minimum: 0, maximum: 1000000000 }, reactivePowerVar: { minimum: -1000000000, maximum: 1000000000 }, powerTotalKwh: { minimum: 0, maximum: 1000000000000 } } },
  sampling: { intervalSeconds: 1, staleAfterSeconds: 10 }, retentionDays: 7,
  notifications: { browserEnabled: true, critical: true, warning: true, info: false }
};

function field(name, label, value, options = {}) {
  return `<label class="settings-field"><span>${label}</span><div class="settings-input-wrap"><input name="${name}" type="${options.type || "text"}" value="${value ?? ""}" ${options.required ? "required" : ""} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.step ? `step="${options.step}"` : ""}><small>${options.unit || ""}</small></div></label>`;
}

function check(name, title, copy, checked) {
  return `<label class="preference-row"><span><strong>${title}</strong><small>${copy}</small></span><input name="${name}" type="checkbox" ${checked ? "checked" : ""}><i aria-hidden="true"></i></label>`;
}

function powerRangeField(key, label, range, unit, step = "0.01") {
  return `${field(`thresholds.powerMonitor.${key}.minimum`, `${label} minimum`, range?.minimum, { type: "number", step, unit })}${field(`thresholds.powerMonitor.${key}.maximum`, `${label} maximum`, range?.maximum, { type: "number", step, unit })}`;
}

export function renderSettingsPage({ state }) {
  const settings = state.settings || defaults;
  const shifts = ["First Shift", "Second Shift", "Third Shift", "General Shift"].map(shift => [shift, shift]);
  const shiftAliases = { First: "First Shift", Second: "Second Shift", Third: "Third Shift", General: "General Shift" };
  const configuredShift = shiftAliases[settings.plant.shift] || settings.plant.shift;
  const selectedShift = shifts.some(([value]) => value === configuredShift) ? configuredShift : "General Shift";
  const disabled = !state.currentUser?.isOwner || state.settingsSaving ? "disabled" : "";
  const action = state.currentUser?.isOwner ? `<button class="primary-btn" id="save-settings" type="submit" form="settings-form" ${disabled}>${state.settingsSaving ? "Saving…" : "Save changes"}</button>` : "";
  return `${pageHead("Settings", "Configure plant identity and monitoring preferences", action)}
    ${state.settingsError ? `<div class="inline-error">${state.settingsError}</div>` : ""}
    <form id="settings-form" class="settings-layout">
      <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Plant</span><h2>Plant profile</h2><p>Information shown across the CAMS dashboard.</p></div><span class="settings-saved-state">${settings.updatedAt ? `Last saved ${new Date(settings.updatedAt).toLocaleString("en-IN")}` : "Using system defaults"}</span></div><div class="settings-fields three">${field("plant.name", "Plant name", settings.plant.name, { required: true })}${field("plant.area", "Area / department", settings.plant.area)}<label class="settings-field" for="plant.shift-trigger"><span>Shifts</span>${customSelect("plant.shift", shifts, selectedShift, { label: "Shifts", nativeData: 'name="plant.shift"' })}</label></div></section>
      <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Display</span><h2>Preview & live screen</h2><p>Choose how the CAMS admin interface appears on this browser. This preference does not change plant data.</p></div></div><div class="screen-mode-options" role="group" aria-label="Screen display mode"><button class="screen-mode-option ${state.screenMode === "preview" ? "active" : ""}" type="button" data-screen-mode="preview" aria-pressed="${state.screenMode === "preview"}"><strong>Preview</strong><span>Keep the sidebar visible while reviewing the admin interface.</span></button><button class="screen-mode-option ${state.screenMode === "live" ? "active" : ""}" type="button" data-screen-mode="live" aria-pressed="${state.screenMode === "live"}"><strong>Live</strong><span>Use the full screen; click the menu icon to show or hide the sidebar. On touch screens, use the menu button.</span></button></div></section>
      <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Alerts</span><h2>Notification preferences</h2><p>Select which live alarms may create browser notifications.</p></div></div><div class="preference-list">${check("notifications.browserEnabled", "Browser notifications", "Allow CAMS alerts on this browser", settings.notifications.browserEnabled)}${check("notifications.critical", "Critical alarms", "Immediate safety and connectivity issues", settings.notifications.critical)}${check("notifications.warning", "Warning alarms", "Operating readings approaching limits", settings.notifications.warning)}${check("notifications.info", "Information events", "Lower-priority operating updates", settings.notifications.info)}</div></section>
      <section class="panel settings-section"><div class="settings-section-head"><div><span class="settings-kicker">Power Monitor</span><h2>Power Monitor thresholds</h2><p>Configure warning ranges for electrical measurements received from the power meter.</p></div></div><div class="settings-fields three">${powerRangeField("voltageV", "Voltage", settings.thresholds.powerMonitor?.voltageV, "V")}${powerRangeField("currentA", "Current", settings.thresholds.powerMonitor?.currentA, "A")}${powerRangeField("activePowerW", "Active power", settings.thresholds.powerMonitor?.activePowerW, "W")}${powerRangeField("powerFactor", "Power factor", settings.thresholds.powerMonitor?.powerFactor, "", "0.01")}${powerRangeField("frequencyHz", "Frequency", settings.thresholds.powerMonitor?.frequencyHz, "Hz")}${powerRangeField("apparentPowerVa", "Apparent power", settings.thresholds.powerMonitor?.apparentPowerVa, "VA")}${powerRangeField("reactivePowerVar", "Reactive power", settings.thresholds.powerMonitor?.reactivePowerVar, "var")}${powerRangeField("powerTotalKwh", "Power total", settings.thresholds.powerMonitor?.powerTotalKwh, "kWh")}</div></section>
      ${!state.currentUser?.isOwner ? '<p class="settings-readonly">Settings are read-only. An owner account is required to make changes.</p>' : ""}
    </form>`;
}
