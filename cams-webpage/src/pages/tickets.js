import { formatTicketId, listTickets } from "../data/tickets.js";
import { customSelect, deviceLabel, escapeHtml, icon, pageHead } from "./shared.js";

const priorities = ["All", "Critical", "High", "Medium", "Low"];

function displayDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ticketRow(ticket, machines) {
  const machine = machines.find(item => item.id === ticket.machineId);
  const cluster = ticket.cluster || machine?.cluster || "Unassigned";
  const area = ticket.area || machine?.zone || "Unassigned";
  const searchable = [formatTicketId(ticket.id), ticket.id, ticket.machineId, cluster, area, ticket.machineNo, ticket.problem, ticket.description, ticket.assignedTo].join(" ").toLowerCase();
  const assignedTo = ticket.assignedTo === "Unassigned"
    ? `<span class="muted">${escapeHtml(ticket.assignedTo)}</span>`
    : escapeHtml(ticket.assignedTo);
  return `<tr class="clickable" data-ticket-row data-ticket-open="${escapeHtml(ticket.id)}" tabindex="0" aria-label="Open ticket ${escapeHtml(formatTicketId(ticket.id))}" data-ticket-priority="${escapeHtml(ticket.priority)}" data-ticket-cluster="${escapeHtml(cluster)}" data-ticket-area="${escapeHtml(area)}" data-ticket-device="${escapeHtml(ticket.machineId)}" data-ticket-status="${escapeHtml(ticket.ticketStatus || "Unknown")}" data-ticket-raised-at="${escapeHtml(ticket.raisedAt || "")}" data-ticket-search="${escapeHtml(searchable)}">
    <td><span class="row-action ticket-row-id">${escapeHtml(formatTicketId(ticket.id))}</span></td>
    <td>${escapeHtml(ticket.machineId)}</td><td>${escapeHtml(cluster)}</td><td>${assignedTo}</td><td>${shortDate(ticket.raisedAt)}</td>
  </tr>`;
}

function selectedFilterChip(group, label) {
  return `<button type="button" class="alarm-filter-chip" data-ticket-clear-group="${group}"><span>${escapeHtml(label)}</span><span aria-hidden="true">×</span></button>`;
}

export function renderTicketsPage({ state, tickets: currentTickets = listTickets(), machines = [] }) {
  if (state.ticketsError) {
    return `${pageHead("Tickets", "Track service and problem tickets across raised issues")}<section class="panel"><div class="empty-state">${escapeHtml(state.ticketsError)}</div></section>`;
  }
  const tickets = currentTickets;
  const serviceActive = state.ticketType === "service";
  const filters = priorities.map(priority => `<button class="filter-pill ${state.ticketPriorityFilter === priority ? "active" : ""}" type="button" data-ticket-priority-filter="${priority}">${priority === "All" ? `All · ${tickets.length}` : priority}</button>`).join("");
  const ticketMachine = ticket => machines.find(item => item.id === ticket.machineId);
  const ticketCluster = ticket => ticket.cluster || ticketMachine(ticket)?.cluster || "Unassigned";
  const ticketArea = ticket => ticket.area || ticketMachine(ticket)?.zone || "Unassigned";
  const clusters = [...new Set(tickets.map(ticketCluster))].sort((a, b) => a.localeCompare(b));
  const areas = [...new Set(tickets.filter(ticket => state.ticketClusterFilter === "All" || ticketCluster(ticket) === state.ticketClusterFilter).map(ticketArea))].sort((a, b) => a.localeCompare(b));
  const devices = [...new Set(tickets.filter(ticket =>
    (state.ticketClusterFilter === "All" || ticketCluster(ticket) === state.ticketClusterFilter) &&
    (state.ticketAreaFilter === "All" || ticketArea(ticket) === state.ticketAreaFilter)
  ).map(ticket => ticket.machineId).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const statuses = [...new Set(tickets.map(ticket => ticket.ticketStatus).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const selectedFilters = [];
  if (state.ticketClusterFilter !== "All") selectedFilters.push(["cluster", state.ticketClusterFilter]);
  if (state.ticketAreaFilter !== "All") selectedFilters.push(["area", state.ticketAreaFilter]);
  if (state.ticketDeviceFilter !== "All") selectedFilters.push(["device", deviceLabel(ticketMachine({ machineId: state.ticketDeviceFilter }) || { id: state.ticketDeviceFilter })]);
  if (state.ticketPriorityFilter !== "All") selectedFilters.push(["priority", state.ticketPriorityFilter]);
  if (state.ticketStatusFilter !== "All") selectedFilters.push(["status", state.ticketStatusFilter]);
  if (state.ticketTimeRange !== "All") selectedFilters.push(["time", state.ticketTimeRange === "custom" ? "Custom dates" : state.ticketTimeRange]);
  const selectedFilterChips = selectedFilters.map(([group, label]) => selectedFilterChip(group, label)).join("");
  const customDates = state.ticketTimeRange === "custom" ? `<div class="alarm-filter-date-grid"><label><span>From date</span><div class="alarm-date-input"><input name="fromDate" type="text" inputmode="numeric" maxlength="10" pattern="\\d{2}-\\d{2}-\\d{4}" placeholder="dd-mm-yyyy" value="${escapeHtml(displayDate(state.ticketFromDate))}">${icon("calendar")}</div></label><label><span>To date</span><div class="alarm-date-input"><input name="toDate" type="text" inputmode="numeric" maxlength="10" pattern="\\d{2}-\\d{2}-\\d{4}" placeholder="dd-mm-yyyy" value="${escapeHtml(displayDate(state.ticketToDate))}">${icon("calendar")}</div></label></div>` : "";
  const ticketFilters = state.ticketMoreFiltersOpen ? `<div class="machine-modal-backdrop" id="ticket-filters-backdrop"><section class="machine-modal alarm-filters-modal ticket-filters-modal" role="dialog" aria-modal="true" aria-labelledby="ticket-filters-title">
    <header><div><span class="machine-modal-kicker">Ticket filters</span><h2 id="ticket-filters-title">More filters</h2><p>Refine tickets by location, priority, status, and raised date.</p></div><button class="machine-modal-close" id="ticket-filters-close" type="button" aria-label="Close">×</button></header>
    <form id="ticket-filters-form" class="alarm-filter-form">
      <div class="alarm-filter-column alarm-filter-location"><h3>Location</h3>
        <label><span>Cluster</span>${customSelect("ticket-cluster", [["All", "All clusters"], ...clusters.map(value => [value, value])], state.ticketClusterFilter, { label: "Cluster", ariaLabel: "Filter by cluster" })}</label>
        <label><span>Area</span>${customSelect("ticket-area", [["All", "All areas"], ...areas.map(value => [value, value])], state.ticketAreaFilter, { label: "Area", ariaLabel: "Filter by area" })}</label>
        <label><span>Device</span>${customSelect("ticket-device", [["All", "All devices"], ...devices.map(value => [value, deviceLabel(ticketMachine({ machineId: value }) || { id: value })])], state.ticketDeviceFilter, { label: "Device", ariaLabel: "Filter by device" })}</label>
        <div class="alarm-time-section"><h3>Time range</h3><div class="alarm-time-options ticket-time-options">
          ${[["1 day", "1 day"], ["7 days", "7 days"], ["30 days", "30 days"], ["custom", "Custom"]].map(([value, label]) => `<button type="button" class="${state.ticketTimeRange === value ? "active" : ""}" data-ticket-time-range="${value}">${label}</button>`).join("")}
        </div>${customDates}</div>
      </div>
      <div class="alarm-filter-column alarm-filter-details"><h3>Ticket details</h3>
        <label><span>Priority</span>${customSelect("ticket-priority", [["All", "All priorities"], ...priorities.filter(value => value !== "All").map(value => [value, value])], state.ticketPriorityFilter, { label: "Priority", ariaLabel: "Filter by priority" })}</label>
        <label><span>Ticket status</span>${customSelect("ticket-status", [["All", "All statuses"], ...statuses.map(value => [value, value])], state.ticketStatusFilter, { label: "Ticket status", ariaLabel: "Filter by ticket status" })}</label>
      </div>
    </form>
    ${selectedFilterChips ? `<div class="alarm-selected-filters">${selectedFilterChips}</div>` : ""}
    <footer><span class="alarm-filter-count">${selectedFilters.length} filter${selectedFilters.length === 1 ? "" : "s"} selected</span><div><button class="secondary-btn" id="ticket-filters-reset" type="button" ${selectedFilters.length ? "" : "disabled"}>Clear all</button><button class="primary-btn" type="submit" form="ticket-filters-form">Show results</button></div></footer>
  </section></div>` : "";
  const rows = tickets.map(ticket => ticketRow(ticket, machines)).join("");
  const emptyRow = `<tr id="ticket-empty-row" hidden><td colspan="5"><div class="empty-state">${escapeHtml(serviceActive ? "Service tickets will appear here." : "No tickets match this filter.")}</div></td></tr>`;
  return `${pageHead("Tickets", "Track service and problem tickets across raised issues")}
    <div class="machine-view-toolbar">
      <div class="machine-view-switch" role="group" aria-label="Ticket type">
        <button class="${serviceActive ? "active" : ""}" type="button" data-ticket-type="service">${icon("maintenance")} Service Ticket</button>
        <button class="${!serviceActive ? "active" : ""}" type="button" data-ticket-type="problem">${icon("alarm")} Problem Ticket</button>
      </div>
      <span class="machine-view-note">Cluster → area → machine number</span>
    </div>
    ${serviceActive
      ? `<section class="panel"><div class="empty-state">${icon("maintenance")}Service tickets will appear here.</div></section>`
      : `<div class="filter-bar"><div class="search-wrap">${icon("search")}<input id="ticket-search" type="search" value="${escapeHtml(state.ticketSearch)}" placeholder="Search ticket, machine or area…"></div><div class="device-filter-actions ticket-filter-actions"><div class="filter-pills">${filters}</div><button class="secondary-btn ${selectedFilters.length ? "filter-active" : ""}" id="ticket-more-filters" type="button">${icon("filter")} More filters</button></div></div>
        <section class="panel"><div class="table-wrap"><table class="data-table ticket-table"><thead><tr><th>Ticket_id</th><th>Machine</th><th>Cluster</th><th>Assigned to</th><th>Opened</th></tr></thead><tbody>${rows}${emptyRow}</tbody></table></div></section>${ticketFilters}`}`;
}
