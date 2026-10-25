import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export function serviceStatus(ticket, now = new Date()) {
  if (ticket.status === "Completed") return "Completed";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const deadline = ticket.endDate || ticket.serviceDate;
  if (deadline < today) return "Overdue";
  if (ticket.status === "In progress") return "In progress";
  return deadline === today ? "Due today" : "Upcoming";
}
function publicTicket(ticket) {
  const { _id, ...rest } = ticket;
  return { ...rest, id: String(_id), displayStatus: serviceStatus(ticket) };
}
function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
function text(value, label, max, required = true) {
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) throw fail(`${label} ${required ? "is required and " : ""}must not exceed ${max} characters.`);
  return value.trim();
}
async function fields(body, existing) {
  const task = text(body.task, "Service task", 160);
  const submittedNotes = text(body.notes ?? "", "Notes", 4000, false);
  const notes = existing && !submittedNotes ? existing.notes || "" : submittedNotes;
  const serviceDate = text(body.serviceDate, "Service date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !Number.isFinite(Date.parse(serviceDate)) || new Date(serviceDate).toISOString().slice(0, 10) !== serviceDate) throw fail("Choose a valid service date.");
  const endDate = text(body.endDate, "End date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(Date.parse(endDate)) || new Date(endDate).toISOString().slice(0, 10) !== endDate) throw fail("Choose a valid end date.");
  if (endDate < serviceDate) throw fail("End date cannot be before the service date.");
  if (!ObjectId.isValid(body.assigneeId || "")) throw fail("Select a technician.");
  const user = await getDatabase().collection("users").findOne({ _id: new ObjectId(body.assigneeId), active: true, deletedAt: null, role: { $in: ["owner", "operator"] } });
  if (!user && body.assigneeId !== existing?.assigneeId) throw fail("Select an active owner or operator as technician.");
  return { task, notes, serviceDate, endDate, assigneeId: body.assigneeId, assigneeName: user?.displayName || existing.assigneeName };
}
export function maintenanceRouter() {
  const router = Router();
  router.use(requireAuth);
  const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); } };
  const writer = (req, _res, next) => ["owner", "operator"].includes(req.auth.user.role) ? next() : next(fail("Owner or operator access required.", 403));
  // Use route-local error handling for permission failures too.
  router.get("/maintenance", wrap(async (_req, res) => {
    const db = getDatabase();
    const [tickets, technicians] = await Promise.all([
      db.collection("serviceTickets").find({}).sort({ endDate: 1, serviceDate: 1, createdAt: -1 }).toArray(),
      db.collection("users").find({ active: true, deletedAt: null, role: { $in: ["owner", "operator"] } }, { projection: { displayName: 1 } }).sort({ displayName: 1 }).toArray()
    ]);
    res.json({ tickets: tickets.map(publicTicket), technicians: technicians.map(u => ({ id: String(u._id), name: u.displayName })) });
  }));
  router.post("/maintenance", writer, wrap(async (req, res) => {
    const db = getDatabase();
    const data = await fields(req.body);
    const machine = await db.collection("machines").findOne({ machineId: String(req.body.machineId || ""), siteId: String(req.body.siteId || ""), active: true });
    if (!machine) throw fail("Select a registered active device.");
    const counter = await db.collection("counters").findOneAndUpdate({ _id: "service-ticket" }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after" });
    const now = new Date();
    const ticket = { ...data, number: `SRV-${String(counter.value).padStart(6, "0")}`, machineId: machine.machineId, siteId: machine.siteId, cluster: machine.cluster || "", area: machine.zone, machineName: machine.name, status: "Scheduled", version: 1, createdAt: now, updatedAt: now, completedAt: null, activity: [{ at: now, actor: req.auth.user.displayName, actorId: req.auth.user.id, message: "Service scheduled." }] };
    await db.collection("serviceTickets").insertOne(ticket);
    res.status(201).json({ ticket: publicTicket(ticket) });
  }));
  router.patch("/maintenance/:id", writer, wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) throw fail("Invalid ticket.");
    const collection = getDatabase().collection("serviceTickets");
    const old = await collection.findOne({ _id: new ObjectId(req.params.id) });
    if (!old) throw fail("Ticket not found.", 404);
    if (old.status === "Completed") throw fail("Completed tickets are preserved in Service History.", 409);
    const data = await fields(req.body, old);
    const status = req.body.status;
    if (!["Scheduled", "In progress", "Completed"].includes(status)) throw fail("Invalid service status.");
    const comment = text(req.body.comment ?? "", "Comment", 4000, false);
    const changes = [];
    if (data.task !== old.task) changes.push(`Service task: ${old.task} → ${data.task}`);
    if (data.notes !== old.notes) changes.push(`Notes: ${data.notes}`);
    if (data.serviceDate !== old.serviceDate) changes.push(`Service date: ${old.serviceDate} → ${data.serviceDate}`);
    if (data.endDate !== old.endDate) changes.push(`End date: ${old.endDate} → ${data.endDate}`);
    if (data.assigneeId !== old.assigneeId) changes.push(`Technician: ${old.assigneeName} → ${data.assigneeName}`);
    if (status !== old.status) changes.push(`Status: ${old.status} → ${status}`);
    if (comment) changes.push(`Additional comment: ${comment}`);
    if (!changes.length) return res.json({ ticket: publicTicket(old) });
    const now = new Date();
    const ticket = await collection.findOneAndUpdate({ _id: old._id, version: req.body.version }, { $set: { ...data, status, updatedAt: now, completedAt: status === "Completed" ? now : null }, $inc: { version: 1 }, $push: { activity: { at: now, actor: req.auth.user.displayName, actorId: req.auth.user.id, message: changes.join("\n") } } }, { returnDocument: "after" });
    if (!ticket) throw fail("This ticket was updated by someone else. Close and reopen it before saving.", 409);
    res.json({ ticket: publicTicket(ticket) });
  }));
  router.use((error, _req, res, next) => error.status ? res.status(error.status).json({ error: error.message }) : next(error));
  return router;
}
