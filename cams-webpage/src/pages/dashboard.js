import { chartSvg, fmt, historyFor, icon, kpi, pageHead, relativeTime, statusPill } from "./shared.js";

function sensorMini(label, value, unit, readingState) {
  const isLive = readingState === "live";
  const statusLabel = isLive ? "Receiving live data" : "Live data unavailable; showing the last known reading";
  return `<div class="sensor-mini ${isLive ? "live" : "not-live"}"><div class="sensor-mini-head"><span>${label}</span><span class="sensor-state ${isLive ? "live" : "not-live"}" role="img" aria-label="${statusLabel}" title="${statusLabel}"><i></i></span></div><strong>${value}</strong><small>${unit}</small></div>`;
}

export function renderDashboardPage({ state, machines, machineHistory, alarms }) {
  const running = machines.filter(machine => machine.status === "Running" || machine.status === "Alarm").length;
  const stopped = machines.filter(machine => machine.status === "Stopped" || machine.status === "Offline").length;
  const stoppedCount = machines.filter(machine => machine.status === "Stopped").length;
  const offlineCount = machines.filter(machine => machine.status === "Offline").length;
  const openAlarmCount = alarms.filter(alarm => alarm.status !== "Resolved").length;
  const availability = machines.length ? Math.round(running / machines.length * 100) : 0;
  const snapshot = machines.find(machine => machine.id === "CAMS-01") || machines[0] || null;
  const staleAfterSeconds = Number(state.settings?.sampling?.staleAfterSeconds || 10);
  const snapshotAge = snapshot?.receivedAt ? Date.now() - new Date(snapshot.receivedAt).getTime() : Infinity;
  const snapshotFresh = snapshot && snapshot.status !== "Offline" && snapshot.gatewayStatus !== "Offline" && snapshotAge <= staleAfterSeconds * 1000;
  const readingState = snapshotFresh ? "live" : snapshot?.receivedAt ? "stale" : "offline";
  const snapshotHistory = snapshot ? historyFor(machineHistory, snapshot.id, "Pressure") : [];
  const snapshotChart = snapshotHistory.length ? chartSvg("Pressure", snapshotHistory) : `<div class="empty-state">${icon("pulse")}No pressure readings in the selected 1-hour window.</div>`;
  const compactMachines = machines.slice(0, 6).map((machine, index) => `<button class="machine-compact" data-machine="${machine.id}"><span class="machine-num">${String(index + 1).padStart(2, "0")}</span><span><strong>${machine.id}</strong><small>${machine.zone}</small></span>${statusPill(machine.status)}</button>`).join("");
  const alarmItems = alarms.slice(0, 4).map(alarm => `<div class="alarm-item"><span class="severity-icon ${alarm.severity.toLowerCase()}">${icon(alarm.severity === "Critical" ? "alarm" : "info")}</span><div><strong>${alarm.machine} · ${alarm.parameter}</strong><p>${alarm.message}</p></div><div class="alarm-time"><strong>${alarm.time}</strong><span>${alarm.date}</span></div></div>`).join("");
  const liveLabel = readingState === "live" ? `Live · ${relativeTime(state.lastTelemetryAt)}` : state.lastTelemetryAt ? `Last update · ${relativeTime(state.lastTelemetryAt)}` : "No telemetry received";
  const plantName = state.settings?.plant?.name || "Demo Spinning Plant";
  const snapshotTitle = readingState === "live" ? "Live operating snapshot" : snapshot?.receivedAt ? "Last known operating snapshot" : "Operating snapshot unavailable";
  const snapshotMeta = snapshot ? `${snapshot.id} · ${snapshot.name}${readingState === "live" ? "" : ` · ${relativeTime(snapshot.receivedAt)}`}` : "No connected machine";
  return `${pageHead("Plant overview", `Real-time compressor status across ${plantName}`, `<span class="updated-note ${readingState === "live" ? "live" : "not-live"}"><i class="pulse-dot"></i>${liveLabel}</span><button class="secondary-btn" id="refresh-dashboard">${icon("refresh")} Refresh</button>`)}
    <section class="kpi-grid">
      ${kpi("Total machines", machines.length, "Connected fleet", "machine", "teal")}
      ${kpi("Running", running, `${availability}% available`, "gauge", "green")}
      ${kpi("Stopped / offline", stopped, `${stoppedCount} stopped · ${offlineCount} offline`, "stop", "slate")}
      ${kpi("Open alarms", openAlarmCount, openAlarmCount ? `${openAlarmCount} unresolved or acknowledged` : "No open alarms", "alarm", "red")}
    </section>
    <section class="dashboard-grid">
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>${snapshotTitle}</h2><p>${snapshotMeta}</p></div>${snapshot ? `<button class="panel-link" data-machine="${snapshot.id}">View machine →</button>` : ""}</header>
        <div class="panel-body"><div class="sensor-row">${sensorMini("Flow", snapshot ? fmt(snapshot.flow) : "—", "L/min", readingState)}${sensorMini("Pressure", snapshot ? fmt(snapshot.pressure) : "—", "bar", readingState)}${sensorMini("Suction", snapshot ? fmt(snapshot.suction) : "—", "kPa", readingState)}</div>
          <div class="chart-toolbar"><div class="chart-legend ${readingState}"><i class="legend-line"></i>Pressure · ${snapshot?.id || "—"}<span>${readingState === "live" ? "Live history" : "Historical data"}</span></div><div class="segment-control"><button>15m</button><button class="active">1h</button><button>6h</button><button>24h</button></div></div><div class="chart ${readingState}">${snapshotChart}</div></div>
      </article>
      <article class="panel"><header class="panel-head"><div class="panel-title"><h2>Machine health</h2><p>Fleet status at a glance</p></div><button class="panel-link" data-page="machines">View all ${machines.length} →</button></header><div class="panel-body"><div class="machine-list">${compactMachines || `<div class="empty-state">${icon("machine")}No machines are registered.</div>`}</div></div></article>
    </section>
    <section class="panel"><header class="panel-head"><div class="panel-title"><h2>Recent alarms & events</h2><p>Latest operating exceptions from all machines</p></div><button class="panel-link" data-page="alarms">Open alarm centre →</button></header><div class="alarm-list">${alarmItems || `<div class="empty-state">${icon("check")}No alarm events recorded.</div>`}</div></section>`;
}
