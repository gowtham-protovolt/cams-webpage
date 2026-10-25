import "dotenv/config";
import { hashPassword, normalizeIdentity } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const email = normalizeIdentity(process.env.CAMS_OPERATOR_EMAIL);
const username = normalizeIdentity(process.env.CAMS_OPERATOR_USERNAME);
const displayName = process.env.CAMS_OPERATOR_DISPLAY_NAME?.trim();
const password = process.env.CAMS_OPERATOR_PASSWORD;

if (!email || !email.includes("@")) throw new Error("CAMS_OPERATOR_EMAIL must be a valid email address.");
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("CAMS_OPERATOR_USERNAME is invalid.");
if (!displayName || displayName.length > 80) throw new Error("CAMS_OPERATOR_DISPLAY_NAME is required and must not exceed 80 characters.");

const config = loadConfig();
const db = await connectDatabase(config);
const now = new Date();
const existing = await db.collection("users").findOne({
  $or: [{ emailNormalized: email }, { usernameNormalized: username }]
});

const passwordHash = await hashPassword(password);
if (existing && existing.role === "owner") {
  throw new Error("The supplied operator identity belongs to an owner account.");
}

await db.collection("users").updateOne(
  { $or: [{ emailNormalized: email }, { usernameNormalized: username }] },
  {
    $set: {
      email,
      emailNormalized: email,
      username,
      usernameNormalized: username,
      displayName,
      passwordHash,
      role: "operator",
      active: true,
      deletedAt: null,
      failedLoginCount: 0,
      lockUntil: null,
      updatedAt: now
    },
    $setOnInsert: { createdAt: now }
  },
  { upsert: true }
);
const operator = await db.collection("users").findOne({ usernameNormalized: username });
await db.collection("sessions").deleteMany({ userId: operator._id });
console.log(`CAMS operator account is ready for ${username}.`);
await closeDatabase();
