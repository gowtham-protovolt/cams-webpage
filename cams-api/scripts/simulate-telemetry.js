import "dotenv/config";
import mqtt from "mqtt";

const brokerUrl = process.env.MQTT_URL?.trim() || "mqtt://127.0.0.1:1884";
const once = process.env.SIMULATOR_ONCE === "true";
const cycleLimit = Number.parseInt(process.env.SIMULATOR_CYCLES || "0", 10);
const client = await mqtt.connectAsync(brokerUrl, {
  username: process.env.MQTT_DEVICE_USERNAME?.trim() || undefined,
  password: process.env.MQTT_DEVICE_PASSWORD || undefined,
  clientId: `cams-simulator-${process.pid}`,
  clean: true,
  protocolVersion: 4
});

const stopped = new Set([7, 10]);
const offline = new Set([4]);

async function publishCycle() {
  const timestamp = new Date();
  await Promise.all(Array.from({ length: 1 }, async (_value, index) => {
    const number = index + 1;
    const machineId = `CAMS-${String(number).padStart(2, "0")}`;
    const isStopped = stopped.has(number);
    const isOffline = offline.has(number);
    const status = number === 3 ? "alarm" : isOffline ? "offline" : isStopped ? "stopped" : "running";
    const wave = Math.sin(timestamp.getTime() / 20000 + number) * 0.18;
    const body = {
      timestamp: timestamp.toISOString(),
      sequence: timestamp.getTime() * 100 + number,
      status,
      metrics: {
        pressureBar: isStopped || isOffline ? 0.4 : Number((7.1 + wave).toFixed(2)),
        flowLpm: isStopped || isOffline ? 0 : Number((25 + wave * 4).toFixed(2)),
        suctionKpa: isStopped || isOffline ? 0 : Number((1.2 + wave).toFixed(3))
      },
      raw: {
        pv1: isStopped || isOffline ? 2000 : Math.round(2000.09 + (25 + wave * 4) * 3.95805),
        pv2: isStopped || isOffline ? 6015 : Math.round(6015.44 + (1.2 + wave) * 41.1673),
        pv3: isStopped || isOffline ? 1999 : Math.round(1999 + (7.1 + wave) * 5569 / 7)
      },
      errors: { flow: 0, suction: 0, pressure: 0 },
      quality: { flow: "good", suction: "good", pressure: number === 3 ? "uncertain" : "good", modbus: "good" },
      source: "simulator",
      calibrationVersion: "empirical-2026-10-06-v1"
    };
    await client.publishAsync(`cams/plant-01/${machineId}/telemetry`, JSON.stringify(body), { qos: 1 });
  }));
  console.log(`Published CAMS-01 telemetry at ${timestamp.toISOString()}.`);
}

await publishCycle();
if (once || cycleLimit === 1) {
  await client.endAsync();
} else {
  let completedCycles = 1;
  const timer = setInterval(async () => {
    try {
      await publishCycle();
      completedCycles += 1;
      if (cycleLimit > 0 && completedCycles >= cycleLimit) {
        clearInterval(timer);
        await client.endAsync();
      }
    } catch (error) {
      console.error(error.message);
    }
  }, 500);
  const shutdown = async () => {
    clearInterval(timer);
    await client.endAsync();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
