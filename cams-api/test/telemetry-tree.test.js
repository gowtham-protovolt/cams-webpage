import test from "node:test";
import assert from "node:assert/strict";
import { buildTelemetryTree } from "../src/telemetry/tree.js";

test("builds the required CAMS machine, date, time, and three-value tree", () => {
  const readings = [
    {
      series: { siteId: "plant-01", machineId: "CAMS-01" },
      hierarchy: { root: "CAMS", device: "CAMS-01", date: "2026-04-06", time: "00-05-30", timezone: "Asia/Kolkata" },
      metrics: { flowLpm: 2.3, pressureBar: 18.5, suctionKpa: 5.1 },
      raw: { pv1: 1, pv2: 2, pv3: 3 },
      status: "running"
    },
    {
      series: { siteId: "plant-01", machineId: "CAMS-02" },
      hierarchy: { root: "CAMS", device: "CAMS-02", date: "2026-04-06", time: "00-05-31-250", timezone: "Asia/Kolkata" },
      metrics: { flowLpm: 3.4, pressureBar: 7.1, suctionKpa: 1.4 }
    }
  ];

  assert.deepEqual(buildTelemetryTree(readings), {
    CAMS: {
      "CAMS-01": {
        "2026-04-06": {
          "00-05-30": { flow: 2.3, pressure: 18.5, suction: 5.1 }
        }
      },
      "CAMS-02": {
        "2026-04-06": {
          "00-05-31": { flow: 3.4, pressure: 7.1, suction: 1.4 }
        }
      }
    }
  });
});
