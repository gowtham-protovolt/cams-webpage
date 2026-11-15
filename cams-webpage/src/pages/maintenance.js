import { customDatePicker, customSelect, deviceLabel, escapeHtml as esc, icon, pageHead, timeRangeSelect } from "./shared.js";

const historyRanges = [["1w","1 Week"],["1m","1 Month"],["3m","3 Months"],["6m","6 Months"],["1y","1 Year"],["custom","Custom"]];
function model(state) {
  const maintenance = state.maintenance ||= { tickets: [], technicians: [], loading: false, error: "", modal: null, history: false };
  maintenance.historyRange ||= "1m";
  maintenance.historyCustomStart ||= "";
  maintenance.historyCustomEnd ||= "";
  return maintenance;
}
function writable(state) { return state.currentUser?.isOwner || state.currentUser?.role === "Operator" || state.currentUser?.role === "operator"; }
function date(value) { return value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—"; }
function badge(ticket) {
  const status = ticket.displayStatus;
  const tone = { Upcoming:"info", "Due today":"due", Overdue:"alarm", "In progress":"warning", Completed:"resolved" }[status] || "info";
  return `<span class="status-pill status-${tone}">${esc(status)}</span>`;
}
function activityMessage(message = "") {
  return message.split("\n").filter(line => !/^Technician:\s*[a-f\d]{24}\s*→/i.test(line)).map(line => {
    if (line.startsWith("Technician name:")) return line.replace("Technician name:", "Technician:");
    if (line.startsWith("Comment:")) return line.replace("Comment:", "Additional comment:");
    if (line.startsWith("Notes:") && line.includes("→")) return `Notes: ${line.split("→").at(-1).trim()}`;
    return line;
  }).join("\n");
}
function machineForTicket(ticket, machines) {
  return machines.find(item => item.id === ticket.machineId && item.siteId === ticket.siteId) || {
    machineId: ticket.machineId,
    machineName: ticket.machineName,
  };
}
function rows(tickets, machines) {
  return tickets.map(t => `<tr class="clickable" data-service-ticket="${esc(t.id)}"><td><button class="service-ticket-id" data-service-ticket="${esc(t.id)}">${esc(t.number)}</button></td><td>${esc(deviceLabel(machineForTicket(t, machines)))}</td><td>${esc(t.task)}</td><td>${date(t.serviceDate)}</td><td>${date(t.endDate || t.serviceDate)}</td><td>${esc(t.assigneeName)}</td><td>${badge(t)}</td><td><button class="mini-action" data-service-ticket="${esc(t.id)}">View</button></td></tr>`).join("");
}
function table(tickets, loading, machines) {
  return `<div class="table-wrap"><table class="data-table user-table"><thead><tr><th>Ticket ID</th><th>Device</th><th>Service task</th><th>Start date</th><th>End date</th><th>Assigned technician</th><th>Status</th><th>Action</th></tr></thead><tbody>${loading ? '<tr><td colspan="8"><div class="empty-state">Loading service tickets…</div></td></tr>' : rows(tickets, machines) || '<tr><td colspan="8"><div class="empty-state">No service tickets to display.</div></td></tr>'}</tbody></table></div>`;
}
export function filterServiceHistory(tickets, range, customStart, customEnd, now = new Date()) {
  if (range === "custom") {
    if (!customStart || !customEnd) return tickets;
    return tickets.filter(ticket => {
      const completedDate = ticket.completedAt?.slice(0, 10);
      return completedDate >= customStart && completedDate <= customEnd;
    });
  }
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  if (range === "1w") cutoff.setDate(cutoff.getDate() - 7);
  else if (range === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else cutoff.setMonth(cutoff.getMonth() - ({ "1m": 1, "3m": 3, "6m": 6 }[range] || 1));
  return tickets.filter(ticket => {
    const completedAt = new Date(ticket.completedAt);
    return Number.isFinite(completedAt.getTime()) && completedAt >= cutoff && completedAt <= now;
  });
}
function dialog(state, machines) {
  const m = model(state);
  if (!m.modal) return "";
  const ticket = m.modal === "new" ? null : m.tickets.find(t => t.id === m.modal);
  const editable = writable(state) && ticket?.status !== "Completed";
  const draft = m.draft || {};
  const selected = ticket ? machineForTicket(ticket, machines) : machines[Number(draft.deviceIndex || 0)];
  const description = ticket ? [ticket.cluster,ticket.area,ticket.machineName] : [selected?.cluster,selected?.zone,selected?.name];
  const technicians = m.technicians.map(t => [t.id,t.name]);
  if (ticket && !technicians.some(([id]) => id === ticket.assigneeId)) technicians.push([ticket.assigneeId,ticket.assigneeName]);
  const field = (label, content, className = "") => `<label${className ? ` class="${className}"` : ""}><span>${label}</span>${content}</label>`;
  const summary = `<div class="service-device-description" id="service-device-description">${esc(description.filter(Boolean).join(" · "))}</div>`;
  const deviceField = `<div class="service-device-field">${ticket ? field("Device", `<input readonly value="${esc(deviceLabel(selected))}">`) : field("Device", customSelect("service-device", machines.map((x,i) => [String(i),deviceLabel(x)]), draft.deviceIndex || "0", { label:"Device", nativeData:'name="deviceIndex"' }))}${summary}</div>`;
  const form = editable ? `<form id="service-form" class="machine-form service-ticket-form">
    ${deviceField}
    ${field("Service task", `<input name="task" maxlength="160" required value="${esc(draft.task || "")}" placeholder="e.g. Filter replacement">`)}
    ${field("Start date", `${customDatePicker(state, "service-start-date", draft.serviceDate, "Choose service start date")}<input type="hidden" name="serviceDate" value="${esc(draft.serviceDate || "")}">`)}
    ${field("End date", `${customDatePicker(state, "service-end-date", draft.endDate, "Choose service end date")}<input type="hidden" name="endDate" value="${esc(draft.endDate || "")}">`)}
    ${field("Assigned technician", customSelect("service-technician", [["", "Select technician"],...technicians], draft.assigneeId || "", {label:"Assigned technician",nativeData:'name="assigneeId"'}))}
    ${ticket ? field("Status", customSelect("service-status", [["Scheduled","Scheduled"],["In progress","In progress"],["Completed","Completed"]],draft.status || ticket.status,{label:"Status",nativeData:'name="status"'})) : ""}
    ${field("Notes", `<textarea name="notes" maxlength="4000" placeholder="Optional service instructions">${esc(draft.notes || "")}</textarea>`, "service-field-wide")}
    ${ticket ? field("Add comment", `<textarea name="comment" maxlength="4000" placeholder="Record work performed or an update">${esc(draft.comment || "")}</textarea>`, "service-field-wide") : ""}
  </form>` : `<div class="machine-form"><div><strong>${esc(selected ? deviceLabel(selected) : "—")}</strong>${summary}</div><div><strong>Service task</strong><p>${esc(ticket?.task)}</p></div><div><strong>Start date</strong><p>${date(ticket?.serviceDate)}</p></div><div><strong>End date</strong><p>${date(ticket?.endDate || ticket?.serviceDate)}</p></div><div><strong>Assigned technician</strong><p>${esc(ticket?.assigneeName)}</p></div><div><strong>Notes</strong><p class="service-note">${esc(ticket?.notes || "No notes")}</p></div></div>`;
  return `<div class="machine-modal-backdrop" id="service-backdrop"><section class="machine-modal service-ticket-modal" role="dialog" aria-modal="true" aria-labelledby="service-title"><header><div><span class="machine-modal-kicker">Maintenance ticket</span><h2 id="service-title">${ticket ? esc(ticket.number) : "Schedule service"}</h2><p>${ticket ? `${badge(ticket)} · Created ${date(ticket.createdAt)}${ticket.completedAt ? ` · Completed ${date(ticket.completedAt)}` : ""}` : "Choose a device, date and technician."}</p></div><button class="machine-modal-close" type="button" data-service-close aria-label="Close">×</button></header>
    <div class="inline-error" id="service-error" hidden></div>${form}
    ${ticket ? `<section class="service-activity"><h3>Activity history</h3>${ticket.activity.slice().reverse().map(a => `<article><strong>${esc(a.actor)}</strong><small>${esc(new Date(a.at).toLocaleString("en-IN"))}</small><p>${esc(activityMessage(a.message))}</p></article>`).join("")}</section>` : ""}
    <footer><button class="secondary-btn" type="button" data-service-close>${editable ? "Cancel" : "Close"}</button>${editable ? `<button class="primary-btn" type="submit" form="service-form">${ticket ? "Save changes" : "Schedule service"}</button>` : ""}</footer></section></div>`;
}
export function renderMaintenancePage({state, machines}) {
  const m = model(state);
  const active = m.tickets.filter(t => t.status !== "Completed");
  const completed = m.tickets.filter(t => t.status === "Completed").sort((a,b) => new Date(b.completedAt)-new Date(a.completedAt));
  const filteredHistory = filterServiceHistory(completed, m.historyRange, m.historyCustomStart, m.historyCustomEnd);
  const customDraft = m.historyCustomDraft || { start: m.historyCustomStart, end: m.historyCustomEnd };
  const customRangeError = customDraft.start && customDraft.end && customDraft.end < customDraft.start;
  const customRangePanel = m.historyCustomOpen ? `<div class="service-history-range-panel" role="group" aria-label="Custom service history range"><div class="service-history-range-title"><strong>Custom date range</strong><button type="button" data-history-range-cancel aria-label="Close custom date range">×</button></div><div class="service-history-range-fields"><label><span>From date</span>${customDatePicker(state,"service-history-from-date",customDraft.start,"Choose history start date")}</label><label><span>To date</span>${customDatePicker(state,"service-history-to-date",customDraft.end,"Choose history end date")}</label></div>${customRangeError ? '<p class="service-history-range-error">To date must be on or after From date.</p>' : ""}<div class="service-history-range-actions"><button class="secondary-btn" type="button" data-history-range-cancel>Cancel</button><button class="primary-btn" type="button" id="apply-history-range" ${!customDraft.start || !customDraft.end || customRangeError ? "disabled" : ""}>Apply range</button></div></div>` : "";
  return `${pageHead("Maintenance", "Schedule and track device services")}
    <section class="placeholder-layout service-overview"><article class="panel phase-card"><span class="phase-tag">Service planner</span><h2>Plan service before it becomes downtime.</h2><p>Maintenance workflows will connect compressor runtime, service intervals and technician records in one clear view.</p>${writable(state) ? `<div class="service-schedule-action"><button class="secondary-btn" id="schedule-service" ${!machines.length || m.loading ? "disabled" : ""}>+ Schedule service</button>${!machines.length ? '<small>Register a device to schedule service.</small>' : ""}</div>` : ""}</article>
    <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Service history</h2><p>${completed.length} completed service${completed.length === 1 ? "" : "s"}</p></div><button class="secondary-btn" id="service-history">${m.history ? "Show active" : "View all"}</button></header><div class="feature-list">${completed.slice(0,3).map(t => `<div class="feature-item">${icon("report")}<div><button class="service-ticket-id" data-service-ticket="${esc(t.id)}">${esc(t.number)} · ${esc(deviceLabel(machineForTicket(t, machines)))}</button><span>${esc(t.task)} · ${date(t.completedAt)}</span></div></div>`).join("") || '<div class="empty-state">Completed services will appear here.</div>'}</div></article></section>
    ${m.error ? `<div class="inline-error">${esc(m.error)}</div>` : ""}
    <section class="panel"><header class="panel-head"><div class="panel-title"><h2>Active services</h2><p>${active.length} active · ${active.filter(t => t.displayStatus === "Overdue").length} overdue</p></div><button class="secondary-btn" id="refresh-services">${icon("refresh")} Refresh</button></header>${table(active,m.loading,machines)}</section>
    ${m.history ? `<section class="panel service-history-table"><header class="panel-head service-history-head"><div class="panel-title"><h2>Service history</h2><p>${filteredHistory.length} completed ticket${filteredHistory.length === 1 ? "" : "s"} in the selected period</p></div><div class="service-history-filter"><label for="service-history-range-trigger">View history</label>${timeRangeSelect("service-history-range",historyRanges,m.historyRange)}${customRangePanel}</div></header>${table(filteredHistory,m.loading,machines)}</section>` : ""}${dialog(state,machines)}`;
}
export async function loadMaintenance(state, api, render) {
  const m = model(state); m.loading = true; m.error = ""; render();
  try { const result = await api.request("/api/maintenance"); m.tickets = result.tickets; m.technicians = result.technicians; }
  catch(error) { m.error = error.message; }
  finally { m.loading = false; render(); }
}
export function bindMaintenance(state, machines, api, render, toast) {
  if (state.page !== "maintenance") return;
  const m = model(state);
  const close = () => { m.modal = null; m.draft = null; state.customDatePicker = null; render(); document.querySelector("#schedule-service")?.focus(); };
  document.querySelector("#schedule-service")?.addEventListener("click", () => {m.modal="new";m.draft={deviceIndex:"0",task:"",serviceDate:"",endDate:"",assigneeId:"",notes:""};render();document.querySelector('[name="task"]')?.focus();});
  document.querySelector("#service-history")?.addEventListener("click", () => {m.history=!m.history;render();});
  document.querySelector("#service-history-range")?.addEventListener("change", event => {
    const previousRange = m.historyRange;
    m.historyRange = event.target.value;
    if (m.historyRange === "custom") {
      m.historyPreviousRange = previousRange === "custom" ? "1m" : previousRange;
      m.historyCustomDraft = { start: m.historyCustomStart, end: m.historyCustomEnd };
      m.historyCustomOpen = true;
    } else {
      m.historyCustomOpen = false;
      state.customDatePicker = null;
    }
    render();
  });
  document.querySelectorAll("[data-history-range-cancel]").forEach(button => button.addEventListener("click", () => {
    if (!m.historyCustomStart || !m.historyCustomEnd) m.historyRange = m.historyPreviousRange || "1m";
    m.historyCustomOpen = false;
    m.historyCustomDraft = null;
    state.customDatePicker = null;
    render();
  }));
  document.querySelector("#apply-history-range")?.addEventListener("click", () => {
    const { start, end } = m.historyCustomDraft || {};
    if (!start || !end || end < start) return;
    m.historyCustomStart = start;
    m.historyCustomEnd = end;
    m.historyCustomOpen = false;
    m.historyCustomDraft = null;
    state.customDatePicker = null;
    render();
  });
  document.querySelector("#refresh-services")?.addEventListener("click", () => loadMaintenance(state,api,render));
  document.querySelectorAll("[data-service-ticket]").forEach(el => el.addEventListener("click", event => {event.stopPropagation();const ticket=m.tickets.find(item=>item.id===el.dataset.serviceTicket);m.modal=el.dataset.serviceTicket;m.draft=ticket ? {task:ticket.task,serviceDate:ticket.serviceDate,endDate:ticket.endDate||ticket.serviceDate,assigneeId:ticket.assigneeId,status:ticket.status,notes:"",comment:""} : null;render();document.querySelector("[data-service-close]")?.focus();}));
  document.querySelectorAll("[data-service-close]").forEach(el => el.addEventListener("click",close));
  document.querySelector("#service-backdrop")?.addEventListener("click", event => {if(event.target.id === "service-backdrop") close();});
  document.querySelector("#service-backdrop")?.addEventListener("keydown", event => {
    if(event.key === "Escape") { event.stopPropagation();close(); }
    if(event.key === "Tab") { const items=[...event.currentTarget.querySelectorAll('button:not([disabled]), input:not([type="hidden"]), textarea, [tabindex="0"]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();} }
  });
  document.querySelector("#service-device")?.addEventListener("change", event => {const machine=machines[Number(event.target.value)];document.querySelector("#service-device-description").textContent=[machine?.cluster,machine?.zone,machine?.name].filter(Boolean).join(" · ");});
  document.querySelector("#service-form")?.addEventListener("input", event => { if (event.target.name) m.draft[event.target.name] = event.target.value; });
  document.querySelector("#service-form")?.addEventListener("change", event => { if (event.target.name) m.draft[event.target.name] = event.target.value; });
  document.querySelector("#service-form")?.addEventListener("submit", async event => {
    event.preventDefault();const form=event.currentTarget;const button=document.querySelector('[form="service-form"]');button.disabled=true;
    const data=Object.fromEntries(new FormData(form));const ticket=m.tickets.find(t=>t.id===m.modal);
    if(ticket) data.version=ticket.version;
    else {const machine=machines[Number(data.deviceIndex)];data.machineId=machine?.id;data.siteId=machine?.siteId;}
    try {await api.request(ticket ? `/api/maintenance/${ticket.id}` : "/api/maintenance", {method:ticket ? "PATCH" : "POST",body:JSON.stringify(data)});m.modal=null;m.draft=null;toast(data.status==="Completed" ? "Service completed and saved in Service History." : ticket ? "Ticket updated." : "Service scheduled.");await loadMaintenance(state,api,render);}
    catch(error){const el=document.querySelector("#service-error");if(el){el.hidden=false;el.textContent=error.message;}button.disabled=false;}
  });
}
