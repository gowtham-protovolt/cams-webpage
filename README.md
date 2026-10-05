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

**In Progress** — UI prototype ready for stakeholder review. Backend, database,
MQTT, authentication, and production deployment are not included.

## Contribution workflow

All changes must be made on a clearly named feature, fix, experiment, or
project branch. Test changes locally, open a pull request, and obtain review
before merging to `main`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Confidentiality

This repository contains sanitized mock data only. Do not commit passwords,
tokens, certificates, personal information, customer data, or confidential
documents.
