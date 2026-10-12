import { getDatabase } from "../db.js";

const DAY_SECONDS = 24 * 60 * 60;

function defaults(config, siteId) {
  return {
    siteId,
    plant: { name: "Demo Spinning Plant", area: "Spinning", shift: "General" },
    thresholds: structuredClone(config.monitoring.thresholds),
    sampling: { intervalSeconds: 1, staleAfterSeconds: config.monitoring.staleAfterSeconds },
    retentionDays: config.telemetryRetentionDays,
    notifications: { browserEnabled: true, critical: true, warning: true, info: false }
  };
}

function mergeSettings(base, stored = {}) {
  return {
    ...base,
    plant: { ...base.plant, ...stored.plant },
    thresholds: {
      pressureBar: { ...base.thresholds.pressureBar, ...stored.thresholds?.pressureBar },
      flowLpm: { ...base.thresholds.flowLpm, ...stored.thresholds?.flowLpm },
      suctionKpa: { ...base.thresholds.suctionKpa, ...stored.thresholds?.suctionKpa }
    },
    sampling: { ...base.sampling, ...stored.sampling },
    notifications: { ...base.notifications, ...stored.notifications },
    retentionDays: stored.retentionDays ?? base.retentionDays,
    updatedAt: stored.updatedAt || null,
    updatedBy: stored.updatedBy || null
  };
}

export async function getSiteSettings(config, siteId = "plant-01") {
  const stored = await getDatabase().collection("settings").findOne({ _id: siteId });
  return mergeSettings(defaults(config, siteId), stored || {});
}

function text(value, label, maximum, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new Error(`${label} is required.`);
  if (result.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return result;
}

function integer(value, label, minimum, maximum) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return result;
}

function range(value, label, minimum, maximum) {
  const low = Number(value?.minimum);
  const high = Number(value?.maximum);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < minimum || high > maximum || low >= high) {
    throw new Error(`${label} limits must be valid and the minimum must be lower than the maximum.`);
  }
  return { minimum: low, maximum: high };
}

export function validateSettings(input) {
  const intervalSeconds = integer(input.sampling?.intervalSeconds, "Sampling interval", 1, 60);
  const staleAfterSeconds = integer(input.sampling?.staleAfterSeconds, "Offline timeout", 3, 600);
  if (staleAfterSeconds < intervalSeconds * 2) throw new Error("Offline timeout must be at least twice the sampling interval.");
  return {
    plant: {
      name: text(input.plant?.name, "Plant name", 80, true),
      area: text(input.plant?.area, "Plant area", 80),
      shift: text(input.plant?.shift, "Shift name", 80)
    },
    thresholds: {
      pressureBar: range(input.thresholds?.pressureBar, "Pressure", -5, 100),
      flowLpm: range(input.thresholds?.flowLpm, "Flow", -10000, 10000),
      suctionKpa: range(input.thresholds?.suctionKpa, "Suction", -1000, 1000)
    },
    sampling: { intervalSeconds, staleAfterSeconds },
    retentionDays: integer(input.retentionDays, "Retention", 1, 3650),
    notifications: {
      browserEnabled: Boolean(input.notifications?.browserEnabled),
      critical: Boolean(input.notifications?.critical),
      warning: Boolean(input.notifications?.warning),
      info: Boolean(input.notifications?.info)
    }
  };
}

export async function saveSiteSettings(config, siteId, input, actor) {
  const settings = validateSettings(input);
  const now = new Date();
  await getDatabase().collection("settings").updateOne(
    { _id: siteId },
    { $set: { ...settings, updatedAt: now, updatedBy: actor } },
    { upsert: true }
  );
  await getDatabase().command({ collMod: "telemetry", expireAfterSeconds: settings.retentionDays * DAY_SECONDS });
  return getSiteSettings(config, siteId);
}
