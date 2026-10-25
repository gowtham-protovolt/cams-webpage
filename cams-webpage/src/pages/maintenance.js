import { phasePage } from "./shared.js";

export function renderMaintenancePage() {
  return phasePage(
    "Maintenance",
    "P1 · Next phase",
    "Plan service before it becomes downtime.",
    "Maintenance workflows will connect compressor runtime, service intervals and technician records in one clear view.",
    [["calendar", "Service planner", "Upcoming and overdue schedules"], ["maintenance", "Work orders", "Assign, track and close maintenance tasks"], ["report", "Service history", "A complete audit trail for each machine"]]
  );
}
