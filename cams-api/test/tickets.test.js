import test from "node:test";
import assert from "node:assert/strict";
import {
  automatedTicketPriority,
  describeProblems,
  publicTicket,
  TICKET_PRIORITY_ESCALATION_INTERVAL_MS
} from "../src/tickets/service.js";

test("ticket descriptions number each active problem", () => {
  assert.equal(describeProblems([
    { parameter: "Pressure", message: "Pressure is above its limit." },
    { parameter: "Flow", message: "Flow is below its limit." }
  ]), "1. Pressure: Pressure is above its limit.\n2. Flow: Flow is below its limit.");
});

test("automated ticket priority starts low and escalates every two unresolved hours", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");
  assert.equal(TICKET_PRIORITY_ESCALATION_INTERVAL_MS, 2 * 60 * 60 * 1000);
  assert.equal(automatedTicketPriority(start, start), "Low");
  assert.equal(automatedTicketPriority(start, new Date(start.getTime() + TICKET_PRIORITY_ESCALATION_INTERVAL_MS - 1)), "Low");
  assert.equal(automatedTicketPriority(start, new Date(start.getTime() + TICKET_PRIORITY_ESCALATION_INTERVAL_MS)), "Medium");
  assert.equal(automatedTicketPriority(start, new Date(start.getTime() + 2 * TICKET_PRIORITY_ESCALATION_INTERVAL_MS - 1)), "Medium");
  assert.equal(automatedTicketPriority(start, new Date(start.getTime() + 2 * TICKET_PRIORITY_ESCALATION_INTERVAL_MS)), "High");
  assert.equal(automatedTicketPriority(start, new Date(start.getTime() + 10 * TICKET_PRIORITY_ESCALATION_INTERVAL_MS)), "High");
  assert.equal(automatedTicketPriority(new Date(start.getTime() + 1000), start), "Low");
});

test("legacy critical ticket priorities are exposed as automatic age-based priorities", () => {
  const raisedAt = new Date("2026-01-01T10:00:00.000Z");
  const ticket = publicTicket({
    id: "TKT_000001",
    priority: "Critical",
    raisedAt,
    problemResolvedAt: new Date(raisedAt.getTime() + 60 * 60 * 1000),
    machineStatus: "Resolved",
    alarmPriority: "Critical"
  });
  assert.equal(ticket.priority, "Low");
  assert.equal(ticket.alarmPriority, "Critical");
  assert.equal("normalPriority" in ticket, false);
});

test("legacy tickets without stored alarm severity are labeled instead of showing an empty priority", () => {
  const ticket = publicTicket({
    id: "TKT_000002",
    priority: "Low",
    raisedAt: new Date("2026-01-01T10:00:00.000Z"),
    machineStatus: "Resolved",
    activeProblems: []
  });
  assert.equal(ticket.alarmPriority, "Not recorded");
});
