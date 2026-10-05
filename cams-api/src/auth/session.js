import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db.js";

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("base64url");
}

export async function createSession({ userId, remember, request, config }) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const duration = remember
    ? config.rememberedSessionDays * 24 * 60 * 60 * 1000
    : config.sessionHours * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + duration);
  await getDatabase().collection("sessions").insertOne({
    tokenHash: hashSessionToken(token),
    userId: new ObjectId(userId),
    createdAt: now,
    expiresAt,
    ip: request.ip,
    userAgent: String(request.get("user-agent") || "").slice(0, 300)
  });
  return { token, expiresAt };
}

export function setSessionCookie(response, token, expiresAt, config) {
  response.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: "/",
    expires: expiresAt
  });
}

export function clearSessionCookie(response, config) {
  response.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: "/"
  });
}

export function publicUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}
