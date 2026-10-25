import test from "node:test";
import assert from "node:assert/strict";
import { validateSettings } from "../src/settings/service.js";

const valid = {
  plant: { name: "Plant A", area: "Utilities", shift: "Shift 1" },
  thresholds: {
    pressureBar: { minimum: 6.5, maximum: 7.5 },
    flowLpm: { minimum: 20, maximum: 30 },
    suctionKpa: { minimum: 0.5, maximum: 2 }
  },
  sampling: { intervalSeconds: 2, staleAfterSeconds: 10 },
  retentionDays: 30,
  notifications: { browserEnabled: true, critical: true, warning: false, info: false }
};

test("validates and normalizes plant monitoring settings", () => {
  const settings = validateSettings(valid);
  assert.equal(settings.plant.name, "Plant A");
  assert.equal(settings.thresholds.pressureBar.maximum, 7.5);
  assert.equal(settings.notifications.warning, false);
});

test("rejects inverted limits and unsafe offline timing", () => {
  assert.throws(() => validateSettings({ ...valid, thresholds: { ...valid.thresholds, pressureBar: { minimum: 8, maximum: 7 } } }), /minimum must be lower/);
  assert.throws(() => validateSettings({ ...valid, sampling: { intervalSeconds: 5, staleAfterSeconds: 6 } }), /twice the sampling interval/);
});
