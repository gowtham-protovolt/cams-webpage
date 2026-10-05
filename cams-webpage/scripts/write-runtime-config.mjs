import { writeFile } from "node:fs/promises";

const apiBaseUrl = String(process.env.CAMS_API_URL || "").trim().replace(/\/$/, "");
if (apiBaseUrl && new URL(apiBaseUrl).protocol !== "https:") {
  throw new Error("CAMS_API_URL must use HTTPS for a production deployment.");
}

const contents = `window.CAMS_CONFIG = ${JSON.stringify({ apiBaseUrl }, null, 2)};\n`;
await writeFile(new URL("../runtime-config.js", import.meta.url), contents, "utf8");
console.log(apiBaseUrl ? "CAMS API URL configured for deployment." : "CAMS API URL is empty; login will remain disabled.");
