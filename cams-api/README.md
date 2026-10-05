# CAMS API and Authentication

## Project name and objective

**CAMS API** is the backend service for the Compressed Air Monitoring System.
Step 1 provides real MongoDB-backed user accounts, password verification,
server-side sessions, login throttling, account lockout, CORS controls, and a
health endpoint. Passwords are hashed with Node.js `scrypt`; raw passwords and
session tokens are never stored in MongoDB.

## Responsible team member

**Owner:** CAMS Project Team

## Hardware requirements

No industrial hardware is required for authentication development. MQTT and
compressor hardware are intentionally outside this step.

## Software requirements

- Node.js 24 or newer
- Docker Desktop for the local MongoDB 7 test service
- A production MongoDB deployment such as MongoDB Atlas for hosting

## Installation and setup

```bash
cd cams-api
cp .env.example .env
docker compose up -d mongodb
npm install
```

Replace the example admin values in the untracked `.env`, then create or rotate
the owner account:

```bash
npm run create-admin
```

Remove `CAMS_ADMIN_PASSWORD` from `.env` after the account has been created.
Start the API with:

```bash
npm run dev
```

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
- Password-reset email, MFA, user administration, and security audit events are
  not included yet.
- The API must be deployed behind HTTPS and must not expose MongoDB publicly.

## Results and observations

The backend boundary now keeps credentials and database access off GitHub
Pages. Invalid credentials were rejected, a valid MongoDB user created an
`HttpOnly` session, the session survived a browser reload, and logout revoked
the server record. The official MongoDB driver uses a reusable connection pool,
and session records have a TTL index so expired sessions are removed
automatically. Full production verification remains incomplete until the API
and MongoDB are deployed with real secrets in approved secure storage.
