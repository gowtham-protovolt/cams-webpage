import test from "node:test";
import assert from "node:assert/strict";
import { telemetryExportRow } from "../src/routes/exports.js";

test("exports PV and ERR channels using the PLC channel order", () => {
  const row = telemetryExportRow({
    observedAt: new Date("2026-10-28T08:00:00.000Z"),
    sequence: 1,
    status: "alarm",
    metrics: { pressureBar: 7, flowLpm: 25, suctionKpa: 1.2 },
    raw: { pv1: 2001, pv2: 7000, pv3: 6065 },
    errors: { flow: 11, pressure: 22, suction: 33 }
  });

  assert.deepEqual(
    { pv1: row.pv1, pv2: row.pv2, pv3: row.pv3, err1: row.err1, err2: row.err2, err3: row.err3 },
    { pv1: 2001, pv2: 7000, pv3: 6065, err1: 11, err2: 22, err3: 33 }
  );
});
