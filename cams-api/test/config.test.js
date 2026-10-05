import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const loadScript = `import { loadConfig } from './src/config.js'; console.log(JSON.stringify(loadConfig()));`;

function loadWith(environment) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", loadScript], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8"
  });
}

test("accepts secure same-origin production configuration", () => {
  const result = loadWith({
    NODE_ENV: "production",
    SERVE_WEB: "true",
    MONGODB_URI: "mongodb+srv://example.invalid/cams",
    CORS_ORIGINS: "https://cams.example.com",
    COOKIE_SECURE: "true",
    MQTT_ENABLED: "true",
    MQTT_URL: "mqtts://mqtt.example.com:8883",
    MQTT_USERNAME: "cams-api",
    MQTT_PASSWORD: "synthetic-test-secret"
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.serveWeb, true);
  assert.equal(config.cookie.sameSite, "lax");
});

test("rejects insecure production origins and MQTT credentials", () => {
  const result = loadWith({
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://localhost:27017/cams",
    CORS_ORIGINS: "http://cams.example.com",
    COOKIE_SECURE: "false",
    MQTT_ENABLED: "true",
    MQTT_URL: "mqtt://mqtt.example.com:1883"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /COOKIE_SECURE|HTTPS|localhost|mqtts/);
});
