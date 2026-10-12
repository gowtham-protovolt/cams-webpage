import {
  renderAlarmsPage,
  renderDashboardPage,
  renderEnergyPage,
  renderLiveDataPage,
  renderLoginPage,
  renderPasswordRequestPage,
  renderPasswordResetPage,
  renderMachineDetailPage,
  renderMachinesPage,
  renderMaintenancePage,
  renderReportsPage,
  renderSettingsPage,
  renderTrendsPage,
  renderUsersPage
} from "./src/pages/index.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const configuredApiBaseUrl = String(window.CAMS_CONFIG?.apiBaseUrl || "");
const API_BASE_URL = (configuredApiBaseUrl === "same-origin" ? window.location.origin : configuredApiBaseUrl).replace(/\/$/, "");

function sessionUser(user) {
  return {
    ...user,
    identity: user.email || user.username,
    isOwner: user.role === "owner",
    role: user.role === "owner" ? "Owner / Admin" : user.role
  };
}

const authApi = {
  async request(path, options = {}) {
    if (!API_BASE_URL) throw new Error("Authentication service is not configured yet.");
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new Error("CAMS service is unavailable. Try again shortly.");
    }
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Authentication request failed.");
    return payload;
  },
  async restore() {
    if (!API_BASE_URL) return null;
    const payload = await this.request("/api/auth/me");
    return sessionUser(payload.user);
  },
  async signIn(identity, password, remember) {
    const payload = await this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identity, password, remember })
    });
    return sessionUser(payload.user);
  },
  async signOut() {
    await this.request("/api/auth/logout", { method: "POST", body: "{}" });
  },
  async requestPasswordReset(identity) {
    return this.request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ identity }) });
  },
  async resetPassword(token, password) {
    return this.request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
  },
  async listUsers() {
    return this.request("/api/admin/users");
  },
  async createUser(user) {
    return this.request("/api/admin/users", { method: "POST", body: JSON.stringify(user) });
  },
  async setUserStatus(userId, active) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
  },
  async createMachine(machine) {
    return this.request("/api/machines", { method: "POST", body: JSON.stringify(machine) });
  },
  async updateMachine(machineId, siteId, machine) {
    return this.request(`/api/machines/${encodeURIComponent(machineId)}?siteId=${encodeURIComponent(siteId)}`, {
      method: "PATCH",
      body: JSON.stringify(machine)
    });
  },
  async removeMachine(machineId, siteId) {
    return this.request(`/api/machines/${encodeURIComponent(machineId)}?siteId=${encodeURIComponent(siteId)}`, { method: "DELETE" });
  },
  async listRemovedMachines(siteId = "plant-01") {
    return this.request(`/api/machines/removed?siteId=${encodeURIComponent(siteId)}`);
  },
  async restoreMachine(machineId, siteId) {
    return this.request(`/api/machines/${encodeURIComponent(machineId)}/restore?siteId=${encodeURIComponent(siteId)}`, {
      method: "POST",
      body: "{}"
    });
  },
  async download(path) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
    } catch {
      throw new Error("CAMS export service is unavailable. Try again shortly.");
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Export could not be created.");
    }
    const disposition = response.headers.get("content-disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || "cams-export";
    return { blob: await response.blob(), filename };
  }
};

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
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 6v5h-5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.2 2.8M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.1-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  gauge: '<path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 13 4-4M9 19h6"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h5v18h-5"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};

const icon = (name, className = "") => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.info}</svg>`;

let machines = [];
const machineHistory = new Map();
let telemetryStream = null;
let telemetryRenderTimer = null;
let liveSyncTimer = null;
let liveSyncInFlight = false;

let alarms = [];

const savedMachineId = window.sessionStorage.getItem("cams.machineId");
const savedTrendParameter = window.sessionStorage.getItem("cams.trendParameter");
const savedDashboardParameter = window.sessionStorage.getItem("cams.dashboardParameter");
const savedDashboardRange = window.sessionStorage.getItem("cams.dashboardRange");
const savedDetailParameter = window.sessionStorage.getItem("cams.detailParameter");
const resetTokenFromUrl = new URLSearchParams(window.location.search).get("resetToken") || "";

const state = {
  authenticated: false,
  authView: resetTokenFromUrl ? "reset" : "login",
  passwordResetToken: resetTokenFromUrl,
  passwordResetIdentity: "",
  passwordResetSent: false,
  passwordResetUrl: "",
  passwordResetError: "",
  currentUser: null,
  page: "dashboard",
  machineId: savedMachineId || "CAMS-01",
  machineFilter: "All",
  machineSearch: "",
  alarmFilter: "All",
  trendMachine: "CAMS-01",
  trendParameter: ["Pressure", "Flow", "Suction"].includes(savedTrendParameter) ? savedTrendParameter : "Pressure",
  trendRange: "1h",
  dashboardParameter: ["Pressure", "Flow", "Suction"].includes(savedDashboardParameter) ? savedDashboardParameter : "Pressure",
  dashboardRange: ["15m", "1h", "6h", "24h"].includes(savedDashboardRange) ? savedDashboardRange : "1h",
  detailParameter: ["Pressure", "Flow", "Suction"].includes(savedDetailParameter) ? savedDetailParameter : "Pressure",
  detailRange: "1h",
  reportMachine: "CAMS-01",
  reportRange: "24h",
  mobileOpen: false,
  notificationsOpen: false,
  userMenuOpen: false,
  telemetryConnected: false,
  lastTelemetryAt: null,
  managedUsers: [],
  usersLoading: false,
  usersError: "",
  settings: null,
  settingsSaving: false,
  settingsError: "",
  machineModal: null,
  removedMachines: [],
  removedMachinesLoading: false,
  machineManagementError: "",
  alarmModal: null,
  alarmHistory: [],
  alarmHistoryLoading: false,
  alarmAuditError: ""
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", group: "Monitor" },
  { id: "live-data", label: "Live Data", icon: "database", group: "Monitor" },
  { id: "machines", label: "Machines", icon: "machine", group: "Monitor" },
  { id: "trends", label: "Trends", icon: "trend", group: "Monitor" },
  { id: "alarms", label: "Alarms & Events", icon: "alarm", group: "Monitor" },
  { id: "maintenance", label: "Maintenance", icon: "maintenance", group: "Manage" },
  { id: "reports", label: "Reports", icon: "report", group: "Manage" },
  { id: "users", label: "Users", icon: "user", group: "Manage", ownerOnly: true },
  { id: "settings", label: "Settings", icon: "settings", group: "Manage" },
  { id: "energy", label: "Energy & Utilization", icon: "energy", group: "Future", future: true }
];

function brand(light = false) {
  return `<div class="brand-lockup ${light ? "light" : ""}">
    <span class="brand-mark">${icon("air")}</span>
    <span><span class="brand-name">CAMS</span><span class="brand-sub">Compressed Air Monitoring System</span></span>
  </div>`;
}

function statusPill(status) {
  return `<span class="status-pill status-${status.toLowerCase()}">${status}</span>`;
}

function fmt(value, unit = "") {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(value % 1 ? 1 : 0)}${unit ? ` ${unit}` : ""}`;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `${icon("check")}<span>${message}</span>`;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function initials(name = "Plant Owner") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "PO";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function displayStatus(value = "offline") {
  const normalized = String(value).trim().toLowerCase();
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Offline";
}

function relativeTime(value) {
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

function mapMachine(item) {
  const telemetry = item.telemetry || null;
  const metrics = telemetry?.metrics || null;
  const monitoring = telemetry?.monitoring || item.monitoring || {};
  const status = displayStatus(monitoring.status || telemetry?.status || item.status);
  const receivedAt = telemetry?.receivedAt || item.lastSeenAt || null;
  return {
    id: item.id,
    siteId: item.siteId || "plant-01",
    name: item.name || item.id,
    zone: item.zone || "Unassigned",
    status,
    pressure: metrics?.pressureBar ?? null,
    flow: metrics?.flowLpm ?? null,
    suction: metrics?.suctionKpa ?? null,
    raw: telemetry?.raw || null,
    errors: telemetry?.errors || null,
    quality: telemetry?.quality || null,
    calibrationVersion: telemetry?.calibrationVersion || null,
    source: telemetry?.source || null,
    monitoring,
    health: Number.isFinite(monitoring.health) ? monitoring.health : 0,
    gatewayStatus: displayStatus(monitoring.gatewayStatus || "offline"),
    plcStatus: displayStatus(monitoring.plcStatus || "offline"),
    communicationPercent: Number.isFinite(monitoring.communicationPercent) ? monitoring.communicationPercent : 0,
    reasons: monitoring.reasons || [],
    updated: relativeTime(receivedAt),
    receivedAt,
    hours: null
  };
}

function normalizeReading(payload) {
  return {
    siteId: payload.siteId || payload.series?.siteId || "plant-01",
    machineId: payload.machineId || payload.series?.machineId,
    observedAt: payload.observedAt,
    receivedAt: payload.receivedAt,
    sequence: payload.sequence,
    status: payload.status,
    metrics: payload.metrics,
    raw: payload.raw || null,
    errors: payload.errors || null,
    quality: payload.quality || null,
    calibrationVersion: payload.calibrationVersion || null,
    source: payload.source || null
    ,monitoring: payload.monitoring || null
  };
}

function mapAlarm(item) {
  const occurredAt = item.lastSeenAt || item.firstSeenAt;
  const date = occurredAt ? new Date(occurredAt) : new Date();
  return {
    id: item.id,
    siteId: item.siteId,
    machine: item.machineId,
    parameter: item.parameter,
    severity: item.severity,
    value: String(item.value ?? "—"),
    message: item.message,
    status: item.status,
    date: date.toLocaleDateString("en-IN"),
    time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    acknowledgedAt: item.acknowledgedAt,
    resolvedAt: item.resolvedAt
  };
}

async function loadAlarms({ render = true } = {}) {
  const payload = await authApi.request("/api/alarms");
  alarms = (payload.alarms || []).map(mapAlarm);
  if (render) renderApp();
}

function appendHistory(payload) {
  const reading = normalizeReading(payload);
  if (!reading.machineId || !reading.metrics) return;
  const current = machineHistory.get(reading.machineId) || [];
  const deduplicated = current.filter(item => item.sequence !== reading.sequence || item.observedAt !== reading.observedAt);
  deduplicated.push(reading);
  deduplicated.sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  machineHistory.set(reading.machineId, deduplicated.slice(-2000));
}

async function loadMachines({ render = true } = {}) {
  const payload = await authApi.request("/api/machines");
  machines = (payload.machines || []).map(mapMachine);
  for (const item of payload.machines || []) {
    if (item.telemetry) appendHistory(item.telemetry);
  }
  const newest = machines
    .map(machine => machine.receivedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  if (newest) state.lastTelemetryAt = newest;
  if (!machines.some(machine => machine.id === state.machineId) && machines[0]) state.machineId = machines[0].id;
  if (!machines.some(machine => machine.id === state.trendMachine) && machines[0]) state.trendMachine = machines[0].id;
  if (!machines.some(machine => machine.id === state.reportMachine) && machines[0]) state.reportMachine = machines[0].id;
  if (render) renderApp();
}

function openMachineModal(type, machine = null) {
  if (!state.currentUser?.isOwner) return;
  state.machineManagementError = "";
  state.machineModal = { type, machine };
  renderApp();
}

function closeMachineModal() {
  state.machineModal = null;
  state.machineManagementError = "";
  renderApp();
}

async function loadRemovedMachines({ render = true } = {}) {
  if (!state.currentUser?.isOwner) return;
  state.removedMachinesLoading = true;
  state.machineManagementError = "";
  if (render) renderApp();
  try {
    const siteId = state.settings?.siteId || "plant-01";
    const payload = await authApi.listRemovedMachines(siteId);
    state.removedMachines = payload.machines || [];
  } catch (error) {
    state.machineManagementError = error.message;
  } finally {
    state.removedMachinesLoading = false;
    if (render) renderApp();
  }
}

async function saveMachine(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.querySelector('[type="submit"][form="machine-form"]');
  const data = Object.fromEntries(new FormData(form));
  data.machineId = String(data.machineId || "").trim().toUpperCase();
  submit.disabled = true;
  state.machineManagementError = "";
  try {
    if (state.machineModal.type === "edit") {
      await authApi.updateMachine(data.machineId, data.siteId, { name: data.name, zone: data.zone });
      showToast(`${data.machineId} details updated.`);
    } else {
      await authApi.createMachine(data);
      showToast(`${data.machineId} registered. Waiting for MQTT telemetry.`);
    }
    state.machineModal = null;
    await loadMachines({ render: false });
    renderApp();
  } catch (error) {
    state.machineManagementError = error.message;
    renderApp();
  }
}

async function removeSelectedMachine() {
  const machine = state.machineModal?.machine;
  if (!machine) return;
  const button = document.querySelector("#confirm-machine-delete");
  button.disabled = true;
  state.machineManagementError = "";
  try {
    await authApi.removeMachine(machine.id, machine.siteId);
    machineHistory.delete(machine.id);
    state.machineModal = null;
    await loadMachines({ render: false });
    renderApp();
    showToast(`${machine.id} removed. Historical telemetry was preserved.`);
  } catch (error) {
    state.machineManagementError = error.message;
    renderApp();
  }
}

async function restoreRemovedMachine(machineId, siteId, button) {
  button.disabled = true;
  state.machineManagementError = "";
  try {
    await authApi.restoreMachine(machineId, siteId);
    await Promise.all([loadMachines({ render: false }), loadRemovedMachines({ render: false })]);
    renderApp();
    showToast(`${machineId} restored. Waiting for new MQTT telemetry.`);
  } catch (error) {
    state.machineManagementError = error.message;
    renderApp();
  }
}

function historyRangeMilliseconds(range) {
  return ({ "15m": 15 * 60e3, "1h": 60 * 60e3, "6h": 6 * 60 * 60e3, "24h": 24 * 60 * 60e3, "7d": 7 * 24 * 60 * 60e3 })[range] || 60 * 60e3;
}

async function loadMachineHistory(machineId, range = "1h", { render = true } = {}) {
  const machine = machines.find(item => item.id === machineId);
  if (!machine) return;
  const from = new Date(Date.now() - historyRangeMilliseconds(range)).toISOString();
  const params = new URLSearchParams({ siteId: machine.siteId, from, limit: "2000" });
  const payload = await authApi.request(`/api/machines/${encodeURIComponent(machineId)}/telemetry?${params}`);
  machineHistory.set(machineId, []);
  for (const reading of payload.readings || []) appendHistory(reading);
  if (render && state.authenticated) renderApp();
}

function applyTelemetry(payload) {
  const reading = normalizeReading(payload);
  if (!reading.machineId || !reading.metrics) return;
  appendHistory(reading);
  const index = machines.findIndex(machine => machine.id === reading.machineId && machine.siteId === reading.siteId);
  const existing = index >= 0 ? machines[index] : {
    id: reading.machineId,
    siteId: reading.siteId,
    name: reading.machineId,
    zone: "Unassigned"
  };
  const updated = mapMachine({
    ...existing,
    telemetry: reading,
    status: reading.status,
    lastSeenAt: reading.receivedAt
  });
  if (index >= 0) machines[index] = updated;
  else machines.push(updated);
  state.lastTelemetryAt = reading.receivedAt || new Date().toISOString();
  scheduleTelemetryRender();
}

function applyMachineStatus(payload) {
  const index = machines.findIndex(machine => machine.id === payload.machineId && machine.siteId === payload.siteId);
  if (index < 0) return loadMachines().catch(() => {});
  machines[index] = {
    ...machines[index],
    status: displayStatus(payload.status),
    health: payload.health,
    gatewayStatus: displayStatus(payload.gatewayStatus),
    plcStatus: displayStatus(payload.plcStatus),
    communicationPercent: payload.communicationPercent,
    reasons: payload.reasons || [],
    monitoring: payload
  };
  scheduleTelemetryRender();
}

function applyAlarm(payload) {
  const mapped = mapAlarm(payload);
  const index = alarms.findIndex(alarm => alarm.id === mapped.id);
  const shouldNotify = index < 0 && mapped.status === "Active" && state.settings?.notifications?.browserEnabled &&
    state.settings.notifications[mapped.severity.toLowerCase()] && window.Notification?.permission === "granted";
  if (index >= 0) alarms[index] = mapped;
  else alarms.unshift(mapped);
  if (shouldNotify) new Notification(`${mapped.severity} · ${mapped.machine}`, { body: `${mapped.parameter}: ${mapped.message}`, tag: `cams-${mapped.id}` });
  scheduleTelemetryRender();
}

function scheduleTelemetryRender() {
  if (telemetryRenderTimer || !state.authenticated) return;
  telemetryRenderTimer = window.setTimeout(() => {
    telemetryRenderTimer = null;
    if (!document.activeElement?.matches("input, select, textarea")) renderApp();
  }, 250);
}

function closeTelemetryStream() {
  telemetryStream?.close();
  telemetryStream = null;
  state.telemetryConnected = false;
  if (telemetryRenderTimer) window.clearTimeout(telemetryRenderTimer);
  telemetryRenderTimer = null;
}

function stopLiveSync() {
  if (liveSyncTimer) window.clearInterval(liveSyncTimer);
  liveSyncTimer = null;
  liveSyncInFlight = false;
}

function machineSnapshotKey() {
  return machines.map(machine => [
    machine.siteId,
    machine.id,
    machine.receivedAt,
    machine.status,
    machine.health,
    machine.pressure,
    machine.flow,
    machine.suction
  ].join("|")).join(";");
}

async function syncLiveSnapshot() {
  if (!state.authenticated || liveSyncInFlight || document.hidden) return;
  liveSyncInFlight = true;
  try {
    const previousSnapshot = machineSnapshotKey();
    await loadMachines({ render: false });
    const telemetryChanged = previousSnapshot !== machineSnapshotKey();
    const livePages = new Set(["dashboard", "live-data", "machines", "machine-detail", "trends", "alarms"]);
    if (telemetryChanged && livePages.has(state.page) && !document.activeElement?.matches("input, select, textarea")) renderApp();
  } catch {
    // The event stream can continue updating the UI while a recovery poll fails.
  } finally {
    liveSyncInFlight = false;
  }
}

function startLiveSync() {
  stopLiveSync();
  const interval = Math.max(1, Number(state.settings?.sampling?.intervalSeconds || 1)) * 1000;
  liveSyncTimer = window.setInterval(syncLiveSnapshot, interval);
}

async function loadSettings({ render = true } = {}) {
  try {
    const payload = await authApi.request("/api/settings");
    state.settings = payload.settings;
    state.settingsError = "";
  } catch (error) {
    state.settingsError = error.message;
  }
  if (render) renderApp();
}

function connectTelemetryStream() {
  closeTelemetryStream();
  if (!API_BASE_URL || typeof EventSource === "undefined") return;
  telemetryStream = new EventSource(`${API_BASE_URL}/api/telemetry/stream`, { withCredentials: true });
  telemetryStream.addEventListener("connected", () => {
    state.telemetryConnected = true;
    scheduleTelemetryRender();
  });
  telemetryStream.addEventListener("telemetry", event => {
    state.telemetryConnected = true;
    try {
      applyTelemetry(JSON.parse(event.data));
    } catch {
      // Ignore a malformed event while keeping the stream open for the next valid reading.
    }
  });
  telemetryStream.addEventListener("machine-status", event => {
    try { applyMachineStatus(JSON.parse(event.data)); } catch { /* Wait for the next status event. */ }
  });
  telemetryStream.addEventListener("alarm", event => {
    try { applyAlarm(JSON.parse(event.data)); } catch { /* Wait for the next alarm event. */ }
  });
  for (const eventName of ["machine-created", "machine-updated", "machine-removed", "machine-restored"]) {
    telemetryStream.addEventListener(eventName, () => {
      loadMachines().catch(() => {});
      if (state.machineModal?.type === "removed") loadRemovedMachines({ render: false }).catch(() => {});
    });
  }
  telemetryStream.onerror = () => {
    state.telemetryConnected = false;
    scheduleTelemetryRender();
  };
}

async function enterApplication(user) {
  state.authenticated = true;
  state.currentUser = user;
  // Connect first so telemetry published while the initial snapshot loads is not missed.
  connectTelemetryStream();
  await loadSettings({ render: false });
  startLiveSync();
  await loadMachines({ render: false });
  await loadAlarms({ render: false });
  const dashboardMachine = machines.find(machine => machine.id === state.machineId) || machines[0];
  if (dashboardMachine) {
    state.machineId = dashboardMachine.id;
    window.sessionStorage.setItem("cams.machineId", state.machineId);
    await loadMachineHistory(dashboardMachine.id, state.dashboardRange, { render: false }).catch(() => {});
  }
  renderApp();
}

async function downloadExport(path) {
  const { blob, filename } = await authApi.download(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`${filename} downloaded.`);
}

function telemetryExportPath(machineId, range, format) {
  const machine = machines.find(item => item.id === machineId);
  const from = new Date(Date.now() - historyRangeMilliseconds(range)).toISOString();
  const params = new URLSearchParams({ machineId, siteId: machine?.siteId || "plant-01", from });
  return `/api/exports/telemetry/${format}?${params}`;
}

function bindDownload(buttonId, path) {
  document.querySelector(buttonId)?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await downloadExport(path());
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

function renderLogin() {
  if (state.authView === "request") {
    app.innerHTML = renderPasswordRequestPage(brand, state);
    document.querySelector("#back-to-login")?.addEventListener("click", returnToLogin);
    document.querySelector("#forgot-password-form")?.addEventListener("submit", handlePasswordResetRequest);
    return;
  }
  if (state.authView === "reset") {
    app.innerHTML = renderPasswordResetPage(brand, state);
    document.querySelector("#back-to-login")?.addEventListener("click", returnToLogin);
    document.querySelectorAll("[data-password-toggle]").forEach(button => button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.dataset.passwordToggle}`);
      input.type = input.type === "password" ? "text" : "password";
      button.innerHTML = icon(input.type === "password" ? "eye" : "eyeOff");
      button.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
    }));
    document.querySelector("#reset-password-form")?.addEventListener("submit", handlePasswordReset);
    return;
  }
  app.innerHTML = renderLoginPage(brand);

  document.querySelector("#password-toggle").addEventListener("click", (event) => {
    const input = document.querySelector("#password");
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.innerHTML = icon(input.type === "password" ? "eye" : "eyeOff");
    event.currentTarget.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
  });
  document.querySelector("#forgot-password").addEventListener("click", () => {
    const username = document.querySelector("#username");
    state.passwordResetIdentity = username.value.trim();
    state.passwordResetSent = false;
    state.passwordResetUrl = "";
    state.passwordResetError = "";
    state.authView = "request";
    renderLogin();
    document.querySelector("#reset-identity")?.focus();
  });
  document.querySelector("#login-form").addEventListener("submit", handleLogin);
}

function returnToLogin() {
  state.authView = "login";
  state.passwordResetToken = "";
  state.passwordResetSent = false;
  state.passwordResetUrl = "";
  state.passwordResetError = "";
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
  renderLogin();
}

async function handlePasswordResetRequest(event) {
  event.preventDefault();
  const identity = document.querySelector("#reset-identity");
  const error = document.querySelector("#reset-identity-error");
  const wrap = document.querySelector("#reset-identity-wrap");
  const button = document.querySelector("#reset-request-button");
  state.passwordResetIdentity = identity.value.trim();
  error.textContent = "";
  wrap.classList.remove("invalid");
  if (!state.passwordResetIdentity) {
    error.textContent = "Enter your username or email.";
    wrap.classList.add("invalid");
    identity.focus();
    return;
  }
  button.disabled = true;
  button.innerHTML = `<span class="loading-spinner"></span><span>Preparing reset…</span>`;
  state.passwordResetError = "";
  try {
    const payload = await authApi.requestPasswordReset(state.passwordResetIdentity);
    state.passwordResetSent = true;
    state.passwordResetUrl = payload.resetUrl || "";
  } catch (requestError) {
    state.passwordResetError = requestError.message;
  }
  renderLogin();
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const password = document.querySelector("#new-password");
  const confirmation = document.querySelector("#confirm-password");
  const passwordError = document.querySelector("#new-password-error");
  const confirmationError = document.querySelector("#confirm-password-error");
  const passwordWrap = document.querySelector("#new-password-wrap");
  const confirmationWrap = document.querySelector("#confirm-password-wrap");
  let valid = true;
  passwordError.textContent = "";
  confirmationError.textContent = "";
  passwordWrap.classList.remove("invalid");
  confirmationWrap.classList.remove("invalid");
  if (password.value.length < 12 || password.value.length > 128) {
    passwordError.textContent = "Use between 12 and 128 characters.";
    passwordWrap.classList.add("invalid");
    valid = false;
  }
  if (!confirmation.value || confirmation.value !== password.value) {
    confirmationError.textContent = "Passwords do not match.";
    confirmationWrap.classList.add("invalid");
    valid = false;
  }
  if (!valid) return;
  const button = document.querySelector("#reset-password-button");
  button.disabled = true;
  button.innerHTML = `<span class="loading-spinner"></span><span>Updating password…</span>`;
  state.passwordResetError = "";
  try {
    const payload = await authApi.resetPassword(state.passwordResetToken, password.value);
    returnToLogin();
    showToast(payload.message || "Password updated. Sign in with your new password.");
  } catch (resetError) {
    state.passwordResetError = resetError.message;
    renderLogin();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  const usernameError = document.querySelector("#username-error");
  const passwordError = document.querySelector("#password-error");
  const usernameWrap = document.querySelector("#username-wrap");
  const passwordWrap = document.querySelector("#password-wrap");
  const remember = document.querySelector("#remember-me");
  usernameError.textContent = "";
  passwordError.textContent = "";
  usernameWrap.classList.remove("invalid");
  passwordWrap.classList.remove("invalid");
  if (!username.value.trim()) {
    usernameError.textContent = "Enter your username or email.";
    usernameWrap.classList.add("invalid");
  }
  if (!password.value) {
    passwordError.textContent = "Enter your password.";
    passwordWrap.classList.add("invalid");
  }
  if (!username.value.trim() || !password.value) return;
  const button = document.querySelector("#login-button");
  button.disabled = true;
  button.innerHTML = `<span class="loading-spinner"></span><span>Verifying access…</span>`;
  try {
    const session = await authApi.signIn(username.value.trim(), password.value, remember.checked);
    await enterApplication(session);
    showToast("Signed in successfully. Plant data is ready.");
  } catch (error) {
    password.value = "";
    passwordError.textContent = error.message;
    passwordWrap.classList.add("invalid");
    button.disabled = false;
    button.innerHTML = `<span>Sign in to CAMS</span>${icon("chevronRight")}`;
    password.focus();
  }
}

function renderApp() {
  const user = state.currentUser || { displayName: "Plant Owner", role: "Owner / Admin" };
  const safeName = escapeHtml(user.displayName);
  const safeRole = escapeHtml(user.role);
  const groups = ["Monitor", "Manage", "Future"];
  const staleAfterMs = Number(state.settings?.sampling?.staleAfterSeconds || 10) * 1000;
  const freshGateways = machines.filter(machine => machine.gatewayStatus === "Online" && machine.receivedAt && Date.now() - new Date(machine.receivedAt).getTime() <= staleAfterMs).length;
  const plantConnectionState = freshGateways ? "online" : "offline";
  const connectionLabel = state.telemetryConnected ? "CAMS stream connected" : "CAMS stream reconnecting";
  const networkLabel = freshGateways ? `${freshGateways} gateway${freshGateways === 1 ? "" : "s"} sending live data` : state.lastTelemetryAt ? `Last telemetry · ${relativeTime(state.lastTelemetryAt)}` : "No gateway telemetry";
  const openAlarmCount = alarms.filter(alarm => alarm.status !== "Resolved").length;
  const sidebarNav = groups.map(group => `<div class="nav-group-label">${group}</div><nav class="nav-list">${navItems.filter(item => item.group === group && (!item.ownerOnly || user.isOwner)).map(item => `<button class="nav-item ${state.page === item.id || (state.page === "machine-detail" && item.id === "machines") ? "active" : ""}" data-page="${item.id}">${icon(item.icon)}<span>${item.label}</span>${item.future ? '<span class="future">P2</span>' : ""}</button>`).join("")}</nav>`).join("");
  app.innerHTML = `<div class="app-shell">
    ${state.mobileOpen ? '<button class="mobile-overlay" id="mobile-overlay" aria-label="Close menu"></button>' : ""}
    <aside class="sidebar ${state.mobileOpen ? "open" : ""}">
      ${brand(true)}
      ${sidebarNav}
      <div class="sidebar-foot"><div class="sidebar-foot-row"><i class="pulse-dot"></i><span>${connectionLabel}</span></div><div class="sidebar-foot-row"><span>MongoDB-backed monitoring</span></div></div>
    </aside>
    <header class="top-header">
      <div class="header-plant"><button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Open menu">${icon("menu")}</button><div><div class="plant-name">${escapeHtml(state.settings?.plant?.name || "Demo Spinning Plant")}</div><div class="plant-meta ${plantConnectionState}"><i class="live-dot"></i><span>${networkLabel}</span></div></div></div>
      <div class="header-right">
        <div class="clock"><strong id="header-time">--:--:--</strong><span id="header-date">--</span></div>
        <button class="icon-btn notification-btn" id="notification-button" aria-label="Notifications">${icon("bell")}${openAlarmCount ? `<span class="notification-badge">${openAlarmCount}</span>` : ""}</button>
        <div class="account-control">
          <button class="user-menu" id="user-menu" aria-haspopup="menu" aria-expanded="${state.userMenuOpen}"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span class="user-copy"><strong>${safeName}</strong><span>${safeRole}</span></span>${icon("chevronDown")}</button>
          ${state.userMenuOpen ? `<div class="account-menu" role="menu"><div class="account-summary"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><div><strong>${safeName}</strong><span>${escapeHtml(user.identity)}</span></div></div><div class="account-session">${icon("shield")}<span>Secure server session active</span></div><button id="sign-out" class="account-action" role="menuitem">${icon("logout")}<span>Sign out</span></button></div>` : ""}
        </div>
      </div>
    </header>
    <main class="main-content">${pageContent()}</main>
  </div>`;
  bindGlobalEvents();
  bindPageEvents();
  updateClock();
}

function pageContent() {
  const model = { state, machines, machineHistory, alarms };
  switch (state.page) {
    case "live-data": return renderLiveDataPage(model);
    case "machines": return renderMachinesPage(model);
    case "machine-detail": return renderMachineDetailPage(model);
    case "trends": return renderTrendsPage(model);
    case "alarms": return renderAlarmsPage(model);
    case "maintenance": return renderMaintenancePage(model);
    case "reports": return renderReportsPage(model);
    case "users": return renderUsersPage(model);
    case "energy": return renderEnergyPage(model);
    case "settings": return renderSettingsPage(model);
    default: return renderDashboardPage(model);
  }
}

async function loadManagedUsers({ render = true } = {}) {
  if (!state.currentUser?.isOwner) return;
  state.usersLoading = true;
  state.usersError = "";
  if (render) renderApp();
  try {
    const payload = await authApi.listUsers();
    state.managedUsers = payload.users || [];
  } catch (error) {
    state.usersError = error.message;
  } finally {
    state.usersLoading = false;
    if (render) renderApp();
  }
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  document.querySelectorAll("[data-machine]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    state.machineId = button.dataset.machine;
    window.sessionStorage.setItem("cams.machineId", state.machineId);
    navigate("machine-detail");
    loadMachineHistory(state.machineId, state.detailRange).catch(error => showToast(error.message));
  }));
  document.querySelector("#mobile-menu")?.addEventListener("click", () => { state.mobileOpen = true; renderApp(); });
  document.querySelector("#mobile-overlay")?.addEventListener("click", () => { state.mobileOpen = false; renderApp(); });
  document.querySelector("#notification-button")?.addEventListener("click", () => { navigate("alarms"); });
  document.querySelector("#user-menu")?.addEventListener("click", () => {
    state.userMenuOpen = !state.userMenuOpen;
    renderApp();
  });
  document.querySelector("#sign-out")?.addEventListener("click", async () => {
    try {
      await authApi.signOut();
      closeTelemetryStream();
      stopLiveSync();
      state.authenticated = false;
      state.currentUser = null;
      state.userMenuOpen = false;
      renderLogin();
      showToast("Signed out securely.");
    } catch (error) {
      showToast(error.message);
    }
  });
}

function bindConnectedProcessChart() {
  const chart = document.querySelector("#connected-process-chart");
  if (!chart) return;
  const stage = chart.querySelector(".process-chart-stage");
  const tooltip = chart.querySelector("#process-tooltip");
  const crosshair = chart.querySelector("#process-crosshair");
  const nodes = [...chart.querySelectorAll(".process-node")];
  let pinnedNode = null;

  const showReading = (node) => {
    const timestamp = new Date(node.dataset.observedAt);
    const displayTime = Number.isNaN(timestamp.getTime()) ? "Unknown time" : timestamp.toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    tooltip.querySelector("[data-tooltip-time]").textContent = displayTime;
    tooltip.querySelector("[data-tooltip-pressure]").textContent = node.dataset.pressure;
    tooltip.querySelector("[data-tooltip-flow]").textContent = node.dataset.flow;
    tooltip.querySelector("[data-tooltip-suction]").textContent = node.dataset.suction;
    tooltip.querySelector("[data-tooltip-status]").textContent = displayStatus(node.dataset.status);
    tooltip.querySelector("[data-tooltip-quality]").textContent = displayStatus(node.dataset.quality);

    const stageBox = stage.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();
    const nodeX = nodeBox.left + nodeBox.width / 2 - stageBox.left;
    const nodeY = nodeBox.top + nodeBox.height / 2 - stageBox.top;
    const tooltipWidth = Math.min(240, stageBox.width - 24);
    const preferredLeft = nodeX > stageBox.width * .68 ? nodeX - tooltipWidth - 16 : nodeX + 16;
    tooltip.style.left = `${Math.max(12, Math.min(stageBox.width - tooltipWidth - 12, preferredLeft))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(stageBox.height - 188, nodeY - 76))}px`;
    tooltip.classList.add("active");
    crosshair.setAttribute("x1", node.getAttribute("cx"));
    crosshair.setAttribute("x2", node.getAttribute("cx"));
    crosshair.classList.add("active");
    nodes.forEach(item => item.classList.toggle("is-selected", item === node));
  };

  const hideReading = () => {
    if (pinnedNode) return;
    tooltip.classList.remove("active");
    crosshair.classList.remove("active");
    nodes.forEach(node => node.classList.remove("is-selected"));
  };

  nodes.forEach(node => {
    node.addEventListener("pointerenter", () => showReading(node));
    node.addEventListener("focus", () => showReading(node));
    node.addEventListener("blur", hideReading);
    node.addEventListener("click", event => {
      event.stopPropagation();
      pinnedNode = pinnedNode === node ? null : node;
      if (pinnedNode) showReading(node);
      else hideReading();
    });
    node.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
      if (event.key === "Escape") {
        pinnedNode = null;
        hideReading();
        node.blur();
      }
    });
  });

  stage.addEventListener("pointerleave", hideReading);
  stage.addEventListener("click", () => {
    pinnedNode = null;
    hideReading();
  });
}

function bindPageEvents() {
  document.querySelector("#refresh-dashboard")?.addEventListener("click", async () => {
    try {
      await loadMachines({ render: false });
      const snapshot = machines.find(machine => machine.id === state.machineId) || machines[0];
      if (snapshot) await loadMachineHistory(snapshot.id, state.dashboardRange, { render: false });
      renderApp();
      showToast("Live readings refreshed from the CAMS API.");
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#machine-search")?.addEventListener("input", event => {
    state.machineSearch = event.target.value;
    const position = event.target.selectionStart;
    renderApp();
    const search = document.querySelector("#machine-search");
    search.focus();
    search.setSelectionRange(position, position);
  });
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => { state.machineFilter = button.dataset.filter; renderApp(); }));
  document.querySelector("#dashboard-parameter")?.addEventListener("change", event => {
    state.dashboardParameter = event.target.value;
    window.sessionStorage.setItem("cams.dashboardParameter", state.dashboardParameter);
    renderApp();
  });
  document.querySelectorAll("[data-dashboard-range]").forEach(button => button.addEventListener("click", () => {
    state.dashboardRange = button.dataset.dashboardRange;
    window.sessionStorage.setItem("cams.dashboardRange", state.dashboardRange);
    renderApp();
    if (state.machineId) loadMachineHistory(state.machineId, state.dashboardRange).catch(error => showToast(error.message));
  }));
  document.querySelector("#add-machine")?.addEventListener("click", () => openMachineModal("create"));
  document.querySelector("#removed-machines")?.addEventListener("click", async () => {
    state.machineModal = { type: "removed", machine: null };
    await loadRemovedMachines();
  });
  document.querySelectorAll("[data-edit-machine]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    const machine = machines.find(item => item.id === button.dataset.editMachine);
    if (machine) openMachineModal("edit", machine);
  }));
  document.querySelectorAll("[data-delete-machine]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    const machine = machines.find(item => item.id === button.dataset.deleteMachine);
    if (machine) openMachineModal("delete", machine);
  }));
  document.querySelector("#machine-modal-close")?.addEventListener("click", closeMachineModal);
  document.querySelector("#machine-modal-cancel")?.addEventListener("click", closeMachineModal);
  document.querySelector("#machine-modal-backdrop")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeMachineModal();
  });
  document.querySelector("#machine-form")?.addEventListener("submit", saveMachine);
  document.querySelector("#confirm-machine-delete")?.addEventListener("click", removeSelectedMachine);
  document.querySelectorAll("[data-restore-machine]").forEach(button => button.addEventListener("click", () => {
    restoreRemovedMachine(button.dataset.restoreMachine, button.dataset.siteId, button);
  }));
  document.querySelectorAll("[data-alarm-filter]").forEach(button => button.addEventListener("click", () => { state.alarmFilter = button.dataset.alarmFilter; renderApp(); }));
  document.querySelectorAll("[data-ack]").forEach(button => button.addEventListener("click", () => openAlarmAction(button.dataset.ack, "Acknowledged")));
  document.querySelectorAll("[data-resolve]").forEach(button => button.addEventListener("click", () => openAlarmAction(button.dataset.resolve, "Resolved")));
  document.querySelectorAll("[data-view-alarm]").forEach(button => button.addEventListener("click", () => openAlarmHistory(button.dataset.viewAlarm)));
  document.querySelector("#alarm-modal-close")?.addEventListener("click", closeAlarmModal);
  document.querySelector("#alarm-modal-cancel")?.addEventListener("click", closeAlarmModal);
  document.querySelector("#alarm-modal-backdrop")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeAlarmModal();
  });
  document.querySelector("#alarm-audit-form")?.addEventListener("submit", submitAlarmAction);
  document.querySelector("#trend-machine")?.addEventListener("change", event => {
    state.trendMachine = event.target.value;
    renderApp();
    loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  });
  document.querySelector("#trend-parameter")?.addEventListener("change", event => {
    state.trendParameter = event.target.value;
    window.sessionStorage.setItem("cams.trendParameter", state.trendParameter);
    renderApp();
  });
  document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => {
    state.trendRange = button.dataset.range;
    renderApp();
    loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  }));
  document.querySelectorAll("[data-detail-range]").forEach(button => button.addEventListener("click", () => {
    state.detailRange = button.dataset.detailRange;
    renderApp();
    loadMachineHistory(state.machineId, state.detailRange).catch(error => showToast(error.message));
  }));
  document.querySelector("#detail-parameter")?.addEventListener("change", event => {
    state.detailParameter = event.target.value;
    window.sessionStorage.setItem("cams.detailParameter", state.detailParameter);
    renderApp();
  });
  document.querySelector("#report-machine")?.addEventListener("change", event => {
    state.reportMachine = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-report-range]").forEach(button => button.addEventListener("click", () => {
    state.reportRange = button.dataset.reportRange;
    renderApp();
  }));
  document.querySelector("#settings-form")?.addEventListener("submit", saveSettings);
  document.querySelector("#refresh-users")?.addEventListener("click", () => loadManagedUsers());
  document.querySelector("#refresh-live-data")?.addEventListener("click", () => {
    const machineId = machines.find(machine => machine.id === state.machineId)?.id;
    if (machineId) loadMachineHistory(machineId, "24h").catch(error => showToast(error.message));
  });
  document.querySelector("#create-user-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    button.disabled = true;
    try {
      await authApi.createUser(Object.fromEntries(formData));
      form.reset();
      await loadManagedUsers({ render: false });
      renderApp();
      showToast("CAMS user created successfully.");
    } catch (error) {
      state.usersError = error.message;
      renderApp();
    }
  });
  document.querySelectorAll("[data-user-status]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await authApi.setUserStatus(button.dataset.userStatus, button.dataset.nextActive === "true");
      await loadManagedUsers({ render: false });
      renderApp();
      showToast("User access updated.");
    } catch (error) {
      state.usersError = error.message;
      renderApp();
    }
  }));
  bindDownload("#export-machines", () => "/api/exports/machines/xlsx");
  bindDownload("#export-machine-xlsx", () => telemetryExportPath(state.machineId, "1h", "xlsx"));
  bindDownload("#export-machine-pdf", () => telemetryExportPath(state.machineId, "1h", "pdf"));
  bindDownload("#export-trend-xlsx", () => telemetryExportPath(state.trendMachine, state.trendRange, "xlsx"));
  bindDownload("#export-trend-pdf", () => telemetryExportPath(state.trendMachine, state.trendRange, "pdf"));
  bindDownload("#report-telemetry-xlsx", () => telemetryExportPath(state.reportMachine, state.reportRange, "xlsx"));
  bindDownload("#report-telemetry-pdf", () => telemetryExportPath(state.reportMachine, state.reportRange, "pdf"));
  bindDownload("#report-fleet-xlsx", () => "/api/exports/machines/xlsx");
  bindDownload("#report-fleet-pdf", () => "/api/exports/machines/pdf");
  document.querySelector("#export-alarms")?.addEventListener("click", () => showToast("Alarm exports will be enabled when real alarm storage is connected."));
  bindConnectedProcessChart();
}

function settingsPayload(form) {
  const data = new FormData(form);
  const number = name => Number(data.get(name));
  return {
    siteId: state.settings?.siteId || "plant-01",
    plant: { name: data.get("plant.name"), area: data.get("plant.area"), shift: data.get("plant.shift") },
    thresholds: {
      pressureBar: { minimum: number("thresholds.pressureBar.minimum"), maximum: number("thresholds.pressureBar.maximum") },
      flowLpm: { minimum: number("thresholds.flowLpm.minimum"), maximum: number("thresholds.flowLpm.maximum") },
      suctionKpa: { minimum: number("thresholds.suctionKpa.minimum"), maximum: number("thresholds.suctionKpa.maximum") }
    },
    sampling: { intervalSeconds: number("sampling.intervalSeconds"), staleAfterSeconds: number("sampling.staleAfterSeconds") },
    retentionDays: number("retentionDays"),
    notifications: {
      browserEnabled: data.has("notifications.browserEnabled"), critical: data.has("notifications.critical"),
      warning: data.has("notifications.warning"), info: data.has("notifications.info")
    }
  };
}

async function saveSettings(event) {
  event.preventDefault();
  if (!state.currentUser?.isOwner) return;
  const form = event.currentTarget;
  const payloadToSave = settingsPayload(form);
  state.settingsSaving = true;
  state.settingsError = "";
  renderApp();
  try {
    const payload = await authApi.request("/api/settings", { method: "PUT", body: JSON.stringify(payloadToSave) });
    state.settings = payload.settings;
    if (state.settings.notifications.browserEnabled && window.Notification?.permission === "default") Notification.requestPermission().catch(() => {});
    startLiveSync();
    await loadMachines({ render: false });
    showToast("Plant settings saved and applied live.");
  } catch (error) {
    state.settingsError = error.message;
  } finally {
    state.settingsSaving = false;
    renderApp();
  }
}

function openAlarmAction(alarmId, status) {
  state.alarmModal = { type: "action", alarmId, status };
  state.alarmAuditError = "";
  renderApp();
  document.querySelector("#alarm-audit-form textarea")?.focus();
}

async function openAlarmHistory(alarmId) {
  state.alarmModal = { type: "history", alarmId };
  state.alarmHistory = [];
  state.alarmHistoryLoading = true;
  state.alarmAuditError = "";
  renderApp();
  try {
    const payload = await authApi.request(`/api/alarms/${encodeURIComponent(alarmId)}/history`);
    state.alarmHistory = payload.history || [];
  } catch (error) {
    state.alarmAuditError = error.message;
  } finally {
    state.alarmHistoryLoading = false;
    renderApp();
  }
}

function closeAlarmModal() {
  state.alarmModal = null;
  state.alarmHistory = [];
  state.alarmHistoryLoading = false;
  state.alarmAuditError = "";
  renderApp();
}

async function submitAlarmAction(event) {
  event.preventDefault();
  const modal = state.alarmModal;
  if (!modal || modal.type !== "action") return;
  const submit = document.querySelector('[type="submit"][form="alarm-audit-form"]');
  const comment = String(new FormData(event.currentTarget).get("comment") || "").trim();
  submit.disabled = true;
  state.alarmAuditError = "";
  try {
    await updateAlarm(modal.alarmId, modal.status, comment);
    state.alarmModal = null;
    renderApp();
  } catch (error) {
    state.alarmAuditError = error.message;
    renderApp();
  }
}

async function updateAlarm(id, nextStatus, comment) {
  const payload = await authApi.request(`/api/alarms/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus, comment })
  });
  applyAlarm(payload.alarm);
  showToast(`Alarm marked as ${nextStatus.toLowerCase()}.`);
}

function navigate(page) {
  if (page === "users" && !state.currentUser?.isOwner) return;
  state.page = page;
  state.mobileOpen = false;
  renderApp();
  if (page === "trends" && state.trendMachine) {
    loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  }
  if (page === "live-data") {
    const machineId = machines.find(machine => machine.id === state.machineId)?.id;
    if (machineId) loadMachineHistory(machineId, "24h").catch(error => showToast(error.message));
  }
  if (page === "users") loadManagedUsers().catch(error => showToast(error.message));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateClock() {
  const now = new Date();
  const time = document.querySelector("#header-time");
  const date = document.querySelector("#header-date");
  if (time) time.textContent = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (date) date.textContent = now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

window.setInterval(() => { if (state.authenticated) updateClock(); }, 1000);

document.addEventListener("visibilitychange", () => {
  if (!state.authenticated || document.hidden) return;
  if (!telemetryStream || telemetryStream.readyState === EventSource.CLOSED) connectTelemetryStream();
  syncLiveSnapshot();
});

window.addEventListener("online", () => {
  if (!state.authenticated) return;
  connectTelemetryStream();
  syncLiveSnapshot();
});

async function initializeAuthentication() {
  if (state.authView === "reset") {
    renderLogin();
    return;
  }
  try {
    const restoredSession = await authApi.restore();
    if (restoredSession) {
      await enterApplication(restoredSession);
      return;
    }
  } catch {
    // An expired or unavailable session returns the user to the login screen.
  }
  renderLogin();
}

initializeAuthentication();
