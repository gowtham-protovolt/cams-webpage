import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDatabase } from "../db.js";
import {
  addTicketComment,
  closeTicket,
  getOpenTicketForMachine,
  getTicket,
  listTickets,
  updateTicket
} from "../tickets/service.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TICKET_ID = /^TKT_[A-Za-z0-9_-]{1,32}$/;
const ENUMS = {
  cluster: ["", "C1", "C2", "C3", "C4"],
  area: ["", "A1", "A2", "A3"],
  category: ["", "Pressure", "Flow", "Suction", "Communication", "Sensor", "Mechanical", "Gateway"],
  priority: ["Critical", "High", "Medium", "Low"],
  maintenance: ["In progress", "Warning", "Closed"]
};
const MUTABLE_FIELDS = new Set(["cluster", "area", "machineNo", "category", "priority", "assignedTo", "dueBy", "maintenance"]);

function requireTicketWrite(request, response, next) {
  if (!new Set(["owner", "operator"]).has(request.auth?.user.role)) {
    return response.status(403).json({ error: "Owner or operator access required." });
  }
  next();
}

function validatedPatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Ticket updates must be an object." };
  const patch = {};
  for (const [field, value] of Object.entries(body)) {
    if (!MUTABLE_FIELDS.has(field)) return { error: `Ticket field "${field}" cannot be changed.` };
    if (field in ENUMS) {
      if (!ENUMS[field].includes(value)) return { error: `Invalid ${field}.` };
      patch[field] = value;
      continue;
    }
    if (field === "dueBy") {
      if (value === "" || value === null) patch.dueBy = null;
      else {
        const parsed = new Date(value);
        if (typeof value !== "string" || Number.isNaN(parsed.getTime())) return { error: "Due date must be a valid date." };
        patch.dueBy = parsed;
      }
      continue;
    }
    if (typeof value !== "string" || value.trim().length > 80) return { error: "Machine number and assignee must be text under 80 characters." };
    patch[field] = value.trim();
  }
  if (!Object.keys(patch).length) return { error: "Provide at least one ticket field to update." };
  return { patch };
}

export function ticketsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/tickets", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(siteId)) return response.status(400).json({ error: "Invalid site identifier." });
      response.json({ tickets: await listTickets(siteId) });
    } catch (error) { next(error); }
  });

  router.get("/tickets/operators", async (_request, response, next) => {
    try {
      const users = await getDatabase().collection("users")
        .find({ active: true, role: "operator" }, { projection: { displayName: 1 } })
        .sort({ displayName: 1 })
        .toArray();
      response.json({ operators: users.map(user => user.displayName) });
    } catch (error) { next(error); }
  });

  router.get("/tickets/open/:machineId", async (request, response, next) => {
    try {
      const machineId = String(request.params.machineId);
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(machineId) || !IDENTIFIER.test(siteId)) return response.status(400).json({ error: "Invalid machine identifier." });
      const ticket = await getOpenTicketForMachine(siteId, machineId);
      response.json({ ticket });
    } catch (error) { next(error); }
  });

  router.get("/tickets/:id", async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(siteId) || !TICKET_ID.test(request.params.id)) return response.status(400).json({ error: "Invalid ticket identifier." });
      const ticket = await getTicket(siteId, request.params.id);
      if (!ticket) return response.status(404).json({ error: "Ticket not found." });
      response.json({ ticket });
    } catch (error) { next(error); }
  });

  router.patch("/tickets/:id", requireTicketWrite, async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(siteId) || !TICKET_ID.test(request.params.id)) return response.status(400).json({ error: "Invalid ticket identifier." });
      const validated = validatedPatch(request.body);
      if (validated.error) return response.status(400).json({ error: validated.error });
      if (validated.patch.maintenance === "Closed") {
        const result = await closeTicket(siteId, request.params.id, request.auth.user);
        if (result.error) return response.status(result.status).json({ error: result.error, code: result.code });
        return response.json({ ticket: result.ticket });
      }
      const ticket = await updateTicket(siteId, request.params.id, validated.patch, request.auth.user);
      if (!ticket) return response.status(404).json({ error: "Open ticket not found." });
      response.json({ ticket });
    } catch (error) { next(error); }
  });

  router.post("/tickets/:id/comments", requireTicketWrite, async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      const text = String(request.body?.text || "").trim();
      if (!IDENTIFIER.test(siteId) || !TICKET_ID.test(request.params.id)) return response.status(400).json({ error: "Invalid ticket identifier." });
      if (!text || text.length > 1000) return response.status(400).json({ error: "Comment is required and must not exceed 1000 characters." });
      const result = await addTicketComment(siteId, request.params.id, text, request.auth.user);
      if (result.error) return response.status(result.status).json({ error: result.error, code: result.code });
      response.status(201).json({ ticket: result.ticket, comment: result.comment });
    } catch (error) { next(error); }
  });

  router.post("/tickets/:id/close", requireTicketWrite, async (request, response, next) => {
    try {
      const siteId = String(request.query.siteId || "plant-01");
      if (!IDENTIFIER.test(siteId) || !TICKET_ID.test(request.params.id)) return response.status(400).json({ error: "Invalid ticket identifier." });
      const result = await closeTicket(siteId, request.params.id, request.auth.user);
      if (result.error) return response.status(result.status).json({ error: result.error, code: result.code });
      response.json({ ticket: result.ticket });
    } catch (error) { next(error); }
  });

  return router;
}
