import { hashPassword, normalizeIdentity } from "../src/auth/password.js";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";

const email = normalizeIdentity(process.env.CAMS_ADMIN_EMAIL);
const username = normalizeIdentity(process.env.CAMS_ADMIN_USERNAME);
const displayName = process.env.CAMS_ADMIN_DISPLAY_NAME?.trim();
const password = process.env.CAMS_ADMIN_PASSWORD;

if (!email || !email.includes("@")) throw new Error("CAMS_ADMIN_EMAIL must be a valid email address.");
if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("CAMS_ADMIN_USERNAME is invalid.");
if (!displayName || displayName.length > 80) throw new Error("CAMS_ADMIN_DISPLAY_NAME is required and must not exceed 80 characters.");

const config = loadConfig();
const db = await connectDatabase(config);
const passwordHash = await hashPassword(password);
const now = new Date();
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
      role: "owner",
      active: true,
      failedLoginCount: 0,
      lockUntil: null,
      updatedAt: now
    },
    $setOnInsert: { createdAt: now }
  },
  { upsert: true }
);
const owner = await db.collection("users").findOne({ emailNormalized: email });
await db.collection("sessions").deleteMany({ userId: owner._id });
console.log(`CAMS owner account is ready for ${email}.`);
await closeDatabase();
