import { phasePage } from "./shared.js";

export function renderEnergyPage() {
  return phasePage(
    "Energy & Utilization",
    "P2 · Future module",
    "Measure the cost of every cubic metre.",
    "Energy metering and utilization intelligence will be introduced after the core monitoring workflow is approved.",
    [["energy", "Energy intensity", "kWh per unit of compressed air"], ["pulse", "Load profile", "Loaded, unloaded and idle time"], ["trend", "Opportunity tracking", "Identify efficiency and leakage improvements"]]
  );
}
