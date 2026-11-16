# CAMS Architecture

## Runtime services

| Service | Responsibility | Public exposure |
|---|---|---|
| Nginx | Serves the UI and balances API/SSE traffic | `3100` |
| API-1…API-4 | Authentication, CRUD, queries and exports | Internal only |
| MQTT worker | Receives and validates ESP32 telemetry | Internal only |
| Redis | Distributes live events between API replicas | Internal only |
| MongoDB | Persists users, machines, telemetry, alarms and tickets | Loopback/admin only |
| Mosquitto | TLS MQTT broker for gateways | `8883` |

Nginx uses `least_conn`, sending a new request to the replica with the fewest
active connections. API replicas remain stateless where possible and share
MongoDB data, authenticated sessions and Redis events.

## Telemetry flow

1. ESP32-S3 reads PLC/sensor values through RS485 Modbus RTU.
2. Firmware publishes a device-restricted MQTT message over TLS.
3. The dedicated worker validates the topic, identity and payload.
4. Valid telemetry is stored in MongoDB and published through Redis.
5. API replicas deliver current state and Server-Sent Events to browsers.
6. The UI derives Online, last-seen and health information from real telemetry.

## Availability boundary

Four API replicas protect against an individual API process failure. MongoDB,
Redis, Mosquitto, Nginx and the physical host remain single instances in this
Compose deployment. Full high availability requires additional hosts, replicated
datastores, an external load balancer and monitored failover.
