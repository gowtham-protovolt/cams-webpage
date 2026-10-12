import { escapeHtml, fmt, icon, pageHead, relativeTime, statusPill } from "./shared.js";

function machineDialog(state) {
  const modal = state.machineModal;
  if (!modal) return "";
  if (modal.type === "removed") {
    const rows = state.removedMachines.map(machine => `<div class="removed-machine-row">
      <div><strong>${escapeHtml(machine.id)}</strong><span>${escapeHtml(machine.name)} · ${escapeHtml(machine.zone)}</span><small>Removed ${relativeTime(machine.removedAt)}</small></div>
      <button class="secondary-btn" type="button" data-restore-machine="${escapeHtml(machine.id)}" data-site-id="${escapeHtml(machine.siteId)}">Restore</button>
    </div>`).join("");
    return `<div class="machine-modal-backdrop" id="machine-modal-backdrop"><section class="machine-modal" role="dialog" aria-modal="true" aria-labelledby="machine-modal-title">
      <header><div><span class="machine-modal-kicker">Machine lifecycle</span><h2 id="machine-modal-title">Removed machines</h2><p>Restore a machine before its MQTT readings can be accepted again.</p></div><button class="machine-modal-close" id="machine-modal-close" type="button" aria-label="Close">×</button></header>
      <div class="removed-machine-list">${state.removedMachinesLoading ? `<div class="machine-modal-state"><span class="loading-spinner dark"></span>Loading removed machines…</div>` : state.machineManagementError ? `<div class="inline-error">${escapeHtml(state.machineManagementError)}</div>` : rows || `<div class="machine-modal-state">No removed machines.</div>`}</div>
      <footer><button class="secondary-btn" id="machine-modal-cancel" type="button">Close</button></footer>
    </section></div>`;
  }

  const machine = modal.machine || {};
  if (modal.type === "delete") {
    return `<div class="machine-modal-backdrop" id="machine-modal-backdrop"><section class="machine-modal machine-modal-danger" role="alertdialog" aria-modal="true" aria-labelledby="machine-modal-title">
      <header><div><span class="machine-modal-kicker">Controlled removal</span><h2 id="machine-modal-title">Remove ${escapeHtml(machine.id)}?</h2><p>The machine will disappear from monitoring and its MQTT messages will be ignored until you restore it. Historical telemetry is preserved.</p></div><button class="machine-modal-close" id="machine-modal-close" type="button" aria-label="Close">×</button></header>
      ${state.machineManagementError ? `<div class="inline-error">${escapeHtml(state.machineManagementError)}</div>` : ""}
      <div class="machine-delete-summary"><strong>${escapeHtml(machine.name)}</strong><span>${escapeHtml(machine.zone)}</span></div>
      <footer><button class="secondary-btn" id="machine-modal-cancel" type="button">Cancel</button><button class="danger-btn" id="confirm-machine-delete" type="button">Remove machine</button></footer>
    </section></div>`;
  }

  const editing = modal.type === "edit";
  return `<div class="machine-modal-backdrop" id="machine-modal-backdrop"><section class="machine-modal" role="dialog" aria-modal="true" aria-labelledby="machine-modal-title">
    <header><div><span class="machine-modal-kicker">Machine inventory</span><h2 id="machine-modal-title">${editing ? "Edit machine" : "Register machine"}</h2><p>${editing ? "Update the display name and plant area without changing telemetry identity." : "Register the device identity before its MQTT telemetry can enter CAMS."}</p></div><button class="machine-modal-close" id="machine-modal-close" type="button" aria-label="Close">×</button></header>
    ${state.machineManagementError ? `<div class="inline-error">${escapeHtml(state.machineManagementError)}</div>` : ""}
    <form id="machine-form" class="machine-form">
      <label><span>Machine ID</span><input name="machineId" value="${escapeHtml(machine.id || "")}" placeholder="CAMS-17" pattern="CAMS-(0[1-9]|[1-9][0-9])" ${editing ? "readonly" : ""} required><small>Use CAMS-01 through CAMS-99</small></label>
      <label><span>Machine name</span><input name="name" value="${escapeHtml(machine.name || "")}" maxlength="80" placeholder="Compressor 17" required></label>
      <label><span>Plant area</span><input name="zone" value="${escapeHtml(machine.zone || "")}" maxlength="80" placeholder="Spinning · Line B" required></label>
      <input type="hidden" name="siteId" value="${escapeHtml(machine.siteId || state.settings?.siteId || "plant-01")}">
    </form>
    <footer><button class="secondary-btn" id="machine-modal-cancel" type="button">Cancel</button><button class="primary-btn" type="submit" form="machine-form">${editing ? "Save changes" : "Register machine"}</button></footer>
  </section></div>`;
}

export function renderMachinesPage({ state, machines }) {
  const search = state.machineSearch.toLowerCase();
  const filtered = machines.filter(machine => (state.machineFilter === "All" || machine.status === state.machineFilter)
    && (machine.id.toLowerCase().includes(search) || machine.name.toLowerCase().includes(search) || machine.zone.toLowerCase().includes(search)));
  const filters = ["All", "Running", "Stopped", "Alarm", "Offline"].map(filter => `<button class="filter-pill ${state.machineFilter === filter ? "active" : ""}" data-filter="${filter}">${filter}${filter === "All" ? ` · ${machines.length}` : ""}</button>`).join("");
  const rows = filtered.map((machine, index) => `<tr class="clickable" data-machine="${escapeHtml(machine.id)}">
    <td><div class="machine-cell"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(machine.id)}</strong><small>${escapeHtml(machine.zone)}</small></span></div></td>
    <td>${statusPill(machine.status)}</td><td>${fmt(machine.pressure, "bar")}</td><td>${fmt(machine.flow, "L/min")}</td><td>${fmt(machine.suction, "kPa")}</td><td>${escapeHtml(machine.updated)}</td>
    <td><div class="health-score"><div class="health-bar"><span style="width:${machine.health}%"></span></div><small>${Number.isFinite(machine.health) ? `${machine.health}%` : "—"}</small></div></td>
    <td><div class="machine-actions"><button class="row-action" data-machine="${escapeHtml(machine.id)}">View</button>${state.currentUser?.isOwner ? `<button class="row-action" data-edit-machine="${escapeHtml(machine.id)}" type="button">Edit</button><button class="row-action danger" data-delete-machine="${escapeHtml(machine.id)}" type="button">Delete</button>` : ""}</div></td>
  </tr>`).join("");
  const ownerActions = state.currentUser?.isOwner ? `<button class="secondary-btn" id="removed-machines" type="button">Removed machines</button><button class="primary-btn" id="add-machine" type="button">+ Add machine</button>` : "";
  return `${pageHead("Machines", `Monitor and compare ${machines.length} connected compressor systems`, `${ownerActions}<button class="secondary-btn" id="export-machines">${icon("download")} Export list</button>`)}
    <div class="filter-bar"><div class="search-wrap">${icon("search")}<input id="machine-search" type="search" value="${escapeHtml(state.machineSearch)}" placeholder="Search ID, name or area…"></div><div class="filter-pills">${filters}</div></div>
    <section class="panel"><div class="table-wrap"><table class="data-table machine-table"><thead><tr><th>Machine</th><th>Status</th><th>Pressure</th><th>Flow</th><th>Suction</th><th>Last update</th><th>Health</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="8"><div class="empty-state">${icon("search")}No machines match this filter.</div></td></tr>`}</tbody></table></div></section>${machineDialog(state)}`;
}
