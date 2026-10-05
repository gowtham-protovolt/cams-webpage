const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const AUTH_STORAGE_KEY = "cams-review-session-v1";
const SESSION_DURATION = 8 * 60 * 60 * 1000;
const REMEMBERED_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

const reviewAuth = {
  restore() {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      try {
        const raw = storage.getItem(AUTH_STORAGE_KEY);
        if (!raw) continue;
        const session = JSON.parse(raw);
        if (!session?.identity || !session?.expiresAt || session.expiresAt <= Date.now()) {
          storage.removeItem(AUTH_STORAGE_KEY);
          continue;
        }
        return session;
      } catch {
        storage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    return null;
  },
  signIn(identity, password, remember) {
    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
        if (identity.toLowerCase() === "invalid") {
          reject(new Error("These credentials do not match an active review account."));
          return;
        }
        const displayName = identity.includes("@") ? identity.split("@")[0] : identity;
        const session = {
          identity,
          displayName: displayName.replace(/[._-]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()),
          role: "Owner / Admin",
          expiresAt: Date.now() + (remember ? REMEMBERED_SESSION_DURATION : SESSION_DURATION)
        };
        const storage = remember ? window.localStorage : window.sessionStorage;
        const otherStorage = remember ? window.sessionStorage : window.localStorage;
        otherStorage.removeItem(AUTH_STORAGE_KEY);
        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        resolve(session);
      }, 650);
    });
  },
  signOut() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
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

const machines = [
  { id: "CAMS-01", name: "Compressor 01", zone: "Spinning · Line A", status: "Running", pressure: 7.2, temp: 38.5, flow: 25.6, suction: -0.8, health: 96, updated: "1 sec ago", hours: 6248 },
  { id: "CAMS-02", name: "Compressor 02", zone: "Spinning · Line A", status: "Running", pressure: 7.1, temp: 40.1, flow: 24.8, suction: -0.7, health: 94, updated: "1 sec ago", hours: 5891 },
  { id: "CAMS-03", name: "Compressor 03", zone: "Carding · Line B", status: "Alarm", pressure: 6.2, temp: 45.8, flow: 21.3, suction: -0.6, health: 71, updated: "2 sec ago", hours: 7142 },
  { id: "CAMS-04", name: "Compressor 04", zone: "Carding · Line B", status: "Offline", pressure: null, temp: null, flow: null, suction: null, health: 0, updated: "12 min ago", hours: 4621 },
  { id: "CAMS-05", name: "Compressor 05", zone: "Winding · Line C", status: "Running", pressure: 7.3, temp: 37.9, flow: 26.1, suction: -0.8, health: 98, updated: "1 sec ago", hours: 5107 },
  { id: "CAMS-06", name: "Compressor 06", zone: "Winding · Line C", status: "Running", pressure: 7.0, temp: 39.4, flow: 24.3, suction: -0.9, health: 91, updated: "1 sec ago", hours: 6602 },
  { id: "CAMS-07", name: "Compressor 07", zone: "Utility · North", status: "Stopped", pressure: 0.4, temp: 30.2, flow: 0, suction: -0.1, health: 88, updated: "3 sec ago", hours: 3985 },
  { id: "CAMS-08", name: "Compressor 08", zone: "Utility · North", status: "Running", pressure: 7.2, temp: 38.2, flow: 25.1, suction: -0.8, health: 95, updated: "1 sec ago", hours: 5430 },
  { id: "CAMS-09", name: "Compressor 09", zone: "Packing · South", status: "Running", pressure: 7.4, temp: 39.0, flow: 26.4, suction: -0.7, health: 93, updated: "2 sec ago", hours: 4766 },
  { id: "CAMS-10", name: "Compressor 10", zone: "Packing · South", status: "Stopped", pressure: 0.5, temp: 31.0, flow: 0, suction: -0.1, health: 86, updated: "2 sec ago", hours: 3508 },
  { id: "CAMS-11", name: "Compressor 11", zone: "Blow Room", status: "Running", pressure: 7.1, temp: 41.2, flow: 24.6, suction: -0.8, health: 89, updated: "1 sec ago", hours: 8092 },
  { id: "CAMS-12", name: "Compressor 12", zone: "Blow Room", status: "Running", pressure: 7.3, temp: 38.8, flow: 25.9, suction: -0.9, health: 97, updated: "1 sec ago", hours: 2864 },
  { id: "CAMS-13", name: "Compressor 13", zone: "Standby Bay", status: "Running", pressure: 6.9, temp: 39.7, flow: 23.9, suction: -0.7, health: 92, updated: "2 sec ago", hours: 2291 }
];

let alarms = [
  { id: 1, time: "10:42:18", date: "Today", machine: "CAMS-03", parameter: "Temperature", value: "45.8 °C", severity: "Critical", status: "Active", message: "Discharge temperature above high limit" },
  { id: 2, time: "10:38:04", date: "Today", machine: "CAMS-04", parameter: "Communication", value: "No signal", severity: "Critical", status: "Active", message: "Gateway communication interrupted" },
  { id: 3, time: "09:56:42", date: "Today", machine: "CAMS-11", parameter: "Pressure", value: "6.6 bar", severity: "Warning", status: "Acknowledged", message: "Pressure below preferred operating band" },
  { id: 4, time: "08:21:15", date: "Today", machine: "CAMS-07", parameter: "State", value: "Stopped", severity: "Info", status: "Acknowledged", message: "Machine stopped by local operator" },
  { id: 5, time: "17:48:02", date: "Yesterday", machine: "CAMS-06", parameter: "Temperature", value: "43.1 °C", severity: "Warning", status: "Resolved", message: "Temperature returned to normal band" },
  { id: 6, time: "15:12:38", date: "Yesterday", machine: "CAMS-09", parameter: "Flow", value: "20.2 L/min", severity: "Warning", status: "Resolved", message: "Flow dropped below configured threshold" }
];

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
  mobileOpen: false,
  notificationsOpen: false,
  userMenuOpen: false
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", group: "Monitor" },
  { id: "machines", label: "Machines", icon: "machine", group: "Monitor" },
  { id: "trends", label: "Trends", icon: "trend", group: "Monitor" },
  { id: "alarms", label: "Alarms & Events", icon: "alarm", group: "Monitor" },
  { id: "maintenance", label: "Maintenance", icon: "maintenance", group: "Manage" },
  { id: "reports", label: "Reports", icon: "report", group: "Manage" },
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
      <div class="powered-by"><img src="./assets/e7-powered-logo.png" alt="Powered by E7"></div>
      <div class="visual-copy">
        <h2>Clarity for every compressor.</h2>
        <p>One operational view of pressure, flow, suction and temperature across your complete compressed air network.</p>
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
    showToast("Recovery request noted. Email delivery will activate with the production identity service.");
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
  if (password.value.length < 4) {
    passwordError.textContent = "Password must contain at least 4 characters.";
    passwordWrap.classList.add("invalid");
    return;
  }
  const button = document.querySelector("#login-button");
  button.disabled = true;
  button.innerHTML = `<span class="loading-spinner"></span><span>Verifying access…</span>`;
  try {
    const session = await reviewAuth.signIn(username.value.trim(), password.value, remember.checked);
    state.authenticated = true;
    state.currentUser = session;
    renderApp();
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
  const sidebarNav = groups.map(group => `<div class="nav-group-label">${group}</div><nav class="nav-list">${navItems.filter(item => item.group === group).map(item => `<button class="nav-item ${state.page === item.id || (state.page === "machine-detail" && item.id === "machines") ? "active" : ""}" data-page="${item.id}">${icon(item.icon)}<span>${item.label}</span>${item.future ? '<span class="future">P2</span>' : ""}</button>`).join("")}</nav>`).join("");
  app.innerHTML = `<div class="app-shell">
    ${state.mobileOpen ? '<button class="mobile-overlay" id="mobile-overlay" aria-label="Close menu"></button>' : ""}
    <aside class="sidebar ${state.mobileOpen ? "open" : ""}">
      ${brand(true)}
      ${sidebarNav}
      <div class="sidebar-foot"><div class="sidebar-foot-row"><i class="pulse-dot"></i><span>All systems connected</span></div><div class="sidebar-foot-row"><span>UI prototype · Mock data</span></div></div>
    </aside>
    <header class="top-header">
      <div class="header-plant"><button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Open menu">${icon("menu")}</button><div><div class="plant-name">Demo Spinning Plant</div><div class="plant-meta"><i class="live-dot"></i><span>Plant network online</span></div></div></div>
      <div class="header-right">
        <div class="clock"><strong id="header-time">--:--:--</strong><span id="header-date">--</span></div>
        <button class="icon-btn notification-btn" id="notification-button" aria-label="Notifications">${icon("bell")}<span class="notification-badge">2</span></button>
        <div class="account-control">
          <button class="user-menu" id="user-menu" aria-haspopup="menu" aria-expanded="${state.userMenuOpen}"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span class="user-copy"><strong>${safeName}</strong><span>${safeRole}</span></span>${icon("chevronDown")}</button>
          ${state.userMenuOpen ? `<div class="account-menu" role="menu"><div class="account-summary"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><div><strong>${safeName}</strong><span>${escapeHtml(user.identity)}</span></div></div><div class="account-session">${icon("shield")}<span>Review session active</span></div><button id="sign-out" class="account-action" role="menuitem">${icon("logout")}<span>Sign out</span></button></div>` : ""}
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
    case "machines": return machinesPage();
    case "machine-detail": return machineDetailPage();
    case "trends": return trendsPage();
    case "alarms": return alarmsPage();
    case "maintenance": return phasePage("Maintenance", "P1 · Next phase", "Plan service before it becomes downtime.", "Maintenance workflows will connect compressor runtime, service intervals and technician records in one clear view.", [["calendar", "Service planner", "Upcoming and overdue schedules"], ["maintenance", "Work orders", "Assign, track and close maintenance tasks"], ["report", "Service history", "A complete audit trail for each machine"]]);
    case "reports": return phasePage("Reports", "P1 · Next phase", "Operational insight, ready to share.", "Create owner-ready plant summaries with uptime, alarms, parameter history and machine performance.", [["report", "Shift reports", "Daily operating summary by machine"], ["trend", "Performance reports", "Min, max and average parameter values"], ["download", "PDF & Excel export", "Review-friendly exports for stakeholders"]]);
    case "energy": return phasePage("Energy & Utilization", "P2 · Future module", "Measure the cost of every cubic metre.", "Energy metering and utilization intelligence will be introduced after the core monitoring workflow is approved.", [["energy", "Energy intensity", "kWh per unit of compressed air"], ["pulse", "Load profile", "Loaded, unloaded and idle time"], ["trend", "Opportunity tracking", "Identify efficiency and leakage improvements"]]);
    case "settings": return settingsPage();
    default: return dashboardPage();
  }
}

function pageHead(title, subtitle, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
}

function chartSvg(parameter = "Pressure", pointsCount = 24) {
  const configs = {
    Pressure: { min: 6.6, max: 7.8, unit: "bar", base: 7.18, amp: .27 },
    Flow: { min: 20, max: 30, unit: "L/min", base: 25.3, amp: 2.1 },
    Suction: { min: -1.1, max: -.3, unit: "bar", base: -.76, amp: .16 },
    Temperature: { min: 34, max: 46, unit: "°C", base: 39.1, amp: 2.3 }
  };
  const c = configs[parameter] || configs.Pressure;
  const values = Array.from({ length: pointsCount }, (_, index) => c.base + Math.sin(index * .72) * c.amp + Math.cos(index * .27) * c.amp * .35 + ((index % 5) - 2) * c.amp * .06);
  const x = i => 48 + i * (632 / (values.length - 1));
  const y = value => 18 + ((c.max - value) / (c.max - c.min)) * 178;
  const points = values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const areaPoints = `48,196 ${points} 680,196`;
  const grid = [0, 1, 2, 3, 4].map(i => {
    const gy = 18 + i * 44.5;
    const label = (c.max - i * ((c.max - c.min) / 4)).toFixed(c.max < 10 ? 1 : 0);
    return `<line class="chart-grid-line" x1="48" y1="${gy}" x2="680" y2="${gy}"/><text class="chart-label" x="3" y="${gy + 4}">${label}</text>`;
  }).join("");
  const times = [[48, "09:45"], [206, "10:00"], [364, "10:15"], [522, "10:30"], [680, "10:45"]].map(([tx, label], i) => `<text class="chart-label" x="${tx}" y="220" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${label}</text>`).join("");
  const lastX = x(values.length - 1), lastY = y(values.at(-1));
  return `<svg viewBox="0 0 700 228" preserveAspectRatio="none" role="img" aria-label="${parameter} trend chart"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#42b7a4" stop-opacity=".34"/><stop offset="100%" stop-color="#42b7a4" stop-opacity=".02"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${areaPoints}"/><polyline class="chart-line" points="${points}"/><circle class="chart-point" cx="${lastX}" cy="${lastY}" r="4"/>${times}<text class="chart-label" x="3" y="12">${c.unit}</text></svg>`;
}

function dashboardPage() {
  const running = machines.filter(m => m.status === "Running" || m.status === "Alarm").length;
  const stopped = machines.filter(m => m.status === "Stopped" || m.status === "Offline").length;
  const compactMachines = machines.slice(0, 6).map((machine, index) => `<button class="machine-compact" data-machine="${machine.id}"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${machine.id}</strong><small>${machine.zone}</small></span>${statusPill(machine.status)}</button>`).join("");
  const alarmItems = alarms.slice(0, 4).map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon(alarm.severity === "Critical" ? "alarm" : "info")}</span><div><strong>${alarm.machine} · ${alarm.parameter}</strong><p>${alarm.message}</p></div><div class="alarm-time"><strong>${alarm.time}</strong><span>${alarm.date}</span></div></div>`).join("");
  return `${pageHead("Plant overview", "Real-time compressor status across Demo Spinning Plant", `<span class="updated-note"><i class="pulse-dot"></i>Live · updated now</span><button class="secondary-btn" id="refresh-dashboard">${icon("refresh")} Refresh</button>`)}
    <section class="kpi-grid">
      ${kpi("Total machines", machines.length, "Connected fleet", "machine", "teal")}
      ${kpi("Running", running, `${Math.round(running / machines.length * 100)}% available`, "gauge", "green")}
      ${kpi("Stopped / offline", stopped, "2 stopped · 1 offline", "stop", "slate")}
      ${kpi("Active alarms", 2, "2 require attention", "alarm", "red")}
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <header class="panel-head"><div class="panel-title"><h2>Live operating snapshot</h2><p>CAMS-01 · Compressor 01</p></div><button class="panel-link" data-machine="CAMS-01">View machine →</button></header>
        <div class="panel-body">
          <div class="sensor-row">${sensorMini("Flow", "25.6", "L/min")}${sensorMini("Pressure", "7.2", "bar")}${sensorMini("Suction", "−0.8", "bar")}${sensorMini("Temperature", "38.5", "°C")}</div>
          <div class="chart-toolbar"><div class="chart-legend"><i class="legend-line"></i>Pressure · CAMS-01</div><div class="segment-control"><button>15m</button><button class="active">1h</button><button>6h</button><button>24h</button></div></div>
          <div class="chart">${chartSvg("Pressure")}</div>
        </div>
      </article>
      <article class="panel">
        <header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>Fleet status at a glance</p></div><button class="panel-link" data-page="machines">View all 13 →</button></header>
        <div class="panel-body"><div class="machine-list">${compactMachines}</div></div>
      </article>
    </section>
    <section class="panel">
      <header class="panel-head"><div class="panel-title"><h2>Recent alarms & events</h2><p>Latest operating exceptions from all machines</p></div><button class="panel-link" data-page="alarms">Open alarm centre →</button></header>
      <div class="alarm-list">${alarmItems}</div>
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
    <td>${statusPill(machine.status)}</td><td>${fmt(machine.pressure, "bar")}</td><td>${fmt(machine.temp, "°C")}</td><td>${machine.updated}</td>
    <td><div class="health-score"><div class="health-bar"><span style="width:${machine.health}%"></span></div><small>${machine.health ? `${machine.health}%` : "—"}</small></div></td>
    <td><button class="row-action" data-machine="${machine.id}">View details</button></td>
  </tr>`).join("");
  return `${pageHead("Machines", "Monitor and compare all 13 connected compressor systems", `<button class="secondary-btn" id="export-machines">${icon("download")} Export list</button>`)}
    <div class="filter-bar"><div class="search-wrap">${icon("search")}<input id="machine-search" type="search" value="${state.machineSearch}" placeholder="Search ID, name or area…"></div><div class="filter-pills">${filters}</div></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Machine</th><th>Status</th><th>Pressure</th><th>Temperature</th><th>Last update</th><th>Health</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state">${icon("search")}No machines match this filter.</div></td></tr>`}</tbody></table></div></section>`;
}

function machineDetailPage() {
  const machine = machines.find(item => item.id === state.machineId) || machines[0];
  const value = (key, unit) => machine[key] === null ? "—" : `${machine[key]} <small>${unit}</small>`;
  const related = alarms.filter(alarm => alarm.machine === machine.id).slice(0, 3);
  return `<button class="back-link" data-page="machines">${icon("arrowLeft")} Back to machines</button>
    ${pageHead(`<span class="machine-head-title">${machine.id} ${statusPill(machine.status === "Offline" ? "Offline" : "Online")}</span>`, `${machine.name} · ${machine.zone}`, `<button class="secondary-btn" id="export-machine">${icon("download")} Export data</button>`)}
    <div class="meta-line"><span>${icon("gauge")} Mode: ${machine.status}</span><span>${icon("clock")} Last update: ${machine.updated}</span><span>${icon("wifi")} Communication: ${machine.status === "Offline" ? "Interrupted" : "Stable · 98%"}</span></div>
    <div style="height:18px"></div>
    <section class="sensor-card-grid">
      ${sensorCard("Flow", value("flow", "L/min"), "Normal range 22–28 L/min")}
      ${sensorCard("Pressure", value("pressure", "bar"), "Target range 6.8–7.5 bar")}
      ${sensorCard("Suction", value("suction", "bar"), "Normal range −1.0–−0.5 bar")}
      ${sensorCard("Temperature", value("temp", "°C"), "Warning above 43 °C")}
    </section>
    <section class="detail-grid">
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Operating trend</h2><p>Pressure · last 60 minutes</p></div><div class="segment-control"><button>15m</button><button class="active">1h</button><button>6h</button><button>24h</button></div></header><div class="panel-body"><div class="chart tall">${chartSvg("Pressure", 32)}</div></div></article>
      <div class="info-stack">
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>Current operating state</p></div></header><div class="state-list"><div class="state-row"><span>Operation</span>${statusPill(machine.status)}</div><div class="state-row"><span>PLC link</span>${statusPill(machine.status === "Offline" ? "Offline" : "Online")}</div><div class="state-row"><span>Gateway</span>${statusPill(machine.status === "Offline" ? "Offline" : "Online")}</div><div class="state-row"><span>Overall health</span><strong>${machine.health ? `${machine.health}%` : "—"}</strong></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Service summary</h2><p>Preventive maintenance</p></div></header><div class="service-progress"><div class="service-big"><strong>${machine.hours.toLocaleString()} h</strong><span>Running hours</span></div><div class="progress-track"><span style="width:72%"></span></div><div class="service-dates"><span>Last service · 14 Aug 2026</span><span>Next · 6,500 h</span></div></div></article>
        <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Alarm summary</h2><p>${related.length} recent event${related.length === 1 ? "" : "s"}</p></div><button class="panel-link" data-page="alarms">View all →</button></header><div class="alarm-list">${related.length ? related.map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon("alarm")}</span><div><strong>${alarm.parameter} · ${alarm.value}</strong><p>${alarm.message}</p></div></div>`).join("") : `<div class="empty-state">${icon("check")}No recent alarms for this machine.</div>`}</div></article>
      </div>
    </section>`;
}

function sensorCard(label, value, range) {
  return `<article class="sensor-card"><div class="sensor-card-top"><span class="sensor-card-label">${label}</span><span class="live-tag"><i class="live-dot"></i> LIVE</span></div><div class="sensor-card-value">${value}</div><div class="sensor-range">${range}</div></article>`;
}

function trendsPage() {
  const machine = machines.find(item => item.id === state.trendMachine) || machines[0];
  const parameterValues = {
    Pressure: [machine.pressure ?? 0, 6.81, 7.48, 7.17, "bar"],
    Flow: [machine.flow ?? 0, 22.7, 27.8, 25.2, "L/min"],
    Suction: [machine.suction ?? 0, -1.0, -0.52, -0.76, "bar"],
    Temperature: [machine.temp ?? 0, 35.8, 42.3, 39.1, "°C"]
  }[state.trendParameter];
  const selects = machines.map(m => `<option value="${m.id}" ${m.id === state.trendMachine ? "selected" : ""}>${m.id} · ${m.name}</option>`).join("");
  const parameters = ["Pressure", "Flow", "Suction", "Temperature"].map(parameter => `<option value="${parameter}" ${parameter === state.trendParameter ? "selected" : ""}>${parameter}</option>`).join("");
  const ranges = ["15m", "1h", "6h", "24h", "7d", "Custom"].map(range => `<button class="${state.trendRange === range ? "active" : ""}" data-range="${range}">${range}</button>`).join("");
  return `${pageHead("Trends & analytics", "Explore live and historical operating parameters", `<button class="secondary-btn" id="export-trend">${icon("download")} Export chart</button>`)}
    <section class="trend-controls"><div class="control-group grow"><label>Machine</label><div class="select-wrap"><select id="trend-machine">${selects}</select>${icon("chevronDown")}</div></div><div class="control-group"><label>Parameter</label><div class="select-wrap"><select id="trend-parameter">${parameters}</select>${icon("chevronDown")}</div></div><div class="control-group grow"><label>Time range</label><div class="range-pills">${ranges}</div></div></section>
    <article class="panel"><header class="panel-head"><div class="panel-title"><h2>${state.trendParameter} history</h2><p>${machine.id} · ${state.trendRange === "Custom" ? "custom range preview" : `last ${state.trendRange}`}</p></div><span class="updated-note"><i class="pulse-dot"></i>Live sampling</span></header>
      <div class="panel-body"><div class="chart tall">${chartSvg(state.trendParameter, 40)}</div></div>
      <div class="trend-stat-grid">${trendStat("Current", parameterValues[0], parameterValues[4])}${trendStat("Minimum", parameterValues[1], parameterValues[4])}${trendStat("Maximum", parameterValues[2], parameterValues[4])}${trendStat("Average", parameterValues[3], parameterValues[4])}</div>
    </article>`;
}

function trendStat(label, value, unit) {
  return `<div class="trend-stat"><span>${label}</span><strong>${Number(value).toFixed(1)} <small>${unit}</small></strong></div>`;
}

function alarmsPage() {
  const filters = ["All", "Critical", "Warning", "Info", "Resolved"].map(filter => `<button class="filter-pill ${state.alarmFilter === filter ? "active" : ""}" data-alarm-filter="${filter}">${filter}</button>`).join("");
  const visible = alarms.filter(alarm => state.alarmFilter === "All" || (state.alarmFilter === "Resolved" ? alarm.status === "Resolved" : alarm.severity === state.alarmFilter));
  const rows = visible.map(alarm => `<tr><td><strong>${alarm.time}</strong><br><small>${alarm.date}</small></td><td><strong>${alarm.machine}</strong></td><td>${alarm.parameter}</td><td>${alarm.value}</td><td>${statusPill(alarm.severity)}</td><td>${statusPill(alarm.status)}</td><td><div class="table-actions"><button class="mini-action" data-view-alarm="${alarm.id}">View</button><button class="mini-action" data-ack="${alarm.id}" ${alarm.status !== "Active" ? "disabled" : ""}>Acknowledge</button><button class="mini-action" data-resolve="${alarm.id}" ${alarm.status === "Resolved" ? "disabled" : ""}>Resolve</button></div></td></tr>`).join("");
  return `${pageHead("Alarms & events", "Review, acknowledge and resolve plant operating exceptions", `<button class="secondary-btn" id="export-alarms">${icon("download")} Export history</button>`)}
    <section class="alarm-summary">${alarmSummary("Critical", 2, "alarm", "critical")}${alarmSummary("Warning", 5, "alarm", "warning")}${alarmSummary("Information", 12, "info", "info")}${alarmSummary("Resolved", 48, "check", "info")}</section>
    <div class="filter-bar"><div class="filter-pills">${filters}</div><button class="secondary-btn">${icon("filter")} More filters</button></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Machine</th><th>Parameter</th><th>Value</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function alarmSummary(label, count, iconName, tone) {
  return `<article class="alarm-summary-card"><span class="severity-icon ${tone}">${icon(iconName)}</span><div><span>${label}</span><strong>${count}</strong></div></article>`;
}

function phasePage(title, tag, headline, description, features) {
  return `${pageHead(title, "Preview of the planned CAMS capability")}
    <section class="placeholder-layout"><article class="panel phase-card"><span class="phase-tag">${tag}</span><h2>${headline}</h2><p>${description}</p></article><article class="panel"><header class="panel-head"><div class="panel-title"><h2>Planned capabilities</h2><p>For owner discussion and scope review</p></div></header><div class="feature-list">${features.map(([iconName, name, copy]) => `<div class="feature-item">${icon(iconName)}<div><strong>${name}</strong><span>${copy}</span></div></div>`).join("")}</div></article></section>`;
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

function bindGlobalEvents() {
  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  document.querySelectorAll("[data-machine]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    state.machineId = button.dataset.machine;
    navigate("machine-detail");
  }));
  document.querySelector("#mobile-menu")?.addEventListener("click", () => { state.mobileOpen = true; renderApp(); });
  document.querySelector("#mobile-overlay")?.addEventListener("click", () => { state.mobileOpen = false; renderApp(); });
  document.querySelector("#notification-button")?.addEventListener("click", () => { navigate("alarms"); });
  document.querySelector("#user-menu")?.addEventListener("click", () => {
    state.userMenuOpen = !state.userMenuOpen;
    renderApp();
  });
  document.querySelector("#sign-out")?.addEventListener("click", () => {
    reviewAuth.signOut();
    state.authenticated = false;
    state.currentUser = null;
    state.userMenuOpen = false;
    renderLogin();
    showToast("Signed out of the CAMS review session.");
  });
}

function bindPageEvents() {
  document.querySelector("#refresh-dashboard")?.addEventListener("click", () => { showToast("Live mock readings refreshed."); renderApp(); });
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
  document.querySelector("#trend-machine")?.addEventListener("change", event => { state.trendMachine = event.target.value; renderApp(); });
  document.querySelector("#trend-parameter")?.addEventListener("change", event => { state.trendParameter = event.target.value; renderApp(); });
  document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => { state.trendRange = button.dataset.range; renderApp(); }));
  document.querySelectorAll(".toggle").forEach(button => button.addEventListener("click", () => button.classList.toggle("on")));
  document.querySelector("#save-settings")?.addEventListener("click", () => showToast("Interface preferences saved for review."));
  ["#export-machines", "#export-machine", "#export-trend", "#export-alarms"].forEach(selector => document.querySelector(selector)?.addEventListener("click", () => showToast("Export prepared in this UI prototype.")));
}

function updateAlarm(id, nextStatus) {
  alarms = alarms.map(alarm => alarm.id === id ? { ...alarm, status: nextStatus } : alarm);
  renderApp();
  showToast(`Alarm marked as ${nextStatus.toLowerCase()}.`);
}

function navigate(page) {
  state.page = page;
  state.mobileOpen = false;
  renderApp();
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

const restoredSession = reviewAuth.restore();
if (restoredSession) {
  state.authenticated = true;
  state.currentUser = restoredSession;
  renderApp();
} else {
  renderLogin();
}
