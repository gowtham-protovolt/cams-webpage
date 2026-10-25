function locationName(value, fallback) {
  const name = String(value || "").trim();
  return name || fallback;
}

function statusKey(device) {
  const status = String(device.status || "offline").toLowerCase();
  if (["running", "stopped", "alarm"].includes(status)) return status;
  return "offline";
}

function countsFor(devices) {
  return devices.reduce((counts, device) => {
    counts.total += 1;
    counts[statusKey(device)] += 1;
    return counts;
  }, { total: 0, running: 0, stopped: 0, alarm: 0, offline: 0 });
}

function compareNames(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function deviceNumber(device, fallback) {
  const match = String(device.id || device.machineId || "").match(/(\d+)$/);
  return match ? Number(match[1]) : fallback + 1;
}

export function assignDeviceLocations(devices, clusterCount = 4, areasPerCluster = 3) {
  const maximumDeviceNumber = Math.max(clusterCount, ...devices.map(deviceNumber));
  const devicesPerCluster = Math.max(1, Math.ceil(maximumDeviceNumber / clusterCount));
  const devicesPerArea = Math.max(1, Math.ceil(devicesPerCluster / areasPerCluster));

  return devices.map((device, index) => {
    if (String(device.cluster || "").trim() && String(device.zone || "").trim()) return device;
    const ordinal = deviceNumber(device, index);
    const clusterIndex = Math.min(clusterCount - 1, Math.floor((ordinal - 1) / devicesPerCluster));
    const positionInCluster = (ordinal - 1) % devicesPerCluster;
    const areaIndex = Math.min(areasPerCluster - 1, Math.floor(positionInCluster / devicesPerArea));
    return {
      ...device,
      cluster: locationName(device.cluster, `Cluster ${String(clusterIndex + 1).padStart(2, "0")}`),
      zone: locationName(device.zone, `Area ${String(areaIndex + 1).padStart(2, "0")}`)
    };
  });
}

export function buildClusterHierarchy(inputDevices) {
  const devices = assignDeviceLocations(inputDevices);
  const clusters = new Map();

  for (const device of devices) {
    const clusterName = locationName(device.cluster, "Unassigned cluster");
    const areaName = locationName(device.zone, "Unassigned area");
    if (!clusters.has(clusterName)) clusters.set(clusterName, new Map());
    const areas = clusters.get(clusterName);
    if (!areas.has(areaName)) areas.set(areaName, []);
    areas.get(areaName).push(device);
  }

  return [...clusters.entries()]
    .sort(([left], [right]) => compareNames(left, right))
    .map(([name, areas]) => {
      const areaRows = [...areas.entries()]
        .sort(([left], [right]) => compareNames(left, right))
        .map(([areaName, areaDevices]) => {
          const sortedDevices = [...areaDevices].sort((left, right) => compareNames(left.id, right.id));
          return {
            name: areaName,
            counts: countsFor(sortedDevices),
            devices: sortedDevices
          };
        });
      const clusterDevices = areaRows.flatMap(area => area.devices);
      return {
        name,
        counts: countsFor(clusterDevices),
        areas: areaRows
      };
    });
}
