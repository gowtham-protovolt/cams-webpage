import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, normalizeIdentity, validateNewPassword, verifyPassword } from "../src/auth/password.js";

test("normalizes a username or email", () => {
  assert.equal(normalizeIdentity("  Owner@Example.COM "), "owner@example.com");
});

test("rejects short passwords", () => {
  assert.throws(() => validateNewPassword("too-short"), /at least 12/);
});

test("hashes and verifies a password without storing the original", async () => {
  const password = "correct-horse-battery-staple";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
});

test("rejects malformed password hashes", async () => {
  assert.equal(await verifyPassword("anything", "malformed"), false);
});
