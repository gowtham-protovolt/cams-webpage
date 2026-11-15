import { Router } from "express";
import { MongoServerError, ObjectId } from "mongodb";
import { hashPassword, normalizeIdentity, validateNewPassword, verifyPassword } from "../auth/password.js";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const ROLES = new Set(["operator", "viewer"]);

function requireOwner(request, response, next) {
  if (request.auth?.user.role !== "owner") return response.status(403).json({ error: "Owner access required." });
  next();
}

function managedUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    deletedAt: user.deletedAt?.toISOString?.() || user.deletedAt || null,
    createdAt: user.createdAt?.toISOString?.() || user.createdAt,
    lastLoginAt: user.lastLoginAt?.toISOString?.() || user.lastLoginAt || null
  };
}

export function usersRouter() {
  const router = Router();
  router.use(requireAuth, requireOwner);

  router.get("/users", async (_request, response, next) => {
    try {
      const users = await getDatabase().collection("users")
        .find({}, { projection: { passwordHash: 0, failedLoginCount: 0, lockUntil: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      response.json({ users: users.map(managedUser) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users", async (request, response, next) => {
    try {
      const email = normalizeIdentity(request.body?.email);
      const username = normalizeIdentity(request.body?.username);
      const displayName = String(request.body?.displayName || "").trim();
      const password = request.body?.password;
      const role = String(request.body?.role || "viewer").toLowerCase();
      if (!email || !email.includes("@") || email.length > 320) return response.status(400).json({ error: "Enter a valid email address." });
      if (!USERNAME.test(username)) return response.status(400).json({ error: "Username must contain 3–32 lowercase letters, numbers, dots, dashes, or underscores." });
      if (!displayName || displayName.length > 80) return response.status(400).json({ error: "Display name is required and must not exceed 80 characters." });
      if (!ROLES.has(role)) return response.status(400).json({ error: "Role must be operator or viewer." });

      const now = new Date();
      const result = await getDatabase().collection("users").insertOne({
        email,
        emailNormalized: email,
        username,
        usernameNormalized: username,
        displayName,
        passwordHash: await hashPassword(password),
        role,
        active: true,
        failedLoginCount: 0,
        lockUntil: null,
        createdAt: now,
        updatedAt: now
      });

      const user = await getDatabase().collection("users").findOne({ _id: result.insertedId });
      response.status(201).json({ user: managedUser(user) });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return response.status(409).json({ error: "That email address or username is already registered." });
      }
      if (error.message?.startsWith("Password must")) return response.status(400).json({ error: error.message });
      next(error);
    }
  });

  router.patch("/users/:userId", async (request, response, next) => {
    try {
      if (!ObjectId.isValid(request.params.userId)) return response.status(400).json({ error: "Invalid user identifier." });
      const userId = new ObjectId(request.params.userId);
      const email = normalizeIdentity(request.body?.email);
      const username = normalizeIdentity(request.body?.username);
      const displayName = String(request.body?.displayName || "").trim();
      const role = String(request.body?.role || "").toLowerCase();
      const changePassword = request.body?.changePassword === true;
      const currentPassword = request.body?.currentPassword;
      const password = request.body?.password;
      const existingUser = await getDatabase().collection("users").findOne({ _id: userId }, { projection: { role: 1 } });
      if (!existingUser) return response.status(404).json({ error: "User not found." });
      if (!email || !email.includes("@") || email.length > 320) return response.status(400).json({ error: "Enter a valid email address." });
      if (!USERNAME.test(username)) return response.status(400).json({ error: "Username must contain 3–32 lowercase letters, numbers, dots, dashes, or underscores." });
      if (!displayName || displayName.length > 80) return response.status(400).json({ error: "Display name is required and must not exceed 80 characters." });
      if (!(ROLES.has(role) || (existingUser.role === "owner" && role === "owner"))) return response.status(400).json({ error: "Role must be operator or viewer." });
      if (userId.equals(request.auth.user.id) && role !== "owner") return response.status(400).json({ error: "You cannot remove your own owner role." });
      if (changePassword && role === "owner" && !userId.equals(request.auth.user.id)) {
        return response.status(403).json({ error: "Owner passwords can only be changed by the owner." });
      }
      const update = { email, emailNormalized: email, username, usernameNormalized: username, displayName, role, updatedAt: new Date() };
      if (changePassword) {
        try {
          validateNewPassword(password);
        } catch (error) {
          return response.status(400).json({ error: error.message });
        }
        const changingAnotherUser = !userId.equals(request.auth.user.id);
        if (!changingAnotherUser) {
          if (typeof currentPassword !== "string" || !currentPassword) {
            return response.status(400).json({ error: "Current password is required." });
          }
          const storedUser = await getDatabase().collection("users").findOne({ _id: userId }, { projection: { passwordHash: 1 } });
          if (!storedUser || !(await verifyPassword(currentPassword, storedUser.passwordHash))) {
            return response.status(400).json({ error: "Current password is incorrect." });
          }
        }
        update.passwordHash = await hashPassword(password);
        update.failedLoginCount = 0;
        update.lockUntil = null;
      }
      const user = await getDatabase().collection("users").findOneAndUpdate(
        { _id: userId },
        { $set: update },
        { returnDocument: "after" }
      );
      if (update.passwordHash) await getDatabase().collection("sessions").deleteMany({ userId });
      response.json({ user: managedUser(user) });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return response.status(409).json({ error: "That email address or username is already registered." });
      }
      if (error.message?.startsWith("Password must")) return response.status(400).json({ error: error.message });
      next(error);
    }
  });

  router.patch("/users/:userId/status", async (request, response, next) => {
    try {
      if (!ObjectId.isValid(request.params.userId)) return response.status(400).json({ error: "Invalid user identifier." });
      if (typeof request.body?.active !== "boolean") return response.status(400).json({ error: "Active status must be true or false." });
      const userId = new ObjectId(request.params.userId);
      if (userId.equals(request.auth.user.id) && request.body.active === false) {
        return response.status(400).json({ error: "You cannot disable your own owner account." });
      }
      const users = getDatabase().collection("users");
      const user = await users.findOneAndUpdate(
        { _id: userId, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
        { $set: { active: request.body.active, updatedAt: new Date() } },
        { returnDocument: "after" }
      );
      if (!user) return response.status(404).json({ error: "User not found." });
      if (!user.active) await getDatabase().collection("sessions").deleteMany({ userId });
      response.json({ user: managedUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/:userId", async (request, response, next) => {
    try {
      if (!ObjectId.isValid(request.params.userId)) return response.status(400).json({ error: "Invalid user identifier." });
      const userId = new ObjectId(request.params.userId);
      if (userId.equals(request.auth.user.id)) return response.status(400).json({ error: "You cannot delete your own owner account." });
      const now = new Date();
      const user = await getDatabase().collection("users").findOneAndUpdate(
        { _id: userId, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
        { $set: { active: false, deletedAt: now, deletedBy: request.auth.user.id, updatedAt: now } },
        { returnDocument: "after" }
      );
      if (!user) return response.status(404).json({ error: "Active user not found." });
      await getDatabase().collection("sessions").deleteMany({ userId });
      response.json({ user: managedUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/:userId/permanent", async (request, response, next) => {
    try {
      if (!ObjectId.isValid(request.params.userId)) return response.status(400).json({ error: "Invalid user identifier." });
      const userId = new ObjectId(request.params.userId);
      if (userId.equals(request.auth.user.id)) return response.status(400).json({ error: "You cannot permanently delete your own owner account." });
      const user = await getDatabase().collection("users").findOneAndDelete({ _id: userId, deletedAt: { $ne: null } });
      if (!user) return response.status(404).json({ error: "Removed user not found." });
      await Promise.all([
        getDatabase().collection("sessions").deleteMany({ userId }),
        getDatabase().collection("passwordResetTokens").deleteMany({ userId })
      ]);
      response.json({ deleted: true, userId: userId.toString() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/:userId/restore", async (request, response, next) => {
    try {
      if (!ObjectId.isValid(request.params.userId)) return response.status(400).json({ error: "Invalid user identifier." });
      const userId = new ObjectId(request.params.userId);
      const user = await getDatabase().collection("users").findOneAndUpdate(
        { _id: userId, deletedAt: { $ne: null } },
        {
          $set: {
            active: true,
            deletedAt: null,
            deletedBy: null,
            failedLoginCount: 0,
            lockUntil: null,
            updatedAt: new Date()
          }
        },
        { returnDocument: "after" }
      );
      if (!user) return response.status(404).json({ error: "Deleted user not found." });
      response.json({ user: managedUser(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
