#!/bin/zsh
set -e
cd "$(dirname "$0")/cams-api"
docker compose down
