import { escapeHtml, icon, pageHead, statusPill } from "./shared.js";

function alarmSummary(label, count, iconName, tone) {
  return `<article class="alarm-summary-card"><span class="severity-icon ${tone}">${icon(iconName)}</span><div><span>${label}</span><strong>${count}</strong></div></article>`;
}

function auditTime(value) {
  if (!value) return "Time unavailable";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });
}

function alarmDialog(state, alarms) {
  const modal = state.alarmModal;
  if (!modal) return "";
  const alarm = alarms.find(item => item.id === modal.alarmId);
  if (!alarm) return "";

  if (modal.type === "action") {
    const verb = modal.status === "Acknowledged" ? "Acknowledge" : "Resolve";
    return `<div class="machine-modal-backdrop" id="alarm-modal-backdrop"><section class="machine-modal alarm-audit-modal" role="dialog" aria-modal="true" aria-labelledby="alarm-modal-title">
      <header><div><span class="machine-modal-kicker">Alarm audit</span><h2 id="alarm-modal-title">${verb} ${escapeHtml(alarm.machine)} alarm</h2><p>Record the action reason. The user, date and time are captured automatically.</p></div><button class="machine-modal-close" id="alarm-modal-close" type="button" aria-label="Close">×</button></header>
      ${state.alarmAuditError ? `<div class="inline-error">${escapeHtml(state.alarmAuditError)}</div>` : ""}
      <div class="alarm-audit-summary"><strong>${escapeHtml(alarm.parameter)} · ${escapeHtml(alarm.value)}</strong><span>${escapeHtml(alarm.message)}</span></div>
      <form id="alarm-audit-form" class="machine-form">
        <label><span>Action comment</span><textarea name="comment" maxlength="500" rows="4" placeholder="Describe the inspection, corrective action or reason…" required></textarea><small>Required · maximum 500 characters</small></label>
      </form>
      <footer><button class="secondary-btn" id="alarm-modal-cancel" type="button">Cancel</button><button class="primary-btn" type="submit" form="alarm-audit-form">${verb} alarm</button></footer>
    </section></div>`;
  }

  const history = state.alarmHistory.map(entry => `<article class="alarm-audit-entry">
    <span class="alarm-audit-marker ${String(entry.status || "").toLowerCase()}">${icon(entry.status === "Resolved" ? "check" : "user")}</span>
    <div><div class="alarm-audit-entry-head"><strong>${escapeHtml(entry.action)}</strong><time>${escapeHtml(auditTime(entry.createdAt))}</time></div><p>${escapeHtml(entry.comment || "No comment recorded.")}</p><small>${escapeHtml(entry.actor?.displayName || "CAMS Monitoring")} · ${escapeHtml(entry.actor?.role || entry.source || "system")}</small></div>
  </article>`).join("");
  return `<div class="machine-modal-backdrop" id="alarm-modal-backdrop"><section class="machine-modal alarm-audit-modal" role="dialog" aria-modal="true" aria-labelledby="alarm-modal-title">
    <header><div><span class="machine-modal-kicker">Alarm audit history</span><h2 id="alarm-modal-title">${escapeHtml(alarm.machine)} · ${escapeHtml(alarm.parameter)}</h2><p>${escapeHtml(alarm.message)}</p></div><button class="machine-modal-close" id="alarm-modal-close" type="button" aria-label="Close">×</button></header>
    <div class="alarm-audit-overview"><div><span>Current status</span>${statusPill(alarm.status)}</div><div><span>Severity</span>${statusPill(alarm.severity)}</div><div><span>Current value</span><strong>${escapeHtml(alarm.value)}</strong></div></div>
    <div class="alarm-audit-history">${state.alarmHistoryLoading ? `<div class="machine-modal-state"><span class="loading-spinner dark"></span>Loading audit history…</div>` : state.alarmAuditError ? `<div class="inline-error">${escapeHtml(state.alarmAuditError)}</div>` : history || `<div class="machine-modal-state">No acknowledge or resolve actions recorded yet.</div>`}</div>
    <footer><button class="secondary-btn" id="alarm-modal-cancel" type="button">Close</button></footer>
  </section></div>`;
}

export function renderAlarmsPage({ state, alarms }) {
  const filters = ["All", "Critical", "Warning", "Info", "Resolved"].map(filter => `<button class="filter-pill ${state.alarmFilter === filter ? "active" : ""}" data-alarm-filter="${filter}">${filter}</button>`).join("");
  const visible = alarms.filter(alarm => state.alarmFilter === "All" || (state.alarmFilter === "Resolved" ? alarm.status === "Resolved" : alarm.severity === state.alarmFilter));
  const canManage = state.currentUser?.isOwner || state.currentUser?.role === "operator";
  const rows = visible.map(alarm => `<tr><td><strong>${escapeHtml(alarm.time)}</strong><br><small>${escapeHtml(alarm.date)}</small></td><td><strong>${escapeHtml(alarm.machine)}</strong></td><td>${escapeHtml(alarm.parameter)}</td><td>${escapeHtml(alarm.value)}</td><td>${statusPill(alarm.severity)}</td><td>${statusPill(alarm.status)}</td><td><div class="table-actions"><button class="mini-action" data-view-alarm="${escapeHtml(alarm.id)}">View</button><button class="mini-action" data-ack="${escapeHtml(alarm.id)}" ${!canManage || alarm.status !== "Active" ? "disabled" : ""}>Acknowledge</button><button class="mini-action" data-resolve="${escapeHtml(alarm.id)}" ${!canManage || alarm.status === "Resolved" ? "disabled" : ""}>Resolve</button></div></td></tr>`).join("");
  const count = (severity, status = "Active") => alarms.filter(alarm => alarm.severity === severity && alarm.status === status).length;
  const resolved = alarms.filter(alarm => alarm.status === "Resolved").length;
  return `${pageHead("Alarms & events", "Review, acknowledge and resolve plant operating exceptions", `<button class="secondary-btn" id="export-alarms">${icon("download")} Export history</button>`)}
    <section class="alarm-summary">${alarmSummary("Critical", count("Critical"), "alarm", "critical")}${alarmSummary("Warning", count("Warning"), "alarm", "warning")}${alarmSummary("Information", count("Info"), "info", "info")}${alarmSummary("Resolved", resolved, "check", "info")}</section>
    <div class="filter-bar"><div class="filter-pills">${filters}</div><button class="secondary-btn">${icon("filter")} More filters</button></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Machine</th><th>Alarm Point</th><th>Value</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state">${icon("check")}No live alarms received.</div></td></tr>`}</tbody></table></div></section>${alarmDialog(state, alarms)}`;
}
