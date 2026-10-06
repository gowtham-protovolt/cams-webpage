import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const hasDatabase = Boolean(process.env.MONGODB_URI);

async function login(baseUrl, origin, identity, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ identity, password })
  });
  return { response, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}

test("allows only owners to list, create, and disable CAMS users", { skip: !hasDatabase }, async () => {
  const baseConfig = loadConfig();
  const config = { ...baseConfig, mongoDb: `${baseConfig.mongoDb}_test` };
  const db = await connectDatabase(config);
  await Promise.all([db.collection("users").deleteMany({}), db.collection("sessions").deleteMany({})]);
  const now = new Date();
  await db.collection("users").insertMany([
    {
      email: "owner@example.test", emailNormalized: "owner@example.test", username: "owner", usernameNormalized: "owner",
      displayName: "Owner", passwordHash: await hashPassword("temporary-owner-password"), role: "owner", active: true,
      failedLoginCount: 0, lockUntil: null, createdAt: now, updatedAt: now
    },
    {
      email: "viewer@example.test", emailNormalized: "viewer@example.test", username: "viewer", usernameNormalized: "viewer",
      displayName: "Viewer", passwordHash: await hashPassword("temporary-viewer-password"), role: "viewer", active: true,
      failedLoginCount: 0, lockUntil: null, createdAt: now, updatedAt: now
    }
  ]);

  const server = createApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const origin = config.allowedOrigins[0];
  const jsonHeaders = { Origin: origin, "Content-Type": "application/json" };

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/users`, { headers: { Origin: origin } })).status, 401);

    const viewerLogin = await login(baseUrl, origin, "viewer", "temporary-viewer-password");
    assert.equal(viewerLogin.response.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/users`, { headers: { Origin: origin, Cookie: viewerLogin.cookie } })).status, 403);

    const ownerLogin = await login(baseUrl, origin, "owner", "temporary-owner-password");
    assert.equal(ownerLogin.response.status, 200);
    const listed = await fetch(`${baseUrl}/api/admin/users`, { headers: { Origin: origin, Cookie: ownerLogin.cookie } });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    assert.equal(listedBody.users.length, 2);
    assert.equal("passwordHash" in listedBody.users[0], false);

    const created = await fetch(`${baseUrl}/api/admin/users`, {
      method: "POST",
      headers: { ...jsonHeaders, Cookie: ownerLogin.cookie },
      body: JSON.stringify({
        displayName: "Plant Operator", username: "plant.operator", email: "operator@example.test",
        role: "operator", password: "temporary-operator-password"
      })
    });
    assert.equal(created.status, 201);
    const createdUser = (await created.json()).user;
    assert.equal(createdUser.active, true);
    assert.equal("passwordHash" in createdUser, false);
    const storedUser = await db.collection("users").findOne({ usernameNormalized: "plant.operator" });
    assert.notEqual(storedUser.passwordHash, "temporary-operator-password");

    const operatorLogin = await login(baseUrl, origin, "plant.operator", "temporary-operator-password");
    assert.equal(operatorLogin.response.status, 200);
    const disabled = await fetch(`${baseUrl}/api/admin/users/${createdUser.id}/status`, {
      method: "PATCH",
      headers: { ...jsonHeaders, Cookie: ownerLogin.cookie },
      body: JSON.stringify({ active: false })
    });
    assert.equal(disabled.status, 200);
    assert.equal((await db.collection("sessions").countDocuments({ userId: storedUser._id })), 0);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: origin, Cookie: operatorLogin.cookie } })).status, 401);

    const ownerId = listedBody.users.find(user => user.role === "owner").id;
    const selfDisable = await fetch(`${baseUrl}/api/admin/users/${ownerId}/status`, {
      method: "PATCH",
      headers: { ...jsonHeaders, Cookie: ownerLogin.cookie },
      body: JSON.stringify({ active: false })
    });
    assert.equal(selfDisable.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
});
