import { readFile } from "node:fs/promises";

const files = {
  html: new URL("../index.html", import.meta.url),
  css: new URL("../styles.css", import.meta.url),
  js: new URL("../app.js", import.meta.url),
  pages: new URL("../src/pages/", import.meta.url),
  data: new URL("../src/data/", import.meta.url)
};

const pageNames = ["login", "dashboard", "live-data", "machines", "machine-detail", "trends", "alarms", "maintenance", "users", "settings", "energy", "tickets", "ticket-detail", "shared", "index"];
const [html, css, controller, runtimeConfig, ticketData, backendExports, ...pageSources] = await Promise.all([
  readFile(files.html, "utf8"),
  readFile(files.css, "utf8"),
  readFile(files.js, "utf8"),
  readFile(new URL("../runtime-config.js", import.meta.url), "utf8"),
  readFile(new URL("tickets.js", files.data), "utf8"),
  readFile(new URL("../../cams-api/src/routes/exports.js", import.meta.url), "utf8"),
  ...pageNames.map(name => readFile(new URL(`${name}.js`, files.pages), "utf8"))
]);
const pageCode = Object.fromEntries(pageNames.map((name, index) => [name, pageSources[index]]));
const js = `${controller}\n${pageSources.join("\n")}`;

const checks = [
  ["page title", html.includes("Compressed Air Monitoring System")],
  ["responsive viewport", html.includes('name="viewport"')],
  ["stylesheet reference", html.includes('href="./styles.css"')],
  ["application script", html.includes('src="./app.js"')],
  ["runtime API configuration", html.includes('src="./runtime-config.js"') && runtimeConfig.includes("apiBaseUrl")],
  ["same-origin production API", controller.includes('configuredApiBaseUrl === "same-origin"')],
  ["E7 powered-by mark", js.includes('<span class="owner-mark">E7</span>')],
  ["mobile breakpoint", css.includes("@media (max-width: 620px)")],
  ["reduced-motion support", css.includes("prefers-reduced-motion")],
  ["machine API connection", js.includes('authApi.request("/api/machines")')],
  ["owner machine lifecycle controls", controller.includes("createMachine(machine)") && controller.includes("updateMachine(machineId") && controller.includes("removeMachine(machineId") && controller.includes("restoreMachine(machineId") && pageCode.machines.includes('id="add-machine"') && pageCode.machines.includes('id="removed-machines"')],
  ["editable device names preserve immutable CAMS identity", pageCode.shared.includes("export function deviceDisplayName") && pageCode.shared.includes("export function deviceLabel") && pageCode.machines.includes("<span>Device ID</span>") && pageCode.machines.includes('readonly aria-readonly="true"') && pageCode.machines.includes("<span>Device name</span>") && pageCode.machines.includes('type="hidden" name="machineId"') && controller.includes("{ name: data.name, clusterId: data.clusterId, areaId: data.areaId }")],
  ["device display names appear across monitoring pages", ["dashboard", "live-data", "machine-detail", "trends", "alarms", "maintenance"].every(name => pageCode[name].includes("deviceLabel(") || pageCode[name].includes("deviceDisplayName(")) && pageCode.machines.includes("deviceDisplayName(machine)")],
  ["controlled machine removal copy", pageCode.machines.includes("Historical telemetry is preserved") && pageCode.machines.includes("ignored until you restore it")],
  ["MQTT telemetry event stream", js.includes('/api/telemetry/stream') && js.includes('addEventListener("telemetry"')],
  ["configurable reload-safe live sync", controller.includes("setInterval(syncLiveSnapshot, interval)") && controller.includes("settings?.sampling?.intervalSeconds") && controller.includes('addEventListener("visibilitychange"')],
  ["trend parameter survives live refresh", controller.includes('sessionStorage.setItem("cams.trendParameter"') && controller.includes('matches("input, select, textarea")') && controller.includes("telemetryChanged")],
  ["live data CAMS hierarchy", js.includes('data-tree-root-label') && js.includes('data-tree-device') && js.includes('data-tree-date') && js.includes('data-tree-sample')],
  ["live data three-value leaves", js.includes('treeValue("flow"') && js.includes('treeValue("pressure"') && js.includes('treeValue("suction"')],
  ["live data is integrated beside cluster view instead of sidebar navigation", !controller.includes('{ id: "live-data", label: "Live Data"') && !controller.includes('case "live-data"') && pageCode.machines.includes('data-machine-view="cluster"') && pageCode.machines.includes('data-machine-view="live"') && pageCode.machines.includes("renderLiveDataPanel") && pageCode["live-data"].includes("renderLiveDataPanel")],
  ["live data second precision", js.includes('second: "2-digit"') && !js.includes('fractionalSecondDigits: 3')],
  ["no static machine telemetry", !js.includes('const machines = [') && controller.includes("let machines = []")],
  ["authenticated Excel export", js.includes('/api/exports/telemetry/${format}') && js.includes('credentials: "include"')],
  ["download menus close outside and preserve icon-only detail action", controller.includes('.download-menu[open]') && controller.includes('menu.removeAttribute("open")') && css.includes('summary.icon-btn { min-width: 44px;')],
  ["reports page removed and fleet PDF endpoint disabled", !pageNames.includes("reports") && !controller.includes("renderReportsPage") && !pageCode.index.includes("renderReportsPage") && !js.includes("report-telemetry") && /router\.get\("\/exports\/machines\/:format"[\s\S]*?if \(format !== "xlsx"\)/.test(backendExports)],
  ["separate page modules", ["login", "dashboard", "machines", "machine-detail", "trends", "alarms", "maintenance", "users", "settings", "energy", "tickets", "ticket-detail"].every(name => pageCode[name].includes("export function render"))],
  ["dashboard page", pageCode.dashboard.includes("renderDashboardPage")],
  ["dashboard unavailable telemetry state", pageCode.dashboard.includes('Last known operating snapshot') && pageCode.dashboard.includes('Last update') && pageCode.dashboard.includes('Open alarms') && controller.includes('CAMS stream connected')],
  ["dashboard KPI cards navigate to online/offline device filters", ["all", "running", "stopped", "alarms"].every(filter => pageCode.dashboard.includes(`filter: "${filter}"`)) && pageCode.shared.includes('data-dashboard-kpi=') && controller.includes('[data-dashboard-kpi]') && controller.includes('navigate("machines")') && controller.includes('navigate("alarms")') && controller.includes('filter === "running" ? "Online" : filter === "stopped" ? "Offline"') && pageCode.machines.includes('["Online", "Offline"]') && pageCode.machines.includes('connectionStatus(machine) === state.machineFilter') && pageCode.alarms.includes('state.alarmFilter === "Open"')],
  ["dashboard device health lists clickable PR ticket IDs", pageCode.dashboard.includes("<h2>Device health</h2>") && pageCode.dashboard.includes("Problem tickets") && pageCode.dashboard.includes("formatTicketId(ticket.id)") && pageCode.dashboard.includes('data-page="tickets"') && pageCode.dashboard.includes("No problem tickets available.") && pageCode.dashboard.includes("state.ticketsError") && !pageCode.dashboard.includes("Recent alarms & events") && !pageCode.dashboard.includes("compactMachines")],
  ["tickets load from the authenticated API with an opt-in isolated preview", ["listTickets", "getTicket", "updateTicket", "addComment", "getOpenTicketForMachine"].every(name => ticketData.includes(`function ${name}`)) && ticketData.includes("/api/tickets") && ticketData.includes('credentials: "include"') && ticketData.includes('get("ticketPreview") === "1"') && ticketData.includes("TKT_TEST_001") && !controller.includes('ticketId: "TKT_TEST_001"')],
  ["ticket list uses Ticket_id and displays PR-prefixed ids", pageCode.tickets.includes("<th>Ticket_id</th><th>Machine</th><th>Cluster</th><th>Assigned to</th><th>Opened</th>") && !pageCode.tickets.includes("<th>PR_id</th>") && pageCode.tickets.includes("formatTicketId(ticket.id)") && ticketData.includes('replace(/^TKT(?=_)/, "PR")') && pageCode.tickets.includes('colspan="5"') && pageCode.tickets.includes("No tickets match this filter.")],
  ["ticket filters reuse the alarm-style modal and filter rows by location, priority, status, and time", pageCode.tickets.includes('id="ticket-more-filters"') && pageCode.tickets.includes('class="machine-modal alarm-filters-modal ticket-filters-modal"') && ["ticket-cluster", "ticket-area", "ticket-device", "ticket-priority", "ticket-status", "data-ticket-time-range"].every(filter => pageCode.tickets.includes(filter)) && pageCode.tickets.includes("Custom dates") && pageCode.tickets.includes('icon("filter")') && controller.includes("state.ticketClusterFilter") && controller.includes("state.ticketAreaFilter") && controller.includes("state.ticketDeviceFilter") && controller.includes("state.ticketStatusFilter") && controller.includes("state.ticketFromDate") && controller.includes("data-ticket-clear-group") && controller.includes('parseFilterDate(values.get("fromDate"))')],
  ["ticket list opens from row clicks except the PR ticket id", pageCode.tickets.includes('class="clickable" data-ticket-row') && pageCode.tickets.includes('data-ticket-open="${escapeHtml(ticket.id)}" tabindex="0"') && pageCode.tickets.includes('class="row-action ticket-row-id"') && controller.includes('if (event.target.closest(".ticket-row-id")) return;') && controller.includes('row.addEventListener("click", openTicket)') && controller.includes('["Enter", " "].includes(event.key)')],
  ["ticket detail moves maintenance status below opened and comments below description", pageCode["ticket-detail"].includes('customSelect("ticket-maintenance"') && pageCode["ticket-detail"].indexOf('input("Opened"') < pageCode["ticket-detail"].indexOf('customSelect("ticket-maintenance"') && pageCode["ticket-detail"].includes('input("machine_id", "machineNo"') && !pageCode["ticket-detail"].includes('input("Machine number"') && pageCode["ticket-detail"].indexOf("</textarea>") < pageCode["ticket-detail"].indexOf('id="ticket-comment-form"') && pageCode["ticket-detail"].includes('<section class="panel">') && !pageCode["ticket-detail"].includes("ticket-comments-panel") && pageCode["ticket-detail"].includes("</form>") && pageCode["ticket-detail"].includes("Back to tickets") && !["Assignment group", "Opened by", "Source", "Due by"].some(label => pageCode["ticket-detail"].includes(`input("${label}"`)) && controller.includes("closeTicket(state.ticketId)") && controller.includes("addComment(state.ticketId, comment)") && controller.includes("Ticket updated successfully.")],
  ["ticket dropdowns use the shared rounded teal controls with action and activity spacing", pageCode["ticket-detail"].includes("customSelect(`ticket-${name}`") && pageCode["ticket-detail"].includes('customSelect("ticket-maintenance"') && css.includes(".ticket-form-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 8px; padding: 0 23px 24px; }") && css.includes(".ticket-activity-panel { margin-top: 18px; }") && css.includes(".custom-select-trigger:focus-visible") && css.includes(".custom-select-menu { position: fixed;")],
  ["ticket details show a bottom activity history", pageCode["ticket-detail"].includes("<h2>Activity history</h2>") && pageCode["ticket-detail"].includes("ticket.activity || []") && pageCode["ticket-detail"].includes("ticket-activity") && ticketData.includes("previewTicket")],
  ["devices page omits connected systems tagline", pageCode.machines.includes('pageHead("Devices", ""') && !pageCode.machines.includes("Monitor and compare")],
  ["time ranges use full month labels", js.includes('"1 month"') && js.includes('"3 months"') && js.includes('"6 months"') && !/\[\s*"(?:1|3|6)mo"\s*,\s*"(?:1|3|6) mo"\s*\]/.test(js)],
  ["dropdown controls use rounded custom options", ["dashboard", "trends", "machine-detail"].every(name => pageCode[name].includes("customSelect(") || pageCode[name].includes("timeRangeSelect(")) && pageCode.users.includes("customSelect(") && pageCode.shared.includes('role="listbox"') && pageCode.shared.includes('role="option"') && controller.includes("document.body.append(menu)") && css.includes(".custom-select-menu { position: fixed;") && css.includes("border-radius: 13px") && css.includes(".custom-select-option[aria-selected=\"true\"]")],
  ["settings offers rounded shift choices", pageCode.settings.includes('"First Shift", "Second Shift", "Third Shift", "General Shift"') && pageCode.settings.includes('customSelect("plant.shift"') && pageCode.settings.includes('name="plant.shift"') && css.includes(".settings-field .custom-select-trigger")],
  ["preview and live screen modes are local display preferences", pageCode.settings.includes('data-screen-mode="preview"') && pageCode.settings.includes('data-screen-mode="live"') && pageCode.settings.includes("state.screenMode") && controller.includes('localStorage.getItem("cams.screenMode")') && controller.includes('localStorage.setItem("cams.screenMode", mode)') && controller.includes('class="app-shell ${state.screenMode === "live" ? "live-screen" : "preview-screen"}"') && controller.includes('if (mode === "live") state.page = "dashboard";') && css.includes(".app-shell.live-screen:has(") && css.includes(".app-shell.live-screen .top-header, .app-shell.live-screen .main-content { margin-left: 0;") && css.includes(".sidebar-reveal-zone:focus-visible") && pageCode.settings.includes("On touch screens, use the menu button.") && !pageCode.settings.includes('name="screenMode"') && !controller.slice(controller.indexOf("function settingsPayload(form)"), controller.indexOf("async function saveSettings")).includes("screenMode")],
  ["dropdown controls preserve selection and keyboard access", controller.includes("[data-custom-select-option]") && controller.includes('querySelector(".custom-select-trigger span").textContent = option.textContent') && controller.includes('dispatchEvent(new Event("change", { bubbles: true }))') && controller.includes('event.key === "ArrowDown"') && controller.includes('event.key === "Escape"') && controller.includes('document.addEventListener("scroll", event =>') && controller.includes("closeCustomSelects()")],
  ["custom date picker uses rounded CAMS-themed calendar controls", pageCode.shared.includes("export function customDatePicker") && pageCode.shared.includes("custom-calendar-day") && css.includes(".custom-calendar { position: fixed;") && css.includes("border-radius: 14px") && css.includes(".custom-calendar-day.selected") && css.includes("font-family: inherit")],
  ["custom calendar floats without moving form fields", css.includes("position: fixed; z-index: 1000; width: 280px") && controller.includes("positionCustomCalendar()") && controller.includes("calendar.style.top")],
  ["custom calendar weekdays and dates have aligned spacing", css.includes("grid-template-columns: repeat(7, minmax(0, 1fr)); column-gap: 5px") && css.includes("white-space: nowrap")],
  ["custom date picker supports direct month and year selection", pageCode.shared.includes("data-custom-date-part=\"month\"") && pageCode.shared.includes("data-custom-date-part=\"year\"") && controller.includes("[data-custom-date-month-year]") && controller.includes("[data-custom-date-part]") && controller.includes("state.customDatePickerMonth") && !pageCode.shared.includes("data-custom-date-month=")],
  ["custom date picker selects dates and closes the selector", controller.includes("[data-custom-date-select]") && controller.includes("[data-custom-date-done]") && controller.includes("state.customDatePickerSelecting = null")],
  ["all custom time-range fields use the shared calendar", ["dashboard", "trends", "machine-detail"].every(name => pageCode[name].includes("customDatePicker(state,")) && !js.includes('type="date"')],
  ["alarm summary cards fit evenly without grid overflow", css.includes(".alarm-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));") && css.includes(".alarm-summary-card { min-width: 0;") && css.includes(".alarm-summary-card > div { min-width: 0; }")],
  ["operating limits rows have clear vertical and horizontal spacing", css.includes(".threshold-row { display: grid;") && css.includes("column-gap: 18px; row-gap: 16px; padding: 17px 0;")],
  ["alarm filters open, clear, and preserve selected filters", pageCode.alarms.includes('id="alarm-more-filters"') && pageCode.alarms.includes('id="alarm-filters-reset"') && pageCode.alarms.includes('customSelect("alarm-cluster"') && pageCode.alarms.includes('customSelect("alarm-area"') && pageCode.alarms.includes('customSelect("alarm-device"') && controller.includes('state.alarmTimeRange === "custom"')],
  ["clear all action uses neutral secondary button styling", pageCode.alarms.includes('class="secondary-btn" id="alarm-filters-reset"') && css.includes(".alarm-filters-modal .secondary-btn:disabled")],
  ["device pages share the compact industrial telemetry time format", pageCode.shared.includes("export function telemetryUpdateTime") && pageCode.shared.includes('Live · ${elapsedSeconds}s ago') && pageCode.shared.includes('return "No telemetry"') && pageCode.shared.includes('return `${date} · ${time}`') && pageCode.machines.includes("connectionLastUpdate(machine)") && pageCode["machine-detail"].includes("connectionStatusDisplay(machine)") && pageCode.dashboard.includes("telemetryUpdateTime(snapshot.receivedAt") && pageCode["live-data"].includes("telemetryUpdateTime(state.lastTelemetryAt") && controller.includes("telemetryUpdateTime(state.lastTelemetryAt)")],
  ["machine operating limits omit requested kicker and badge", !pageCode["machine-detail"].includes("Frontend only") && !pageCode["machine-detail"].includes('settings-kicker">Monitoring')],
  ["machine operating limits require edit mode before saving", pageCode["machine-detail"].includes('id="edit-machine-limits"') && pageCode["machine-detail"].includes('const limitsDisabled = !limitsEditing;') && controller.includes("!state.machineLimitsEditing") && controller.includes('querySelector("#edit-machine-limits")') && controller.includes("state.machineLimitsEditing = false;")],
  ["machine details page", pageCode["machine-detail"].includes("renderMachineDetailPage")],
  ["interactive machine detail graph", pageCode["machine-detail"].includes("connectedProcessChart") && pageCode["machine-detail"].includes('customSelect("detail-parameter"') && pageCode["machine-detail"].includes('timeRangeSelect("detail-range"') && controller.includes('sessionStorage.setItem("cams.detailParameter"')],
  ["trends page", pageCode.trends.includes("renderTrendsPage")],
  ["alarms page", pageCode.alarms.includes("renderAlarmsPage")],
  ["alarm audit history", controller.includes("/history") && controller.includes("alarm-audit-form") && pageCode.alarms.includes("Alarm audit history") && pageCode.alarms.includes("Action comment")],
  ["authentication API connection", js.includes("fetch(`${API_BASE_URL}${path}")],
  ["no embedded demo password", !js.includes('value="cams')],
  ["password is not persisted", !js.includes("password: password") && !js.includes("password: password.value")],
  ["server session restore", js.includes('authApi.restore()') && js.includes('authApi.signOut()')],
  ["secure password reset interface", controller.includes('/api/auth/forgot-password') && controller.includes('/api/auth/reset-password') && pageCode.login.includes('renderPasswordRequestPage') && pageCode.login.includes('renderPasswordResetPage')],
  ["owner-only user management", controller.includes('/api/admin/users') && controller.includes('ownerOnly: true') && pageCode.users.includes('renderUsersPage')],
  ["user account KPI cards are professional read-only drill-down filters", pageCode.users.includes('data-user-account-filter=') && pageCode.users.includes('aria-pressed=') && pageCode.users.includes('label: "Registered accounts"') && pageCode.users.includes('label: "Active accounts"') && pageCode.users.includes('user.deletedAt') && controller.includes('userAccountFilter: "registered"') && controller.includes('[data-user-account-filter]') && css.includes('.user-summary-card.selected')],
  ["persistent plant settings", controller.includes('authApi.request("/api/settings"') && controller.includes('thresholds.pressureBar') && pageCode.settings.includes('retentionDays')],
  ["user passwords are never rendered", !js.includes("passwordHash")],
  ["sanitized public identity", !js.includes("Gowtham") && !js.includes("Dharanidhara")]
];

let failed = false;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
  failed ||= !passed;
}

if (failed) process.exitCode = 1;
else console.log(`\n${checks.length} validation checks passed.`);
