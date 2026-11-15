import test from "node:test";
import assert from "node:assert/strict";
import { assignDeviceLocations, buildClusterHierarchy } from "../src/telemetry/hierarchy.js";

test("buildClusterHierarchy groups, sorts and counts devices", () => {
  const devices = [
    { id: "CAMS-10", cluster: "Cluster 02", zone: "Area 01", status: "running" },
    { id: "CAMS-02", cluster: "Cluster 01", zone: "Area 02", status: "alarm" },
    { id: "CAMS-01", cluster: "Cluster 01", zone: "Area 01", status: "offline" },
    { id: "CAMS-03", cluster: "Cluster 01", zone: "Area 01", status: "stopped" }
  ];

  const hierarchy = buildClusterHierarchy(devices);
  assert.deepEqual(hierarchy.map(cluster => cluster.name), ["Cluster 01", "Cluster 02"]);
  assert.deepEqual(hierarchy[0].counts, { total: 3, running: 0, stopped: 1, alarm: 1, offline: 1 });
  assert.deepEqual(hierarchy[0].areas.map(area => area.name), ["Area 01", "Area 02"]);
  assert.deepEqual(hierarchy[0].areas[0].devices.map(device => device.id), ["CAMS-01", "CAMS-03"]);
  assert.deepEqual(hierarchy[1].counts, { total: 1, running: 1, stopped: 0, alarm: 0, offline: 0 });
});

test("assignDeviceLocations gives legacy devices the default four-cluster layout", () => {
  const devices = Array.from({ length: 18 }, (_, index) => ({ id: `CAMS-${String(index + 1).padStart(2, "0")}` }));
  const assigned = assignDeviceLocations(devices);
  assert.deepEqual([assigned[0].cluster, assigned[0].zone], ["C1", "Area 01"]);
  assert.deepEqual([assigned[4].cluster, assigned[4].zone], ["C1", "Area 03"]);
  assert.deepEqual([assigned[5].cluster, assigned[5].zone], ["C2", "Area 01"]);
  assert.deepEqual([assigned[17].cluster, assigned[17].zone], ["C4", "Area 02"]);
});
