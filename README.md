# CAMS Webpage Projects

This repository contains the review-stage user interface for **CAMS —
Compressed Air Monitoring System**.

The application is intentionally stored inside its own project directory. No
application source files are placed directly in the repository root.

## Repository structure

```text
cams-webpage/
├── .github/workflows/validate.yml
├── .gitignore
├── CONTRIBUTING.md
├── README.md
├── shared/
│   └── README.md
├── cams-api/
│   ├── README.md
│   ├── docker-compose.yml
│   ├── package.json
│   ├── scripts/
│   ├── src/
│   └── test/
└── cams-webpage/
    ├── README.md
    ├── app.js
    ├── index.html
    ├── package.json
    ├── scripts/
    │   └── validate.mjs
    └── styles.css
```

## Project

See [cams-webpage/README.md](cams-webpage/README.md) for objectives,
requirements, setup, testing, current status, limitations, and observations.

## Status

**In Progress** — E7-branded UI prototype is available for stakeholder review.
The real authentication API and MongoDB session layer are under development in
`cams-api/`; MQTT, telemetry, exports, and production deployment remain future
steps.

## Implementation roadmap

1. **Real authentication and API foundation — local implementation complete**
2. **MongoDB operational data models — planned**
3. **MQTT ingestion and live telemetry — planned**
4. **Dashboard API integration and alarm workflows — planned**
5. **PDF/Excel exports, deployment, and production verification — planned**

Step 1 is intentionally not described as production-complete until a managed
MongoDB deployment, HTTPS API host, secrets, real owner account, and production
domain/cookie configuration are verified.

## Contribution workflow

All changes must be made on a clearly named feature, fix, experiment, or
project branch. Test changes locally, open a pull request, and obtain review
before merging to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Confidentiality

This repository contains sanitized mock data only. Do not commit passwords,
tokens, certificates, personal information, customer data, or confidential
documents.
