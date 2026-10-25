#!/bin/zsh
set -e
cd "$(dirname "$0")/cams-api"
# 1) rebuild users/ACL from .env + docker/devices.txt (always, so new devices are picked up)
docker compose run --rm mqtt-config
# 2) start / update everything (rebuilds the website + API image)
docker compose up -d --build
# 3) make Mosquitto reload the password + ACL files
docker compose restart mqtt
docker compose ps
open http://localhost:3100
