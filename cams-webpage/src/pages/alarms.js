import { icon, pageHead, statusPill } from "./shared.js";

function alarmSummary(label, count, iconName, tone) {
  return `<article class="alarm-summary-card"><span class="severity-icon ${tone}">${icon(iconName)}</span><div><span>${label}</span><strong>${count}</strong></div></article>`;
}

export function renderAlarmsPage({ state, alarms }) {
  const filters = ["All", "Critical", "Warning", "Info", "Resolved"].map(filter => `<button class="filter-pill ${state.alarmFilter === filter ? "active" : ""}" data-alarm-filter="${filter}">${filter}</button>`).join("");
  const visible = alarms.filter(alarm => state.alarmFilter === "All" || (state.alarmFilter === "Resolved" ? alarm.status === "Resolved" : alarm.severity === state.alarmFilter));
  const rows = visible.map(alarm => `<tr><td><strong>${alarm.time}</strong><br><small>${alarm.date}</small></td><td><strong>${alarm.machine}</strong></td><td>${alarm.parameter}</td><td>${alarm.value}</td><td>${statusPill(alarm.severity)}</td><td>${statusPill(alarm.status)}</td><td><div class="table-actions"><button class="mini-action" data-view-alarm="${alarm.id}">View</button><button class="mini-action" data-ack="${alarm.id}" ${alarm.status !== "Active" ? "disabled" : ""}>Acknowledge</button><button class="mini-action" data-resolve="${alarm.id}" ${alarm.status === "Resolved" ? "disabled" : ""}>Resolve</button></div></td></tr>`).join("");
  const count = (severity, status = "Active") => alarms.filter(alarm => alarm.severity === severity && alarm.status === status).length;
  const resolved = alarms.filter(alarm => alarm.status === "Resolved").length;
  return `${pageHead("Alarms & events", "Review, acknowledge and resolve plant operating exceptions", `<button class="secondary-btn" id="export-alarms">${icon("download")} Export history</button>`)}
    <section class="alarm-summary">${alarmSummary("Critical", count("Critical"), "alarm", "critical")}${alarmSummary("Warning", count("Warning"), "alarm", "warning")}${alarmSummary("Information", count("Info"), "info", "info")}${alarmSummary("Resolved", resolved, "check", "info")}</section>
    <div class="filter-bar"><div class="filter-pills">${filters}</div><button class="secondary-btn">${icon("filter")} More filters</button></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Machine</th><th>Alarm Point</th><th>Value</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state">${icon("check")}No live alarms received.</div></td></tr>`}</tbody></table></div></section>`;
}
