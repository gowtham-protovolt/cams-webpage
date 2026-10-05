import { access, readFile } from "node:fs/promises";

const files = {
  html: new URL("../index.html", import.meta.url),
  css: new URL("../styles.css", import.meta.url),
  js: new URL("../app.js", import.meta.url)
};

const [html, css, js] = await Promise.all([
  readFile(files.html, "utf8"),
  readFile(files.css, "utf8"),
  readFile(files.js, "utf8")
]);

let logoExists = true;
try {
  await access(new URL("../assets/e7-powered-logo.png", import.meta.url));
} catch {
  logoExists = false;
}

const checks = [
  ["page title", html.includes("Compressed Air Monitoring System")],
  ["responsive viewport", html.includes('name="viewport"')],
  ["stylesheet reference", html.includes('href="./styles.css"')],
  ["application script", html.includes('src="./app.js"')],
  ["E7 logo asset", logoExists && js.includes('alt="Powered by E7"')],
  ["mobile breakpoint", css.includes("@media (max-width: 620px)")],
  ["reduced-motion support", css.includes("prefers-reduced-motion")],
  ["13 machine records", (js.match(/id: "CAMS-/g) || []).length === 13],
  ["dashboard page", js.includes("function dashboardPage()")],
  ["machine details page", js.includes("function machineDetailPage()")],
  ["trends page", js.includes("function trendsPage()")],
  ["alarms page", js.includes("function alarmsPage()")],
  ["no backend connection", !js.includes("fetch(") && !js.includes("WebSocket")],
  ["no embedded demo password", !js.includes('value="cams')],
  ["password is not persisted", !js.includes("password: password") && !js.includes("password: password.value")],
  ["review session expiry", js.includes("expiresAt") && js.includes("reviewAuth.signOut()")],
  ["sanitized public identity", !js.includes("Gowtham") && !js.includes("Dharanidhara")]
];

let failed = false;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}`);
  failed ||= !passed;
}

if (failed) process.exitCode = 1;
else console.log(`\n${checks.length} validation checks passed.`);
