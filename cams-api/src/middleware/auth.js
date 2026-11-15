import { getDatabase } from "../db.js";
import { hashSessionToken, publicUser } from "../auth/session.js";

export async function findAuthenticatedSession(database, tokenHash, now = new Date()) {
  return database.collection("sessions").aggregate([
    { $match: { tokenHash, expiresAt: { $gt: now } } },
    { $limit: 1 },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        pipeline: [
          { $match: { active: true } },
          { $project: { email: 1, username: 1, displayName: 1, role: 1 } }
        ],
        as: "user"
      }
    },
    { $unwind: "$user" }
  ]).next();
}

export function getBearerToken(request) {
  const header = request.get("authorization");
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] || null;
}

export function authenticate(config) {
  return async function authenticateRequest(request, _response, next) {
    try {
      const token = getBearerToken(request) || request.cookies[config.cookie.name];
      if (!token) return next();
      const authenticated = await findAuthenticatedSession(getDatabase(), hashSessionToken(token));
      if (authenticated) {
        const { user, ...session } = authenticated;
        request.auth = { session, user: publicUser(user) };
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(request, response, next) {
  if (!request.auth) return response.status(401).json({ error: "Authentication required." });
  next();
}
