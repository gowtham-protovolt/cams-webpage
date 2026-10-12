import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "../db.js";
import { hashPassword, normalizeIdentity, validateNewPassword, verifyPassword } from "../auth/password.js";
import { clearSessionCookie, createSession, hashSessionToken, setSessionCookie } from "../auth/session.js";
import { requireAuth } from "../middleware/auth.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const dummyPasswordHash = hashPassword("cams-dummy-password-for-timing-only");
const RESET_RESPONSE = "If an active CAMS account matches, password-reset instructions are ready.";

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("base64url");
}

export function authRouter(config) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later." }
  });
  const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many password-reset attempts. Try again later." }
  });

  router.post("/forgot-password", resetLimiter, async (request, response, next) => {
    try {
      const identity = normalizeIdentity(request.body?.identity);
      if (!identity || identity.length > 320) return response.status(400).json({ error: "Username or email is required." });

      const user = await getDatabase().collection("users").findOne({
        active: true,
        $or: [{ emailNormalized: identity }, { usernameNormalized: identity }]
      }, { projection: { _id: 1 } });
      const payload = { message: RESET_RESPONSE };
      const token = randomBytes(32).toString("base64url");
      if (user) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + config.passwordResetMinutes * 60 * 1000);
        const tokens = getDatabase().collection("passwordResetTokens");
        await tokens.deleteMany({ userId: user._id });
        await tokens.insertOne({ tokenHash: hashResetToken(token), userId: user._id, createdAt: now, expiresAt });
      }
      if (!config.production) {
        const resetUrl = new URL(config.passwordResetBaseUrl);
        resetUrl.searchParams.set("resetToken", token);
        payload.resetUrl = resetUrl.toString();
      }
      response.status(202).json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/reset-password", resetLimiter, async (request, response, next) => {
    try {
      const token = String(request.body?.token || "");
      const password = request.body?.password;
      if (token.length < 32 || token.length > 128) return response.status(400).json({ error: "This password-reset link is invalid or expired." });
      try {
        validateNewPassword(password);
      } catch (error) {
        return response.status(400).json({ error: error.message });
      }

      const now = new Date();
      const reset = await getDatabase().collection("passwordResetTokens").findOneAndDelete({
        tokenHash: hashResetToken(token),
        expiresAt: { $gt: now }
      });
      if (!reset) return response.status(400).json({ error: "This password-reset link is invalid or expired." });

      const result = await getDatabase().collection("users").updateOne(
        { _id: reset.userId, active: true },
        { $set: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockUntil: null, updatedAt: now } }
      );
      if (!result.matchedCount) return response.status(400).json({ error: "This password-reset link is invalid or expired." });
      await Promise.all([
        getDatabase().collection("sessions").deleteMany({ userId: reset.userId }),
        getDatabase().collection("passwordResetTokens").deleteMany({ userId: reset.userId })
      ]);
      clearSessionCookie(response, config);
      response.json({ message: "Password updated. Sign in with your new password." });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", loginLimiter, async (request, response, next) => {
    try {
      const identity = normalizeIdentity(request.body?.identity);
      const password = request.body?.password;
      const remember = request.body?.remember === true;
      if (!identity || identity.length > 320 || typeof password !== "string" || password.length > 128) {
        return response.status(400).json({ error: "Username/email and password are required." });
      }

      const users = getDatabase().collection("users");
      const user = await users.findOne({
        $or: [{ emailNormalized: identity }, { usernameNormalized: identity }]
      });
      const now = new Date();
      const locked = user?.lockUntil && user.lockUntil > now;
      const validPassword = await verifyPassword(password, user?.passwordHash || await dummyPasswordHash);
      if (!user || !user.active || locked || !validPassword) {
        if (user && !locked) {
          const failedLoginCount = (user.failedLoginCount || 0) + 1;
          await users.updateOne(
            { _id: user._id },
            {
              $set: {
                failedLoginCount,
                ...(failedLoginCount >= MAX_FAILED_ATTEMPTS ? { lockUntil: new Date(now.getTime() + LOCK_DURATION_MS) } : {})
              }
            }
          );
        }
        return response.status(401).json({ error: "Invalid username/email or password." });
      }

      await users.updateOne(
        { _id: user._id },
        { $set: { failedLoginCount: 0, lockUntil: null, lastLoginAt: now, updatedAt: now } }
      );
      const session = await createSession({ userId: user._id, remember, request, config });
      setSessionCookie(response, session.token, session.expiresAt, config);
      response.json({ user: request.app.locals.publicUser(user), expiresAt: session.expiresAt.toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", requireAuth, (request, response) => {
    response.json({ user: request.auth.user, expiresAt: request.auth.session.expiresAt.toISOString() });
  });

  router.post("/logout", async (request, response, next) => {
    try {
      const token = request.cookies[config.cookie.name];
      if (token) await getDatabase().collection("sessions").deleteOne({ tokenHash: hashSessionToken(token) });
      clearSessionCookie(response, config);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
