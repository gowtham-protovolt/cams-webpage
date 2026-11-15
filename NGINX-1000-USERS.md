# CAMS Nginx deployment for 1,000 concurrent users

## Architecture

- Nginx accepts traffic on port `3100` and uses `least_conn` across four API replicas.
- The API replicas do not connect to MQTT or run background schedulers.
- One worker owns the MQTT subscription, stale-device monitor, and ticket scheduler.
- Redis Pub/Sub distributes telemetry, alarm, ticket, and device events to every API replica.
- MongoDB stores sessions, users, devices, telemetry, alarms, and tickets for all replicas.
- Mosquitto remains the only ESP32 MQTT endpoint; devices use TLS port `8883`.

## Start

```bash
cd cams-api
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3100/nginx-health
curl http://127.0.0.1:3100/api/health
```

Open `http://SERVER-IP:3100`.

## Verify balancing

```bash
docker compose logs -f nginx api-1 api-2 api-3 api-4 worker
```

Only `worker` should log the MQTT subscription. All API replicas should log Redis event-bus connectivity.

## Load test

Install k6 and run:

```bash
BASE_URL=http://SERVER-IP:3100 k6 run ../load-tests/k6-1000-users.js
```

For authenticated dashboard measurements, copy a temporary `cams_session` cookie from a dedicated load-test account:

```bash
BASE_URL=http://SERVER-IP:3100 CAMS_SESSION=TOKEN k6 run ../load-tests/k6-1000-users.js
```

The test ramps to 1,000 virtual users and requires less than 1% HTTP failures, p95 below 1 second, and p99 below 2 seconds. Passing depends on server CPU, RAM, storage, network, telemetry frequency, and production data volume; configuration alone is not a capacity guarantee.

## Production notes

- Use HTTPS at Nginx and set secure cookies before internet exposure.
- Raise the host open-file limit to at least 65,535.
- Monitor CPU, memory, MongoDB latency, Redis clients, Nginx active connections, and SSE reconnects.
- MongoDB is still a single instance. Use a replica set for high availability.
- Mosquitto is still a single broker. Add broker HA separately if required.
