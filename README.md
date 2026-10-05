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

**In Progress** — the E7-branded UI, real authentication API, MongoDB storage,
MQTT ingestion, protected telemetry APIs, and live dashboard integration are
implemented locally. Authenticated PDF/XLSX exports are also implemented;
production deployment remains the final infrastructure step.

## Implementation roadmap

1. **Real authentication and API foundation — local implementation complete**
2. **MongoDB operational data models — local implementation complete**
3. **MQTT ingestion and live telemetry API — local implementation complete**
4. **Dashboard API integration — local implementation complete**
5. **Alarm workflows — planned**
6. **PDF/Excel exports — local implementation complete**
7. **Deployment and production verification — requires production services**

Step 1 is intentionally not described as production-complete until a managed
MongoDB deployment, HTTPS API host, secrets, real owner account, and production
domain/cookie configuration are verified.

## Contribution workflow

All changes must be made on a clearly named feature, fix, experiment, or
project branch. Test changes locally, open a pull request, and obtain review
before merging to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Confidentiality

This repository contains application code and a synthetic local telemetry
simulator only. Do not commit passwords, tokens, certificates, personal
information, customer data, real plant readings, or confidential documents.
