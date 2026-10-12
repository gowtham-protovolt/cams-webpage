import { readFile } from "node:fs/promises";

const files = {
  html: new URL("../index.html", import.meta.url),
  css: new URL("../styles.css", import.meta.url),
  js: new URL("../app.js", import.meta.url),
  pages: new URL("../src/pages/", import.meta.url)
};

const pageNames = ["login", "dashboard", "live-data", "machines", "machine-detail", "trends", "alarms", "maintenance", "reports", "users", "settings", "energy", "shared", "index"];
const [html, css, controller, runtimeConfig, ...pageSources] = await Promise.all([
  readFile(files.html, "utf8"),
  readFile(files.css, "utf8"),
  readFile(files.js, "utf8"),
  readFile(new URL("../runtime-config.js", import.meta.url), "utf8"),
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
  ["controlled machine removal copy", pageCode.machines.includes("Historical telemetry is preserved") && pageCode.machines.includes("ignored until you restore it")],
  ["MQTT telemetry event stream", js.includes('/api/telemetry/stream') && js.includes('addEventListener("telemetry"')],
  ["configurable reload-safe live sync", controller.includes("setInterval(syncLiveSnapshot, interval)") && controller.includes("settings?.sampling?.intervalSeconds") && controller.includes('addEventListener("visibilitychange"')],
  ["trend parameter survives live refresh", controller.includes('sessionStorage.setItem("cams.trendParameter"') && controller.includes('matches("input, select, textarea")') && controller.includes("telemetryChanged")],
  ["live data CAMS hierarchy", js.includes('data-tree-root-label') && js.includes('data-tree-device') && js.includes('data-tree-date') && js.includes('data-tree-sample')],
  ["live data three-value leaves", js.includes('treeValue("flow"') && js.includes('treeValue("pressure"') && js.includes('treeValue("suction"')],
  ["live data second precision", js.includes('second: "2-digit"') && !js.includes('fractionalSecondDigits: 3')],
  ["no static machine telemetry", !js.includes('const machines = [') && controller.includes("let machines = []")],
  ["authenticated Excel export", js.includes('/api/exports/telemetry/${format}') && js.includes('credentials: "include"')],
  ["PDF and Excel report controls", js.includes('report-telemetry-pdf') && js.includes('report-telemetry-xlsx')],
  ["separate page modules", ["login", "dashboard", "live-data", "machines", "machine-detail", "trends", "alarms", "maintenance", "reports", "users", "settings", "energy"].every(name => pageCode[name].includes("export function render"))],
  ["dashboard page", pageCode.dashboard.includes("renderDashboardPage")],
  ["dashboard unavailable telemetry state", pageCode.dashboard.includes('Last known operating snapshot') && pageCode.dashboard.includes('Last update') && pageCode.dashboard.includes('Open alarms') && controller.includes('CAMS stream connected')],
  ["machine details page", pageCode["machine-detail"].includes("renderMachineDetailPage")],
  ["interactive machine detail graph", pageCode["machine-detail"].includes("connectedProcessChart") && pageCode["machine-detail"].includes('id="detail-parameter"') && controller.includes('sessionStorage.setItem("cams.detailParameter"') && controller.includes("data-detail-range")],
  ["trends page", pageCode.trends.includes("renderTrendsPage")],
  ["alarms page", pageCode.alarms.includes("renderAlarmsPage")],
  ["alarm audit history", controller.includes("/history") && controller.includes("alarm-audit-form") && pageCode.alarms.includes("Alarm audit history") && pageCode.alarms.includes("Action comment")],
  ["authentication API connection", js.includes("fetch(`${API_BASE_URL}${path}")],
  ["no embedded demo password", !js.includes('value="cams')],
  ["password is not persisted", !js.includes("password: password") && !js.includes("password: password.value")],
  ["server session restore", js.includes('authApi.restore()') && js.includes('authApi.signOut()')],
  ["secure password reset interface", controller.includes('/api/auth/forgot-password') && controller.includes('/api/auth/reset-password') && pageCode.login.includes('renderPasswordRequestPage') && pageCode.login.includes('renderPasswordResetPage')],
  ["owner-only user management", controller.includes('/api/admin/users') && controller.includes('ownerOnly: true') && pageCode.users.includes('renderUsersPage')],
  ["persistent plant settings", controller.includes('authApi.request("/api/settings"') && pageCode.settings.includes('thresholds.pressureBar') && pageCode.settings.includes('retentionDays')],
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
