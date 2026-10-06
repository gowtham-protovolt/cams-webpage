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

let alarms = [];

const state = {
  authenticated: false,
  currentUser: null,
  page: "dashboard",
  machineId: "CAMS-01",
  machineFilter: "All",
  machineSearch: "",
  alarmFilter: "All",
  trendMachine: "CAMS-01",
  trendParameter: "Pressure",
  trendRange: "1h",
  reportMachine: "CAMS-01",
  reportRange: "24h",
  mobileOpen: false,
  notificationsOpen: false,
  userMenuOpen: false,
  telemetryConnected: false,
  lastTelemetryAt: null,
  managedUsers: [],
  usersLoading: false,
  usersError: ""
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

function healthScore(status, metrics) {
  if (status === "Offline") return 0;
  if (status === "Stopped") return 85;
  if (status === "Alarm") return 65;
  if (!metrics) return 0;
  let score = 100;
  if (metrics.pressureBar < 6.8 || metrics.pressureBar > 7.5) score -= 12;
  if (metrics.flowLpm < 22 || metrics.flowLpm > 28) score -= 8;
  if (metrics.suctionKpa < 0.6 || metrics.suctionKpa > 1.8) score -= 8;
  return Math.max(0, score);
}

function mapMachine(item) {
  const telemetry = item.telemetry || null;
  const metrics = telemetry?.metrics || null;
  const status = displayStatus(telemetry?.status || item.status);
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
    health: healthScore(status, metrics),
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
  };
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

function scheduleTelemetryRender() {
  if (telemetryRenderTimer || !state.authenticated) return;
  telemetryRenderTimer = window.setTimeout(() => {
    telemetryRenderTimer = null;
    if (document.activeElement?.id !== "machine-search") renderApp();
  }, 250);
}

function closeTelemetryStream() {
  telemetryStream?.close();
  telemetryStream = null;
  state.telemetryConnected = false;
  if (telemetryRenderTimer) window.clearTimeout(telemetryRenderTimer);
  telemetryRenderTimer = null;
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
  telemetryStream.onerror = () => {
    state.telemetryConnected = false;
    scheduleTelemetryRender();
  };
}

async function enterApplication(user) {
  state.authenticated = true;
  state.currentUser = user;
  await loadMachines({ render: false });
  if (machines[0]) {
    await loadMachineHistory(machines[0].id, "1h", { render: false }).catch(() => {});
  }
  renderApp();
  connectTelemetryStream();
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
  app.innerHTML = `<main class="login-shell">
    <section class="login-form-side">
      ${brand()}
      <div class="login-content">
        <p class="login-kicker">Secure plant access</p>
        <h1>Welcome back.</h1>
        <p class="login-intro">Sign in to monitor compressor health, live parameters, trends and plant alarms.</p>
        <form id="login-form" novalidate>
          <div class="form-field">
            <label for="username">Username or email</label>
            <div class="input-wrap" id="username-wrap">${icon("user", "field-icon")}<input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Enter username"></div>
            <p class="field-error" id="username-error"></p>
          </div>
          <div class="form-field">
            <label for="password">Password</label>
            <div class="input-wrap" id="password-wrap">${icon("lock", "field-icon")}<input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter password"><button class="password-toggle" id="password-toggle" type="button" aria-label="Show password">${icon("eye")}</button></div>
            <p class="field-error" id="password-error"></p>
          </div>
          <div class="form-options">
            <label class="checkbox"><input id="remember-me" type="checkbox" checked> Remember me</label>
            <button class="text-link" id="forgot-password" type="button">Forgot password?</button>
          </div>
          <button class="primary-btn wide" id="login-button" type="submit"><span>Sign in to CAMS</span>${icon("chevronRight")}</button>
          <div class="login-note">${icon("shield")} Protected industrial monitoring access</div>
        </form>
      </div>
      <footer class="login-footer"><span>© 2026 CAMS</span><span>System version 1.0 · UI review</span></footer>
    </section>
    <aside class="login-visual" aria-label="CAMS overview">
      <div class="powered-by"><span>Powered by</span><span class="owner-mark">E7</span></div>
      <div class="visual-copy">
        <h2>Clarity for every compressor.</h2>
        <p>One operational view of pressure, flow and suction across your complete compressed air network.</p>
      </div>
      <div class="system-route"><span>Sensors</span><i class="route-dot"></i><span>PLC</span><i class="route-dot"></i><span>ESP32-S3</span><i class="route-dot"></i><span>MQTT</span><i class="route-dot"></i><b>CAMS</b></div>
    </aside>
  </main>`;

  document.querySelector("#password-toggle").addEventListener("click", (event) => {
    const input = document.querySelector("#password");
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.innerHTML = icon(input.type === "password" ? "eye" : "eyeOff");
    event.currentTarget.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
  });
  document.querySelector("#forgot-password").addEventListener("click", () => {
    const username = document.querySelector("#username");
    const usernameError = document.querySelector("#username-error");
    const usernameWrap = document.querySelector("#username-wrap");
    if (!username.value.trim()) {
      usernameError.textContent = "Enter your username or email first.";
      usernameWrap.classList.add("invalid");
      username.focus();
      return;
    }
    usernameError.textContent = "";
    usernameWrap.classList.remove("invalid");
    showToast("Password recovery is not enabled yet. Contact the CAMS administrator.");
  });
  document.querySelector("#login-form").addEventListener("submit", handleLogin);
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
  const connectionLabel = state.telemetryConnected ? "Live telemetry stream" : "Telemetry reconnecting";
  const networkLabel = state.telemetryConnected ? "Plant network online" : "Waiting for live telemetry";
  const sidebarNav = groups.map(group => `<div class="nav-group-label">${group}</div><nav class="nav-list">${navItems.filter(item => item.group === group && (!item.ownerOnly || user.isOwner)).map(item => `<button class="nav-item ${state.page === item.id || (state.page === "machine-detail" && item.id === "machines") ? "active" : ""}" data-page="${item.id}">${icon(item.icon)}<span>${item.label}</span>${item.future ? '<span class="future">P2</span>' : ""}</button>`).join("")}</nav>`).join("");
  app.innerHTML = `<div class="app-shell">
    ${state.mobileOpen ? '<button class="mobile-overlay" id="mobile-overlay" aria-label="Close menu"></button>' : ""}
    <aside class="sidebar ${state.mobileOpen ? "open" : ""}">
      ${brand(true)}
      ${sidebarNav}
      <div class="sidebar-foot"><div class="sidebar-foot-row"><i class="pulse-dot"></i><span>${connectionLabel}</span></div><div class="sidebar-foot-row"><span>MongoDB-backed monitoring</span></div></div>
    </aside>
    <header class="top-header">
      <div class="header-plant"><button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Open menu">${icon("menu")}</button><div><div class="plant-name">Demo Spinning Plant</div><div class="plant-meta"><i class="live-dot"></i><span>${networkLabel}</span></div></div></div>
      <div class="header-right">
        <div class="clock"><strong id="header-time">--:--:--</strong><span id="header-date">--</span></div>
        <button class="icon-btn notification-btn" id="notification-button" aria-label="Notifications">${icon("bell")}${alarms.filter(alarm => alarm.status === "Active").length ? `<span class="notification-badge">${alarms.filter(alarm => alarm.status === "Active").length}</span>` : ""}</button>
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
  switch (state.page) {
    case "live-data": return liveDataPage();
    case "machines": return machinesPage();
    case "machine-detail": return machineDetailPage();
    case "trends": return trendsPage();
    case "alarms": return alarmsPage();
    case "maintenance": return phasePage("Maintenance", "P1 · Next phase", "Plan service before it becomes downtime.", "Maintenance workflows will connect compressor runtime, service intervals and technician records in one clear view.", [["calendar", "Service planner", "Upcoming and overdue schedules"], ["maintenance", "Work orders", "Assign, track and close maintenance tasks"], ["report", "Service history", "A complete audit trail for each machine"]]);
    case "reports": return reportsPage();
    case "users": return usersPage();
    case "energy": return phasePage("Energy & Utilization", "P2 · Future module", "Measure the cost of every cubic metre.", "Energy metering and utilization intelligence will be introduced after the core monitoring workflow is approved.", [["energy", "Energy intensity", "kWh per unit of compressed air"], ["pulse", "Load profile", "Loaded, unloaded and idle time"], ["trend", "Opportunity tracking", "Identify efficiency and leakage improvements"]]);
    case "settings": return settingsPage();
    default: return dashboardPage();
  }
}

function liveDataPage() {
  const machine = machines.find(item => item.id === "CAMS-01") || machines[0];
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
    const time = observed.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }).replaceAll(":", "-");
    return `<details class="data-tree-node data-tree-sample" ${dateIndex === 0 && sampleIndex === 0 ? "open" : ""}><summary>${icon("clock")}<strong>${time}</strong><span>${escapeHtml(reading.status || "unknown")}</span></summary><div class="data-tree-values">
      ${treeValue("flowLpm", reading.metrics?.flowLpm, "L/min")}${treeValue("pressureBar", reading.metrics?.pressureBar, "bar")}${treeValue("suctionKpa", reading.metrics?.suctionKpa, "kPa")}
      ${treeValue("PV1", reading.raw?.pv1)}${treeValue("PV2", reading.raw?.pv2)}${treeValue("PV3", reading.raw?.pv3)}
      ${treeValue("ERR1", reading.errors?.flow)}${treeValue("ERR2", reading.errors?.suction)}${treeValue("ERR3", reading.errors?.pressure)}
      ${treeValue("source", reading.source || "—")}${treeValue("calibration", reading.calibrationVersion || "—")}
    </div></details>`;
  }).join("")}</div></details>`).join("");
  return `${pageHead("Live sensor data", "Stored MQTT readings from the authenticated ESP32-S3 gateway", `<span class="updated-note"><i class="pulse-dot"></i>${state.lastTelemetryAt ? `Last sample · ${relativeTime(state.lastTelemetryAt)}` : "Waiting for ESP32"}</span><button class="secondary-btn" id="refresh-live-data">${icon("refresh")} Refresh</button>`)}
    <section class="panel data-tree-panel"><div class="data-tree-root"><div class="data-tree-root-label">${icon("database")}<strong>CAMS</strong><span>MongoDB telemetry</span></div><div class="data-tree-children"><details class="data-tree-node data-tree-device" open><summary>${icon("machine")}<strong>${escapeHtml(machine?.id || "CAMS-01")}</strong><span>${machine ? machine.status : "Waiting"}</span></summary><div class="data-tree-children">${dates || `<div class="empty-state">${icon("pulse")}No sensor values received. Connect PLC → ESP32-S3 RS485 → MQTT.</div>`}</div></details></div></div></section>`;
}

function treeValue(label, value, unit = "") {
  const display = value === null || value === undefined ? "—" : `${value}${unit ? ` ${unit}` : ""}`;
  return `<div class="data-tree-value"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></div>`;
}

function pageHead(title, subtitle, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
}

const parameterConfig = {
  Pressure: { field: "pressureBar", unit: "bar", fallbackSpan: 1.2 },
  Flow: { field: "flowLpm", unit: "L/min", fallbackSpan: 10 },
  Suction: { field: "suctionKpa", unit: "kPa", fallbackSpan: 1.2 }
};

function historyFor(machineId, parameter) {
  const config = parameterConfig[parameter] || parameterConfig.Pressure;
  return (machineHistory.get(machineId) || [])
    .map(reading => ({ value: Number(reading.metrics?.[config.field]), observedAt: reading.observedAt }))
    .filter(point => Number.isFinite(point.value));
}

function chartSvg(parameter = "Pressure", readings = []) {
  const c = parameterConfig[parameter] || parameterConfig.Pressure;
  if (!readings.length) return `<div class="empty-state">${icon("pulse")}Waiting for live telemetry history.</div>`;
  const pointsToPlot = readings.length === 1 ? [readings[0], readings[0]] : readings;
  const values = pointsToPlot.map(point => point.value);
  const actualMin = Math.min(...values);
  const actualMax = Math.max(...values);
  const padding = Math.max((actualMax - actualMin) * 0.15, c.fallbackSpan * 0.08);
  const min = actualMin - padding;
  const max = actualMax + padding;
  const x = i => 48 + i * (632 / (values.length - 1));
  const y = value => 18 + ((max - value) / (max - min)) * 178;
  const points = values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const areaPoints = `48,196 ${points} 680,196`;
  const grid = [0, 1, 2, 3, 4].map(i => {
    const gy = 18 + i * 44.5;
    const label = (max - i * ((max - min) / 4)).toFixed(Math.abs(max) < 10 ? 1 : 0);
    return `<line class="chart-grid-line" x1="48" y1="${gy}" x2="680" y2="${gy}"/><text class="chart-label" x="3" y="${gy + 4}">${label}</text>`;
  }).join("");
  const timeAt = ratio => {
    const index = Math.min(pointsToPlot.length - 1, Math.round((pointsToPlot.length - 1) * ratio));
    const value = pointsToPlot[index].observedAt;
    return value ? new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
  };
  const times = [0, .25, .5, .75, 1].map((ratio, i) => `<text class="chart-label" x="${48 + 632 * ratio}" y="220" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${timeAt(ratio)}</text>`).join("");
  const lastX = x(values.length - 1), lastY = y(values.at(-1));
  return `<svg viewBox="0 0 700 228" preserveAspectRatio="none" role="img" aria-label="${parameter} trend chart"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#42b7a4" stop-opacity=".34"/><stop offset="100%" stop-color="#42b7a4" stop-opacity=".02"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${areaPoints}"/><polyline class="chart-line" points="${points}"/><circle class="chart-point" cx="${lastX}" cy="${lastY}" r="4"/>${times}<text class="chart-label" x="3" y="12">${c.unit}</text></svg>`;
}

function dashboardPage() {
  const running = machines.filter(m => m.status === "Running" || m.status === "Alarm").length;
  const stopped = machines.filter(m => m.status === "Stopped" || m.status === "Offline").length;
  const stoppedCount = machines.filter(m => m.status === "Stopped").length;
  const offlineCount = machines.filter(m => m.status === "Offline").length;
  const activeAlarmCount = alarms.filter(alarm => alarm.status === "Active").length;
  const availability = machines.length ? Math.round(running / machines.length * 100) : 0;
  const snapshot = machines.find(machine => machine.id === "CAMS-01") || machines[0] || null;
  const snapshotHistory = snapshot ? historyFor(snapshot.id, "Pressure") : [];
  const compactMachines = machines.slice(0, 6).map((machine, index) => `<button class="machine-compact" data-machine="${machine.id}"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${machine.id}</strong><small>${machine.zone}</small></span>${statusPill(machine.status)}</button>`).join("");
  const alarmItems = alarms.slice(0, 4).map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon(alarm.severity === "Critical" ? "alarm" : "info")}</span><div><strong>${alarm.machine} · ${alarm.parameter}</strong><p>${alarm.message}</p></div><div class="alarm-time"><strong>${alarm.time}</strong><span>${alarm.date}</span></div></div>`).join("");
  const liveLabel = state.lastTelemetryAt ? `Live · ${relativeTime(state.lastTelemetryAt)}` : "Waiting for telemetry";
  return `${pageHead("Plant overview", "Real-time compressor status across Demo Spinning Plant", `<span class="updated-note"><i class="pulse-dot"></i>${liveLabel}</span><button class="secondary-btn" id="refresh-dashboard">${icon("refresh")} Refresh</button>`)}
    <section class="kpi-grid">
      ${kpi("Total machines", machines.length, "Connected fleet", "machine", "teal")}
      ${kpi("Running", running, `${availability}% available`, "gauge", "green")}
      ${kpi("Stopped / offline", stopped, `${stoppedCount} stopped · ${offlineCount} offline`, "stop", "slate")}
      ${kpi("Active alarms", activeAlarmCount, activeAlarmCount ? `${activeAlarmCount} require attention` : "No live alarms", "alarm", "red")}
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <header class="panel-head"><div class="panel-title"><h2>Live operating snapshot</h2><p>${snapshot ? `${snapshot.id} · ${snapshot.name}` : "No connected machine"}</p></div>${snapshot ? `<button class="panel-link" data-machine="${snapshot.id}">View machine →</button>` : ""}</header>
        <div class="panel-body">
          <div class="sensor-row">${sensorMini("Flow", snapshot ? fmt(snapshot.flow) : "—", "L/min")}${sensorMini("Pressure", snapshot ? fmt(snapshot.pressure) : "—", "bar")}${sensorMini("Suction", snapshot ? fmt(snapshot.suction) : "—", "kPa")}</div>
          <div class="chart-toolbar"><div class="chart-legend"><i class="legend-line"></i>Pressure · ${snapshot?.id || "—"}</div><div class="segment-control"><button>15m</button><button class="active">1h</button><button>6h</button><button>24h</button></div></div>
          <div class="chart">${chartSvg("Pressure", snapshotHistory)}</div>
        </div>
      </article>
      <article class="panel">
        <header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>Fleet status at a glance</p></div><button class="panel-link" data-page="machines">View all ${machines.length} →</button></header>
        <div class="panel-body"><div class="machine-list">${compactMachines || `<div class="empty-state">${icon("machine")}No machines are registered.</div>`}</div></div>
      </article>
    </section>
    <section class="panel">
      <header class="panel-head"><div class="panel-title"><h2>Recent alarms & events</h2><p>Latest operating exceptions from all machines</p></div><button class="panel-link" data-page="alarms">Open alarm centre →</button></header>
      <div class="alarm-list">${alarmItems || `<div class="empty-state">${icon("check")}No live alarms received.</div>`}</div>
    </section>`;
}

function kpi(label, value, note, iconName, tone) {
  return `<article class="kpi-card"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon ${tone}">${icon(iconName)}</span></div><div class="kpi-value"><strong>${value}</strong><span>${note}</span></div></article>`;
}

function sensorMini(label, value, unit) {
  return `<div class="sensor-mini"><div class="sensor-mini-head"><span>${label}</span><i class="live-dot"></i></div><strong>${value}</strong><small>${unit}</small></div>`;
}

function machinesPage() {
  const filtered = machines.filter(machine => (state.machineFilter === "All" || machine.status === state.machineFilter) && (machine.id.toLowerCase().includes(state.machineSearch.toLowerCase()) || machine.name.toLowerCase().includes(state.machineSearch.toLowerCase()) || machine.zone.toLowerCase().includes(state.machineSearch.toLowerCase())));
  const filters = ["All", "Running", "Stopped", "Alarm", "Offline"].map(filter => `<button class="filter-pill ${state.machineFilter === filter ? "active" : ""}" data-filter="${filter}">${filter}${filter === "All" ? ` · ${machines.length}` : ""}</button>`).join("");
  const rows = filtered.map((machine, index) => `<tr class="clickable" data-machine="${machine.id}">
    <td><div class="machine-cell"><span class="machine-num">${String(machines.indexOf(machine) + 1).padStart(2, "0")}</span><span><strong>${machine.id}</strong><small>${machine.zone}</small></span></div></td>
    <td>${statusPill(machine.status)}</td><td>${fmt(machine.pressure, "bar")}</td><td>${fmt(machine.flow, "L/min")}</td><td>${fmt(machine.suction, "kPa")}</td><td>${machine.updated}</td>
    <td><div class="health-score"><div class="health-bar"><span style="width:${machine.health}%"></span></div><small>${machine.health ? `${machine.health}%` : "—"}</small></div></td>
    <td><button class="row-action" data-machine="${machine.id}">View details</button></td>
  </tr>`).join("");
  return `${pageHead("Machines", `Monitor and compare ${machines.length} connected compressor systems`, `<button class="secondary-btn" id="export-machines">${icon("download")} Export list</button>`)}
    <div class="filter-bar"><div class="search-wrap">${icon("search")}<input id="machine-search" type="search" value="${state.machineSearch}" placeholder="Search ID, name or area…"></div><div class="filter-pills">${filters}</div></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Machine</th><th>Status</th><th>Pressure</th><th>Flow</th><th>Suction</th><th>Last update</th><th>Health</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="8"><div class="empty-state">${icon("search")}No machines match this filter.</div></td></tr>`}</tbody></table></div></section>`;
}

function machineDetailPage() {
  const machine = machines.find(item => item.id === state.machineId) || machines[0];
  if (!machine) return `${pageHead("Machine details", "No machine is currently available")}<div class="empty-state">${icon("machine")}Register a machine and publish telemetry to view details.</div>`;
  const value = (key, unit) => machine[key] === null || machine[key] === undefined ? "—" : `${machine[key]} <small>${unit}</small>`;
  const related = alarms.filter(alarm => alarm.machine === machine.id).slice(0, 3);
  const pressureHistory = historyFor(machine.id, "Pressure");
  return `<button class="back-link" data-page="machines">${icon("arrowLeft")} Back to machines</button>
    ${pageHead(`<span class="machine-head-title">${machine.id} ${statusPill(machine.status === "Offline" ? "Offline" : "Online")}</span>`, `${machine.name} · ${machine.zone}`, `<button class="secondary-btn" id="export-machine-pdf">${icon("report")} PDF</button><button class="secondary-btn" id="export-machine-xlsx">${icon("download")} Excel</button>`)}
    <div class="meta-line"><span>${icon("gauge")} Mode: ${machine.status}</span><span>${icon("clock")} Last update: ${machine.updated}</span><span>${icon("wifi")} Communication: ${machine.status === "Offline" ? "Interrupted" : "Stable · 98%"}</span></div>
    <div style="height:18px"></div>
    <section class="sensor-card-grid">
      ${sensorCard("Flow", value("flow", "L/min"), "Normal range 22–28 L/min")}
      ${sensorCard("Pressure", value("pressure", "bar"), "Target range 6.8–7.5 bar")}
      ${sensorCard("Suction", value("suction", "kPa"), "Verified calibration range 0.6–1.8 kPa")}
    </section>
    <section class="panel diagnostics-panel"><header class="panel-head"><div class="panel-title"><h2>PLC diagnostics</h2><p>Raw Modbus registers and conversion traceability</p></div><span class="updated-note">${machine.source || "Waiting for gateway"}</span></header>
      <div class="diagnostic-grid">${diagnosticValue("PV1 · Flow", machine.raw?.pv1, `ERR1 ${machine.errors?.flow ?? "—"}`, machine.quality?.flow)}${diagnosticValue("PV2 · Suction", machine.raw?.pv2, `ERR2 ${machine.errors?.suction ?? "—"}`, machine.quality?.suction)}${diagnosticValue("PV3 · Pressure", machine.raw?.pv3, `ERR3 ${machine.errors?.pressure ?? "—"}`, machine.quality?.pressure)}${diagnosticValue("Calibration", machine.calibrationVersion || "—", "500 ms sampling", machine.quality?.modbus)}</div>
    </section>
    <section class="detail-grid">
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Operating trend</h2><p>Pressure · last 60 minutes</p></div><div class="segment-control"><button>15m</button><button class="active">1h</button><button>6h</button><button>24h</button></div></header><div class="panel-body"><div class="chart tall">${chartSvg("Pressure", pressureHistory)}</div></div></article>
      <div class="info-stack">
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>Current operating state</p></div></header><div class="state-list"><div class="state-row"><span>Operation</span>${statusPill(machine.status)}</div><div class="state-row"><span>PLC link</span>${statusPill(machine.status === "Offline" ? "Offline" : "Online")}</div><div class="state-row"><span>Gateway</span>${statusPill(machine.status === "Offline" ? "Offline" : "Online")}</div><div class="state-row"><span>Overall health</span><strong>${machine.health ? `${machine.health}%` : "—"}</strong></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Service summary</h2><p>Preventive maintenance</p></div></header><div class="service-progress"><div class="service-big"><strong>${machine.hours === null ? "—" : `${machine.hours.toLocaleString()} h`}</strong><span>Running hours</span></div><div class="progress-track"><span style="width:0%"></span></div><div class="service-dates"><span>Service records not connected</span><span>Maintenance module · next phase</span></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Alarm summary</h2><p>${related.length} recent event${related.length === 1 ? "" : "s"}</p></div><button class="panel-link" data-page="alarms">View all →</button></header><div class="alarm-list">${related.length ? related.map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon("alarm")}</span><div><strong>${alarm.parameter} · ${alarm.value}</strong><p>${alarm.message}</p></div></div>`).join("") : `<div class="empty-state">${icon("check")}No recent alarms for this machine.</div>`}</div></article>
      </div>
    </section>`;
}

function sensorCard(label, value, range) {
  return `<article class="sensor-card"><div class="sensor-card-top"><span class="sensor-card-label">${label}</span><span class="live-tag"><i class="live-dot"></i> LIVE</span></div><div class="sensor-card-value">${value}</div><div class="sensor-range">${range}</div></article>`;
}

function diagnosticValue(label, value, detail, quality) {
  const normalized = quality || "unknown";
  return `<div class="diagnostic-value"><span>${label}</span><strong>${value ?? "—"}</strong><small>${detail} · <b class="quality-${normalized}">${normalized}</b></small></div>`;
}

function trendsPage() {
  const machine = machines.find(item => item.id === state.trendMachine) || machines[0];
  if (!machine) return `${pageHead("Trends & analytics", "No machine telemetry is available")}<div class="empty-state">${icon("trend")}Publish telemetry to begin charting.</div>`;
  const history = historyFor(machine.id, state.trendParameter);
  const values = history.map(point => point.value);
  const current = values.at(-1) ?? null;
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const unit = (parameterConfig[state.trendParameter] || parameterConfig.Pressure).unit;
  const selects = machines.map(m => `<option value="${m.id}" ${m.id === state.trendMachine ? "selected" : ""}>${m.id} · ${m.name}</option>`).join("");
  const parameters = ["Pressure", "Flow", "Suction"].map(parameter => `<option value="${parameter}" ${parameter === state.trendParameter ? "selected" : ""}>${parameter}</option>`).join("");
  const ranges = ["15m", "1h", "6h", "24h", "7d", "Custom"].map(range => `<button class="${state.trendRange === range ? "active" : ""}" data-range="${range}">${range}</button>`).join("");
  return `${pageHead("Trends & analytics", "Explore live and historical operating parameters", `<button class="secondary-btn" id="export-trend-pdf">${icon("report")} PDF</button><button class="secondary-btn" id="export-trend-xlsx">${icon("download")} Excel</button>`)}
    <section class="trend-controls"><div class="control-group grow"><label>Machine</label><div class="select-wrap"><select id="trend-machine">${selects}</select>${icon("chevronDown")}</div></div><div class="control-group"><label>Parameter</label><div class="select-wrap"><select id="trend-parameter">${parameters}</select>${icon("chevronDown")}</div></div><div class="control-group grow"><label>Time range</label><div class="range-pills">${ranges}</div></div></section>
    <article class="panel"><header class="panel-head"><div class="panel-title"><h2>${state.trendParameter} history</h2><p>${machine.id} · ${state.trendRange === "Custom" ? "custom range preview" : `last ${state.trendRange}`}</p></div><span class="updated-note"><i class="pulse-dot"></i>Live sampling</span></header>
      <div class="panel-body"><div class="chart tall">${chartSvg(state.trendParameter, history)}</div></div>
      <div class="trend-stat-grid">${trendStat("Current", current, unit)}${trendStat("Minimum", minimum, unit)}${trendStat("Maximum", maximum, unit)}${trendStat("Average", average, unit)}</div>
    </article>`;
}

function trendStat(label, value, unit) {
  return `<div class="trend-stat"><span>${label}</span><strong>${value === null ? "—" : Number(value).toFixed(1)} <small>${unit}</small></strong></div>`;
}

function alarmsPage() {
  const filters = ["All", "Critical", "Warning", "Info", "Resolved"].map(filter => `<button class="filter-pill ${state.alarmFilter === filter ? "active" : ""}" data-alarm-filter="${filter}">${filter}</button>`).join("");
  const visible = alarms.filter(alarm => state.alarmFilter === "All" || (state.alarmFilter === "Resolved" ? alarm.status === "Resolved" : alarm.severity === state.alarmFilter));
  const rows = visible.map(alarm => `<tr><td><strong>${alarm.time}</strong><br><small>${alarm.date}</small></td><td><strong>${alarm.machine}</strong></td><td>${alarm.parameter}</td><td>${alarm.value}</td><td>${statusPill(alarm.severity)}</td><td>${statusPill(alarm.status)}</td><td><div class="table-actions"><button class="mini-action" data-view-alarm="${alarm.id}">View</button><button class="mini-action" data-ack="${alarm.id}" ${alarm.status !== "Active" ? "disabled" : ""}>Acknowledge</button><button class="mini-action" data-resolve="${alarm.id}" ${alarm.status === "Resolved" ? "disabled" : ""}>Resolve</button></div></td></tr>`).join("");
  const count = (severity, status = "Active") => alarms.filter(alarm => alarm.severity === severity && alarm.status === status).length;
  const resolved = alarms.filter(alarm => alarm.status === "Resolved").length;
  return `${pageHead("Alarms & events", "Review, acknowledge and resolve plant operating exceptions", `<button class="secondary-btn" id="export-alarms">${icon("download")} Export history</button>`)}
    <section class="alarm-summary">${alarmSummary("Critical", count("Critical"), "alarm", "critical")}${alarmSummary("Warning", count("Warning"), "alarm", "warning")}${alarmSummary("Information", count("Info"), "info", "info")}${alarmSummary("Resolved", resolved, "check", "info")}</section>
    <div class="filter-bar"><div class="filter-pills">${filters}</div><button class="secondary-btn">${icon("filter")} More filters</button></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Machine</th><th>Parameter</th><th>Value</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state">${icon("check")}No live alarms received.</div></td></tr>`}</tbody></table></div></section>`;
}

function alarmSummary(label, count, iconName, tone) {
  return `<article class="alarm-summary-card"><span class="severity-icon ${tone}">${icon(iconName)}</span><div><span>${label}</span><strong>${count}</strong></div></article>`;
}

function phasePage(title, tag, headline, description, features) {
  return `${pageHead(title, "Preview of the planned CAMS capability")}
    <section class="placeholder-layout"><article class="panel phase-card"><span class="phase-tag">${tag}</span><h2>${headline}</h2><p>${description}</p></article><article class="panel"><header class="panel-head"><div class="panel-title"><h2>Planned capabilities</h2><p>For owner discussion and scope review</p></div></header><div class="feature-list">${features.map(([iconName, name, copy]) => `<div class="feature-item">${icon(iconName)}<div><strong>${name}</strong><span>${copy}</span></div></div>`).join("")}</div></article></section>`;
}

function reportsPage() {
  const options = machines.map(machine => `<option value="${machine.id}" ${machine.id === state.reportMachine ? "selected" : ""}>${machine.id} · ${machine.name}</option>`).join("");
  const ranges = ["1h", "6h", "24h", "7d"].map(range => `<button class="${state.reportRange === range ? "active" : ""}" data-report-range="${range}">${range}</button>`).join("");
  return `${pageHead("Reports & exports", "Create protected files from stored CAMS data")}
    <section class="trend-controls"><div class="control-group grow"><label>Machine</label><div class="select-wrap"><select id="report-machine">${options}</select>${icon("chevronDown")}</div></div><div class="control-group grow"><label>Telemetry range</label><div class="range-pills">${ranges}</div></div></section>
    <section class="placeholder-layout">
      <article class="panel phase-card"><span class="phase-tag">LIVE EXPORT</span><h2>Machine telemetry</h2><p>Download up to 5,000 stored readings for ${state.reportMachine} over the selected period.</p><div class="page-actions"><button class="primary-btn" id="report-telemetry-xlsx">${icon("download")} Download Excel</button><button class="secondary-btn" id="report-telemetry-pdf">${icon("report")} Download PDF</button></div></article>
      <article class="panel phase-card"><span class="phase-tag">LIVE EXPORT</span><h2>Machine fleet</h2><p>Download the registered machine inventory with each compressor's latest telemetry.</p><div class="page-actions"><button class="primary-btn" id="report-fleet-xlsx">${icon("download")} Download Excel</button><button class="secondary-btn" id="report-fleet-pdf">${icon("report")} Download PDF</button></div></article>
    </section>`;
}

function settingsPage() {
  const cards = [
    ["Plant profile", "Manage site name, areas and shift details.", "Demo Spinning Plant", false],
    ["Live refresh", "Update connected machine readings automatically.", "Every 1 second", true],
    ["Alarm notifications", "Show browser alerts for critical conditions.", "Critical & warning", true],
    ["Engineering units", "Configure units used throughout the dashboard.", "Metric units", false]
  ];
  return `${pageHead("Settings", "Configure the CAMS interface and monitoring preferences", `<button class="primary-btn" id="save-settings">Save changes</button>`)}
    <section class="settings-grid">${cards.map(([title, copy, value, toggle]) => `<article class="setting-card"><h3>${title}</h3><p>${copy}</p><div class="toggle-row"><strong>${value}</strong>${toggle ? '<button class="toggle on" aria-label="Toggle setting"></button>' : '<button class="secondary-btn">Edit</button>'}</div></article>`).join("")}</section>`;
}

function userDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function usersPage() {
  if (!state.currentUser?.isOwner) {
    return `${pageHead("Users", "Owner access is required")}<div class="empty-state">${icon("shield")}You do not have permission to manage CAMS users.</div>`;
  }
  const activeUsers = state.managedUsers.filter(user => user.active).length;
  const rows = state.managedUsers.map(user => `<tr>
    <td><div class="user-identity"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></span></div></td>
    <td>${escapeHtml(user.email)}</td>
    <td><span class="role-tag">${escapeHtml(user.role)}</span></td>
    <td>${statusPill(user.active ? "Online" : "Offline")}</td>
    <td>${escapeHtml(userDate(user.lastLoginAt))}</td>
    <td><button class="mini-action" data-user-status="${escapeHtml(user.id)}" data-next-active="${user.active ? "false" : "true"}" ${user.id === state.currentUser.id ? "disabled" : ""}>${user.active ? "Disable" : "Enable"}</button></td>
  </tr>`).join("");
  const tableBody = state.usersLoading
    ? `<tr><td colspan="6"><div class="empty-state"><span class="loading-spinner dark"></span>Loading registered users…</div></td></tr>`
    : rows || `<tr><td colspan="6"><div class="empty-state">${icon("user")}No user accounts are registered.</div></td></tr>`;
  return `${pageHead("Users", "Create accounts and control access to CAMS")}
    <section class="user-summary-grid">
      ${kpi("Registered users", state.managedUsers.length, "All accounts", "user", "teal")}
      ${kpi("Active accounts", activeUsers, "Allowed to sign in", "shield", "green")}
    </section>
    ${state.usersError ? `<div class="inline-error">${escapeHtml(state.usersError)}</div>` : ""}
    <section class="panel user-create-panel">
      <header class="panel-head"><div class="panel-title"><h2>Add a CAMS user</h2><p>The temporary password is hashed immediately and is never shown in the user list.</p></div></header>
      <form id="create-user-form" class="user-create-form">
        <label><span>Display name</span><input name="displayName" required maxlength="80" autocomplete="name" placeholder="e.g. Plant Operator"></label>
        <label><span>Username</span><input name="username" required minlength="3" maxlength="32" pattern="[a-z0-9._-]+" autocomplete="off" placeholder="plant.operator"></label>
        <label><span>Email</span><input name="email" required type="email" autocomplete="email" placeholder="operator@example.com"></label>
        <label><span>Role</span><select name="role"><option value="viewer">Viewer</option><option value="operator">Operator</option></select></label>
        <label><span>Temporary password</span><input name="password" required type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="At least 12 characters"></label>
        <button class="primary-btn" type="submit">${icon("user")} Create user</button>
      </form>
    </section>
    <section class="panel">
      <header class="panel-head"><div class="panel-title"><h2>Registered accounts</h2><p>${activeUsers} active · ${state.managedUsers.length - activeUsers} disabled</p></div><button class="secondary-btn" id="refresh-users">${icon("refresh")} Refresh</button></header>
      <div class="table-wrap"><table class="data-table user-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Action</th></tr></thead><tbody>${tableBody}</tbody></table></div>
    </section>`;
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
    navigate("machine-detail");
    loadMachineHistory(state.machineId, "1h").catch(error => showToast(error.message));
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

function bindPageEvents() {
  document.querySelector("#refresh-dashboard")?.addEventListener("click", async () => {
    try {
      await loadMachines({ render: false });
      const snapshot = machines.find(machine => machine.id === "CAMS-01") || machines[0];
      if (snapshot) await loadMachineHistory(snapshot.id, "1h", { render: false });
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
  document.querySelectorAll("[data-alarm-filter]").forEach(button => button.addEventListener("click", () => { state.alarmFilter = button.dataset.alarmFilter; renderApp(); }));
  document.querySelectorAll("[data-ack]").forEach(button => button.addEventListener("click", () => updateAlarm(Number(button.dataset.ack), "Acknowledged")));
  document.querySelectorAll("[data-resolve]").forEach(button => button.addEventListener("click", () => updateAlarm(Number(button.dataset.resolve), "Resolved")));
  document.querySelectorAll("[data-view-alarm]").forEach(button => button.addEventListener("click", () => {
    const alarm = alarms.find(item => item.id === Number(button.dataset.viewAlarm));
    showToast(`${alarm.machine}: ${alarm.message}`);
  }));
  document.querySelector("#trend-machine")?.addEventListener("change", event => {
    state.trendMachine = event.target.value;
    renderApp();
    loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  });
  document.querySelector("#trend-parameter")?.addEventListener("change", event => { state.trendParameter = event.target.value; renderApp(); });
  document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => {
    state.trendRange = button.dataset.range;
    renderApp();
    loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  }));
  document.querySelector("#report-machine")?.addEventListener("change", event => {
    state.reportMachine = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-report-range]").forEach(button => button.addEventListener("click", () => {
    state.reportRange = button.dataset.reportRange;
    renderApp();
  }));
  document.querySelectorAll(".toggle").forEach(button => button.addEventListener("click", () => button.classList.toggle("on")));
  document.querySelector("#save-settings")?.addEventListener("click", () => showToast("Interface preferences saved for review."));
  document.querySelector("#refresh-users")?.addEventListener("click", () => loadManagedUsers());
  document.querySelector("#refresh-live-data")?.addEventListener("click", () => {
    const machineId = machines.find(machine => machine.id === "CAMS-01")?.id;
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
}

function updateAlarm(id, nextStatus) {
  alarms = alarms.map(alarm => alarm.id === id ? { ...alarm, status: nextStatus } : alarm);
  renderApp();
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
    const machineId = machines.find(machine => machine.id === "CAMS-01")?.id;
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

async function initializeAuthentication() {
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
