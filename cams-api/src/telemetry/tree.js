function sampleValue(reading) {
  return {
    flow: reading.metrics.flowLpm,
    pressure: reading.metrics.pressureBar,
    suction: reading.metrics.suctionKpa
  };
}

function secondPrecision(time) {
  return String(time || "").split("-").slice(0, 3).join("-");
}

export function buildTelemetryTree(readings) {
  const machines = {};
  for (const reading of readings) {
    const machineId = reading.hierarchy?.device || reading.series?.machineId;
    const date = reading.hierarchy?.date;
    const time = secondPrecision(reading.hierarchy?.time);
    if (!machineId || !date || !/^\d{2}-\d{2}-\d{2}$/.test(time)) continue;
    machines[machineId] ||= {};
    machines[machineId][date] ||= {};
    machines[machineId][date][time] = sampleValue(reading);
  }
  return { CAMS: machines };
}
