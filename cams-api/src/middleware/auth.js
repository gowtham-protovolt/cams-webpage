import { getDatabase } from "../db.js";
import { hashSessionToken, publicUser } from "../auth/session.js";

export function authenticate(config) {
  return async function authenticateRequest(request, _response, next) {
    try {
      const token = request.cookies[config.cookie.name];
      if (!token) return next();
      const session = await getDatabase().collection("sessions").findOne({
        tokenHash: hashSessionToken(token),
        expiresAt: { $gt: new Date() }
      });
      if (!session) return next();
      const user = await getDatabase().collection("users").findOne({ _id: session.userId, active: true });
      if (user) request.auth = { session, user: publicUser(user) };
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
