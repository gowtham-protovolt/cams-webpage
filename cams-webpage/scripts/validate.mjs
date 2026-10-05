import { readFile } from "node:fs/promises";

const files = {
  html: new URL("../index.html", import.meta.url),
  css: new URL("../styles.css", import.meta.url),
  js: new URL("../app.js", import.meta.url)
};

const [html, css, js, runtimeConfig] = await Promise.all([
  readFile(files.html, "utf8"),
  readFile(files.css, "utf8"),
  readFile(files.js, "utf8"),
  readFile(new URL("../runtime-config.js", import.meta.url), "utf8")
]);

const checks = [
  ["page title", html.includes("Compressed Air Monitoring System")],
  ["responsive viewport", html.includes('name="viewport"')],
  ["stylesheet reference", html.includes('href="./styles.css"')],
  ["application script", html.includes('src="./app.js"')],
  ["runtime API configuration", html.includes('src="./runtime-config.js"') && runtimeConfig.includes("apiBaseUrl")],
  ["E7 powered-by mark", js.includes('<span class="owner-mark">E7</span>')],
  ["mobile breakpoint", css.includes("@media (max-width: 620px)")],
  ["reduced-motion support", css.includes("prefers-reduced-motion")],
  ["machine API connection", js.includes('authApi.request("/api/machines")')],
  ["MQTT telemetry event stream", js.includes('/api/telemetry/stream') && js.includes('addEventListener("telemetry"')],
  ["no static machine telemetry", !js.includes('const machines = [') && js.includes("let machines = []")],
  ["authenticated Excel export", js.includes('/api/exports/telemetry/${format}') && js.includes('credentials: "include"')],
  ["PDF and Excel report controls", js.includes('report-telemetry-pdf') && js.includes('report-telemetry-xlsx')],
  ["dashboard page", js.includes("function dashboardPage()")],
  ["machine details page", js.includes("function machineDetailPage()")],
  ["trends page", js.includes("function trendsPage()")],
  ["alarms page", js.includes("function alarmsPage()")],
  ["authentication API connection", js.includes("fetch(`${API_BASE_URL}${path}")],
  ["no embedded demo password", !js.includes('value="cams')],
  ["password is not persisted", !js.includes("password: password") && !js.includes("password: password.value")],
  ["server session restore", js.includes('authApi.restore()') && js.includes('authApi.signOut()')],
  ["sanitized public identity", !js.includes("Gowtham") && !js.includes("Dharanidhara")]
];

let failed = false;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
  failed ||= !passed;
}

if (failed) process.exitCode = 1;
else console.log(`\n${checks.length} validation checks passed.`);
