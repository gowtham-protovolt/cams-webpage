const tickets = [];
const configuredApiBaseUrl = String(window.CAMS_CONFIG?.apiBaseUrl || "");
const apiBaseUrl = (configuredApiBaseUrl === "same-origin" ? window.location.origin : configuredApiBaseUrl).replace(/\/$/, "");
const siteId = "plant-01";
const previewMode = new URLSearchParams(window.location.search).get("ticketPreview") === "1";
const previewTime = Date.now();
const previewTicket = {
  id: "TKT_TEST_001",
  siteId,
  machineId: "CAMS-01",
  cluster: "",
  area: "",
  machineNo: "",
  category: "Pressure",
  priority: "Low",
  alarmPriority: "Warning",
  problem: "Test preview ticket",
  description: "Preview only — this temporary ticket is stored in this browser session and is not sent to the API or database.",
  activeProblems: [],
  machineStatus: "Warning",
  maintenance: "In progress",
  ticketStatus: "Open",
  assignedTo: "Unassigned",
  raisedAt: new Date(previewTime).toISOString(),
  comments: [],
  activity: [
    { id: "preview-3", action: "Ticket updated", by: "CAMS Admin", details: "Status: Scheduled → In progress", at: new Date(previewTime - 60_000).toISOString() },
    { id: "preview-2", action: "Ticket assigned", by: "CAMS Admin", details: "Technician: Unassigned → CAMS Admin", at: new Date(previewTime - 5 * 60_000).toISOString() },
    { id: "preview-1", action: "Ticket created", by: "CAMS Monitoring", details: "Temporary visual preview ticket.", at: new Date(previewTime - 10 * 60_000).toISOString() }
  ]
};

function addPreviewActivity(ticket, action, details, by = "CAMS Admin") {
  ticket.activity.unshift({ id: `preview-${crypto.randomUUID()}`, action, by, details, at: new Date().toISOString() });
}

async function request(path, options = {}) {
  if (!apiBaseUrl) throw new Error("Ticket service is not configured yet.");
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("CAMS ticket service is unavailable. Try again shortly.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Ticket request failed.");
  return payload;
}

function replaceTicket(ticket) {
  if (!ticket) return null;
  const index = tickets.findIndex(item => item.id === ticket.id);
  if (index < 0) tickets.push(ticket);
  else tickets[index] = ticket;
  return ticket;
}

export function listTickets() {
  return tickets;
}

export function formatTicketId(id) {
  return String(id).replace(/^TKT(?=_)/, "PR");
}

export async function loadTickets() {
  if (previewMode) {
    tickets.splice(0, tickets.length, previewTicket);
    return tickets;
  }
  const payload = await request(`/api/tickets?siteId=${encodeURIComponent(siteId)}`);
  tickets.splice(0, tickets.length, ...(payload.tickets || []));
  return tickets;
}

export function getTicket(id) {
  return tickets.find(ticket => ticket.id === id) || null;
}

export async function loadTicket(id) {
  if (previewMode && id === previewTicket.id) return replaceTicket(previewTicket);
  const payload = await request(`/api/tickets/${encodeURIComponent(id)}?siteId=${encodeURIComponent(siteId)}`);
  return replaceTicket(payload.ticket);
}

export async function updateTicket(id, patch) {
  if (previewMode && id === previewTicket.id) {
    const changes = Object.entries(patch).map(([field, value]) => `${field}: ${previewTicket[field] || "—"} → ${value || "—"}`);
    Object.assign(previewTicket, patch);
    if (changes.length) addPreviewActivity(previewTicket, patch.category !== undefined ? "Category changed" : "Ticket updated", changes.join("; "));
    return previewTicket;
  }
  const payload = await request(`/api/tickets/${encodeURIComponent(id)}?siteId=${encodeURIComponent(siteId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return replaceTicket(payload.ticket);
}

export async function loadOperators() {
  if (previewMode) return ["CAMS Admin", "Maintenance Operator"];
  const payload = await request(`/api/tickets/operators?siteId=${encodeURIComponent(siteId)}`);
  return payload.operators || [];
}

export async function closeTicket(id) {
  if (previewMode && id === previewTicket.id) {
    previewTicket.ticketStatus = "Closed";
    previewTicket.machineStatus = "Resolved";
    previewTicket.maintenance = "Completed";
    addPreviewActivity(previewTicket, "Ticket closed", "Ticket closed after the preview machine problem cleared.");
    return previewTicket;
  }
  const payload = await request(`/api/tickets/${encodeURIComponent(id)}/close?siteId=${encodeURIComponent(siteId)}`, {
    method: "POST",
    body: "{}"
  });
  return replaceTicket(payload.ticket);
}

export async function addComment(id, text) {
  if (previewMode && id === previewTicket.id) {
    const comment = { id: `preview-comment-${crypto.randomUUID()}`, by: "CAMS Admin", at: new Date().toISOString(), text: String(text).trim() };
    previewTicket.comments.unshift(comment);
    addPreviewActivity(previewTicket, "Comment posted", comment.text, comment.by);
    return comment;
  }
  const payload = await request(`/api/tickets/${encodeURIComponent(id)}/comments?siteId=${encodeURIComponent(siteId)}`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
  replaceTicket(payload.ticket);
  return payload.comment;
}

export function getOpenTicketForMachine(machineId) {
  return tickets.find(ticket => ticket.machineId === machineId && ticket.ticketStatus === "Open") || null;
}

export function applyTicketEvent(ticket) {
  replaceTicket(ticket);
}
