import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const hasDatabase = Boolean(process.env.MONGODB_URI || (process.env.MONGODB_APP_USERNAME && process.env.MONGODB_APP_PASSWORD));

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
    const changedOperator = await fetch(`${baseUrl}/api/admin/users/${createdUser.id}`, {
      method: "PATCH",
      headers: { ...jsonHeaders, Cookie: ownerLogin.cookie },
      body: JSON.stringify({
        displayName: "Plant Operator", username: "plant.operator", email: "operator@example.test",
        role: "operator", changePassword: true, password: "updated-operator-password"
      })
    });
    assert.equal(changedOperator.status, 200);
    const storedUpdatedUser = await db.collection("users").findOne({ _id: storedUser._id });
    assert.notEqual(storedUpdatedUser.passwordHash, storedUser.passwordHash);
    assert.equal(storedUpdatedUser.failedLoginCount, 0);
    assert.equal(storedUpdatedUser.lockUntil, null);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Origin: origin, Cookie: operatorLogin.cookie } })).status, 401);
    assert.equal((await login(baseUrl, origin, "plant.operator", "updated-operator-password")).response.status, 200);
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

    const activePermanentDelete = await fetch(`${baseUrl}/api/admin/users/${createdUser.id}/permanent`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerLogin.cookie }
    });
    assert.equal(activePermanentDelete.status, 404);
    const softDeleted = await fetch(`${baseUrl}/api/admin/users/${createdUser.id}`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerLogin.cookie }
    });
    assert.equal(softDeleted.status, 200);
    const testSessionToken = `permanent-delete-session-${process.pid}`;
    const testResetToken = `permanent-delete-reset-${process.pid}`;
    const retainedTicketGeneration = `permanent-delete-user-${process.pid}`;
    const retainedAlarmId = `permanent-delete-user-alarm-${process.pid}`;
    await Promise.all([
      db.collection("sessions").insertOne({ userId: storedUser._id, tokenHash: testSessionToken, expiresAt: new Date(Date.now() + 60_000) }),
      db.collection("passwordResetTokens").insertOne({ userId: storedUser._id, tokenHash: testResetToken, expiresAt: new Date(Date.now() + 60_000) }),
      db.collection("tickets").insertOne({ siteId: "user-delete-test", id: retainedTicketGeneration, generationKey: retainedTicketGeneration, actorUserId: createdUser.id }),
      db.collection("alarmAudit").insertOne({ alarmId: retainedAlarmId, actorUserId: createdUser.id, action: "User history retained", createdAt: now })
    ]);
    const permanentDelete = await fetch(`${baseUrl}/api/admin/users/${createdUser.id}/permanent`, {
      method: "DELETE", headers: { Origin: origin, Cookie: ownerLogin.cookie }
    });
    assert.equal(permanentDelete.status, 200);
    assert.equal((await db.collection("users").findOne({ _id: storedUser._id })), null);
    assert.equal(await db.collection("sessions").countDocuments({ tokenHash: testSessionToken }), 0);
    assert.equal(await db.collection("passwordResetTokens").countDocuments({ tokenHash: testResetToken }), 0);
    assert.equal(await db.collection("tickets").countDocuments({ generationKey: retainedTicketGeneration }), 1);
    assert.equal(await db.collection("alarmAudit").countDocuments({ alarmId: retainedAlarmId }), 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
  }
});
