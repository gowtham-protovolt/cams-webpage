import { customSelect, deviceLabel, escapeHtml, icon, pageHead, statusPill } from "./shared.js";

function alarmSummary(label, count, iconName, tone, filter, selectedFilter) {
  const active = selectedFilter === filter;
  return `<button class="alarm-summary-card ${active ? "active" : ""}" type="button" data-alarm-summary-filter="${filter}" aria-pressed="${active}"><span class="severity-icon ${tone}">${icon(iconName)}</span><span class="alarm-summary-copy"><span>${label}</span><strong>${count}</strong></span></button>`;
}

function displayDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function alarmLocationLayout(devices, alarms) {
  const source = devices.length
    ? devices
    : [...new Set(alarms.map(alarm => alarm.machine))].map(id => ({ id }));
  return source.map((device) => {
    const clusterName = device.cluster || "Unassigned cluster";
    const areaName = device.zone || "Unassigned area";
    return {
      device,
      clusterId: clusterName,
      clusterName,
      areaId: areaName,
      areaName,
      areaKey: JSON.stringify([clusterName, areaName])
    };
  });
}

function filterChoice(group, value, selected, tone = "") {
  return `<button type="button" class="alarm-filter-choice ${tone} ${selected === value ? "active" : ""}" data-alarm-choice-group="${group}" data-alarm-choice="${value}">${value}</button>`;
}

function selectedFilterChip(group, label) {
  return `<button type="button" class="alarm-filter-chip" data-alarm-clear-group="${group}"><span>${escapeHtml(label)}</span><span aria-hidden="true">×</span></button>`;
}

export function renderAlarmsPage({ state, alarms, machines = [] }) {
  const filters = ["All", "Open", "Critical", "Warning", "Info", "Resolved"].map(filter => `<button class="filter-pill ${state.alarmFilter === filter ? "active" : ""}" data-alarm-filter="${filter}">${filter}</button>`).join("");
  const alarmMachines = [...new Set(alarms.map(alarm => alarm.machine))].sort();
  const locationAssignments = alarmLocationLayout(machines, alarms);
  const assignmentByDevice = new Map(locationAssignments.map(assignment => [assignment.device.id, assignment]));
  const visible = alarms.filter(alarm => {
    const date = alarm.occurredAt ? new Date(alarm.occurredAt) : null;
    const afterFrom = !state.alarmFromDate || (date && date >= new Date(`${state.alarmFromDate}T00:00:00`));
    const beforeTo = !state.alarmToDate || (date && date <= new Date(`${state.alarmToDate}T23:59:59.999`));
    const quickFilter = state.alarmFilter === "All" || (state.alarmFilter === "Open" ? alarm.status !== "Resolved" : state.alarmFilter === "Resolved" ? alarm.status === "Resolved" : alarm.severity === state.alarmFilter);
    const assignment = assignmentByDevice.get(alarm.machine);
    const matchesCluster = state.alarmClusterFilter === "All" || assignment?.clusterId === state.alarmClusterFilter;
    const matchesArea = state.alarmAreaFilter === "All" || assignment?.areaKey === state.alarmAreaFilter;
    return quickFilter && matchesCluster && matchesArea && (state.alarmMachineFilter === "All" || alarm.machine === state.alarmMachineFilter) &&
      (state.alarmPointFilter === "All" || alarm.parameter === state.alarmPointFilter) &&
      (state.alarmSeverityFilter === "All" || alarm.severity === state.alarmSeverityFilter) &&
      (state.alarmStatusFilter === "All" || alarm.status === state.alarmStatusFilter) && afterFrom && beforeTo;
  });
  const rows = visible.map(alarm => { const machine = machines.find(item => item.id === alarm.machine) || { id: alarm.machine }; return `<tr><td><strong>${escapeHtml(alarm.time)}</strong><br><small>${escapeHtml(alarm.date)}</small></td><td><strong>${escapeHtml(deviceLabel(machine))}</strong></td><td>${escapeHtml(alarm.parameter)}</td><td>${escapeHtml(alarm.value)}</td><td>${statusPill(alarm.severity)}</td><td>${statusPill(alarm.status)}</td></tr>`; }).join("");
  const count = (severity, status = "Active") => alarms.filter(alarm => alarm.severity === severity && alarm.status === status).length;
  const resolved = alarms.filter(alarm => alarm.status === "Resolved").length;
  const clusters = Array.from(new Map(locationAssignments.map(item => [item.clusterId, item.clusterName])));
  const areas = locationAssignments
    .filter(item => state.alarmClusterFilter === "All" || item.clusterId === state.alarmClusterFilter)
    .reduce((choices, item) => choices.some(([value]) => value === item.areaKey) ? choices : [...choices, [item.areaKey, item.areaName]], []);
  const availableDevices = locationAssignments
    .filter(item => (state.alarmClusterFilter === "All" || item.clusterId === state.alarmClusterFilter) && (state.alarmAreaFilter === "All" || item.areaKey === state.alarmAreaFilter))
    .map(item => item.device.id)
    .filter(id => alarmMachines.includes(id))
    .sort();
  const alarmPoints = [...new Set(alarms.map(alarm => alarm.parameter).filter(Boolean))].sort();
  const selectedFilters = [];
  if (state.alarmClusterFilter !== "All") selectedFilters.push(["cluster", clusters.find(([value]) => value === state.alarmClusterFilter)?.[1] || state.alarmClusterFilter]);
  if (state.alarmAreaFilter !== "All") selectedFilters.push(["area", areas.find(([value]) => value === state.alarmAreaFilter)?.[1] || state.alarmAreaFilter]);
  if (state.alarmMachineFilter !== "All") selectedFilters.push(["device", deviceLabel(machines.find(machine => machine.id === state.alarmMachineFilter) || { id: state.alarmMachineFilter })]);
  if (state.alarmPointFilter !== "All") selectedFilters.push(["point", state.alarmPointFilter]);
  if (state.alarmSeverityFilter !== "All") selectedFilters.push(["severity", state.alarmSeverityFilter]);
  if (state.alarmStatusFilter !== "All") selectedFilters.push(["status", state.alarmStatusFilter]);
  if (state.alarmTimeRange !== "All") selectedFilters.push(["time", state.alarmTimeRange === "custom" ? "Custom Dates" : state.alarmTimeRange.replace(/\b\w/g, letter => letter.toUpperCase())]);
  const selectedFilterChips = selectedFilters.map(([group, label]) => selectedFilterChip(group, label)).join("");
  const customDates = state.alarmTimeRange === "custom" ? `<div class="alarm-filter-date-grid"><label><span>From date</span><div class="alarm-date-input"><input name="fromDate" type="text" inputmode="numeric" maxlength="10" pattern="\\d{2}-\\d{2}-\\d{4}" placeholder="dd-mm-yyyy" value="${escapeHtml(displayDate(state.alarmFromDate))}">${icon("calendar")}</div></label><label><span>To date</span><div class="alarm-date-input"><input name="toDate" type="text" inputmode="numeric" maxlength="10" pattern="\\d{2}-\\d{2}-\\d{4}" placeholder="dd-mm-yyyy" value="${escapeHtml(displayDate(state.alarmToDate))}">${icon("calendar")}</div></label></div>` : "";
  const moreFilters = state.alarmMoreFiltersOpen ? `<div class="machine-modal-backdrop" id="alarm-filters-backdrop"><section class="machine-modal alarm-filters-modal" role="dialog" aria-modal="true" aria-labelledby="alarm-filters-title">
    <header><div><span class="machine-modal-kicker">Alarm filters</span><h2 id="alarm-filters-title">More filters</h2><p>Refine the alarm and event history.</p></div><button class="machine-modal-close" id="alarm-filters-close" type="button" aria-label="Close">×</button></header>
    <form id="alarm-filters-form" class="alarm-filter-form">
      <div class="alarm-filter-column alarm-filter-location"><h3>Location</h3>
        <label><span>Cluster</span>${customSelect("alarm-cluster", [["All", "All clusters"], ...clusters], state.alarmClusterFilter, { label: "Cluster", ariaLabel: "Filter by cluster" })}</label>
        <label><span>Area</span>${customSelect("alarm-area", [["All", "All areas"], ...areas], state.alarmAreaFilter, { label: "Area", ariaLabel: "Filter by area" })}</label>
        <label><span>Device</span>${customSelect("alarm-device", [["All", "All devices"], ...availableDevices.map(value => [value, deviceLabel(machines.find(machine => machine.id === value) || { id: value })])], state.alarmMachineFilter, { label: "Device", ariaLabel: "Filter by device" })}</label>
        <div class="alarm-time-section"><h3>Time range</h3><div class="alarm-time-options">
          ${[["today", "1 Day"], ["7 days", "7 Days"], ["30 days", "30 Days"], ["custom", "Custom"]].map(([value, label]) => `<button type="button" class="${state.alarmTimeRange === value ? "active" : ""}" data-alarm-time-range="${value}">${label}</button>`).join("")}
        </div>${customDates}</div>
      </div>
      <div class="alarm-filter-column alarm-filter-details"><h3>Alarm details</h3>
        <label><span>Alarm point</span>${customSelect("alarm-point", [["All", "All alarm points"], ...alarmPoints.map(value => [value, value])], state.alarmPointFilter, { label: "Alarm point", ariaLabel: "Filter by alarm point" })}</label>
        <fieldset><legend>Severity</legend><div class="alarm-filter-segments severity">${filterChoice("severity", "Critical", state.alarmSeverityFilter, "critical")}${filterChoice("severity", "Warning", state.alarmSeverityFilter, "warning")}${filterChoice("severity", "Info", state.alarmSeverityFilter, "info")}</div></fieldset>
        <fieldset><legend>Status</legend><div class="alarm-filter-segments status">${filterChoice("status", "Active", state.alarmStatusFilter)}${filterChoice("status", "Acknowledged", state.alarmStatusFilter)}${filterChoice("status", "Resolved", state.alarmStatusFilter)}</div></fieldset>
      </div>
    </form>
    ${selectedFilterChips ? `<div class="alarm-selected-filters">${selectedFilterChips}</div>` : ""}
    <footer><span class="alarm-filter-count">${selectedFilters.length} filter${selectedFilters.length === 1 ? "" : "s"} selected</span><div><button class="secondary-btn" id="alarm-filters-reset" type="button" ${selectedFilters.length ? "" : "disabled"}>Clear all</button><button class="primary-btn" type="submit" form="alarm-filters-form">Show results</button></div></footer>
  </section></div>` : "";
  return `${state.dashboardAlarmReturn ? `<button class="back-link" type="button" data-page="dashboard">${icon("arrowLeft")} Back to Dashboard</button>` : ""}
    ${pageHead("Alarms & events", "Review plant operating exceptions; alarms resolve automatically when readings return to normal.", `<button class="secondary-btn" id="export-alarms">${icon("download")} Export history</button>`)}
    <section class="alarm-summary">${alarmSummary("Critical", count("Critical"), "alarm", "critical", "Critical", state.alarmFilter)}${alarmSummary("Warning", count("Warning"), "alarm", "warning", "Warning", state.alarmFilter)}${alarmSummary("Information", count("Info"), "info", "info", "Info", state.alarmFilter)}${alarmSummary("Resolved", resolved, "check", "info", "Resolved", state.alarmFilter)}</section>
    <div class="filter-bar"><div class="filter-pills">${filters}</div><button class="secondary-btn" id="alarm-more-filters">${icon("filter")} More filters</button></div>
    <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Device</th><th>Alarm Point</th><th>Value</th><th>Severity</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty-state">${icon("check")}No live alarms received.</div></td></tr>`}</tbody></table></div></section>${moreFilters}`;
}
