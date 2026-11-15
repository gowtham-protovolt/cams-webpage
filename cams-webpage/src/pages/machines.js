import {
  connectionLastUpdate,
  connectionStatus,
  connectionStatusDisplay,
  customSelect,
  deviceDisplayName,
  downloadMenu,
  escapeHtml,
  icon,
  pageHead,
  relativeTime,
} from "./shared.js";
import { locationSelects, renderLocationManager } from "./locations.js";
import { renderLiveDataPanel } from "./live-data.js";

function machineNumber(machine, fallback) {
  const match = String(machine.id || "").match(/(\d+)$/);
  return match ? Number(match[1]) : fallback + 1;
}

function machineHealth(machine) {
  return Number.isFinite(machine.health) ? Math.min(100, Math.max(0, machine.health)) : null;
}

function clusterLayout(machines) {
  return machines.map(machine => {
    return {
      machine,
      clusterId: machine.clusterId || machine.cluster || "Unassigned",
      clusterName: machine.cluster || "Unassigned",
      areaId: machine.areaId || machine.zone || "Unassigned",
      areaName: machine.zone || "Unassigned",
    };
  });
}

function statusCounts(machines) {
  return machines.reduce(
    (counts, machine) => {
      counts.total += 1;
      const key = connectionStatus(machine) === "Online" ? "online" : "offline";
      if (Object.hasOwn(counts, key)) counts[key] += 1;
      return counts;
    },
    { total: 0, online: 0, offline: 0 },
  );
}

function clusterMachineCard(machine) {
  const live = connectionStatus(machine) === "Online";
  const displayName = deviceDisplayName(machine);
  return `<article class="cluster-machine-card">
    <button class="cluster-machine-main" type="button" data-machine="${escapeHtml(machine.id)}">
      <span class="machine-num">${escapeHtml(String(machineNumber(machine, 0)).padStart(2, "0"))}</span>
      <span class="cluster-machine-identity"><strong>${escapeHtml(displayName)}</strong></span>
      <span class="cluster-device-live ${live ? "live" : "not-live"}"><small>Live data</small><strong><i></i>${live ? "Online" : "Offline"}</strong></span>
      <span class="cluster-machine-updated"><small>Last update</small><strong>${connectionLastUpdate(machine)}</strong></span>
    </button>
    <div class="cluster-machine-actions">
      <button class="row-action" data-machine="${escapeHtml(machine.id)}" type="button">View</button>
      ${machine.ownerActions || ""}
    </div>
  </article>`;
}

function clusterView(state, filteredMachines, allMachines) {
  const assignments = clusterLayout(allMachines);
  const allowedIds = new Set(
    filteredMachines.map((machine) => `${machine.siteId}:${machine.id}`),
  );
  const visibleAssignments = assignments.filter(({ machine }) =>
    allowedIds.has(`${machine.siteId}:${machine.id}`),
  );
  const showEmpty = !state.machineSearch && state.machineFilter === "All" &&
    state.machineClusterFilter === "All" && state.machineAreaFilter === "All" &&
    state.machineDeviceFilter === "All";
  const records = state.locations || [];
  const clusters = [...new Set([...visibleAssignments.map(item => item.clusterId), ...(showEmpty ? records.map(c => c.id) : [])])].map(id => ({
    id,
    name: records.find(c => c.id === id)?.name || visibleAssignments.find(a => a.clusterId === id)?.clusterName || id,
    assignments: visibleAssignments.filter(item => item.clusterId === id),
  })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  if (!clusters.length)
    return `<section class="panel"><div class="empty-state cluster-empty">${icon("search")}No devices match this filter.</div></section>`;

  return `<div class="cluster-grid">${clusters
    .map((cluster) => {
      const clusterKey = cluster.id;
      const expanded = state.expandedMachineClusters.includes(clusterKey);
      const counts = statusCounts(
        cluster.assignments.map((item) => item.machine),
      );
      const areaRecords = records.find(c => c.id === cluster.id)?.areas || [];
      const areas = [...new Set([...cluster.assignments.map(item => item.areaId), ...(showEmpty ? areaRecords.map(a => a.id) : [])])].map(id => ({
        id,
        name: areaRecords.find(a => a.id === id)?.name || cluster.assignments.find(a => a.areaId === id)?.areaName || id,
        assignments: cluster.assignments.filter(item => item.areaId === id),
      })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      return `<section class="cluster-card ${expanded ? "expanded" : ""}">
      <button class="cluster-card-head" type="button" data-cluster-toggle="${escapeHtml(clusterKey)}" aria-expanded="${expanded}">
        <span class="cluster-chevron">${icon("chevronRight")}</span>
        <span class="cluster-title"><strong>${escapeHtml(cluster.name)}</strong></span>
        <span class="cluster-count"><strong>${counts.total}</strong><small>Devices</small></span>
        <span class="cluster-stat online"><i></i><strong>${counts.online}</strong><small>Online</small></span>
        <span class="cluster-stat offline"><i></i><strong>${counts.offline}</strong><small>Offline</small></span>
      </button>
      ${
        expanded
          ? `<div class="cluster-areas">${areas
              .map((area) => {
                const areaKey = JSON.stringify([cluster.id, area.id]);
                const areaExpanded =
                  state.expandedMachineAreas.includes(areaKey);
                const areaCounts = statusCounts(
                  area.assignments.map((item) => item.machine),
                );
                return `<section class="cluster-area ${areaExpanded ? "expanded" : ""}">
          <button class="cluster-area-head" type="button" data-area-toggle="${escapeHtml(areaKey)}" aria-expanded="${areaExpanded}" ${area.assignments.length ? "" : "disabled"}>
            <span class="cluster-chevron">${icon("chevronRight")}</span>
            <span><strong>${escapeHtml(area.name)}</strong></span>
            <span class="area-status-summary">${areaCounts.online} online · ${areaCounts.offline} offline</span>
          </button>
          ${
            areaExpanded && area.assignments.length
              ? `<div class="cluster-machine-list">${area.assignments
                  .map(({ machine }) =>
                    clusterMachineCard({
                      ...machine,
                      ownerActions: state.currentUser?.isOwner && !state.devicePreviewMode
                        ? `<button class="row-action" data-edit-machine="${escapeHtml(machine.id)}" type="button">Edit</button><button class="row-action danger" data-delete-machine="${escapeHtml(machine.id)}" type="button">Delete</button>`
                        : "",
                    }),
                  )
                  .join("")}</div>`
              : ""
          }
        </section>`;
              })
              .join("")}</div>`
          : ""
      }
    </section>`;
    })
    .join("")}</div>`;
}

function machineDialog(state) {
  const modal = state.machineModal;
  if (!modal) return "";
  if (modal.type === "removed") {
    const rows = state.removedMachines
      .map(
        (machine) => `<div class="removed-machine-row">
      <div><strong>${escapeHtml(deviceDisplayName(machine))}</strong><span>${escapeHtml([machine.cluster, machine.zone].filter(Boolean).join(" · "))}</span><small>Removed ${relativeTime(machine.removedAt)}</small></div>
      <div class="table-actions"><button class="secondary-btn" type="button" data-restore-machine="${escapeHtml(machine.id)}" data-site-id="${escapeHtml(machine.siteId)}">Restore</button><button class="mini-action danger mini-action-icon" type="button" data-permanent-delete-machine="${escapeHtml(machine.id)}" data-site-id="${escapeHtml(machine.siteId)}" aria-label="Permanently delete ${escapeHtml(deviceDisplayName(machine))}" title="Permanently delete">${icon("trash")}</button></div>
    </div>`,
      )
      .join("");
    return `<div class="machine-modal-backdrop" id="machine-modal-backdrop"><section class="machine-modal" role="dialog" aria-modal="true" aria-labelledby="machine-modal-title">
      <header><div><span class="machine-modal-kicker">Device lifecycle</span><h2 id="machine-modal-title">Removed devices</h2><p>Restore a device or permanently delete it. Historical telemetry, tickets, and audit records are retained.</p></div><button class="machine-modal-close" id="machine-modal-close" type="button" aria-label="Close">×</button></header>
      <div class="removed-machine-list">${state.removedMachinesLoading ? `<div class="machine-modal-state"><span class="loading-spinner dark"></span>Loading removed devices…</div>` : state.machineManagementError ? `<div class="inline-error">${escapeHtml(state.machineManagementError)}</div>` : rows || `<div class="machine-modal-state">No removed devices.</div>`}</div>
      <footer><button class="secondary-btn" id="machine-modal-cancel" type="button">Close</button></footer>
    </section></div>`;
  }

  const machine = modal.machine || {};
  if (modal.type === "delete") {
    return `<div class="machine-modal-backdrop" id="machine-modal-backdrop"><section class="machine-modal machine-modal-danger" role="alertdialog" aria-modal="true" aria-labelledby="machine-modal-title">
      <header><div><span class="machine-modal-kicker">Controlled removal</span><h2 id="machine-modal-title">Remove ${escapeHtml(deviceDisplayName(machine))}?</h2><p>The device will disappear from monitoring and its MQTT messages will be ignored until you restore it. Historical telemetry is preserved.</p></div><button class="machine-modal-close" id="machine-modal-close" type="button" aria-label="Close">×</button></header>
      ${state.machineManagementError ? `<div class="inline-error">${escapeHtml(state.machineManagementError)}</div>` : ""}
      <div class="machine-delete-summary"><strong>${escapeHtml(machine.cluster || "Unassigned")}</strong><span>${escapeHtml(machine.zone || "Unassigned")}</span></div>
      <footer><button class="secondary-btn" id="machine-modal-cancel" type="button">Cancel</button><button class="danger-btn" id="confirm-machine-delete" type="button">Remove device</button></footer>
    </section></div>`;
  }

  const editing = modal.type === "edit";
  return `<div class="machine-modal-backdrop" id="machine-modal-backdrop"><section class="machine-modal" role="dialog" aria-modal="true" aria-labelledby="machine-modal-title">
    <header><div><span class="machine-modal-kicker">Device inventory</span><h2 id="machine-modal-title">${editing ? "Edit device" : "Register device"}</h2><p>${editing ? "Update the mill display name and assigned location. The CAMS device ID remains fixed." : "Describe your device by its cluster, area and mill display name."}</p></div><button class="machine-modal-close" id="machine-modal-close" type="button" aria-label="Close">×</button></header>
    ${state.machineManagementError ? `<div class="inline-error">${escapeHtml(state.machineManagementError)}</div>` : ""}
    <form id="machine-form" class="machine-form">
      ${locationSelects(state, machine)}
      ${editing ? `<label><span>Device ID</span><input value="${escapeHtml(machine.id)}" readonly aria-readonly="true"><small>Used by ESP32, MQTT and telemetry. This ID cannot be changed.</small></label>` : ""}
      <label><span>Device name</span><input name="name" value="${escapeHtml(machine.name || "")}" maxlength="80" placeholder="e.g. Carding Compressor - 1" required><small>Name shown to mill operators across CAMS.</small></label>
      ${editing ? `<input type="hidden" name="machineId" value="${escapeHtml(machine.id)}">` : ""}
      <input type="hidden" name="siteId" value="${escapeHtml(machine.siteId || state.settings?.siteId || "plant-01")}">
    </form>
    <footer><button class="secondary-btn" id="machine-modal-cancel" type="button">Cancel</button><button class="primary-btn" type="submit" form="machine-form">${editing ? "Save changes" : "Register device"}</button></footer>
  </section></div>`;
}

export function renderMachinesPage({ state, machines, machineHistory }) {
  const search = state.machineSearch.toLowerCase();
  const timeCutoff = state.machineTimeRange === "1 day" ? Date.now() - 864e5 : state.machineTimeRange === "7 days" ? Date.now() - 7 * 864e5 : state.machineTimeRange === "30 days" ? Date.now() - 30 * 864e5 : null;
  const clusterOptions = Array.from(new Map([
    ...(state.locations || []).map(cluster => [cluster.id, cluster.name]),
    ...clusterLayout(machines).map(({ clusterId, clusterName }) => [clusterId, clusterName]),
  ])).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: "base" }));
  const areaOptions = clusterLayout(machines)
    .filter(({ clusterId }) => state.machineClusterFilter === "All" || clusterId === state.machineClusterFilter)
    .reduce((choices, item) => choices.some(([value]) => value === item.areaId) ? choices : [...choices, [item.areaId, item.areaName]], []);
  const deviceOptions = machines
    .filter(machine => (state.machineClusterFilter === "All" || (machine.clusterId || machine.cluster || "Unassigned") === state.machineClusterFilter) &&
      (state.machineAreaFilter === "All" || (machine.areaId || machine.zone || "Unassigned") === state.machineAreaFilter))
    .map(machine => machine.id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const filtered = machines.filter(
    (machine) => {
      const updatedAt = new Date(machine.lastSeenAt || machine.updatedAt || 0).getTime();
      const status = String(machine.status || "");
      return (state.machineFilter === "All" || connectionStatus(machine) === state.machineFilter || status === state.machineFilter) &&
      (state.machineClusterFilter === "All" || (machine.clusterId || machine.cluster || "Unassigned") === state.machineClusterFilter) &&
      (state.machineAreaFilter === "All" || (machine.areaId || machine.zone || "Unassigned") === state.machineAreaFilter) &&
      (state.machineDeviceFilter === "All" || machine.id === state.machineDeviceFilter) &&
      (!timeCutoff || (Number.isFinite(updatedAt) && updatedAt >= timeCutoff)) &&
      ((machine.cluster || "").toLowerCase().includes(search) ||
        String(machine.id || "").toLowerCase().includes(search) ||
        (machine.name || "").toLowerCase().includes(search) ||
        (machine.zone || "").toLowerCase().includes(search));
    },
  );
  const filterSummary = [["All", "All Devices"], ["Online", "Online"], ["Offline", "Offline"]]
    .map(([value, label]) => `<button class="filter-pill ${state.machineView === "list" && state.machineFilter === value ? "active" : ""}" type="button" data-quick-machine-filter="${value}">${label}</button>`)
    .join("");
  const selectedFilterCount = [
    state.machineFilter !== "All",
    state.machineClusterFilter !== "All",
    state.machineAreaFilter !== "All",
    state.machineDeviceFilter !== "All",
    state.machineTimeRange !== "All",
  ].filter(Boolean).length;
  const filterChoice = (value, tone = "") => `<button type="button" class="alarm-filter-choice ${tone} ${state.machineFilter === value ? "active" : ""}" data-machine-filter-value="${value}">${value}</button>`;
  const machineFilters = state.machineMoreFiltersOpen ? `<div class="machine-modal-backdrop" id="machine-filters-backdrop"><section class="machine-modal alarm-filters-modal device-filters-modal" role="dialog" aria-modal="true" aria-labelledby="machine-filters-title">
    <header><div><span class="machine-modal-kicker">Device filters</span><h2 id="machine-filters-title">More filters</h2><p>Refine the device list by location, device, and connection.</p></div><button class="machine-modal-close" id="machine-filters-close" type="button" aria-label="Close">×</button></header>
    <form id="machine-filters-form" class="alarm-filter-form">
      <div class="alarm-filter-column alarm-filter-location"><h3>Location</h3>
        <label><span>Cluster</span>${customSelect("machine-cluster", [["All", "All clusters"], ...clusterOptions], state.machineClusterFilter, { label: "Cluster", ariaLabel: "Filter by cluster" })}</label>
        <label><span>Area</span>${customSelect("machine-area", [["All", "All areas"], ...areaOptions], state.machineAreaFilter, { label: "Area", ariaLabel: "Filter by area" })}</label>
        <label><span>Device</span>${customSelect("machine-device", [["All", "All devices"], ...deviceOptions.map(value => [value, value])], state.machineDeviceFilter, { label: "Device", ariaLabel: "Filter by device" })}</label>
        <div class="alarm-time-section"><h3>Time range</h3><div class="alarm-time-options">
          ${[["1 day", "1 Day"], ["7 days", "7 Days"], ["30 days", "30 Days"], ["All", "All Time"]].map(([value, label]) => `<button type="button" class="${state.machineTimeRange === value ? "active" : ""}" data-machine-time-range="${value}">${label}</button>`).join("")}
        </div></div>
      </div>
      <div class="alarm-filter-column alarm-filter-details"><h3>Device details</h3>
        <fieldset><legend>Connection</legend><div class="alarm-filter-segments status">${filterChoice("Online")}${filterChoice("Offline")}</div></fieldset>
        <fieldset><legend>Operating status</legend><div class="alarm-filter-segments severity">${filterChoice("Running", "info")}${filterChoice("Stopped", "warning")}${filterChoice("Alarm", "critical")}</div></fieldset>
      </div>
    </form>
    <footer><span class="alarm-filter-count">${selectedFilterCount} filter${selectedFilterCount === 1 ? "" : "s"} selected</span><div><button class="secondary-btn" id="machine-filters-reset" type="button" ${selectedFilterCount ? "" : "disabled"}>Clear all</button><button class="primary-btn" type="submit" form="machine-filters-form">Show results</button></div></footer>
  </section></div>` : "";
  const rows = filtered
    .map(
      (
        machine,
        index,
      ) => {
        const health = machineHealth(machine);
        return `<tr class="clickable" data-machine="${escapeHtml(machine.id)}">
    <td><div class="machine-cell"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(deviceDisplayName(machine))}</strong><small>${escapeHtml([machine.cluster, machine.zone].filter(Boolean).join(" · "))}</small></span></div></td>
    <td>${connectionStatusDisplay(machine)}</td><td>${escapeHtml(connectionLastUpdate(machine))}</td>
    <td><div class="health-score"><progress class="health-bar" value="${health ?? 0}" max="100" aria-label="${health === null ? "Device health unavailable" : `Device health ${health}%`}">${health ?? 0}%</progress><small>${health === null ? "—" : `${health}%`}</small></div></td>
    <td><div class="machine-actions"><button class="row-action" data-machine="${escapeHtml(machine.id)}">View</button>${state.currentUser?.isOwner && !state.devicePreviewMode ? `<button class="row-action" data-edit-machine="${escapeHtml(machine.id)}" type="button">Edit</button><button class="row-action danger" data-delete-machine="${escapeHtml(machine.id)}" type="button">Delete</button>` : ""}</div></td>
  </tr>`;
      },
    )
    .join("");
  const ownerActions = state.currentUser?.isOwner && !state.devicePreviewMode
    ? `<button class="secondary-btn" id="manage-locations" type="button">Manage clusters & areas</button><button class="secondary-btn" id="removed-machines" type="button">Removed devices</button><button class="primary-btn" id="add-machine" type="button">+ Add device</button>`
    : "";
  const headerActions = state.devicePreviewMode
    ? ""
    : `${ownerActions}${downloadMenu([{ id: "export-machines-pdf", label: "PDF", format: "pdf" }, { id: "export-machines-xlsx", label: "Excel", format: "xlsx" }], { label: "Export", buttonClass: "secondary-btn", showLabel: true })}`;
  return `${state.dashboardDeviceReturn ? `<button class="back-link" type="button" data-page="dashboard">${icon("arrowLeft")} Back to Dashboard</button>` : ""}
    ${pageHead("Devices", "", headerActions)}
    ${state.devicePreviewMode ? `<aside class="device-preview-notice" role="status"><strong>Device preview</strong><span>Sample devices and readings only. No changes are saved.</span></aside>` : ""}
    <div class="machine-view-toolbar">
      <div class="machine-view-switch" role="group" aria-label="Device view">
        <button class="${state.machineView === "cluster" ? "active" : ""}" type="button" data-machine-view="cluster">${icon("layers")} Cluster View</button>
        <button class="${state.machineView === "live" ? "active" : ""}" type="button" data-machine-view="live">${icon("database")} Live Data</button>
      </div>
      <span class="machine-view-note">${state.machineView === "live" ? "Device → Date → Reading" : state.machineView === "cluster" ? "Cluster → Area → Device" : "Device list"}</span>
    </div>
    ${state.machineView === "live" ? renderLiveDataPanel({ state, machines, machineHistory }) : `<div class="filter-bar"><div class="search-wrap">${icon("search")}<input id="machine-search" type="search" value="${escapeHtml(state.machineSearch)}" placeholder="${state.machineView === "cluster" ? "Search cluster, area or device…" : "Search devices…"}"></div><div class="device-filter-actions"><div class="filter-pills" aria-label="Device connection summary">${filterSummary}</div><button class="secondary-btn ${selectedFilterCount ? "filter-active" : ""}" id="machine-more-filters" type="button">${icon("filter")} More filters</button></div></div>${state.machineView === "cluster" ? clusterView(state, filtered, machines) : `<section class="panel"><div class="table-wrap"><table class="data-table machine-table"><thead><tr><th>Device</th><th>Status</th><th>Last update</th><th>Health</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="5"><div class="empty-state">${icon("search")}No devices match this filter.</div></td></tr>`}</tbody></table></div></section>`}`}${machineDialog(state)}${state.devicePreviewMode ? "" : renderLocationManager(state, machines)}${machineFilters}`;
}
