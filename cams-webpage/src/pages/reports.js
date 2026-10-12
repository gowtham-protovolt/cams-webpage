import { icon, pageHead } from "./shared.js";

export function renderReportsPage({ state, machines }) {
  const options = machines.map(machine => `<option value="${machine.id}" ${machine.id === state.reportMachine ? "selected" : ""}>${machine.id} · ${machine.name}</option>`).join("");
  const ranges = ["1h", "6h", "24h", "7d"].map(range => `<button class="${state.reportRange === range ? "active" : ""}" data-report-range="${range}">${range}</button>`).join("");
  return `${pageHead("Reports & exports", "Create protected files from stored CAMS data")}
    <section class="trend-controls"><div class="control-group grow"><label>Machine</label><div class="select-wrap"><select id="report-machine">${options}</select>${icon("chevronDown")}</div></div><div class="control-group grow"><label>Telemetry range</label><div class="range-pills">${ranges}</div></div></section>
    <section class="placeholder-layout">
      <article class="panel phase-card"><span class="phase-tag">LIVE EXPORT</span><h2>Machine telemetry</h2><p>Download up to 5,000 stored readings for ${state.reportMachine} over the selected period.</p><div class="page-actions"><button class="primary-btn" id="report-telemetry-xlsx">${icon("download")} Download Excel</button><button class="secondary-btn" id="report-telemetry-pdf">${icon("report")} Download PDF</button></div></article>
      <article class="panel phase-card"><span class="phase-tag">LIVE EXPORT</span><h2>Machine fleet</h2><p>Download the registered machine inventory with each compressor's latest telemetry.</p><div class="page-actions"><button class="primary-btn" id="report-fleet-xlsx">${icon("download")} Download Excel</button><button class="secondary-btn" id="report-fleet-pdf">${icon("report")} Download PDF</button></div></article>
    </section>`;
}
