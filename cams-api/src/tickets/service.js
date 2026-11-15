import { randomUUID } from "node:crypto";
import { getDatabase } from "../db.js";
import { telemetryEvents } from "../telemetry/events.js";

export const TICKET_PRIORITY_ESCALATION_INTERVAL_MS = 2 * 60 * 60 * 1000;
const ACTIVE_ALARM_STATUSES = ["Active", "Acknowledged"];
const TICKET_PRIORITIES = ["Low", "Medium", "High"];

export function automatedTicketPriority(activeSince, now = new Date()) {
  const elapsed = Math.max(0, now.getTime() - new Date(activeSince).getTime());
  const escalations = Math.floor(elapsed / TICKET_PRIORITY_ESCALATION_INTERVAL_MS);
  return TICKET_PRIORITIES[Math.min(escalations, TICKET_PRIORITIES.length - 1)];
}

function activeProblems(alarms) {
  return alarms
    .sort((first, second) => String(first.code).localeCompare(String(second.code)))
    .map(alarm => ({
      alarmId: alarm._id,
      code: alarm.code,
      parameter: alarm.parameter,
      severity: alarm.severity,
      message: alarm.message
    }));
}

export function describeProblems(problems) {
  return problems.map((problem, index) => `${index + 1}. ${problem.parameter}: ${problem.message}`).join("\n");
}

function publicTicket(ticket) {
  const raisedAt = ticket.raisedAt || ticket.updatedAt || new Date();
  const priorityAt = ticket.machineStatus === "Resolved"
    ? ticket.problemResolvedAt || ticket.closedAt || ticket.updatedAt || raisedAt
    : new Date();
  const automaticPriority = TICKET_PRIORITIES.includes(ticket.priority)
    ? ticket.priority
    : automatedTicketPriority(raisedAt, priorityAt);
  const activeAlarmPriority = (ticket.activeProblems || []).some(problem => problem.severity === "Critical")
    ? "Critical"
    : (ticket.activeProblems || []).some(problem => problem.severity === "Warning")
      ? "Warning"
      : "";
  return {
    id: ticket.id,
    siteId: ticket.siteId,
    machineId: ticket.machineId,
    cluster: ticket.cluster || "",
    area: ticket.area || "",
    machineNo: ticket.machineNo || "",
    category: ticket.category || "",
    priority: automaticPriority,
    alarmPriority: ticket.alarmPriority || activeAlarmPriority || (ticket.machineStatus === "Critical" || ticket.machineStatus === "Warning" ? ticket.machineStatus : "Not recorded"),
    problem: ticket.problem,
    description: ticket.description,
    activeProblems: ticket.activeProblems || [],
    machineStatus: ticket.machineStatus,
    maintenance: ticket.maintenance === "Completed" || ticket.maintenance === "Closed" ? "Completed" : "In progress",
    ticketStatus: ticket.ticketStatus,
    assignedTo: ticket.assignedTo,
    group: ticket.group || "",
    source: ticket.source,
    openedBy: ticket.openedBy,
    raisedAt: ticket.raisedAt,
    dueBy: ticket.dueBy || null,
    closedAt: ticket.closedAt || null,
    comments: ticket.comments || []
  };
}

function ticketProblemSummary(problems) {
  return problems.length === 1 ? problems[0].message : `${problems.length} active problems`;
}

async function recordTicketActivity(ticket, { action, actor = null, details = "", at = new Date() }) {
  const entry = {
    _id: randomUUID(),
    siteId: ticket.siteId,
    ticketId: ticket.id,
    action,
    by: actor?.displayName || actor?.username || "CAMS Monitoring",
    actorId: actor?.id || null,
    details,
    at
  };
  await getDatabase().collection("ticketActivity").insertOne(entry);
  return entry;
}

async function publishTicket(ticket) {
  const activity = await getTicketActivity(ticket.siteId, ticket.id);
  telemetryEvents.emit("ticket", { ...publicTicket(ticket), activity });
}

async function publishTickets(siteId, machineId, incidentId) {
  const tickets = await getDatabase().collection("tickets")
    .find({ siteId, machineId, incidentId, ticketStatus: "Open" })
    .sort({ raisedAt: -1 })
    .toArray();
  for (const ticket of tickets) await publishTicket(ticket);
}

async function createTicket(siteId, machineId, machine, problems, incidentId, raisedAt, priority) {
  const db = getDatabase();
  const generationKey = incidentId;
  let ticket = await db.collection("tickets").findOne(
    { siteId, machineId, incidentId },
    { sort: { raisedAt: 1 } }
  );
  if (ticket) return ticket;

  const counter = await db.collection("ticketCounters").findOneAndUpdate(
    { _id: siteId },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const description = describeProblems(problems);
  ticket = {
    id: `TKT_${String(counter.sequence).padStart(6, "0")}`,
    siteId,
    machineId,
    generationKey,
    incidentId,
    cluster: machine?.cluster || "",
    area: machine?.area || "",
    machineNo: machine?.machineNo || "",
    category: problems[0]?.parameter || "",
    priority,
    alarmPriority: problems.some(problem => problem.severity === "Critical") ? "Critical" : "Warning",
    problem: ticketProblemSummary(problems),
    description,
    activeProblems: problems,
    machineStatus: problems.some(problem => problem.severity === "Critical") ? "Critical" : "Warning",
    maintenance: "In progress",
    ticketStatus: "Open",
    assignedTo: "Unassigned",
    group: "",
    source: "Auto-generated from alarm",
    openedBy: "CAMS Monitoring",
    raisedAt,
    dueBy: null,
    comments: [],
    updatedAt: raisedAt
  };
  try {
    await db.collection("tickets").insertOne(ticket);
  } catch (error) {
    if (error.code !== 11000) throw error;
    ticket = await db.collection("tickets").findOne({ siteId, machineId, incidentId });
    if (!ticket) throw error;
  }
  await recordTicketActivity(ticket, {
    action: "Ticket created",
    details: `Created automatically from ${problems.length} active alarm${problems.length === 1 ? "" : "s"}.`,
    at: raisedAt
  });
  await publishTicket(ticket);
  return ticket;
}

async function startIncident(states, key, siteId, machineId, problems, now) {
  const incidentId = randomUUID();
  try {
    await states.updateOne(
      { _id: key, active: { $ne: true } },
      {
        $set: {
          siteId,
          machineId,
          active: true,
          incidentId,
          activeSince: now,
          activeProblems: problems,
          updatedAt: now
        },
        $setOnInsert: { _id: key }
      },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return states.findOne({ _id: key });
}

export async function hasActiveMachineProblems(siteId, machineId) {
  return Boolean(await getDatabase().collection("alarms").findOne({
    siteId,
    machineId,
    status: { $in: ACTIVE_ALARM_STATUSES }
  }, { projection: { _id: 1 } }));
}

export async function reconcileMachineTickets(siteId, machineId, now = new Date()) {
  const db = getDatabase();
  const states = db.collection("ticketMachineState");
  const ticketCollection = db.collection("tickets");
  const key = `${siteId}/${machineId}`;
  const alarms = await db.collection("alarms")
    .find({ siteId, machineId, status: { $in: ACTIVE_ALARM_STATUSES } })
    .toArray();
  const problems = activeProblems(alarms);
  let state = await states.findOne({ _id: key });

  if (!problems.length) {
    if (state?.active) {
      await states.updateOne(
        { _id: key, active: true, incidentId: state.incidentId },
        { $set: { active: false, activeProblems: [], resolvedAt: now, updatedAt: now } }
      );
      const openTickets = await ticketCollection.find({
        siteId,
        machineId,
        incidentId: state.incidentId,
        ticketStatus: "Open"
      }).toArray();
      await ticketCollection.updateMany(
        { siteId, machineId, incidentId: state.incidentId, ticketStatus: "Open" },
        { $set: { machineStatus: "Resolved", activeProblems: [], problemResolvedAt: now, updatedAt: now } }
      );
      for (const ticket of openTickets) {
        await recordTicketActivity(ticket, {
          action: "Machine problems resolved",
          details: "All active alarms for this machine have cleared.",
          at: now
        });
        await publishTicket({ ...ticket, machineStatus: "Resolved", activeProblems: [], problemResolvedAt: now, updatedAt: now });
      }
    }
    return [];
  }

  const machine = await db.collection("machines").findOne({ siteId, machineId }, { projection: { cluster: 1, area: 1, machineNo: 1, zone: 1 } });
  if (!state?.active) state = await startIncident(states, key, siteId, machineId, problems, now);
  const currentSignature = JSON.stringify((state.activeProblems || []).map(problem => [problem.code, problem.severity, problem.message]));
  const nextSignature = JSON.stringify(problems.map(problem => [problem.code, problem.severity, problem.message]));
  if (currentSignature !== nextSignature) {
    await states.updateOne(
      { _id: key, active: true, incidentId: state.incidentId },
      { $set: { activeProblems: problems, updatedAt: now } }
    );
    await ticketCollection.updateMany(
      { siteId, machineId, incidentId: state.incidentId, ticketStatus: "Open" },
      {
        $set: {
          problem: ticketProblemSummary(problems),
          description: describeProblems(problems),
          activeProblems: problems,
          category: problems[0]?.parameter || "",
          alarmPriority: problems.some(problem => problem.severity === "Critical") ? "Critical" : "Warning",
          machineStatus: problems.some(problem => problem.severity === "Critical") ? "Critical" : "Warning",
          updatedAt: now
        }
      }
    );
    const changedTickets = await ticketCollection.find({
      siteId,
      machineId,
      incidentId: state.incidentId,
      ticketStatus: "Open"
    }).toArray();
    for (const ticket of changedTickets) {
      await recordTicketActivity(ticket, {
        action: "Active problems updated",
        details: `${problems.length} active alarm${problems.length === 1 ? "" : "s"} currently recorded.`,
        at: now
      });
    }
    await publishTickets(siteId, machineId, state.incidentId);
  }

  state = await states.findOne({ _id: key });
  const priority = automatedTicketPriority(state.activeSince, now);
  let ticket = await ticketCollection.findOne(
    { siteId, machineId, incidentId: state.incidentId },
    { sort: { raisedAt: 1 } }
  );
  if (!ticket) {
    ticket = await createTicket(siteId, machineId, machine, problems, state.incidentId, state.activeSince, priority);
  } else if (ticket.ticketStatus === "Open" && ticket.priority !== priority) {
    const previousPriority = ticket.priority;
    ticket = await ticketCollection.findOneAndUpdate(
      { siteId, machineId, id: ticket.id, ticketStatus: "Open", priority: previousPriority },
      { $set: { priority, updatedAt: now } },
      { returnDocument: "after" }
    );
    if (ticket) {
      await recordTicketActivity(ticket, {
        action: "Priority escalated",
        details: `Priority changed from ${previousPriority} to ${priority} because the machine problem remains unresolved.`,
        at: now
      });
      await publishTicket(ticket);
    }
  }
  return ticketCollection.find({ siteId, machineId }).sort({ raisedAt: -1 }).toArray();
}

export async function reconcileActiveMachineTickets(now = new Date()) {
  const db = getDatabase();
  const activeGroups = await db.collection("alarms").aggregate([
    { $match: { status: { $in: ACTIVE_ALARM_STATUSES } } },
    { $group: { _id: { siteId: "$siteId", machineId: "$machineId" } } }
  ]).toArray();
  const activeKeys = new Set(activeGroups.map(group => `${group._id.siteId}/${group._id.machineId}`));
  const activeStates = await db.collection("ticketMachineState").find({ active: true }).toArray();
  for (const group of activeGroups) await reconcileMachineTickets(group._id.siteId, group._id.machineId, now);
  for (const state of activeStates) {
    if (!activeKeys.has(`${state.siteId}/${state.machineId}`)) {
      await reconcileMachineTickets(state.siteId, state.machineId, now);
    }
  }
}

export async function listTickets(siteId) {
  const tickets = await getDatabase().collection("tickets").find({ siteId }).sort({ raisedAt: -1 }).toArray();
  return tickets.map(publicTicket);
}

export async function getTicket(siteId, id) {
  const ticket = await getDatabase().collection("tickets").findOne({ siteId, id });
  return ticket ? { ...publicTicket(ticket), activity: await getTicketActivity(siteId, id) } : null;
}

export async function getTicketActivity(siteId, id) {
  const entries = await getDatabase().collection("ticketActivity")
    .find({ siteId, ticketId: id })
    .sort({ at: -1, _id: -1 })
    .limit(500)
    .toArray();
  return entries.map(entry => ({
    id: entry._id,
    action: entry.action,
    by: entry.by,
    details: entry.details,
    at: entry.at
  }));
}

export async function getOpenTicketForMachine(siteId, machineId) {
  const ticket = await getDatabase().collection("tickets")
    .findOne({ siteId, machineId, ticketStatus: "Open" }, { sort: { raisedAt: -1 } });
  return ticket ? publicTicket(ticket) : null;
}

export async function recordMachineTicketActivity(siteId, machineId, { action, actor, details, at = new Date() }) {
  const tickets = await getDatabase().collection("tickets")
    .find({ siteId, machineId, ticketStatus: "Open" })
    .toArray();
  for (const ticket of tickets) {
    await recordTicketActivity(ticket, { action, actor, details, at });
    await publishTicket(ticket);
  }
}

async function hasUnresolvedTicketProblems(ticket) {
  const state = await getDatabase().collection("ticketMachineState").findOne(
    { _id: `${ticket.siteId}/${ticket.machineId}` },
    { projection: { active: 1, incidentId: 1 } }
  );
  if (ticket.incidentId && state?.incidentId === ticket.incidentId) {
    return state.active === true && await hasActiveMachineProblems(ticket.siteId, ticket.machineId);
  }
  if (ticket.machineStatus === "Resolved" || (ticket.incidentId && state?.incidentId)) return false;
  return hasActiveMachineProblems(ticket.siteId, ticket.machineId);
}

export async function updateTicket(siteId, id, patch, actor, now = new Date()) {
  const collection = getDatabase().collection("tickets");
  const before = await collection.findOne({ siteId, id, ticketStatus: "Open" });
  if (!before) return null;
  const changes = Object.entries(patch)
    .filter(([field, value]) => JSON.stringify(before[field] ?? null) !== JSON.stringify(value ?? null))
    .map(([field, value]) => `${field}: ${before[field] ?? "—"} → ${value ?? "—"}`);
  const ticket = await collection.findOneAndUpdate(
    { siteId, id, ticketStatus: "Open" },
    { $set: { ...patch, updatedAt: now, updatedBy: actor?.id || null } },
    { returnDocument: "after" }
  );
  if (!ticket) return null;
  if (changes.length) {
    const activityAction = patch.category !== undefined
      ? "Category changed"
      : patch.assignedTo !== undefined
        ? "Assignment changed"
      : patch.maintenance !== undefined
        ? "Maintenance status changed"
        : "Ticket updated";
    await recordTicketActivity(ticket, {
      action: activityAction,
      actor,
      details: changes.join("; "),
      at: now
    });
  }
  await publishTicket(ticket);
  return await getTicket(siteId, id);
}

export async function closeTicket(siteId, id, actor, now = new Date()) {
  const ticket = await getDatabase().collection("tickets").findOne({ siteId, id });
  if (!ticket) return { error: "Ticket not found.", status: 404 };
  if (ticket.ticketStatus === "Closed") return { error: "Ticket is already closed.", status: 409 };
  if (await hasUnresolvedTicketProblems(ticket)) {
    return { error: "Machine is still in progress. Resolve all active problems before closing this ticket.", status: 409, code: "MACHINE_IN_PROGRESS" };
  }
  const updated = await getDatabase().collection("tickets").findOneAndUpdate(
    { siteId, id, ticketStatus: "Open" },
    { $set: { ticketStatus: "Closed", machineStatus: "Resolved", maintenance: "Completed", closedAt: now, closedBy: actor?.id || null, updatedAt: now } },
    { returnDocument: "after" }
  );
  if (!updated) return { error: "Ticket is already closed.", status: 409 };
  await recordTicketActivity(updated, {
    action: "Ticket closed",
    actor,
    details: "Ticket closed after all active machine problems cleared.",
    at: now
  });
  await publishTicket(updated);
  return { ticket: await getTicket(siteId, id) };
}

export async function addTicketComment(siteId, id, text, actor, now = new Date()) {
  const ticket = await getDatabase().collection("tickets").findOne({ siteId, id });
  if (!ticket) return { error: "Ticket not found.", status: 404 };
  if (ticket.ticketStatus === "Closed") return { error: "Ticket is closed and cannot receive comments.", status: 409 };
  const comment = {
    id: randomUUID(),
    by: actor?.displayName || actor?.username || "CAMS user",
    at: now,
    text
  };
  const updated = await getDatabase().collection("tickets").findOneAndUpdate(
    { siteId, id, ticketStatus: "Open" },
    { $push: { comments: comment }, $set: { updatedAt: now } },
    { returnDocument: "after" }
  );
  if (!updated) return { error: "Ticket is already closed.", status: 409 };
  await recordTicketActivity(updated, {
    action: "Comment posted",
    actor,
    details: text,
    at: now
  });
  await publishTicket(updated);
  return { ticket: await getTicket(siteId, id), comment };
}

export { publicTicket };
