# CAMS API and Authentication

## Project name and objective

**CAMS API** is the backend service for the Compressed Air Monitoring System.
It provides real MongoDB-backed user accounts, password verification,
server-side sessions, login throttling, account lockout, CORS controls, MQTT
telemetry ingestion, time-series retention, protected telemetry APIs, and an
authenticated server-sent event stream. Passwords are hashed with Node.js
`scrypt`; raw passwords and session tokens are never stored in MongoDB.
It also creates authenticated machine-fleet and telemetry reports as standard
XLSX workbooks and paginated PDF documents.

## Responsible team member

**Owner:** CAMS Project Team

## Hardware requirements

No industrial hardware is required for authentication development. MQTT and
compressor hardware are intentionally outside this step.

## Software requirements

- Node.js 24 or newer
- Docker Desktop for the local MongoDB 7 and Mosquitto test services
- A production MongoDB deployment such as MongoDB Atlas for hosting

## Installation and setup

```bash
cd cams-api
cp .env.example .env
docker compose up -d mongodb mqtt
npm install
```

Replace the example admin values in the untracked `.env`, then create or rotate
the owner account:

```bash
npm run create-admin
npm run seed-machines
```

Remove `CAMS_ADMIN_PASSWORD` from `.env` after the account has been created.
Start the API with:

```bash
npm run dev
```

The local broker requires separate backend and device credentials. Its ACL lets
the device publish only `cams/plant-01/CAMS-01/telemetry` and the matching status
topic. Port 1884 is available to the protected LAN for ESP32 commissioning.
Production MQTT must use `mqtts://` or `wss://`, unique device identities, and
secrets stored outside the repository.

## Production container

The production image serves the API and static CAMS webpage from the same HTTPS
origin. This avoids third-party-cookie restrictions and keeps the `HttpOnly`
session cookie first-party.

Build from the repository root:

```bash
docker build -f cams-api/Dockerfile -t cams-webpage:latest .
```

Required production environment variables:

```text
NODE_ENV=production
SERVE_WEB=true
MONGODB_URI=<managed MongoDB TLS URI>
MONGODB_DB=cams
CORS_ORIGINS=https://<public CAMS host>
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
MQTT_ENABLED=true
MQTT_URL=mqtts://<secure broker>:8883
MQTT_USERNAME=<broker username>
MQTT_PASSWORD=<broker password>
MQTT_TOPIC=cams/+/+/telemetry
MQTT_CLIENT_ID=cams-api-production
```

Run `npm run create-admin` as a one-time service command with the admin values
stored in the hosting provider's secret manager, then remove
`CAMS_ADMIN_PASSWORD`. Never place production values in a Docker image, GitHub
variable visible to forks, repository file, or build log.

The container listens on `PORT`, exposes `/api/health`, and includes a Docker
health check. Production startup rejects insecure cookies, non-HTTPS origins,
localhost MongoDB, plaintext MQTT, and missing MQTT credentials.

Never commit `.env`, MongoDB credentials, passwords, session cookies, private
certificates, or customer information.

## Testing procedure

```bash
npm test
curl http://localhost:3000/api/health
```

For an integration test, submit a login request from an origin listed in
`CORS_ORIGINS`, confirm the `HttpOnly` session cookie is issued, call
`GET /api/auth/me`, then call `POST /api/auth/logout` and verify the session no
longer works.

## Current status

**In Progress**

- Password hashing and verification: implemented
- MongoDB users and expiring sessions: implemented
- Login rate limiting and account lockout: implemented
- Secure cookie configuration: implemented
- Frontend API integration: implemented and browser-tested locally
- MongoDB machine inventory and time-series telemetry: implemented locally
- MQTT QoS 1 ingestion and duplicate protection: implemented locally
- Authenticated Mosquitto device/backend identities and topic ACL: implemented locally
- PV1/PV2/PV3, ERR1/ERR2/ERR3, calibration, and quality storage: implemented locally
- Protected machine/history APIs and live SSE stream: implemented locally
- Authenticated XLSX and PDF export endpoints: implemented locally
- Same-origin production container and configuration validation: implemented
- Owner-only account listing, creation, and enable/disable controls: implemented
- Production MongoDB and API hosting: not configured
- Password-reset email and MFA: not implemented

## Known issues and limitations

- A real MongoDB connection and an owner account are required before login can
  work.
- Cross-site cookies require HTTPS, `COOKIE_SECURE=true`, and
  `COOKIE_SAME_SITE=none` in production.
- For reliable production cookies, host the frontend and API under the same
  registered domain or serve the frontend from the API host. Unrelated-domain
  third-party cookies can be blocked by browsers.
- Password-reset email, MFA, role editing, account deletion, and security audit
  events are not included yet.
- The bundled Mosquitto configuration is authenticated but plaintext; use it
  only on a protected commissioning LAN and never expose port 1884 to the internet.
- Production TLS certificates and managed broker hosting are not configured.
- The PLC slave ID, baud/parity, ESP32 pins, Modbus offset convention, and DINT
  word order must be confirmed on a supervised bench before plant use.
- The API must be deployed behind HTTPS and must not expose MongoDB publicly.
- Exports are limited to 5,000 telemetry readings per request to keep memory and
  response sizes bounded.

## Results and observations

The backend boundary now keeps credentials and database access off GitHub
Pages. Invalid credentials were rejected, a valid MongoDB user created an
`HttpOnly` session, the session survived a browser reload, and logout revoked
the server record. The official MongoDB driver uses a reusable connection pool,
and session records have a TTL index so expired sessions are removed
automatically. The ESP32 payload contract was verified during commissioning
development, then the synthetic publisher and its stored readings were removed.
The active dashboard now accepts authenticated device publications through
Mosquitto into MongoDB, protected history APIs, and the live SSE stream.
Owner-only API tests also verify account listing and creation,
password hashing, denial for non-owners, self-disable protection, and immediate
session revocation for disabled accounts. Full production verification remains incomplete until the API,
MongoDB, and broker are deployed with real secrets and device identities in
approved secure storage. Generated XLSX files passed ZIP/OOXML validation, and
the landscape PDF table was rendered and visually checked for clipping,
pagination, spacing, headers, and footers.
