import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getSiteSettings, saveSiteSettings } from "../settings/service.js";

const SITE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function requireOwner(request, response, next) {
  if (request.auth?.user.role !== "owner") return response.status(403).json({ error: "Owner access required." });
  next();
}

export function settingsRouter(config) {
  const router = Router();
  router.use(requireAuth);
  router.get("/settings", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!SITE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      response.json({ settings: await getSiteSettings(config, siteId) });
    } catch (error) { next(error); }
  });
  router.put("/settings", requireOwner, async (request, response, next) => {
    try {
      const siteId = String(request.body?.siteId || "plant-01");
      if (!SITE_ID.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      response.json({ settings: await saveSiteSettings(config, siteId, request.body, request.auth.user.id) });
    } catch (error) {
      if (/required|must be|limits/.test(error.message)) return response.status(400).json({ error: error.message });
      next(error);
    }
  });
  return router;
}
