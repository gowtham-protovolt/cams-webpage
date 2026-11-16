# CAMS API

The Express API is mounted under `/api`. Browser authentication uses a secure
session cookie. Owner-only and write operations are protected by role-aware
middleware. Exact request/response fields are defined in `cams-api/src/routes/`.

## Endpoint groups

| Group | Main methods and paths | Purpose |
|---|---|---|
| Health | `GET /api/health` | API and MQTT worker health |
| Authentication | `POST /api/login`, `GET /api/me`, `POST /api/logout` | Sessions and identity |
| Passwords | `POST /api/forgot-password`, `POST /api/reset-password`, `POST /api/change-password` | Password lifecycle |
| Machines | `GET/POST /api/machines`, `PATCH/DELETE /api/machines/:id` | Device inventory |
| Telemetry | `GET /api/machines/:id/telemetry`, `GET /api/telemetry/tree` | Historical/latest readings |
| Live stream | `GET /api/telemetry/stream` | Server-Sent Events |
| Dashboard | `GET /api/dashboard/summary`, `GET /api/clusters` | Overview data |
| Alarms | `GET /api/alarms`, `PATCH /api/alarms/:id` | Alarm review and resolution |
| Tickets | `GET /api/tickets`, `PATCH /api/tickets/:id`, comment/close actions | Maintenance workflow |
| Locations | `GET /api/locations`, CRUD location paths, assignment | Site hierarchy |
| Maintenance | `GET/POST/PATCH /api/maintenance` | Maintenance records |
| Users | `GET/POST/PATCH/DELETE /api/users` | Owner-managed accounts |
| Settings | `GET/PUT /api/settings` | Site configuration |
| Exports | `GET /api/exports/{machines|telemetry|alarms}/:format` | PDF/XLSX/CSV output |

## HTTP method meaning

- `GET` reads data without changing it.
- `POST` creates a resource or executes an action.
- `PUT` replaces or updates the complete configured value.
- `PATCH` changes selected fields.
- `DELETE` removes or soft-deletes a resource.

## Source layout

```text
cams-api/
├── src/app.js                 Express application and middleware
├── src/server.js              Service startup and worker mode
├── src/config.js              Environment configuration
├── src/db.js                  MongoDB connection
├── src/routes/                HTTP route definitions
├── src/auth/                  Password and session helpers
├── src/telemetry/             MQTT, storage, status and alarm logic
├── src/tickets/               Ticket service and scheduler
├── src/exports/               Document generation
├── scripts/                   Admin/seed commands
└── test/                      Unit and integration coverage
```

## Configuration and security

Copy `.env.example` to `.env` locally. Do not commit `.env`. Production requires
strong MongoDB/MQTT credentials, trusted TLS certificates, explicit CORS origins,
secure cookies and a reverse proxy. Rate limits are applied to sensitive auth
routes; Nginx adds connection and request controls for the public entry point.
