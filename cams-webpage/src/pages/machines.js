import { fmt, icon, pageHead, statusPill } from "./shared.js";

export function renderMachinesPage({ state, machines }) {
  const search = state.machineSearch.toLowerCase();
  const filtered = machines.filter(machine => (state.machineFilter === "All" || machine.status === state.machineFilter)
    && (machine.id.toLowerCase().includes(search) || machine.name.toLowerCase().includes(search) || machine.zone.toLowerCase().includes(search)));
  const filters = ["All", "Running", "Stopped", "Alarm", "Offline"].map(filter => `<button class="filter-pill ${state.machineFilter === filter ? "active" : ""}" data-filter="${filter}">${filter}${filter === "All" ? ` · ${machines.length}` : ""}</button>`).join("");
  const rows = filtered.map(machine => `<tr class="clickable" data-machine="${machine.id}">
    <td><div class="machine-cell"><span class="machine-num">${String(machines.indexOf(machine) + 1).padStart(2, "0")}</span><span><strong>${machine.id}</strong><small>${machine.zone}</small></span></div></td>
    <td>${statusPill(machine.status)}</td><td>${fmt(machine.pressure, "bar")}</td><td>${fmt(machine.flow, "L/min")}</td><td>${fmt(machine.suction, "kPa")}</td><td>${machine.updated}</td>
    <td><div class="health-score"><div class="health-bar"><span style="width:${machine.health}%"></span></div><small>${Number.isFinite(machine.health) ? `${machine.health}%` : "—"}</small></div></td>
    <td><button class="row-action" data-machine="${machine.id}">View details</button></td>
  </tr>`).join("");
  return `${pageHead("Machines", `Monitor and compare ${machines.length} connected compressor systems`, `<button class="secondary-btn" id="export-machines">${icon("download")} Export list</button>`)}
    <div class="filter-bar"><div class="search-wrap">${icon("search")}<input id="machine-search" type="search" value="${state.machineSearch}" placeholder="Search ID, name or area…"></div><div class="filter-pills">${filters}</div></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Machine</th><th>Status</th><th>Pressure</th><th>Flow</th><th>Suction</th><th>Last update</th><th>Health</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="8"><div class="empty-state">${icon("search")}No machines match this filter.</div></td></tr>`}</tbody></table></div></section>`;
}
