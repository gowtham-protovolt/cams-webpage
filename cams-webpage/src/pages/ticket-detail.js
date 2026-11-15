import { formatTicketId, getTicket } from "../data/tickets.js";
import { customSelect, deviceLabel, escapeHtml, icon, pageHead, statusPill } from "./shared.js";

const maintenanceStatuses = ["In progress", "Completed"];
const categories = ["Pressure", "Flow", "Suction", "Communication", "Sensor", "Mechanical", "Gateway"];

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

export function renderTicketDetailPage({ state, operators = [], machines = [] }) {
  const ticket = getTicket(state.ticketId);
  if (!ticket) {
    return `<button class="back-link" type="button" data-page="tickets">${icon("arrowLeft")} Back to tickets</button><section class="panel"><div class="empty-state">${icon("search")}Ticket not found.</div></section>`;
  }

  const machine = machines.find(item => item.id === ticket.machineId && (!ticket.siteId || item.siteId === ticket.siteId));
  const deviceName = deviceLabel(machine || { id: ticket.machineId, machineName: ticket.machineName });
  const canEdit = Boolean((state.currentUser?.isOwner || state.currentUser?.role === "operator") && ticket.ticketStatus === "Open");
  const statusActions = `<div class="ticket-status-stack"><div class="ticket-priority-item"><span>Priority</span>${statusPill(ticket.priority)}</div><div class="ticket-priority-item"><span>Alarm priority</span>${statusPill(ticket.alarmPriority || "Not recorded")}</div></div>`;
  const operatorHint = state.currentUser?.role === "operator"
    ? `<div class="ticket-operator-hint"><strong>Operator actions:</strong><span>Update category</span><span>Assign ticket</span><span>Update maintenance status</span><span>Add comments</span><span>Resolve after the alarm clears</span></div>`
    : "";
  const comments = commentsList(ticket);
  const activity = activityList(ticket);
  const assignmentField = canEdit
    ? select("Assigned to", "assignedTo", ticket.assignedTo, ["Unassigned", ...operators])
    : input("Assigned to", "assignedTo", ticket.assignedTo, { readonly: true });
  const categoryField = canEdit
    ? select("Category", "category", ticket.category, categories)
    : input("Category", "category", ticket.category, { readonly: true });
  const maintenanceStatus = ticket.maintenance === "Completed" ? "Completed" : "In progress";
  const maintenanceField = canEdit
    ? `<label><span>Maintenance status</span>${customSelect("ticket-maintenance", maintenanceStatuses.map(status => [status, status]), maintenanceStatus, { label: "Maintenance status", ariaLabel: "Maintenance status" })}</label>`
    : input("Maintenance status", "maintenance", ticket.maintenance, { readonly: true });
  return `<button class="back-link" type="button" data-page="tickets">${icon("arrowLeft")} Back to tickets</button>
    ${pageHead(escapeHtml(formatTicketId(ticket.id)), `Problem ticket · ${escapeHtml(ticket.problem)}`, statusActions)}
    ${operatorHint}
    <section class="panel"><form id="ticket-detail-form" class="machine-form ticket-detail-form">
      <div class="ticket-fields-grid">
        <div class="ticket-form-column">
          ${input("Ticket number", "id", formatTicketId(ticket.id), { readonly: true })}
          ${input("Cluster", "cluster", ticket.cluster, { readonly: true })}
          ${input("Area", "area", ticket.area, { readonly: true })}
          ${input("Device", "machineName", deviceName, { readonly: true })}
          ${categoryField}
        </div>
        <div class="ticket-form-column">
          ${assignmentField}
          ${input("Opened", "raisedAt", displayDate(ticket.raisedAt), { readonly: true })}
          ${maintenanceField}
        </div>
      </div>
      <label><span>Short description</span><textarea name="description" data-ticket-field="description" readonly>${escapeHtml(ticket.description)}</textarea></label>
    </form>
    ${canEdit ? `<form id="ticket-comment-form" class="machine-form ticket-comment-form"><label><span>Comment</span><textarea name="comment" placeholder="Add a comment" required></textarea></label></form>` : ""}
      <div class="ticket-comments">${comments || `<div class="empty-state">No comments yet.</div>`}</div>
    ${canEdit ? `<div class="ticket-form-actions"><button class="primary-btn" type="submit" form="ticket-comment-form">Post comment</button><button class="secondary-btn" id="resolve-ticket" type="button">Resolve ticket</button></div>` : ""}
    </section>
    <section class="panel ticket-activity-panel"><header class="panel-head"><div class="panel-title"><h2>Activity history</h2></div></header>
      <div class="ticket-activity">${activity}</div>
    </section>`;
}
