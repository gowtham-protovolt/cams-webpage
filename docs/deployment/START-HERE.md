# CAMS Docker Complete Package

This is a private, Docker-ready CAMS package.

## Start

From Terminal:

```bash
cd cams-api
docker compose up -d --build
open http://localhost:3100
```

Or double-click `RUN-CAMS.command` on macOS.

## Stop

```bash
cd cams-api
docker compose down
```

The `cams-api/.env` file is included so this copy can use the existing private MQTT and owner configuration. Keep this package private.
