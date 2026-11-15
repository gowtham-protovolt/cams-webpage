import { bindMaintenance, loadMaintenance } from "./src/pages/maintenance.js";
import { bindLocations } from "./src/pages/locations.js";
 import {
  renderAlarmsPage,
  renderDashboardPage,
  renderEnergyPage,
  renderLoginPage,
  renderPasswordRequestPage,
  renderPasswordResetPage,
  renderMachineDetailPage,
  renderMachinesPage,
  renderMaintenancePage,
  renderProfilePage,
  renderSettingsPage,
  renderTrendsPage,
  renderTicketsPage,
  renderTicketDetailPage,
  renderUsersPage
} from "./src/pages/index.js";
import { createDevicePreview, createDevicePreviewConfiguration } from "./src/data/device-preview.js";
import { trendTimeBounds } from "./src/pages/trends.js";
import {
  addComment,
  applyTicketEvent,
  closeTicket,
  getTicket,
  listTickets,
  loadOperators,
  loadTicket,
  loadTickets,
  updateTicket
} from "./src/data/tickets.js";
import { telemetryUpdateTime } from "./src/pages/shared.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const configuredApiBaseUrl = String(window.CAMS_CONFIG?.apiBaseUrl || "");
const API_BASE_URL = (configuredApiBaseUrl === "same-origin" ? window.location.origin : configuredApiBaseUrl).replace(/\/$/, "");

const customSelectMenuState = new WeakMap();
const customSelectMenuOwners = new WeakMap();

function positionCustomSelectMenu(wrapper) {
  const trigger = wrapper.querySelector("[data-custom-select-trigger]");
  const menu = customSelectMenuState.get(wrapper)?.menu;
  if (!trigger || !menu || menu.hidden) return;
  const bounds = trigger.getBoundingClientRect();
  const viewportGap = 12;
  const menuGap = 5;
  const spaceBelow = window.innerHeight - bounds.bottom - viewportGap;
  const spaceAbove = bounds.top - viewportGap;
  const preferredHeight = Math.min(menu.scrollHeight || 80, 320, window.innerHeight * .48);
  const openAbove = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(80, openAbove ? spaceAbove - menuGap : spaceBelow);
  const renderedHeight = Math.min(preferredHeight, availableHeight);
  menu.style.top = `${openAbove ? Math.max(viewportGap, bounds.top - renderedHeight - menuGap) : bounds.bottom + menuGap}px`;
  menu.style.left = `${bounds.left}px`;
  menu.style.width = `${bounds.width}px`;
  menu.style.maxHeight = `${availableHeight}px`;
}

function setCustomSelectOpen(wrapper, open) {
  const trigger = wrapper.querySelector("[data-custom-select-trigger]");
  let state = customSelectMenuState.get(wrapper);
  let menu = state?.menu || wrapper.querySelector(".custom-select-menu");
  if (!trigger || !menu) return;
  if (!state) {
    state = { menu, placeholder: null };
    customSelectMenuState.set(wrapper, state);
    customSelectMenuOwners.set(menu, wrapper);
  }
  trigger.setAttribute("aria-expanded", String(open));
  menu.hidden = !open;
  wrapper.classList.toggle("is-open", open);
  if (open) {
    if (!state.placeholder) {
      state.placeholder = document.createComment("time-range-menu");
      menu.before(state.placeholder);
    }
    menu.classList.toggle("dashboard-time-range-menu", Boolean(wrapper.closest(".dashboard-time-range")));
    menu.classList.toggle("dashboard-parameter-menu", Boolean(wrapper.closest(".dashboard-parameter")));
    menu.classList.toggle("custom-calendar-select-menu", Boolean(wrapper.closest(".custom-calendar-month-select")));
    menu.classList.toggle("user-edit-select-menu", wrapper.classList.contains("user-edit-select"));
    document.body.append(menu);
    positionCustomSelectMenu(wrapper);
  } else {
    if (state.placeholder?.isConnected) state.placeholder.replaceWith(menu);
    state.placeholder = null;
    menu.classList.remove("dashboard-time-range-menu");
    menu.classList.remove("dashboard-parameter-menu", "custom-calendar-select-menu", "user-edit-select-menu");
    menu.style.removeProperty("top");
    menu.style.removeProperty("left");
    menu.style.removeProperty("width");
    menu.style.removeProperty("max-height");
  }
}

function closeCustomSelects(except) {
  document.querySelectorAll("[data-custom-select]").forEach(wrapper => {
    if (wrapper !== except) setCustomSelectOpen(wrapper, false);
  });
}

function cleanupCustomSelectMenus() {
  closeCustomSelects();
  document.querySelectorAll("body > .custom-select-menu").forEach(menu => {
    const owner = customSelectMenuOwners.get(menu);
    if (owner?.isConnected) setCustomSelectOpen(owner, false);
    else menu.remove();
  });
}

function selectCustomOption(option) {
  const wrapper = customSelectMenuOwners.get(option.closest(".custom-select-menu"));
  const select = wrapper?.querySelector(".custom-select-native");
  const state = wrapper ? customSelectMenuState.get(wrapper) : null;
  if (!wrapper || !select || !state) return false;
  select.value = option.dataset.customSelectOption;
  wrapper.querySelector(".custom-select-trigger span").textContent = option.textContent;
  state.menu.querySelectorAll("[data-custom-select-option]").forEach(item => {
    item.setAttribute("aria-selected", String(item === option));
  });
  select.dispatchEvent(new Event("change", { bubbles: true }));
  setCustomSelectOpen(wrapper, false);
  document.getElementById(`${select.id}-trigger`)?.focus({ preventScroll: true });
  return true;
}

document.addEventListener("click", event => {
  const activeDownloadMenu = event.target.closest?.(".download-menu");
  document.querySelectorAll(".download-menu[open]").forEach(menu => {
    if (menu !== activeDownloadMenu && !menu.classList.contains("is-exporting")) menu.removeAttribute("open");
  });

  const trigger = event.target.closest?.("[data-custom-select-trigger]");
  if (trigger) {
    const wrapper = trigger.closest("[data-custom-select]");
    const open = trigger.getAttribute("aria-expanded") !== "true";
    closeCustomSelects(wrapper);
    setCustomSelectOpen(wrapper, open);
    return;
  }

  const option = event.target.closest?.("[data-custom-select-option]");
  if (option) {
    event.preventDefault();
    selectCustomOption(option);
    return;
  }

  if (!event.target.closest?.("[data-custom-select]")) closeCustomSelects();
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".download-menu[open]").forEach(menu => menu.removeAttribute("open"));
});

document.addEventListener("scroll", event => {
  if (event.target.closest?.(".custom-select-menu")) return;
  document.querySelectorAll("[data-custom-select].is-open").forEach(positionCustomSelectMenu);
}, true);
window.addEventListener("resize", () => {
  document.querySelectorAll("[data-custom-select].is-open").forEach(positionCustomSelectMenu);
});

document.addEventListener("keydown", event => {
  const option = event.target.closest?.("[data-custom-select-option]");
  if (option) {
    const wrapper = customSelectMenuOwners.get(option.closest(".custom-select-menu"));
    const options = [...customSelectMenuState.get(wrapper).menu.querySelectorAll("[data-custom-select-option]")];
    const index = options.indexOf(option);
    const nextIndex = event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1)
      : event.key === "ArrowUp" ? Math.max(index - 1, 0)
        : event.key === "Home" ? 0
          : event.key === "End" ? options.length - 1
            : -1;
    if (nextIndex >= 0) {
      event.preventDefault();
      options[nextIndex].focus();
    } else if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      selectCustomOption(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setCustomSelectOpen(wrapper, false);
      wrapper.querySelector("[data-custom-select-trigger]")?.focus();
    }
    return;
  }

  const trigger = event.target.closest?.("[data-custom-select-trigger]");
  if (!trigger) return;
  const wrapper = trigger.closest("[data-custom-select]");
  if (event.key === "Escape" && trigger.getAttribute("aria-expanded") === "true") {
    event.preventDefault();
    setCustomSelectOpen(wrapper, false);
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
  event.preventDefault();
  const wasOpen = trigger.getAttribute("aria-expanded") === "true";
  closeCustomSelects(wrapper);
  setCustomSelectOpen(wrapper, true);
  const options = [...customSelectMenuState.get(wrapper).menu.querySelectorAll("[data-custom-select-option]")];
  const selected = options.findIndex(item => item.getAttribute("aria-selected") === "true");
  const index = event.key === "ArrowDown" ? Math.min(selected + (wasOpen ? 1 : 0), options.length - 1)
    : event.key === "ArrowUp" ? Math.max(selected - (wasOpen ? 1 : 0), 0)
      : Math.max(selected, 0);
  options[index]?.focus();
});

function sessionUser(user) {
  return {
    ...user,
    identity: user.email || user.username,
    isOwner: user.role === "owner",
    role: user.role === "owner" ? "Owner / Admin" : user.role
  };
}

function parseFilterDate(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(input);
  if (!match) throw new Error("Enter dates as dd-mm-yyyy.");
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    throw new Error("Enter a valid date in dd-mm-yyyy format.");
  }
  return `${year}-${month}-${day}`;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setAlarmTimeRange(range) {
  state.alarmTimeRange = range;
  if (range === "custom") return;
  const today = new Date();
  const from = new Date(today);
  if (range === "7 days") from.setDate(from.getDate() - 6);
  if (range === "30 days") from.setDate(from.getDate() - 29);
  state.alarmFromDate = localDateValue(from);
  state.alarmToDate = localDateValue(today);
}

function setTicketTimeRange(range) {
  state.ticketTimeRange = range;
  if (range === "custom") return;
  if (range === "All") {
    state.ticketFromDate = "";
    state.ticketToDate = "";
    return;
  }
  const days = Number.parseInt(range, 10);
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - days + 1);
  state.ticketFromDate = localDateValue(from);
  state.ticketToDate = localDateValue(today);
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
  async changePassword(currentPassword, newPassword) {
    return this.request("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },
  async listUsers() {
    return this.request("/api/admin/users");
  },
  async dashboardSummary(siteId) {
    return this.request(`/api/dashboard/summary?siteId=${encodeURIComponent(siteId)}`);
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
  async updateUser(userId, user) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify(user) });
  },
  async deleteUser(userId) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },
  async restoreUser(userId) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/restore`, { method: "POST", body: "{}" });
  },
  async permanentlyDeleteUser(userId) {
    return this.request(`/api/admin/users/${encodeURIComponent(userId)}/permanent`, { method: "DELETE" });
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
  async getMachineConfiguration(machineId, siteId) {
    return this.request(`/api/machines/${encodeURIComponent(machineId)}/configuration?siteId=${encodeURIComponent(siteId)}`);
  },
  async saveMachineConfiguration(machineId, siteId, configuration) {
    return this.request(`/api/machines/${encodeURIComponent(machineId)}/configuration?siteId=${encodeURIComponent(siteId)}`, {
      method: "PUT",
      body: JSON.stringify(configuration)
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
  async permanentlyDeleteMachine(machineId, siteId) {
    return this.request(`/api/machines/${encodeURIComponent(machineId)}/permanent?siteId=${encodeURIComponent(siteId)}`, { method: "DELETE" });
  },
  async download(path) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", signal: controller.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const exportError = new Error(payload.error || "Export could not be created.");
        exportError.name = "ExportError";
        throw exportError;
      }
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || "cams-export";
      return { blob: await response.blob(), filename };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Export took too long. Reduce the time range and try again.");
      if (error?.name === "ExportError") throw error;
      throw new Error("CAMS export service is unavailable. Try again shortly.");
    } finally {
      window.clearTimeout(timeout);
    }
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
let liveRenderDeferred = false;
const liveTelemetryPages = new Set(["dashboard", "machines", "machine-detail", "trends", "alarms"]);
let profileOutsideClickBound = false;
let calendarOutsideClickBound = false;

let alarms = [];

const savedMachineId = window.sessionStorage.getItem("cams.machineId");
const savedMachineView = window.sessionStorage.getItem("cams.machineView");
const savedTrendParameter = window.sessionStorage.getItem("cams.trendParameter");
const savedDashboardParameter = window.sessionStorage.getItem("cams.dashboardParameter");
const savedDashboardRange = window.sessionStorage.getItem("cams.dashboardRange");
const savedDetailParameter = window.sessionStorage.getItem("cams.detailParameter");
let savedScreenMode = "preview";
try {
  savedScreenMode = window.localStorage.getItem("cams.screenMode") === "live" ? "live" : "preview";
} catch (error) {
  console.warn("Could not read the CAMS screen mode preference.", error);
}
const resetTokenFromUrl = new URLSearchParams(window.location.search).get("resetToken") || "";
const devicePreviewMode = new URLSearchParams(window.location.search).get("devicePreview") === "1";
const machineLimitStorageKey = "cams.machineOperatingLimits";
let savedMachineLimitOverrides = {};
try {
  const storedLimits = window.localStorage.getItem(machineLimitStorageKey);
  savedMachineLimitOverrides = storedLimits ? JSON.parse(storedLimits) : {};
} catch {
  savedMachineLimitOverrides = {};
}

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
  ticketId: "",
  ticketRecords: [],
  ticketOperators: [],
  ticketsError: "",
  ticketSearch: "",
  ticketPriorityFilter: "All",
  ticketClusterFilter: "All",
  ticketAreaFilter: "All",
  ticketDeviceFilter: "All",
  ticketStatusFilter: "All",
  ticketTimeRange: "All",
  ticketFromDate: "",
  ticketToDate: "",
  ticketMoreFiltersOpen: false,
  devicePreviewMode,
  machineId: savedMachineId || "CAMS-01",
  machineFilter: "All",
  dashboardDeviceReturn: false,
  dashboardAlarmReturn: false,
  machineClusterFilter: "All",
  machineAreaFilter: "All",
  machineDeviceFilter: "All",
  machineMoreFiltersOpen: false,
  machineSearch: "",
  machineMoreFiltersOpen: false,
  machineClusterFilter: "All",
  machineAreaFilter: "All",
  machineDeviceFilter: "All",
  machineTimeRange: "All",
  machineView: ["list", "cluster", "live"].includes(savedMachineView) ? savedMachineView : "cluster",
  expandedMachineClusters: ["cluster-1"],
  expandedMachineAreas: ["cluster-1:area-1"],
  alarmFilter: "All",
  trendMachine: "CAMS-01",
  trendParameter: ["Pressure", "Flow", "Suction"].includes(savedTrendParameter) ? savedTrendParameter : "Pressure",
  trendRange: "1h",
  dashboardParameter: ["Pressure", "Flow", "Suction", "Temperature"].includes(savedDashboardParameter) ? savedDashboardParameter : "Pressure",
  dashboardRange: ["15m", "1h", "6h", "24h", "7d", "1mo", "3mo", "6mo", "1y"].includes(savedDashboardRange) ? savedDashboardRange : "1h",
  dashboardRefreshing: false,
  powerMonitorOpen: false,
  machinePowerMonitorOpen: false,
  powerMonitorMetric: "voltageV",
  powerMonitorRange: "1h",
  dashboardCustomDate: "",
  customDatePicker: null,
  customDatePickerMonth: "",
  customDatePickerSelecting: null,
  detailParameter: ["Pressure", "Flow", "Suction", "Temperature"].includes(savedDetailParameter) ? savedDetailParameter : "Pressure",
  detailRange: "1h",
  detailCustomDate: "",
  trendCustomDate: "",
  screenMode: savedScreenMode,
  liveSidebarOpen: false,
  mobileOpen: false,
  notificationsOpen: false,
  userMenuOpen: false,
  telemetryConnected: false,
  lastTelemetryAt: null,
  managedUsers: [],
  userAccountFilter: "registered",
  userModal: null,
  profilePasswordError: "",
  usersRemovedOpen: false,
  alarmMoreFiltersOpen: false,
  alarmFilterPanel: "quick",
  alarmClusterFilter: "All",
  alarmAreaFilter: "All",
  alarmMachineFilter: "All",
  alarmPointFilter: "All",
  alarmSeverityFilter: "All",
  alarmStatusFilter: "All",
  alarmTimeRange: "All",
  alarmFromDate: "",
  alarmToDate: "",
  usersLoading: false,
  usersError: "",
  settings: null,
  settingsSaving: false,
  settingsError: "",
  machineLimitOverrides: savedMachineLimitOverrides,
  machineLimitsEditing: false,
  machineLimitsSaving: false,
  machineConfigurationOpen: false,
  machineConfigurationLoading: false,
  machineConfigurationSaving: false,
  machineConfigurationError: "",
  machineConfigurationTab: "general",
  machineConfiguration: null,
  devicePreviewConfigurations: {},
  machineModal: null,
  removedMachines: [],
  removedMachinesLoading: false,
  machineManagementError: ""
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", group: "Operations" },
  { id: "machines", label: "Devices", icon: "machine", group: "Operations" },
  { id: "trends", label: "Trends", icon: "trend", group: "Operations" },
  { id: "alarms", label: "Alarms & Events", icon: "alarm", group: "Operations" },
  { id: "maintenance", label: "Maintenance", icon: "maintenance", group: "Manage" },
  { id: "tickets", label: "Tickets", icon: "layers", group: "Manage" },
  { id: "users", label: "Users", icon: "user", group: "Manage", ownerOnly: true },
  { id: "settings", label: "Settings", icon: "settings", group: "Manage" },
  { id: "energy", label: "Energy & Utilization", icon: "energy", group: "Future", future: true }
];

function brand(light = false) {
  return `<div class="brand-lockup ${light ? "light" : ""}">
    <span class="brand-mark">${icon("air")}</span>
    <span><span class="brand-name">CAMS</span><span class="brand-sub">Industrial Intelligence & Monitoring platform</span></span>
  </div>`;
}

function statusPill(status) {
  return `<span class="status-pill status-${status.toLowerCase()}">${status}</span>`;
}

function fmt(value, unit = "") {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(value % 1 ? 1 : 0)}${unit ? ` ${unit}` : ""}`;
}

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "error" ? "error" : "success"}`;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  toast.innerHTML = `${icon(tone === "error" ? "alarm" : "check")}<span>${message}</span>`;
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

function mapMachine(item) {
  const telemetry = item.telemetry || null;
  const metrics = telemetry?.metrics || null;
  const quality = telemetry?.quality || null;
  const monitoring = telemetry?.monitoring || item.monitoring || {};
  const status = displayStatus(monitoring.status || telemetry?.status || item.status);
  const receivedAt = telemetry?.receivedAt || item.lastSeenAt || null;
  return {
    id: item.id,
    siteId: item.siteId || "plant-01",
    name: item.name || item.id,
    zone: item.zone || "Unassigned",
    cluster: item.cluster || "",
    clusterId: item.clusterId,
    areaId: item.areaId,
    status,
    pressure: quality?.pressure === "bad" ? null : metrics?.pressureBar ?? null,
    flow: quality?.flow === "bad" ? null : metrics?.flowLpm ?? null,
    suction: quality?.suction === "bad" ? null : metrics?.suctionKpa ?? null,
    temperature: quality?.temperature === "bad" ? null : metrics?.temperatureC ?? null,
    powerMonitor: metrics?.powerMonitor || null,
    raw: telemetry?.raw || null,
    errors: telemetry?.errors || null,
    quality,
    calibrationVersion: telemetry?.calibrationVersion || null,
    source: telemetry?.source || null,
    monitoring,
    health: Number.isFinite(monitoring.health) ? monitoring.health : 0,
    gatewayStatus: displayStatus(monitoring.gatewayStatus || "offline"),
    plcStatus: displayStatus(monitoring.plcStatus || "offline"),
    communicationPercent: Number.isFinite(monitoring.communicationPercent) ? monitoring.communicationPercent : 0,
    reasons: monitoring.reasons || [],
    updated: telemetryUpdateTime(receivedAt, { live: status !== "Offline" }),
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
    occurredAt,
    date: date.toLocaleDateString("en-IN"),
    time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    acknowledgedAt: item.acknowledgedAt,
    resolvedAt: item.resolvedAt
  };
}

async function loadAlarms({ render = true } = {}) {
  const params = new URLSearchParams({
    siteId: state.settings?.siteId || "plant-01",
    limit: "500"
  });
  if (state.alarmClusterFilter !== "All") params.set("cluster", state.alarmClusterFilter);
  if (state.alarmAreaFilter !== "All") {
    try {
      const [, area] = JSON.parse(state.alarmAreaFilter);
      if (area) params.set("area", area);
    } catch {
      // Ignore legacy client-side area keys rather than sending an invalid filter.
    }
  }
  if (state.alarmMachineFilter !== "All") params.set("machineId", state.alarmMachineFilter);
  if (state.alarmPointFilter !== "All") params.set("parameter", state.alarmPointFilter);
  const severity = state.alarmSeverityFilter !== "All"
    ? state.alarmSeverityFilter
    : ["Critical", "Warning", "Info"].includes(state.alarmFilter) ? state.alarmFilter : "";
  const status = state.alarmStatusFilter !== "All"
    ? state.alarmStatusFilter
    : state.alarmFilter === "Resolved" ? "Resolved" : "";
  if (severity) params.set("severity", severity);
  if (status) params.set("status", status);
  if (state.alarmFromDate) params.set("from", new Date(`${state.alarmFromDate}T00:00:00`).toISOString());
  if (state.alarmToDate) params.set("to", new Date(`${state.alarmToDate}T23:59:59.999`).toISOString());
  const payload = await authApi.request(`/api/alarms?${params}`);
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

async function loadMachines({ render = true, loadLocations = true } = {}) {
  if (devicePreviewMode) {
    const preview = createDevicePreview();
    machines = preview.machines.map(item => {
      const machine = mapMachine(item);
      const configuration = state.devicePreviewConfigurations[machine.id];
      if (configuration) machine.name = configuration.general.deviceName;
      return machine;
    });
    state.locations = preview.clusters;
    machineHistory.clear();
    for (const reading of preview.readings) appendHistory(reading);
    state.lastTelemetryAt = preview.readings[0]?.receivedAt || null;
    if (!machines.some(machine => machine.id === state.machineId)) state.machineId = machines[0]?.id || "";
    if (!machines.some(machine => machine.id === state.trendMachine)) state.trendMachine = machines[0]?.id || "";
    if (render && !state.locationManager && !state.machineModal) renderApp();
    return machines;
  }
  const [payload, locations] = await Promise.all([
    authApi.request("/api/machines"),
    loadLocations ? authApi.request(`/api/locations?siteId=${encodeURIComponent(state.settings?.siteId || "plant-01")}`) : Promise.resolve(null)
  ]);
  if (locations) state.locations = locations.clusters;
  applyMachinePayload(payload);
  if (render && !state.locationManager && !state.machineModal) renderApp();
}

function applyMachinePayload(payload) {
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
}

async function openMachineConfiguration() {
  const machine = machines.find(item => item.id === state.machineId);
  if (!machine) return;
  state.machineConfigurationOpen = true;
  state.machineConfigurationLoading = true;
  state.machineConfigurationSaving = false;
  state.machineConfigurationError = "";
  state.machineConfigurationTab = "general";
  state.machineConfiguration = null;
  renderApp();
  try {
    state.machineConfiguration = await loadDeviceConfiguration(machine);
  } catch (error) {
    state.machineConfigurationError = error.message;
  } finally {
    state.machineConfigurationLoading = false;
    if (state.machineConfigurationOpen && state.page === "machine-detail") renderApp();
  }
}

async function loadDeviceConfiguration(machine) {
  let configuration;
  let saved;
  if (devicePreviewMode) {
    configuration = state.devicePreviewConfigurations[machine.id] || createDevicePreviewConfiguration(machine);
    saved = Boolean(state.devicePreviewConfigurations[machine.id]);
  } else {
    const payload = await authApi.getMachineConfiguration(machine.id, machine.siteId);
    configuration = payload.configuration;
    saved = payload.saved;
  }
  const legacy = saved ? null : state.machineLimitOverrides?.[machine.id];
  if (legacy) {
    configuration = {
      ...configuration,
      sensors: {
        ...configuration.sensors,
        flow: legacy.flowLpm || configuration.sensors.flow,
        pressure: legacy.pressureBar || configuration.sensors.pressure,
        suction: legacy.suctionKpa || configuration.sensors.suction,
        temperature: legacy.temperatureC || configuration.sensors.temperature
      }
    };
  }
  return configuration;
}

async function loadMachineConfigurationForDetail() {
  const machine = machines.find(item => item.id === state.machineId);
  if (!machine) return;
  const configuration = await loadDeviceConfiguration(machine);
  if (state.page !== "machine-detail" || state.machineId !== machine.id || state.machineConfigurationOpen) return;
  state.machineConfiguration = configuration;
  renderApp();
}

function closeMachineConfiguration() {
  if (state.machineConfigurationSaving) return;
  state.machineConfigurationOpen = false;
  state.machineConfigurationError = "";
  renderApp();
}

function configurationFromForm(form) {
  const fields = new FormData(form);
  const value = name => String(fields.get(name) ?? "").trim();
  const number = name => Number(fields.get(name));
  const range = name => ({ minimum: number(`sensors.${name}.minimum`), maximum: number(`sensors.${name}.maximum`) });
  const powerMetricKeys = ["voltageV", "currentA", "activePowerW", "reactivePowerVar", "apparentPowerVa", "powerFactor", "frequencyHz", "powerTotalKwh"];
  const configuration = {
    general: { deviceName: value("general.deviceName"), machineId: value("general.machineId"), location: value("general.location") },
    sensors: { flow: range("flow"), pressure: range("pressure"), suction: range("suction"), temperature: range("temperature") },
    plc: { protocol: value("plc.protocol"), baudRate: number("plc.baudRate"), serialFormat: value("plc.serialFormat"), slaveId: number("plc.slaveId") },
    data: { samplingInterval: number("data.samplingInterval"), mqttTopic: value("data.mqttTopic") },
    alarms: {
      thresholdAlerts: fields.has("alarms.thresholdAlerts"),
      highPressure: number("alarms.highPressure"),
      lowPressure: number("alarms.lowPressure"),
      offlineDelaySeconds: number("alarms.offlineDelaySeconds")
    }
  };
  const powerMonitor = {};
  for (const key of powerMetricKeys) {
    const minimum = value(`sensors.powerMonitor.${key}.minimum`);
    const maximum = value(`sensors.powerMonitor.${key}.maximum`);
    if (!minimum && !maximum) continue;
    if (!minimum || !maximum) throw new Error(`${key} requires both a minimum and maximum.`);
    powerMonitor[key] = { minimum: Number(minimum), maximum: Number(maximum) };
  }
  if (Object.keys(powerMonitor).length) configuration.sensors.powerMonitor = powerMonitor;
  for (const [label, sensorRange] of Object.entries(configuration.sensors).filter(([key]) => key !== "powerMonitor")) {
    if (!Number.isFinite(sensorRange.minimum) || !Number.isFinite(sensorRange.maximum) || sensorRange.minimum >= sensorRange.maximum) {
      throw new Error(`${label} minimum must be lower than its maximum.`);
    }
  }
  for (const [label, sensorRange] of Object.entries(powerMonitor)) {
    if (!Number.isFinite(sensorRange.minimum) || !Number.isFinite(sensorRange.maximum) || sensorRange.minimum >= sensorRange.maximum) {
      throw new Error(`${label} minimum must be lower than its maximum.`);
    }
  }
  if (configuration.alarms.lowPressure >= configuration.alarms.highPressure) {
    throw new Error("Low pressure threshold must be lower than the high threshold.");
  }
  if (!configuration.general.deviceName) throw new Error("Device name is required.");
  return configuration;
}

async function saveMachineConfiguration(event) {
  event.preventDefault();
  if (!state.currentUser?.isOwner || state.machineConfigurationSaving) return;
  const machine = machines.find(item => item.id === state.machineId);
  if (!machine) return;
  let configuration;
  try {
    configuration = configurationFromForm(event.currentTarget);
  } catch (error) {
    state.machineConfigurationError = error.message;
    renderApp();
    return;
  }
  state.machineConfiguration = configuration;
  state.machineConfigurationSaving = true;
  state.machineConfigurationError = "";
  renderApp();
  try {
    if (devicePreviewMode) {
      state.devicePreviewConfigurations[machine.id] = configuration;
      const previewMachine = machines.find(item => item.id === machine.id);
      if (previewMachine) previewMachine.name = configuration.general.deviceName;
    } else {
      const result = await authApi.saveMachineConfiguration(machine.id, machine.siteId, configuration);
      state.machineConfiguration = result.configuration;
      await loadMachines({ render: false });
    }
    state.machineConfigurationSaving = false;
    renderApp();
    showToast("Device configuration saved.");
  } catch (error) {
    state.machineConfigurationError = error.message;
    state.machineConfigurationSaving = false;
    renderApp();
  }
}

async function saveMachineLimits(event) {
  event.preventDefault();
  if (!state.currentUser?.isOwner || !state.machineLimitsEditing || state.machineLimitsSaving) return;
  const machine = machines.find(item => item.id === state.machineId);
  if (!machine) return;
  const data = new FormData(event.currentTarget);
  const number = name => Number(data.get(name));
  const sensors = {
    pressure: { minimum: number("limits.pressureBar.minimum"), maximum: number("limits.pressureBar.maximum") },
    flow: { minimum: number("limits.flowLpm.minimum"), maximum: number("limits.flowLpm.maximum") },
    suction: { minimum: number("limits.suctionKpa.minimum"), maximum: number("limits.suctionKpa.maximum") },
    temperature: { minimum: number("limits.temperatureC.minimum"), maximum: number("limits.temperatureC.maximum") }
  };
  const powerMetricKeys = ["voltageV", "currentA", "activePowerW", "reactivePowerVar", "apparentPowerVa", "powerFactor", "frequencyHz", "powerTotalKwh"];
  const powerMonitor = {};
  for (const key of powerMetricKeys) {
    const minimumRaw = String(data.get(`limits.powerMonitor.${key}.minimum`) ?? "").trim();
    const maximumRaw = String(data.get(`limits.powerMonitor.${key}.maximum`) ?? "").trim();
    if (!minimumRaw && !maximumRaw) continue;
    if (!minimumRaw || !maximumRaw) throw new Error(`${key} requires both a minimum and maximum.`);
    powerMonitor[key] = { minimum: Number(minimumRaw), maximum: Number(maximumRaw) };
  }
  if (Object.keys(powerMonitor).length) sensors.powerMonitor = powerMonitor;
  if (Object.entries(sensors).filter(([key]) => key !== "powerMonitor").some(([, range]) => range.minimum >= range.maximum)
    || Object.values(powerMonitor).some(range => !Number.isFinite(range.minimum) || !Number.isFinite(range.maximum) || range.minimum >= range.maximum)) {
    showToast("Each minimum must be lower than its maximum.");
    return;
  }
  try {
    const current = state.machineConfiguration?.general?.machineId === machine.id
      ? state.machineConfiguration
      : await loadDeviceConfiguration(machine);
    const configuration = { ...current, sensors };
    state.machineConfiguration = configuration;
    state.machineLimitsSaving = true;
    renderApp();
    if (devicePreviewMode) {
      state.devicePreviewConfigurations[machine.id] = configuration;
      const previewMachine = machines.find(item => item.id === machine.id);
      if (previewMachine) previewMachine.name = configuration.general.deviceName;
    } else {
      const result = await authApi.saveMachineConfiguration(machine.id, machine.siteId, configuration);
      state.machineConfiguration = result.configuration;
      await loadMachines({ render: false });
    }
    state.machineLimitsSaving = false;
    state.machineLimitsEditing = false;
    renderApp();
    showToast("Device operating limits saved.");
  } catch (error) {
    state.machineLimitsSaving = false;
    showToast(error.message);
  }
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
      await authApi.updateMachine(data.machineId, data.siteId, { name: data.name, clusterId: data.clusterId, areaId: data.areaId });
      showToast(`${data.machineId} details updated.`);
    } else {
      const result = await authApi.createMachine(data);
      showToast(`${data.name} registered (${result.machine.id}).`);
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

async function permanentlyDeleteRemovedMachine(machineId, siteId, button) {
  if (!window.confirm(`Permanently delete ${machineId}? This cannot be undone. Telemetry, tickets, and audit history will be retained.`)) return;
  button.disabled = true;
  state.machineManagementError = "";
  try {
    await authApi.permanentlyDeleteMachine(machineId, siteId);
    machineHistory.delete(machineId);
    await loadRemovedMachines({ render: false });
    renderApp();
    showToast(`${machineId} permanently deleted. Historical records were retained.`);
  } catch (error) {
    state.machineManagementError = error.message;
    renderApp();
  }
}

async function loadMachineHistory(machineId, range = "1h", { render = true, customDate = "" } = {}) {
  const machine = machines.find(item => item.id === machineId);
  if (!machine) return;
  if (devicePreviewMode) {
    if (render && state.authenticated) renderApp();
    return;
  }
  const bounds = trendTimeBounds(range, customDate);
  const params = new URLSearchParams({
    siteId: machine.siteId,
    from: new Date(bounds.from).toISOString(),
    to: new Date(bounds.to).toISOString(),
    limit: "2000"
  });
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
  if (telemetryRenderTimer || !state.authenticated || document.hidden || !liveTelemetryPages.has(state.page)) return;
  telemetryRenderTimer = window.setTimeout(() => {
    telemetryRenderTimer = null;
    if (!state.authenticated || document.hidden || !liveTelemetryPages.has(state.page)) {
      liveRenderDeferred = false;
      return;
    }
    renderLiveUpdate();
  }, 500);
}

function liveRenderBlocked() {
  return Boolean(
    state.locationManager ||
    state.machineModal ||
    document.activeElement?.matches("input, select, textarea") ||
    document.querySelector(".download-menu[open], .download-menu.is-exporting, [data-custom-select].is-open") ||
    document.querySelector(".kpi-card.has-action:hover, button:hover, a:hover, [role='button']:hover, svg:hover, .custom-select-trigger:hover")
  );
}

function renderLiveUpdate() {
  if (liveRenderBlocked()) {
    liveRenderDeferred = true;
    return;
  }
  liveRenderDeferred = false;
  window.requestAnimationFrame(renderApp);
}

document.addEventListener("pointerout", event => {
  if (!liveRenderDeferred || event.relatedTarget?.closest?.(".kpi-card.has-action, button, a, [role='button'], svg, .custom-select-trigger")) return;
  liveRenderDeferred = false;
  scheduleTelemetryRender();
});

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
  if (!state.authenticated || state.telemetryConnected || liveSyncInFlight || document.hidden) return;
  liveSyncInFlight = true;
  try {
    const previousSnapshot = machineSnapshotKey();
    await loadMachines({ render: false, loadLocations: false });
    const telemetryChanged = previousSnapshot !== machineSnapshotKey();
    if (telemetryChanged && liveTelemetryPages.has(state.page)) renderLiveUpdate();
  } catch {
    // The event stream can continue updating the UI while a recovery poll fails.
  } finally {
    liveSyncInFlight = false;
  }
}

function startLiveSync() {
  stopLiveSync();
  const interval = Math.max(5, Number(state.settings?.sampling?.intervalSeconds || 1)) * 1000;
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
  telemetryStream.addEventListener("ticket", event => {
    try {
      applyTicketEvent(JSON.parse(event.data));
      state.ticketRecords = listTickets();
      if (["dashboard", "tickets", "ticket-detail"].includes(state.page) && !liveRenderBlocked()) {
        renderApp();
      }
    } catch {
      // Ignore malformed ticket events and keep the stream open.
    }
  });
  for (const eventName of ["machine-created", "machine-updated", "machine-removed", "machine-restored", "machine-permanently-deleted"]) {
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
  if (devicePreviewMode) {
    state.page = "machines";
    state.machineView = "cluster";
    await loadMachines({ render: false });
    state.machineId = machines[0]?.id || "";
    if (state.machineId) window.sessionStorage.setItem("cams.machineId", state.machineId);
    renderApp();
    return;
  }
  // Connect first so telemetry published while the initial snapshot loads is not missed.
  connectTelemetryStream();
  await loadSettings({ render: false });
  startLiveSync();
  await loadMachines({ render: false });
  await loadAlarms({ render: false });
  try {
    state.ticketRecords = await loadTickets();
    state.ticketsError = "";
  } catch (error) {
    state.ticketsError = error.message;
  }
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
  const customDate = range === "custom"
    ? state.trendCustomDate
    : "";
  const bounds = trendTimeBounds(range, customDate);
  const params = new URLSearchParams({
    machineId,
    siteId: machine?.siteId || "plant-01",
    from: new Date(bounds.from).toISOString(),
    to: new Date(bounds.to).toISOString()
  });
  return `/api/exports/telemetry/${format}?${params}`;
}

function bindDownload(buttonId, path) {
  document.querySelector(buttonId)?.addEventListener("click", async event => {
    const button = event.currentTarget;
    const menu = button.closest(".download-menu");
    const summary = menu?.querySelector(":scope > summary");
    const options = menu ? [...menu.querySelectorAll(".download-menu-option")] : [button];
    const originalContent = button.innerHTML;
    const format = /pdf/i.test(button.id) ? "PDF" : "Excel";
    menu?.classList.add("is-exporting");
    menu?.setAttribute("open", "");
    menu?.setAttribute("aria-busy", "true");
    summary?.setAttribute("aria-disabled", "true");
    options.forEach(option => { option.disabled = true; });
    button.innerHTML = `<span class="loading-spinner dark" aria-hidden="true"></span><span>Preparing ${format}…</span>`;
    button.disabled = true;
    try {
      await downloadExport(path());
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.innerHTML = originalContent;
      options.forEach(option => { option.disabled = false; });
      menu?.classList.remove("is-exporting");
      menu?.removeAttribute("aria-busy");
      menu?.removeAttribute("open");
      summary?.removeAttribute("aria-disabled");
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
      button.innerHTML = icon(input.type === "password" ? "eyeOff" : "eye");
      button.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
    }));
    document.querySelector("#reset-password-form")?.addEventListener("submit", handlePasswordReset);
    return;
  }
  app.innerHTML = renderLoginPage(brand);

  document.querySelector("#password-toggle").addEventListener("click", (event) => {
    const input = document.querySelector("#password");
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.innerHTML = icon(input.type === "password" ? "eyeOff" : "eye");
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
  cleanupCustomSelectMenus();
  const user = state.currentUser || { displayName: "Plant Owner", role: "Owner / Admin" };
  const safeName = escapeHtml(user.displayName);
  const safeRole = escapeHtml(user.role);
  const groups = ["Operations", "Manage", "Future"];
  const staleAfterMs = Number(state.settings?.sampling?.staleAfterSeconds || 10) * 1000;
  const freshGateways = machines.filter(machine => machine.gatewayStatus === "Online" && machine.receivedAt && Date.now() - new Date(machine.receivedAt).getTime() <= staleAfterMs).length;
  const plantConnectionState = freshGateways ? "online" : "offline";
  const connectionLabel = state.telemetryConnected ? "CAMS stream connected" : "CAMS stream reconnecting";
  const networkLabel = freshGateways ? `${freshGateways} gateway${freshGateways === 1 ? "" : "s"} sending live data` : state.lastTelemetryAt ? `Last telemetry · ${telemetryUpdateTime(state.lastTelemetryAt)}` : "No telemetry";
  const openAlarmCount = alarms.filter(alarm => alarm.status !== "Resolved").length;
  const sidebarNav = groups.map(group => `<div class="nav-group-label">${group}</div><nav class="nav-list">${navItems.filter(item => item.group === group && (!item.ownerOnly || user.isOwner)).map(item => `<button class="nav-item ${state.page === item.id || (state.page === "ticket-detail" && item.id === "tickets") || (state.page === "machine-detail" && item.id === "machines") ? "active" : ""}" data-page="${item.id}">${icon(item.icon)}<span>${item.label}</span>${item.future ? '<span class="future">P2</span>' : ""}</button>`).join("")}</nav>`).join("");
  app.innerHTML = `<div class="app-shell ${state.screenMode === "live" ? `live-screen ${state.liveSidebarOpen ? "sidebar-open" : ""}` : "preview-screen"}">
    ${state.mobileOpen ? '<button class="mobile-overlay" id="mobile-overlay" aria-label="Close menu"></button>' : ""}
    <button class="icon-btn live-sidebar-toggle" id="live-sidebar-toggle" type="button" aria-label="${state.liveSidebarOpen ? "Hide navigation" : "Show navigation"}" aria-expanded="${state.liveSidebarOpen}" title="${state.liveSidebarOpen ? "Hide navigation" : "Show navigation"}">${icon(state.liveSidebarOpen ? "arrowLeft" : "menu")}</button>
    <aside class="sidebar ${state.mobileOpen ? "open" : ""}">
      ${brand(true)}
      ${sidebarNav}
      <div class="sidebar-foot"><div class="sidebar-foot-row"><i class="pulse-dot"></i><span>${connectionLabel}</span></div><div class="sidebar-foot-row"><span>AI-backed Monitoring</span></div></div>
    </aside>
    <header class="top-header">
      <div class="header-plant"><button class="icon-btn mobile-menu" id="mobile-menu" aria-label="Open menu">${icon("menu")}</button><div><div class="plant-name">${escapeHtml(state.settings?.plant?.name || "Demo Spinning Plant")}</div><div class="plant-meta ${plantConnectionState}"><i class="live-dot"></i><span>${networkLabel}</span></div></div></div>
      <div class="header-right">
        <div class="clock"><strong id="header-time">--:--:--</strong><span id="header-date">--</span></div>
        <button class="icon-btn notification-btn" id="notification-button" aria-label="Notifications">${icon("bell")}${openAlarmCount ? `<span class="notification-badge">${openAlarmCount}</span>` : ""}</button>
        <div class="account-control">
          <button class="user-menu" id="user-menu" aria-haspopup="menu" aria-expanded="${state.userMenuOpen}"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span class="user-copy"><strong>${safeName}</strong><span>${safeRole}</span></span>${icon("chevronDown")}</button>
          ${state.userMenuOpen ? `<div class="account-menu" role="menu"><div class="account-summary"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><div><strong>${safeName}</strong><span>${escapeHtml(user.identity)}</span></div></div><div class="account-session">${icon("shield")}<span>Secure server session active</span></div><button id="change-profile-password" class="account-action" role="menuitem">${icon("lock")}<span>Change password</span></button><button id="sign-out" class="account-action" role="menuitem">${icon("logout")}<span>Sign out</span></button></div>` : ""}
        </div>
      </div>
    </header>
    <main class="main-content">${pageContent()}</main>
  </div>`;
  bindGlobalEvents();
  bindPageEvents();
  positionCustomCalendar();
  updateClock();
}

function positionCustomCalendar() {
  const picker = state.customDatePicker && document.querySelector(`#${CSS.escape(state.customDatePicker)}`);
  const calendar = picker?.parentElement.querySelector(".custom-calendar");
  if (!picker || !calendar) return;

  const anchor = picker.getBoundingClientRect();
  const bounds = calendar.getBoundingClientRect();
  const margin = 12;
  const left = Math.max(margin, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - margin));
  const below = anchor.bottom + 7;
  const top = below + bounds.height <= window.innerHeight - margin
    ? below
    : Math.max(margin, anchor.top - bounds.height - 7);
  calendar.style.left = `${left}px`;
  calendar.style.top = `${top}px`;
}

function applyTicketListFilters() {
  const search = state.ticketSearch.trim().toLowerCase();
  let visibleCount = 0;
  document.querySelectorAll("[data-ticket-row]").forEach(row => {
    const matchesSearch = row.dataset.ticketSearch.includes(search);
    const matchesPriority = state.ticketPriorityFilter === "All" || row.dataset.ticketPriority === state.ticketPriorityFilter;
    const matchesCluster = state.ticketClusterFilter === "All" || row.dataset.ticketCluster === state.ticketClusterFilter;
    const matchesArea = state.ticketAreaFilter === "All" || row.dataset.ticketArea === state.ticketAreaFilter;
    const matchesDevice = state.ticketDeviceFilter === "All" || row.dataset.ticketDevice === state.ticketDeviceFilter;
    const matchesStatus = state.ticketStatusFilter === "All" || row.dataset.ticketStatus === state.ticketStatusFilter;
    const raisedAt = row.dataset.ticketRaisedAt ? new Date(row.dataset.ticketRaisedAt) : null;
    const afterFrom = !state.ticketFromDate || (raisedAt && raisedAt >= new Date(`${state.ticketFromDate}T00:00:00`));
    const beforeTo = !state.ticketToDate || (raisedAt && raisedAt <= new Date(`${state.ticketToDate}T23:59:59.999`));
    row.hidden = !(matchesSearch && matchesPriority && matchesCluster && matchesArea && matchesDevice && matchesStatus && afterFrom && beforeTo);
    if (!row.hidden) visibleCount += 1;
  });
  const emptyRow = document.querySelector("#ticket-empty-row");
  if (emptyRow) emptyRow.hidden = visibleCount > 0;
}

function pageContent() {
  const model = { state, machines, machineHistory, alarms, tickets: state.ticketRecords, operators: state.ticketOperators };
  switch (state.page) {
    case "machines": return renderMachinesPage(model);
    case "machine-detail": return renderMachineDetailPage(model);
    case "trends": return renderTrendsPage(model);
    case "alarms": return renderAlarmsPage(model);
    case "maintenance": return renderMaintenancePage(model);
    case "tickets": return renderTicketsPage(model);
    case "ticket-detail": return renderTicketDetailPage(model);
    case "users": return renderUsersPage(model);
    case "profile": return renderProfilePage(model);
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
  if (!calendarOutsideClickBound) {
    window.addEventListener("resize", positionCustomCalendar);
    window.addEventListener("scroll", positionCustomCalendar, true);
  }
  if (!profileOutsideClickBound) {
    document.addEventListener("click", event => {
      if (!state.userMenuOpen || event.target.closest("#user-menu, .account-menu")) return;
      state.userMenuOpen = false;
      renderApp();
    });
    profileOutsideClickBound = true;
  }
  if (!calendarOutsideClickBound) {
    document.addEventListener("click", event => {
      if (!state.customDatePicker || event.composedPath().some(node => node instanceof Element && node.matches(".custom-date-picker"))) return;
      state.customDatePicker = null;
      state.customDatePickerSelecting = null;
      renderApp();
    });
    calendarOutsideClickBound = true;
  }
  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
    navigate(button.dataset.page);
  }));
  document.querySelectorAll("[data-ticket-row]").forEach(row => {
    const openTicket = () => {
      state.ticketId = row.dataset.ticketOpen;
      navigate("ticket-detail");
    };
    row.addEventListener("click", openTicket);
    row.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openTicket();
    });
  });
  document.querySelectorAll("[data-machine]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    state.machineId = button.dataset.machine;
    state.machinePowerMonitorOpen = false;
    window.sessionStorage.setItem("cams.machineId", state.machineId);
    navigate("machine-detail");
    loadMachineHistory(state.machineId, state.detailRange).catch(error => showToast(error.message));
  }));
  document.querySelectorAll("[data-power-monitor]").forEach(button => button.addEventListener("click", () => {
    state.machineId = button.dataset.powerMonitor;
    window.sessionStorage.setItem("cams.machineId", state.machineId);
    if (state.page === "machine-detail") state.machinePowerMonitorOpen = true;
    else state.powerMonitorOpen = true;
    state.powerMonitorMetric = "voltageV";
    renderApp();
    loadMachineHistory(state.machineId, state.powerMonitorRange).catch(error => showToast(error.message));
  }));
  document.querySelectorAll("[data-detail-parameter]").forEach(button => button.addEventListener("click", () => {
    state.detailParameter = button.dataset.detailParameter;
    window.sessionStorage.setItem("cams.detailParameter", state.detailParameter);
    renderApp();
    window.requestAnimationFrame(() => document.querySelector("#machine-operating-trend")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));
  document.querySelector("#power-monitor-back")?.addEventListener("click", () => {
    if (state.page === "machine-detail") state.machinePowerMonitorOpen = false;
    else state.powerMonitorOpen = false;
    renderApp();
  });
  document.querySelectorAll("[data-power-metric]").forEach(button => button.addEventListener("click", () => {
    state.powerMonitorMetric = button.dataset.powerMetric;
    renderApp();
  }));
  document.querySelector("#power-monitor-range")?.addEventListener("change", event => {
    state.powerMonitorRange = event.target.value;
    renderApp();
    if (state.machineId) loadMachineHistory(state.machineId, state.powerMonitorRange).catch(error => showToast(error.message));
  });
  document.querySelector("#machine-settings")?.addEventListener("click", openMachineConfiguration);
  document.querySelector("#live-sidebar-toggle")?.addEventListener("click", () => {
    state.liveSidebarOpen = !state.liveSidebarOpen;
    renderApp();
    document.querySelector("#live-sidebar-toggle")?.focus({ preventScroll: true });
  });
  document.querySelector("#mobile-menu")?.addEventListener("click", () => { state.mobileOpen = true; renderApp(); });
  document.querySelector("#mobile-overlay")?.addEventListener("click", () => { state.mobileOpen = false; renderApp(); });
  document.querySelectorAll("[data-screen-mode]").forEach(button => button.addEventListener("click", () => {
    const mode = button.dataset.screenMode;
    if (!["preview", "live"].includes(mode)) return;
    state.screenMode = mode;
    if (mode === "live") state.page = "dashboard";
    try {
      window.localStorage.setItem("cams.screenMode", mode);
    } catch (error) {
      console.error("Could not save the CAMS screen mode preference.", error);
      showToast("Display mode changed, but could not be saved in this browser.");
    }
    renderApp();
  }));
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
  document.querySelector("#change-profile-password")?.addEventListener("click", () => {
    state.userMenuOpen = false;
    state.profilePasswordError = "";
    navigate("profile");
  });
  document.querySelector("#profile-password-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await authApi.changePassword(String(new FormData(form).get("currentPassword") || ""), String(new FormData(form).get("newPassword") || ""));
      closeTelemetryStream();
      stopLiveSync();
      state.authenticated = false;
      state.currentUser = null;
      state.profilePasswordError = "";
      renderLogin();
      showToast("Password updated. Sign in with your new password.");
    } catch (error) {
      state.profilePasswordError = error.message;
      submit.disabled = false;
      renderApp();
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
  bindLocations({ state, api: authApi, devices: machines, render: renderApp, refresh: loadMachines, toast: showToast });
  bindMaintenance(state, machines, authApi, renderApp, showToast);
  document.querySelectorAll("[data-dashboard-kpi]").forEach(action => {
    const selectKpi = () => {
      const filter = action.dataset.dashboardKpi;
      if (filter === "alarms") {
        state.alarmFilter = "Open";
        navigate("alarms", { fromDashboardCard: true });
        return;
      }
      state.machineFilter = filter === "running" ? "Online" : filter === "stopped" ? "Offline" : "All";
      state.machineView = "list";
      window.sessionStorage.setItem("cams.machineView", state.machineView);
      state.machineSearch = "";
      navigate("machines", { fromDashboardCard: true });
    };
    action.addEventListener("click", selectKpi);
  });
  document.querySelectorAll("[data-ticket-priority-filter]").forEach(button => button.addEventListener("click", () => {
    state.ticketPriorityFilter = button.dataset.ticketPriorityFilter;
    renderApp();
  }));
  document.querySelector("#ticket-search")?.addEventListener("input", event => {
    state.ticketSearch = event.target.value;
    applyTicketListFilters();
  });
  document.querySelector("#ticket-more-filters")?.addEventListener("click", () => {
    state.ticketMoreFiltersOpen = true;
    renderApp();
  });
  document.querySelector("#ticket-filters-close")?.addEventListener("click", () => {
    state.ticketMoreFiltersOpen = false;
    renderApp();
  });
  document.querySelector("#ticket-filters-backdrop")?.addEventListener("click", event => {
    if (event.target !== event.currentTarget) return;
    state.ticketMoreFiltersOpen = false;
    renderApp();
  });
  document.querySelector("#ticket-cluster")?.addEventListener("change", event => {
    state.ticketClusterFilter = event.target.value;
    state.ticketAreaFilter = "All";
    state.ticketDeviceFilter = "All";
    renderApp();
  });
  document.querySelector("#ticket-area")?.addEventListener("change", event => {
    state.ticketAreaFilter = event.target.value;
    state.ticketDeviceFilter = "All";
    renderApp();
  });
  document.querySelector("#ticket-device")?.addEventListener("change", event => {
    state.ticketDeviceFilter = event.target.value;
    renderApp();
  });
  document.querySelector("#ticket-priority")?.addEventListener("change", event => {
    state.ticketPriorityFilter = event.target.value;
    renderApp();
  });
  document.querySelector("#ticket-status")?.addEventListener("change", event => {
    state.ticketStatusFilter = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-ticket-time-range]").forEach(button => button.addEventListener("click", () => {
    setTicketTimeRange(button.dataset.ticketTimeRange);
    renderApp();
  }));
  document.querySelectorAll("[data-ticket-clear-group]").forEach(button => button.addEventListener("click", () => {
    const group = button.dataset.ticketClearGroup;
    if (group === "cluster") {
      state.ticketClusterFilter = "All";
      state.ticketAreaFilter = "All";
      state.ticketDeviceFilter = "All";
    }
    if (group === "area") {
      state.ticketAreaFilter = "All";
      state.ticketDeviceFilter = "All";
    }
    if (group === "device") state.ticketDeviceFilter = "All";
    if (group === "priority") state.ticketPriorityFilter = "All";
    if (group === "status") state.ticketStatusFilter = "All";
    if (group === "time") setTicketTimeRange("All");
    renderApp();
  }));
  document.querySelector("#ticket-filters-reset")?.addEventListener("click", () => {
    state.ticketClusterFilter = "All";
    state.ticketAreaFilter = "All";
    state.ticketDeviceFilter = "All";
    state.ticketPriorityFilter = "All";
    state.ticketStatusFilter = "All";
    setTicketTimeRange("All");
    renderApp();
  });
  document.querySelector("#ticket-filters-form")?.addEventListener("submit", event => {
    event.preventDefault();
    try {
      if (state.ticketTimeRange === "custom") {
        const values = new FormData(event.currentTarget);
        state.ticketFromDate = parseFilterDate(values.get("fromDate"));
        state.ticketToDate = parseFilterDate(values.get("toDate"));
        if (state.ticketFromDate && state.ticketToDate && state.ticketFromDate > state.ticketToDate) throw new Error("From date must be before To date.");
      }
      state.ticketMoreFiltersOpen = false;
      renderApp();
    } catch (error) {
      showToast(error.message);
    }
  });
  applyTicketListFilters();
  const ticketForm = document.querySelector("#ticket-detail-form");
  ticketForm?.addEventListener("change", async event => {
    const field = event.target.closest("[data-ticket-field]");
    if (!field || field.readOnly) return;
    const value = field.name === "dueBy" && field.value ? new Date(field.value).toISOString() : field.value;
    try {
      await updateTicket(state.ticketId, { [field.name]: value });
      state.ticketRecords = listTickets();
      if (field.name === "maintenance") showToast(`Maintenance marked ${value.toLowerCase()}.`);
      renderApp();
    } catch (error) {
      showToast(error.message);
      renderApp();
    }
  });
  document.querySelector("#resolve-ticket")?.addEventListener("click", async () => {
    try {
      await closeTicket(state.ticketId);
      state.ticketRecords = listTickets();
      showToast("Ticket resolved successfully.");
      renderApp();
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#ticket-comment-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const comment = new FormData(event.currentTarget).get("comment")?.toString().trim();
    if (!comment) return;
    try {
      await addComment(state.ticketId, comment);
      state.ticketRecords = listTickets();
      showToast("Comment posted successfully.");
      renderApp();
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelectorAll("[data-custom-date-toggle]").forEach(button => button.addEventListener("click", () => {
    const id = button.id;
    state.customDatePicker = state.customDatePicker === id ? null : id;
    state.customDatePickerSelecting = null;
    if (state.customDatePicker) {
      const dateState = {
        "dashboard-custom-date": state.dashboardCustomDate,
        "detail-custom-date": state.detailCustomDate,
        "trend-custom-date": state.trendCustomDate,
        "service-start-date": state.maintenance?.draft?.serviceDate,
        "service-end-date": state.maintenance?.draft?.endDate,
        "service-history-from-date": state.maintenance?.historyCustomDraft?.start,
        "service-history-to-date": state.maintenance?.historyCustomDraft?.end
      }[id];
      const today = new Date();
      state.customDatePickerMonth = dateState || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    }
    renderApp();
  }));
  document.querySelectorAll("[data-custom-date-month-year]").forEach(button => button.addEventListener("click", () => {
    state.customDatePickerSelecting = state.customDatePickerSelecting === state.customDatePicker ? null : state.customDatePicker;
    renderApp();
  }));
  document.querySelectorAll("[data-custom-date-part]").forEach(select => select.addEventListener("change", () => {
    const [year, month] = state.customDatePickerMonth.split("-").map(Number);
    const nextYear = select.dataset.customDatePart === "year" ? Number(select.value) : year;
    const nextMonth = select.dataset.customDatePart === "month" ? Number(select.value) : month;
    state.customDatePickerMonth = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    renderApp();
  }));
  document.querySelector("[data-custom-date-done]")?.addEventListener("click", () => {
    state.customDatePickerSelecting = null;
    renderApp();
  });
  document.querySelectorAll("[data-custom-date-select]").forEach(button => button.addEventListener("click", () => {
    const picker = button.closest("[data-custom-date-picker]");
    const id = picker?.dataset.customDatePicker;
    const date = button.dataset.customDateSelect;
    const dateState = {
      "dashboard-custom-date": "dashboardCustomDate",
      "detail-custom-date": "detailCustomDate",
      "trend-custom-date": "trendCustomDate",
    }[id];
    const serviceDateState = {
      "service-start-date": "serviceDate",
      "service-end-date": "endDate"
    }[id];
    if (dateState) state[dateState] = date;
    else if (id === "service-history-from-date" && state.maintenance?.historyCustomDraft) {
      state.maintenance.historyCustomDraft.start = date;
      if (!state.maintenance.historyCustomDraft.end || state.maintenance.historyCustomDraft.end < date) state.maintenance.historyCustomDraft.end = date;
    }
    else if (id === "service-history-to-date" && state.maintenance?.historyCustomDraft) state.maintenance.historyCustomDraft.end = date;
    else if (serviceDateState && state.maintenance?.draft) {
      state.maintenance.draft[serviceDateState] = date;
      if (serviceDateState === "serviceDate" && (!state.maintenance.draft.endDate || state.maintenance.draft.endDate < date)) state.maintenance.draft.endDate = date;
    } else return;
    state.customDatePicker = null;
    state.customDatePickerSelecting = null;
    renderApp();
    if (id === "dashboard-custom-date" && state.machineId) loadMachineHistory(state.machineId, "custom", { customDate: date }).catch(error => showToast(error.message));
    if (id === "detail-custom-date" && state.machineId) loadMachineHistory(state.machineId, "custom", { customDate: date }).catch(error => showToast(error.message));
    if (id === "trend-custom-date") loadMachineHistory(state.trendMachine, "custom", { customDate: date }).catch(error => showToast(error.message));
  }));
  document.querySelector("#refresh-dashboard")?.addEventListener("click", async () => {
    if (state.dashboardRefreshing) return;
    state.dashboardRefreshing = true;
    renderApp();
    try {
      const summary = await authApi.dashboardSummary(state.settings?.siteId || "plant-01");
      applyMachinePayload(summary);
      alarms = (summary.alarms || []).map(mapAlarm);
      state.ticketRecords = summary.tickets || [];
      state.ticketsError = "";
      showToast("Live readings refreshed from the CAMS API.");
    } catch (error) {
      showToast(error.message);
    } finally {
      state.dashboardRefreshing = false;
      renderApp();
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
  document.querySelectorAll("[data-quick-machine-filter]").forEach(button => button.addEventListener("click", () => {
    state.machineFilter = button.dataset.quickMachineFilter;
    state.machineView = "list";
    window.sessionStorage.setItem("cams.machineView", state.machineView);
    state.machineClusterFilter = "All";
    state.machineAreaFilter = "All";
    state.machineDeviceFilter = "All";
    state.machineTimeRange = "All";
    state.machineSearch = "";
    renderApp();
  }));
  document.querySelectorAll("[data-machine-view]").forEach(button => button.addEventListener("click", () => {
    state.machineView = button.dataset.machineView;
    if (state.machineView === "cluster") state.machineFilter = "All";
    window.sessionStorage.setItem("cams.machineView", state.machineView);
    renderApp();
    if (state.machineView === "live") {
      const machineId = machines.find(machine => machine.id === state.machineId)?.id || machines[0]?.id;
      if (machineId) loadMachineHistory(machineId, "24h").catch(error => showToast(error.message));
    }
  }));
  document.querySelector("#machine-more-filters")?.addEventListener("click", () => {
    state.machineMoreFiltersOpen = true;
    renderApp();
  });
  document.querySelector("#machine-filters-close")?.addEventListener("click", () => {
    state.machineMoreFiltersOpen = false;
    renderApp();
  });
  document.querySelector("#machine-filters-backdrop")?.addEventListener("click", event => {
    if (event.target !== event.currentTarget) return;
    state.machineMoreFiltersOpen = false;
    renderApp();
  });
  document.querySelector("#machine-cluster")?.addEventListener("change", event => {
    state.machineClusterFilter = event.target.value;
    state.machineAreaFilter = "All";
    state.machineDeviceFilter = "All";
    renderApp();
  });
  document.querySelector("#machine-area")?.addEventListener("change", event => {
    state.machineAreaFilter = event.target.value;
    state.machineDeviceFilter = "All";
    renderApp();
  });
  document.querySelector("#machine-device")?.addEventListener("change", event => {
    state.machineDeviceFilter = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-machine-filter-value]").forEach(button => button.addEventListener("click", () => {
    state.machineFilter = state.machineFilter === button.dataset.machineFilterValue ? "All" : button.dataset.machineFilterValue;
    renderApp();
  }));
  document.querySelectorAll("[data-machine-time-range]").forEach(button => button.addEventListener("click", () => {
    state.machineTimeRange = button.dataset.machineTimeRange;
    renderApp();
  }));
  document.querySelector("#machine-filters-reset")?.addEventListener("click", () => {
    state.machineFilter = "All";
    state.machineClusterFilter = "All";
    state.machineAreaFilter = "All";
    state.machineDeviceFilter = "All";
    state.machineTimeRange = "All";
    renderApp();
  });
  document.querySelector("#machine-filters-form")?.addEventListener("submit", event => {
    event.preventDefault();
    state.machineMoreFiltersOpen = false;
    renderApp();
  });
  document.querySelectorAll("[data-cluster-toggle]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.clusterToggle;
    state.expandedMachineClusters = state.expandedMachineClusters.includes(key)
      ? state.expandedMachineClusters.filter(item => item !== key)
      : [...state.expandedMachineClusters, key];
    renderApp();
  }));
  document.querySelectorAll("[data-area-toggle]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.areaToggle;
    state.expandedMachineAreas = state.expandedMachineAreas.includes(key)
      ? state.expandedMachineAreas.filter(item => item !== key)
      : [...state.expandedMachineAreas, key];
    renderApp();
  }));
  document.querySelector("#dashboard-parameter")?.addEventListener("change", event => {
    state.dashboardParameter = event.target.value;
    window.sessionStorage.setItem("cams.dashboardParameter", state.dashboardParameter);
    renderApp();
  });
  document.querySelectorAll("[data-dashboard-parameter]").forEach(button => button.addEventListener("click", () => {
    state.dashboardParameter = button.dataset.dashboardParameter;
    window.sessionStorage.setItem("cams.dashboardParameter", state.dashboardParameter);
    renderApp();
    window.requestAnimationFrame(() => document.querySelector("#dashboard-operating-trend")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));
  document.querySelector("#dashboard-range")?.addEventListener("change", event => {
    state.customDatePicker = null;
    state.customDatePickerSelecting = null;
    state.dashboardRange = event.target.value;
    window.sessionStorage.setItem("cams.dashboardRange", state.dashboardRange);
    renderApp();
    if (state.machineId && state.dashboardRange !== "custom") loadMachineHistory(state.machineId, state.dashboardRange).catch(error => showToast(error.message));
  });
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
  document.querySelectorAll("[data-permanent-delete-machine]").forEach(button => button.addEventListener("click", () => {
    permanentlyDeleteRemovedMachine(button.dataset.permanentDeleteMachine, button.dataset.siteId, button);
  }));
  document.querySelectorAll("[data-alarm-filter]").forEach(button => button.addEventListener("click", () => {
    state.alarmFilter = button.dataset.alarmFilter;
    loadAlarms().catch(error => showToast(error.message));
  }));
  document.querySelectorAll("[data-alarm-summary-filter]").forEach(card => card.addEventListener("click", () => {
    state.alarmFilter = card.dataset.alarmSummaryFilter;
    loadAlarms().catch(error => showToast(error.message));
  }));
  document.querySelector("#alarm-more-filters")?.addEventListener("click", () => { state.alarmMoreFiltersOpen = true; renderApp(); });
  document.querySelector("#alarm-filters-close")?.addEventListener("click", () => { state.alarmMoreFiltersOpen = false; renderApp(); });
  document.querySelector("#alarm-filters-cancel")?.addEventListener("click", () => { state.alarmMoreFiltersOpen = false; renderApp(); });
  document.querySelector("#alarm-cluster")?.addEventListener("change", event => {
    state.alarmClusterFilter = event.target.value;
    state.alarmAreaFilter = "All";
    state.alarmMachineFilter = "All";
    renderApp();
  });
  document.querySelector("#alarm-area")?.addEventListener("change", event => {
    state.alarmAreaFilter = event.target.value;
    state.alarmMachineFilter = "All";
    renderApp();
  });
  document.querySelector("#alarm-device")?.addEventListener("change", event => {
    state.alarmMachineFilter = event.target.value;
    renderApp();
  });
  document.querySelector("#alarm-point")?.addEventListener("change", event => {
    state.alarmPointFilter = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-alarm-choice]").forEach(button => button.addEventListener("click", () => {
    const group = button.dataset.alarmChoiceGroup;
    const value = button.dataset.alarmChoice;
    if (group === "severity") state.alarmSeverityFilter = state.alarmSeverityFilter === value ? "All" : value;
    if (group === "status") state.alarmStatusFilter = state.alarmStatusFilter === value ? "All" : value;
    state.alarmFilter = "All";
    renderApp();
  }));
  document.querySelectorAll("[data-alarm-time-range]").forEach(button => button.addEventListener("click", () => {
    setAlarmTimeRange(button.dataset.alarmTimeRange);
    renderApp();
  }));
  document.querySelectorAll("[data-alarm-clear-group]").forEach(button => button.addEventListener("click", () => {
    const group = button.dataset.alarmClearGroup;
    if (group === "cluster") {
      state.alarmClusterFilter = "All";
      state.alarmAreaFilter = "All";
      state.alarmMachineFilter = "All";
    }
    if (group === "area") {
      state.alarmAreaFilter = "All";
      state.alarmMachineFilter = "All";
    }
    if (group === "device") state.alarmMachineFilter = "All";
    if (group === "point") state.alarmPointFilter = "All";
    if (group === "severity") state.alarmSeverityFilter = "All";
    if (group === "status") state.alarmStatusFilter = "All";
    if (group === "time") {
      state.alarmTimeRange = "All";
      state.alarmFromDate = "";
      state.alarmToDate = "";
    }
    renderApp();
  }));
  document.querySelector("#alarm-filters-reset")?.addEventListener("click", () => {
    state.alarmClusterFilter = "All";
    state.alarmAreaFilter = "All";
    state.alarmMachineFilter = "All";
    state.alarmPointFilter = "All";
    state.alarmSeverityFilter = "All";
    state.alarmStatusFilter = "All";
    state.alarmFromDate = "";
    state.alarmToDate = "";
    state.alarmTimeRange = "All";
    state.alarmFilter = "All";
    renderApp();
  });
  document.querySelector("#alarm-filters-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      if (state.alarmTimeRange === "custom") {
        const values = new FormData(event.currentTarget);
        state.alarmFromDate = parseFilterDate(values.get("fromDate"));
        state.alarmToDate = parseFilterDate(values.get("toDate"));
        if (state.alarmFromDate && state.alarmToDate && state.alarmFromDate > state.alarmToDate) throw new Error("From date must be before To date.");
      }
      state.alarmMoreFiltersOpen = false;
      await loadAlarms();
    } catch (error) {
      showToast(error.message);
    }
  });
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
  document.querySelector("#trend-range")?.addEventListener("change", event => {
    state.customDatePicker = null;
    state.customDatePickerSelecting = null;
    state.trendRange = event.target.value;
    renderApp();
    if (state.trendRange !== "custom") loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  });
  document.querySelector("#detail-range")?.addEventListener("change", event => {
    state.customDatePicker = null;
    state.customDatePickerSelecting = null;
    state.detailRange = event.target.value;
    renderApp();
    if (state.detailRange !== "custom") loadMachineHistory(state.machineId, state.detailRange).catch(error => showToast(error.message));
  });
  document.querySelector("#detail-parameter")?.addEventListener("change", event => {
    state.detailParameter = event.target.value;
    window.sessionStorage.setItem("cams.detailParameter", state.detailParameter);
    renderApp();
  });
  document.querySelector("#settings-form")?.addEventListener("submit", saveSettings);
  document.querySelectorAll("[data-device-config-close]").forEach(button => button.addEventListener("click", closeMachineConfiguration));
  document.querySelector("#device-configuration-backdrop")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeMachineConfiguration();
  });
  document.querySelectorAll("[data-device-config-tab]").forEach(button => button.addEventListener("click", () => {
    state.machineConfigurationTab = button.dataset.deviceConfigTab;
    document.querySelectorAll("[data-device-config-tab]").forEach(tab => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-device-config-panel]").forEach(panel => {
      panel.hidden = panel.dataset.deviceConfigPanel !== state.machineConfigurationTab;
    });
  }));
  document.querySelector("#device-config-retry")?.addEventListener("click", openMachineConfiguration);
  document.querySelector("#device-configuration-form")?.addEventListener("submit", saveMachineConfiguration);
  document.querySelector("#machine-limits-form")?.addEventListener("submit", saveMachineLimits);
  document.querySelector("#edit-machine-limits")?.addEventListener("click", () => {
    if (!state.currentUser?.isOwner) return;
    state.machineLimitsEditing = true;
    renderApp();
  });
  document.querySelector("#refresh-users")?.addEventListener("click", () => loadManagedUsers());
  document.querySelectorAll("[data-user-account-filter]").forEach(button => button.addEventListener("click", () => {
    const filter = button.dataset.userAccountFilter;
    if (filter === "removed") {
      state.usersRemovedOpen = true;
      renderApp();
      return;
    }
    state.userAccountFilter = ["active", "disabled"].includes(filter) ? filter : "registered";
    renderApp();
  }));
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
  document.querySelectorAll("[data-edit-user]").forEach(button => button.addEventListener("click", () => {
    state.userModal = { user: state.managedUsers.find(user => user.id === button.dataset.editUser) };
    renderApp();
  }));
  document.querySelector("#user-modal-close")?.addEventListener("click", () => { state.userModal = null; renderApp(); });
  document.querySelector("#user-modal-cancel")?.addEventListener("click", () => { state.userModal = null; renderApp(); });
  document.querySelectorAll("#edit-user-form [data-password-toggle]").forEach(button => button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.passwordToggle}`);
    input.type = input.type === "password" ? "text" : "password";
    button.innerHTML = icon(input.type === "password" ? "eyeOff" : "eye");
    button.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
  }));
  document.querySelector("#edit-user-role")?.addEventListener("change", event => {
    if (event.target.value === "owner") {
      const toggle = document.querySelector("#change-password-toggle");
      toggle.hidden = true;
      toggle.disabled = true;
      document.querySelector("#change-password-fields").hidden = true;
      document.querySelector("#edit-current-password").value = "";
      document.querySelector("#edit-new-password").value = "";
    } else {
      const toggle = document.querySelector("#change-password-toggle");
      toggle.hidden = false;
      toggle.disabled = false;
    }
  });
  document.querySelector("#change-password-toggle")?.addEventListener("click", event => {
    const fields = document.querySelector("#change-password-fields");
    const open = fields.hidden;
    fields.hidden = !open;
    event.currentTarget.classList.toggle("active", open);
    event.currentTarget.setAttribute("aria-expanded", String(open));
    if (!open) {
      document.querySelector("#edit-current-password").value = "";
      document.querySelector("#edit-new-password").value = "";
    }
    state.usersError = "";
  });
  document.querySelector("#edit-user-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.querySelector('button[type="submit"][form="edit-user-form"]');
    button.disabled = true;
    state.usersError = "";
    try {
      const values = Object.fromEntries(new FormData(form));
      values.changePassword = document.querySelector("#change-password-fields")?.hidden === false;
      const changingAnotherUser = state.userModal.user.id !== state.currentUser?.id;
      if (values.changePassword && !values.password) {
        throw new Error("Enter the new password.");
      }
      if (values.changePassword && !changingAnotherUser && !values.currentPassword) {
        throw new Error("Enter your current password.");
      }
      await authApi.updateUser(state.userModal.user.id, values);
      state.userModal = null;
      await loadManagedUsers({ render: false });
      renderApp();
      showToast("CAMS user updated successfully.");
    } catch (error) {
      state.usersError = error.message;
      renderApp();
    }
  });
  document.querySelectorAll("[data-delete-user]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this account? It will remain available for restoration.")) return;
    button.disabled = true;
    try {
      await authApi.deleteUser(button.dataset.deleteUser);
      await loadManagedUsers({ render: false });
      renderApp();
      showToast("User account deleted.");
    } catch (error) {
      state.usersError = error.message;
      renderApp();
    }
  }));
  document.querySelectorAll("[data-restore-user]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await authApi.restoreUser(button.dataset.restoreUser);
      await loadManagedUsers({ render: false });
      renderApp();
      showToast("User account restored.");
    } catch (error) {
      state.usersError = error.message;
      renderApp();
    }
  }));
  document.querySelectorAll("[data-permanent-delete-user]").forEach(button => button.addEventListener("click", async () => {
    if (!window.confirm("Permanently delete this removed account? This cannot be undone. Tickets and audit history will be retained.")) return;
    button.disabled = true;
    try {
      await authApi.permanentlyDeleteUser(button.dataset.permanentDeleteUser);
      await loadManagedUsers({ render: false });
      renderApp();
      showToast("User permanently deleted. Tickets and audit history were retained.");
    } catch (error) {
      state.usersError = error.message;
      renderApp();
    }
  }));
  document.querySelector("#removed-users")?.addEventListener("click", () => { state.usersRemovedOpen = true; renderApp(); });
  document.querySelector("#removed-users-close")?.addEventListener("click", () => { state.usersRemovedOpen = false; renderApp(); });
  document.querySelector("#removed-users-cancel")?.addEventListener("click", () => { state.usersRemovedOpen = false; renderApp(); });
  bindDownload("#export-machines-pdf", () => "/api/exports/machines/pdf");
  bindDownload("#export-machines-xlsx", () => "/api/exports/machines/xlsx");
  bindDownload("#export-machine-xlsx", () => telemetryExportPath(state.machineId, "1h", "xlsx"));
  bindDownload("#export-machine-pdf", () => telemetryExportPath(state.machineId, "1h", "pdf"));
  bindDownload("#export-trend-xlsx", () => telemetryExportPath(state.trendMachine, state.trendRange, "xlsx"));
  bindDownload("#export-trend-pdf", () => telemetryExportPath(state.trendMachine, state.trendRange, "pdf"));
  bindDownload("#export-alarms", () => "/api/exports/alarms/xlsx");
  bindConnectedProcessChart();
}

function settingsPayload(form) {
  const data = new FormData(form);
  const number = (name, fallback) => data.has(name) ? Number(data.get(name)) : fallback;
  const thresholds = state.settings?.thresholds || {};
  const sampling = state.settings?.sampling || {};
  return {
    siteId: state.settings?.siteId || "plant-01",
    plant: { name: data.get("plant.name"), area: data.get("plant.area"), shift: data.get("plant.shift") },
    thresholds: {
      pressureBar: { minimum: number("thresholds.pressureBar.minimum", thresholds.pressureBar?.minimum), maximum: number("thresholds.pressureBar.maximum", thresholds.pressureBar?.maximum) },
      flowLpm: { minimum: number("thresholds.flowLpm.minimum", thresholds.flowLpm?.minimum), maximum: number("thresholds.flowLpm.maximum", thresholds.flowLpm?.maximum) },
      suctionKpa: { minimum: number("thresholds.suctionKpa.minimum", thresholds.suctionKpa?.minimum), maximum: number("thresholds.suctionKpa.maximum", thresholds.suctionKpa?.maximum) },
      powerMonitor: Object.fromEntries(["voltageV", "currentA", "activePowerW", "powerFactor", "frequencyHz", "apparentPowerVa", "reactivePowerVar", "powerTotalKwh"].map(key => [key, { minimum: number(`thresholds.powerMonitor.${key}.minimum`, thresholds.powerMonitor?.[key]?.minimum), maximum: number(`thresholds.powerMonitor.${key}.maximum`, thresholds.powerMonitor?.[key]?.maximum) }]))
    },
    sampling: {
      intervalSeconds: number("sampling.intervalSeconds", sampling.intervalSeconds ?? 1),
      staleAfterSeconds: number("sampling.staleAfterSeconds", sampling.staleAfterSeconds ?? 10)
    },
    retentionDays: number("retentionDays", state.settings?.retentionDays ?? 7),
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

function navigate(page, { fromDashboardCard = false } = {}) {
  if (page === "users" && !state.currentUser?.isOwner) return;
  state.dashboardDeviceReturn = page === "machines" && fromDashboardCard;
  state.dashboardAlarmReturn = page === "alarms" && fromDashboardCard;
  if (page !== "machine-detail") state.machineLimitsEditing = false;
  if (page !== "machine-detail") state.machineConfigurationOpen = false;
  if (page !== "machine-detail") state.machinePowerMonitorOpen = false;
  state.page = page;
  state.mobileOpen = false;
  renderApp();
  if (page === "tickets") {
    loadTickets().then(tickets => {
      state.ticketRecords = tickets;
      state.ticketsError = "";
      if (state.page === "tickets") renderApp();
    }).catch(error => {
      state.ticketsError = error.message;
      if (state.page === "tickets") renderApp();
    });
  }
  if (page === "ticket-detail") {
    Promise.all([loadTicket(state.ticketId), loadOperators()]).then(([, operators]) => {
      state.ticketOperators = operators;
      state.ticketRecords = listTickets();
      if (state.page === "ticket-detail") renderApp();
    }).catch(error => showToast(error.message));
  }
  if (page === "trends" && state.trendMachine) {
    loadMachineHistory(state.trendMachine, state.trendRange).catch(error => showToast(error.message));
  }
  if (page === "machines" && state.machineView === "live") {
    const machineId = machines.find(machine => machine.id === state.machineId)?.id;
    if (machineId) loadMachineHistory(machineId, "24h").catch(error => showToast(error.message));
  }
  if (page === "machine-detail") loadMachineConfigurationForDetail().catch(error => showToast(error.message));
  if (page === "maintenance") loadMaintenance(state, authApi, renderApp);
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
  if (!state.authenticated || devicePreviewMode || document.hidden) return;
  if (!telemetryStream || telemetryStream.readyState === EventSource.CLOSED) connectTelemetryStream();
  syncLiveSnapshot();
});

window.addEventListener("online", () => {
  if (!state.authenticated || devicePreviewMode) return;
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
