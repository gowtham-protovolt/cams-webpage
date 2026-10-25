import test from "node:test";
import assert from "node:assert/strict";
import { describeProblems, TICKET_INTERVAL_MS } from "../src/tickets/service.js";

test("ticket descriptions number each active problem", () => {
  assert.equal(describeProblems([
    { parameter: "Pressure", message: "Pressure is above its limit." },
    { parameter: "Flow", message: "Flow is below its limit." }
  ]), "1. Pressure: Pressure is above its limit.\n2. Flow: Flow is below its limit.");
});

test("ticket recurrence interval is exactly one hour", () => {
  assert.equal(TICKET_INTERVAL_MS, 60 * 60 * 1000);
});
