import mqtt from "mqtt";

const brokerUrl = process.env.MQTT_URL?.trim() || "mqtt://127.0.0.1:1884";
const once = process.env.SIMULATOR_ONCE === "true";
const client = await mqtt.connectAsync(brokerUrl, {
  username: process.env.MQTT_USERNAME?.trim() || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clientId: `cams-simulator-${process.pid}`,
  clean: true,
  protocolVersion: 4
});

const stopped = new Set([7, 10]);
const offline = new Set([4]);

async function publishCycle() {
  const timestamp = new Date();
  await Promise.all(Array.from({ length: 13 }, async (_value, index) => {
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
        suctionBar: isStopped || isOffline ? -0.1 : Number((-0.8 + wave / 3).toFixed(2)),
        temperatureC: isOffline ? 30 : Number(((number === 3 ? 45.8 : 39) + wave * 3).toFixed(2))
      }
    };
    await client.publishAsync(`cams/demo/${machineId}/telemetry`, JSON.stringify(body), { qos: 1 });
  }));
  console.log(`Published telemetry for 13 machines at ${timestamp.toISOString()}.`);
}

await publishCycle();
if (once) {
  await client.endAsync();
} else {
  const timer = setInterval(() => publishCycle().catch(error => console.error(error.message)), 1000);
  const shutdown = async () => {
    clearInterval(timer);
    await client.endAsync();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
