import { formatTicketId, getTicket } from "../data/tickets.js";
import { customSelect, escapeHtml, icon, pageHead, statusPill } from "./shared.js";

const categories = ["Pressure", "Flow", "Suction", "Communication", "Sensor", "Mechanical"];
const priorities = ["Critical", "High", "Medium", "Low"];
const maintenanceStatuses = ["In progress", "Closed", "Warning"];

function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function input(label, name, value, { readonly = false, type = "text" } = {}) {
  return `<label><span>${label}</span><input type="${type}" name="${name}" data-ticket-field="${name}" value="${escapeHtml(value)}" ${readonly ? "readonly" : ""}></label>`;
}

function select(label, name, value, choices) {
  const options = value ? (choices.includes(value) ? choices : [value, ...choices]) : ["", ...choices];
  const selectOptions = options.map(choice => [choice, choice || "Not set"]);
  return `<label><span>${label}</span>${customSelect(`ticket-${name}`, selectOptions, value || "", { label, ariaLabel: `Select ${label}`, nativeData: `name="${name}" data-ticket-field="${name}"` })}</label>`;
}

function commentsList(ticket) {
  return [...ticket.comments].sort((first, second) => new Date(second.at) - new Date(first.at)).map(comment =>
    `<article class="ticket-comment"><div><strong>${escapeHtml(comment.by)}</strong><p>${escapeHtml(comment.text)}</p></div><time>${escapeHtml(displayDate(comment.at))}</time></article>`
  ).join("");
}

function activityList(ticket) {
  const entries = [...(ticket.activity || [])].sort((first, second) => new Date(second.at) - new Date(first.at));
  if (!entries.length) return `<div class="empty-state">No activity recorded yet.</div>`;
  return entries.map(entry =>
    `<article class="ticket-comment"><div><strong>${escapeHtml(entry.by)}</strong><time class="ticket-activity-time">${escapeHtml(new Date(entry.at).toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</time><p>${escapeHtml(entry.action)}${entry.details ? ` · ${escapeHtml(entry.details)}` : ""}</p></div></article>`
  ).join("");
}

export function renderTicketDetailPage({ state, operators = [] }) {
  const ticket = getTicket(state.ticketId);
  if (!ticket) {
    return `<button class="back-link" type="button" data-page="tickets">${icon("arrowLeft")} Back to tickets</button><section class="panel"><div class="empty-state">${icon("search")}Ticket not found.</div></section>`;
  }

  const statusActions = `<div class="ticket-status-stack">${statusPill(ticket.machineStatus)}</div>`;
  const comments = commentsList(ticket);
  const activity = activityList(ticket);
  return `<button class="back-link" type="button" data-page="tickets">${icon("arrowLeft")} Back to tickets</button>
    ${pageHead(escapeHtml(formatTicketId(ticket.id)), `Problem ticket · ${escapeHtml(ticket.problem)}`, statusActions)}
    <section class="panel"><form id="ticket-detail-form" class="machine-form ticket-detail-form">
      <div class="ticket-fields-grid">
        <div class="ticket-form-column">
          ${input("Ticket number", "id", formatTicketId(ticket.id), { readonly: true })}
          ${select("Cluster", "cluster", ticket.cluster, ["C1", "C2", "C3", "C4"])}
          ${select("Area", "area", ticket.area, ["A1", "A2", "A3"])}
          ${input("machine_id", "machineNo", ticket.machineNo)}
          ${select("Category", "category", ticket.category, categories)}
          ${select("Priority", "priority", ticket.priority, priorities)}
        </div>
        <div class="ticket-form-column">
          ${select("Assigned to", "assignedTo", ticket.assignedTo, ["Unassigned", ...operators])}
          ${input("Opened", "raisedAt", displayDate(ticket.raisedAt), { readonly: true })}
          <label><span>Maintenance status</span>${customSelect("ticket-maintenance", maintenanceStatuses.map(status => [status, status]), ticket.maintenance, { label: "Maintenance status", ariaLabel: "Maintenance status" })}</label>
        </div>
      </div>
      <label><span>Short description</span><textarea name="description" data-ticket-field="description" readonly>${escapeHtml(ticket.description)}</textarea></label>
    </form>
    <form id="ticket-comment-form" class="machine-form ticket-comment-form"><label><span>Comment</span><textarea name="comment" placeholder="Add a comment" required></textarea></label><button class="primary-btn" type="submit">Post comment</button></form>
      <div class="ticket-comments">${comments || `<div class="empty-state">No comments yet.</div>`}</div>
    <div class="ticket-form-actions"><button class="primary-btn" type="submit" form="ticket-detail-form">Update</button><button class="secondary-btn" id="resolve-ticket" type="button">Resolve ticket</button></div>
    </section>
    <section class="panel ticket-activity-panel"><header class="panel-head"><div class="panel-title"><h2>Activity history</h2></div></header>
      <div class="ticket-activity">${activity}</div>
    </section>`;
}
