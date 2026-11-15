export function createDevicePreview() {
  const now = Date.now();
  const siteId = "plant-01";
  const clusters = [
    {
      id: "preview-cluster-spinning",
      name: "Spinning",
      areas: [
        { id: "preview-area-blow-room", name: "Blow Room" },
        { id: "preview-area-carding", name: "Carding" }
      ]
    },
    {
      id: "preview-cluster-weaving",
      name: "Weaving",
      areas: [{ id: "preview-area-loom-floor", name: "Loom Floor" }]
    }
  ];
  const definitions = [
    {
      id: "CAMS-DEMO-01",
      name: "Blow Room Compressor",
      cluster: clusters[0],
      area: clusters[0].areas[0],
      status: "Running",
      gatewayStatus: "Online",
      health: 98,
      pressureBar: 7.2,
      flowLpm: 1840,
      suctionKpa: 96
    },
    {
      id: "CAMS-DEMO-02",
      name: "Carding Line Compressor",
      cluster: clusters[0],
      area: clusters[0].areas[1],
      status: "Alarm",
      gatewayStatus: "Online",
      health: 72,
      pressureBar: 5.8,
      flowLpm: 1615,
      suctionKpa: 88
    },
    {
      id: "CAMS-DEMO-03",
      name: "Loom Floor Compressor",
      cluster: clusters[1],
      area: clusters[1].areas[0],
      status: "Offline",
      gatewayStatus: "Offline",
      health: 0,
      pressureBar: 0,
      flowLpm: 0,
      suctionKpa: 0
    }
  ];
  const machines = definitions.map((definition, index) => {
    const receivedAt = new Date(now - (index === 2 ? 45 : 1) * 60_000).toISOString();
    return {
      id: definition.id,
      siteId,
      name: definition.name,
      cluster: definition.cluster.name,
      clusterId: definition.cluster.id,
      zone: definition.area.name,
      areaId: definition.area.id,
      status: definition.status,
      lastSeenAt: receivedAt,
      telemetry: {
        machineId: definition.id,
        siteId,
        observedAt: receivedAt,
        receivedAt,
        sequence: index + 1,
        status: definition.status,
        metrics: {
          pressureBar: definition.pressureBar,
          flowLpm: definition.flowLpm,
          suctionKpa: definition.suctionKpa,
          temperatureC: 34 + index
        },
        monitoring: {
          status: definition.status,
          gatewayStatus: definition.gatewayStatus,
          plcStatus: definition.gatewayStatus,
          health: definition.health,
          communicationPercent: definition.gatewayStatus === "Online" ? 100 : 0,
          reasons: definition.status === "Alarm" ? ["Pressure below operating range"] : []
        },
        source: "device-preview"
      }
    };
  });
  const readings = definitions.flatMap((definition, machineIndex) =>
    Array.from({ length: 24 }, (_, readingIndex) => {
      const observedAt = new Date(now - readingIndex * 30 * 60_000).toISOString();
      const adjustment = machineIndex === 2 ? 0 : Math.sin(readingIndex / 3) * 0.15;
      return {
        machineId: definition.id,
        siteId,
        observedAt,
        receivedAt: observedAt,
        sequence: readingIndex + 1,
        status: definition.status,
        metrics: {
          pressureBar: Number(Math.max(0, definition.pressureBar + adjustment).toFixed(2)),
          flowLpm: Math.round(Math.max(0, definition.flowLpm + adjustment * 100)),
          suctionKpa: Number(Math.max(0, definition.suctionKpa + adjustment * 2).toFixed(1)),
          temperatureC: 34 + machineIndex
        },
        source: "device-preview"
      };
    })
  );

  return { clusters, machines, readings };
}

export function createDevicePreviewConfiguration(machine) {
  return {
    general: {
      deviceName: machine.name,
      machineId: machine.id,
      location: [machine.cluster, machine.zone].filter(Boolean).join(" · ") || "Unassigned"
    },
    sensors: {
      flow: { minimum: 22, maximum: 28 },
      pressure: { minimum: 6.8, maximum: 7.5 },
      suction: { minimum: 0.6, maximum: 1.8 },
      temperature: { minimum: 0, maximum: 80 }
    },
    plc: { protocol: "Modbus RTU", baudRate: 115200, serialFormat: "8E1", slaveId: 2 },
    data: { samplingInterval: 1, mqttTopic: `cams/${machine.siteId}/${machine.id}/telemetry` },
    alarms: { thresholdAlerts: true, highPressure: 7.5, lowPressure: 6.8, offlineDelaySeconds: 30 }
  };
}
