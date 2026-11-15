import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, connectDatabase } from "../src/db.js";
import { loadConfig } from "../src/config.js";
import {
  addTicketComment,
  closeTicket,
  getTicket,
  listTickets,
  reconcileMachineTickets,
  updateTicket
} from "../src/tickets/service.js";

const hasDatabase = Boolean(process.env.MONGODB_URI || (process.env.MONGODB_APP_USERNAME && process.env.MONGODB_APP_PASSWORD));

test("one ticket per incident escalates every two unresolved hours and permits a fresh incident", { skip: !hasDatabase }, async () => {
  const baseConfig = loadConfig();
  const siteId = `ticket-test-${process.pid}`;
  const machineId = "CAMS-99";
  const machineKey = `${siteId}/${machineId}`;
  const now = new Date("2026-01-01T10:00:00.000Z");
  let db;
  const alarm = (code, parameter, severity, message, status = "Active") => ({
    _id: `${machineKey}/${code}`,
    siteId,
    machineId,
    code,
    parameter,
    severity,
    value: "outside range",
    message,
    status,
    firstSeenAt: now,
    lastSeenAt: now
  });
  const actor = { id: "ticket-test-user", displayName: "Ticket Test Operator" };

  try {
    db = await connectDatabase({ ...baseConfig, mongoDb: `${baseConfig.mongoDb}_test` });
    await Promise.all([
      db.collection("tickets").deleteMany({ siteId }),
      db.collection("ticketActivity").deleteMany({ siteId }),
      db.collection("ticketMachineState").deleteMany({ _id: machineKey }),
      db.collection("ticketCounters").deleteOne({ _id: siteId }),
      db.collection("alarms").deleteMany({ siteId, machineId: { $in: [machineId, "CAMS-98"] } }),
      db.collection("machines").deleteMany({ siteId, machineId: { $in: [machineId, "CAMS-98"] } })
    ]);
    await db.collection("machines").insertOne({ siteId, machineId, active: true, name: "Ticket test machine", zone: "Zone A" });
    await db.collection("alarms").insertOne(alarm("pressure-high", "Pressure", "Critical", "Pressure is above its limit."));

    await reconcileMachineTickets(siteId, machineId, now);
    let tickets = await listTickets(siteId);
    assert.equal(tickets.length, 1);
    const firstId = tickets[0].id;
    assert.equal(tickets[0].priority, "Low");
    assert.equal(tickets[0].alarmPriority, "Critical");
    assert.match(tickets[0].description, /^1\. Pressure: Pressure is above its limit\.$/);
    assert.equal((await getTicket(siteId, firstId)).activity[0].action, "Ticket created");
    const categorized = await updateTicket(siteId, firstId, { category: "Flow" }, actor, now);
    assert.equal(categorized.category, "Flow");
    assert.equal(categorized.activity[0].action, "Category changed");

    await db.collection("alarms").insertOne(alarm("flow-low", "Flow", "Warning", "Flow is below its limit."));
    await reconcileMachineTickets(siteId, machineId, new Date(now.getTime() + 60_000));
    const updatedFirst = await getTicket(siteId, firstId);
    assert.match(updatedFirst.description, /1\. Flow: Flow is below its limit\./);
    assert.match(updatedFirst.description, /2\. Pressure: Pressure is above its limit\./);
    assert.equal(updatedFirst.activity[0].action, "Active problems updated");

    await reconcileMachineTickets(siteId, machineId, new Date(now.getTime() + 2 * 60 * 60 * 1000 - 1));
    assert.equal((await listTickets(siteId)).length, 1);
    await db.collection("alarms").updateOne({ _id: `${machineKey}/pressure-high` }, { $set: { status: "Acknowledged" } });
    await reconcileMachineTickets(siteId, machineId, new Date(now.getTime() + 2 * 60 * 60 * 1000));
    tickets = await listTickets(siteId);
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].id, firstId);
    assert.equal(tickets[0].priority, "Medium");
    assert.equal((await getTicket(siteId, firstId)).activity[0].action, "Priority escalated");

    const blockedClose = await closeTicket(siteId, firstId, actor);
    assert.equal(blockedClose.code, "MACHINE_IN_PROGRESS");
    const activeComment = await addTicketComment(siteId, firstId, "Still checking the machine.", actor);
    assert.equal(activeComment.comment.text, "Still checking the machine.");
    const maintenanceCompleted = await updateTicket(siteId, firstId, { maintenance: "Completed" }, actor);
    assert.equal(maintenanceCompleted.ticketStatus, "Open");
    assert.equal(maintenanceCompleted.maintenance, "Completed");

    await reconcileMachineTickets(siteId, machineId, new Date(now.getTime() + 4 * 60 * 60 * 1000));
    tickets = await listTickets(siteId);
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].id, firstId);
    assert.equal(tickets[0].priority, "High");

    await db.collection("alarms").updateMany({ siteId, machineId }, { $set: { status: "Resolved" } });
    await reconcileMachineTickets(siteId, machineId, new Date(now.getTime() + 245 * 60 * 1000));
    assert.equal((await getTicket(siteId, firstId)).alarmPriority, "Critical");
    const allowedComment = await addTicketComment(siteId, firstId, "Machine issue is clear.", actor);
    assert.equal(allowedComment.ticket.comments[0].by, actor.displayName);
    assert.equal(allowedComment.ticket.activity[0].action, "Comment posted");

    await db.collection("alarms").updateOne(
      { _id: `${machineKey}/pressure-high` },
      { $set: { status: "Active", lastSeenAt: new Date(now.getTime() + 250 * 60 * 1000) } }
    );
    await reconcileMachineTickets(siteId, machineId, new Date(now.getTime() + 250 * 60 * 1000));
    tickets = await listTickets(siteId);
    assert.equal(tickets.length, 2);
    const secondIncident = tickets.find(ticket => ticket.id !== firstId);
    assert.ok(secondIncident);
    assert.notEqual(secondIncident.id, firstId);
    assert.equal(secondIncident.priority, "Low");
    const oldTicketComment = await addTicketComment(siteId, firstId, "Closing the previous incident.", actor);
    assert.equal(oldTicketComment.comment.text, "Closing the previous incident.");

    const closed = await closeTicket(siteId, firstId, actor);
    assert.equal(closed.ticket.ticketStatus, "Closed");
    assert.equal(closed.ticket.maintenance, "Completed");
    assert.equal(closed.ticket.machineStatus, "Resolved");
    assert.equal(closed.ticket.activity[0].action, "Ticket closed");

    await db.collection("machines").insertOne({ siteId, machineId: "CAMS-98", active: true, name: "Second ticket test machine", zone: "Zone B" });
    await db.collection("alarms").insertOne({
      ...alarm("flow-low", "Flow", "Warning", "Flow is below its limit."),
      _id: `${siteId}/CAMS-98/flow-low`,
      machineId: "CAMS-98"
    });
    await reconcileMachineTickets(siteId, "CAMS-98", new Date(now.getTime() + 251 * 60 * 1000));
    tickets = await listTickets(siteId);
    assert.equal(tickets.length, 3);
    assert.equal(new Set(tickets.map(ticket => ticket.id)).size, 3);
    assert.equal(tickets.find(ticket => ticket.machineId === "CAMS-98").priority, "Low");
  } finally {
    if (db) {
      await Promise.all([
        db.collection("tickets").deleteMany({ siteId }),
        db.collection("ticketActivity").deleteMany({ siteId }),
        db.collection("ticketMachineState").deleteMany({ _id: machineKey }),
        db.collection("ticketCounters").deleteOne({ _id: siteId }),
        db.collection("alarms").deleteMany({ siteId, machineId: { $in: [machineId, "CAMS-98"] } }),
        db.collection("machines").deleteMany({ siteId, machineId: { $in: [machineId, "CAMS-98"] } })
      ]);
    }
    await closeDatabase();
  }
});
