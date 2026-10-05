import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const hasDatabase = Boolean(process.env.MONGODB_URI);

test("rejects invalid credentials and manages a real MongoDB session", { skip: !hasDatabase }, async () => {
  const config = loadConfig();
  const db = await connectDatabase(config);
  await Promise.all([db.collection("users").deleteMany({}), db.collection("sessions").deleteMany({})]);
  const now = new Date();
  await db.collection("users").insertOne({
    email: "owner@example.test",
    emailNormalized: "owner@example.test",
    username: "owner",
    usernameNormalized: "owner",
    displayName: "Integration Owner",
    passwordHash: await hashPassword("temporary-integration-password"),
    role: "owner",
    active: true,
    failedLoginCount: 0,
    lockUntil: null,
    createdAt: now,
    updatedAt: now
  });

  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { Origin: config.allowedOrigins[0], "Content-Type": "application/json" };

  try {
    const invalid = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ identity: "owner", password: "wrong-password" })
    });
    assert.equal(invalid.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ identity: "owner", password: "temporary-integration-password", remember: true })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.equal(loginBody.user.email, "owner@example.test");
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /cams_session=/);
    assert.match(cookie, /HttpOnly/i);
    const cookieHeader = cookie.split(";", 1)[0];

    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: config.allowedOrigins[0], Cookie: cookieHeader } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.role, "owner");

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { ...headers, Cookie: cookieHeader },
      body: "{}"
    });
    assert.equal(logout.status, 204);

    const afterLogout = await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: config.allowedOrigins[0], Cookie: cookieHeader } });
    assert.equal(afterLogout.status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
});
