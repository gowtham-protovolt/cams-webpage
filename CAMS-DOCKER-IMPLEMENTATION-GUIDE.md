# CAMS Docker Setup and Implementation Guide

This guide explains how to create, verify, operate, and troubleshoot the local CAMS Docker environment. The maintained stack runs the CAMS API and dashboard, MongoDB, and an authenticated Mosquitto MQTT broker. Docker Compose creates the required images, containers, volumes, and network automatically; none of these resources should be created manually in Docker Desktop.

The local system is designed for this data flow:

```text
PLC
  -> RS485 Modbus RTU or CAN
  -> ESP32-S3
  -> Wi-Fi
  -> Mosquitto MQTT
  -> CAMS API
  -> MongoDB
  -> CAMS dashboard
```

The current ESP32 firmware implements RS485 Modbus RTU. CAN support requires a separate CAN or TWAI implementation and is not part of the current firmware.

## Local architecture

```text
ESP32-S3
  |
  | MQTT to <Mac LAN IP>:1884
  v
CAMS-Mosquitto
  |
  | Internal Docker address mqtt:1883
  v
CAMS API and dashboard
  |
  | Internal Docker address mongodb:27017
  v
CAMS-MongoDB
```

The browser connects to the CAMS application at `http://localhost:3100`. The dashboard is included in the CAMS application image, so it does not need a separate container.

## Docker terminology

- An image is the packaged software and filesystem used to create a container.
- A container is a running or stopped instance of an image.
- A volume stores persistent data outside the life of a container.
- A network allows containers to find and communicate with each other by service name.
- Docker Compose reads `docker-compose.yml` and creates the complete group of resources in the correct order.

## Resources created by Docker Compose

### Images

| Image | Source | Purpose |
| --- | --- | --- |
| `cams-api-app:latest` | Built from the local `Dockerfile` | Runs the CAMS API and dashboard |
| `mongo:7.0.43` | Downloaded from the container registry | Stores users, machines, sessions, and telemetry |
| `eclipse-mosquitto:2.0.22` | Downloaded from the container registry | Runs the MQTT broker and the one-time credential setup |

### Containers

| Container | Expected state | Purpose |
| --- | --- | --- |
| `CAMS` | Running and healthy | Serves the API and dashboard on host port `3100` |
| `CAMS-MongoDB` | Running and healthy | Runs MongoDB; host-only access uses port `27018` |
| `CAMS-Mosquitto` | Running | Accepts ESP32 MQTT connections on host port `1884` |
| `CAMS-MQTT-Config` | Exited with code 0 | Creates MQTT password hashes and access-control rules once |

`CAMS-MQTT-Config` is successful when its state is `Exited (0)`. It is not supposed to remain running.

### Volumes

| Volume | Stored data |
| --- | --- |
| `cams-api_cams-mongodb-data` | MongoDB database files |
| `cams-api_cams-mongodb-config` | MongoDB configuration database files |
| `cams-api_cams-mqtt-data` | Mosquitto persistence data |
| `cams-api_cams-mqtt-secrets` | MQTT password hashes and access-control data |
| `cams-api_cams-mqtt-log` | Mosquitto broker logs |

Removing containers does not remove these volumes unless the command explicitly includes `-v` or the volumes are separately deleted.

### Network

Docker Compose creates `cams-api_default`. The services use the following internal names:

- `mongodb:27017`
- `mqtt:1883`
- `app:3000`

These internal names are only used between containers. The ESP32 must use the Mac's LAN address and port `1884`, not the internal name `mqtt`.

## Host and container ports

| Service | Host address | Container address | User |
| --- | --- | --- | --- |
| CAMS dashboard and API | `localhost:3100` | `app:3000` | Browser and local tools |
| MongoDB | `127.0.0.1:27018` | `mongodb:27017` | Local database tools and CAMS API |
| MQTT | `<Mac LAN IP>:1884` | `mqtt:1883` | ESP32-S3 |

MongoDB is bound to the local computer only. MQTT is available on the LAN for commissioning, so the host firewall and network must be treated as part of the security boundary.

## Project files

The Docker stack is controlled by these files:

```text
cams-webpage/
├── .dockerignore
├── cams-webpage/                 Dashboard static files
└── cams-api/
    ├── .env                     Local secrets; never commit this file
    ├── .env.example             Safe configuration template
    ├── Dockerfile               CAMS application image definition
    ├── docker-compose.yml       Complete local stack definition
    ├── docker/
    │   └── mosquitto.conf       MQTT broker configuration
    ├── package.json
    ├── scripts/
    │   ├── create-admin.js
    │   └── seed-machines.js
    └── src/                     CAMS API, MQTT ingestion, and database code
```

Run all Compose commands from the `cams-webpage/cams-api` directory.

## Prerequisites

1. Install and start Docker Desktop.
2. Confirm that Docker Desktop uses the `desktop-linux` context.
3. Make sure ports `3100`, `27018`, and `1884` are not being used by another application.
4. Keep the ESP32 and Mac on the same trusted LAN during local commissioning.

Verify Docker before creating anything:

```bash
docker version
docker compose version
docker context show
```

The context should normally be:

```text
desktop-linux
```

## Prepare the environment file

Move to the Compose directory:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/cams-api"
```

If `.env` does not exist, create it from the example:

```bash
cp .env.example .env
```

Edit `.env` and replace every `replace-with-...` value. At minimum, configure the following values:

```env
NODE_ENV=development
PORT=3000
SERVE_WEB=false
WEB_ROOT=/app/public

MONGODB_URI=mongodb://127.0.0.1:27018
MONGODB_DB=cams

MQTT_ENABLED=true
MQTT_URL=mqtt://127.0.0.1:1884
MQTT_USERNAME=cams-backend
MQTT_PASSWORD=<unique-strong-backend-password>
MQTT_TOPIC=cams/+/+/telemetry
MQTT_CLIENT_ID=cams-api-local

MQTT_DEVICE_USERNAME=cams-esp32-001
MQTT_DEVICE_PASSWORD=<different-strong-device-password>

CAMS_ADMIN_EMAIL=<owner-email>
CAMS_ADMIN_USERNAME=<owner-username>
CAMS_ADMIN_DISPLAY_NAME=<owner-display-name>
CAMS_ADMIN_PASSWORD=<unique-strong-dashboard-password>

TELEMETRY_RETENTION_DAYS=7
```

The Compose file overrides the appropriate localhost addresses inside the containers. The `.env` file supplies secrets and configuration substitutions.

Use a different password for the CAMS backend, ESP32 device, and dashboard owner. Do not publish `.env`, put it in screenshots, or commit it to Git.

### Choose telemetry retention before first startup

The default telemetry retention is seven days. MongoDB creates the telemetry time-series collection with this expiration setting during the first application startup. Choose the required retention period before creating the database. Long-term or indefinite retention should be designed explicitly instead of relying on the seven-day default.

## Complete terminal command runbook

This section provides the terminal commands in execution order. Run one block at a time and confirm its result before continuing. Commands that delete stored data are grouped separately and marked as destructive.

### Open the project directory

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/cams-api"
pwd
```

Expected directory:

```text
/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/cams-api
```

### Start and verify Docker Desktop

Start Docker Desktop from Terminal if it is not already running:

```bash
open -a Docker
```

After Docker Desktop reports that the engine is ready, verify it:

```bash
docker version
docker compose version
docker context show
docker info
```

Select the Docker Desktop context if another context is active:

```bash
docker context use desktop-linux
```

### Check required files

```bash
test -f Dockerfile && echo "Dockerfile found"
test -f docker-compose.yml && echo "Compose file found"
test -f .env.example && echo "Environment template found"
test -f docker/mosquitto.conf && echo "Mosquitto configuration found"
```

List the main files:

```bash
find . -maxdepth 2 -type f | sort
```

### Create and protect the environment file

Create `.env` only when it does not already exist:

```bash
test -f .env || cp .env.example .env
chmod 600 .env
```

Generate candidate random secrets. Run the command once for each password and save each result in the correct `.env` field:

```bash
openssl rand -hex 32
```

Edit the configuration:

```bash
nano .env
```

In `nano`, press `Control+O`, then `Enter` to save. Press `Control+X` to exit.

Check that the required variable names exist without printing their secret values:

```bash
for cams_key in MQTT_USERNAME MQTT_PASSWORD MQTT_DEVICE_USERNAME MQTT_DEVICE_PASSWORD; do
  if grep -q "^${cams_key}=" .env; then
    echo "${cams_key}: present"
  else
    echo "${cams_key}: missing"
  fi
done
```

Do not run `cat .env` in a recorded terminal or share its contents.

### Check host ports before startup

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN
lsof -nP -iTCP:27018 -sTCP:LISTEN
lsof -nP -iTCP:1884 -sTCP:LISTEN
```

No output means the port is available. If a command returns a process, identify and resolve the conflict before starting CAMS.

### Validate Docker Compose

```bash
docker compose config --quiet
docker compose config --services
docker compose config --images
```

Expected services:

```text
mongodb
mqtt-config
mqtt
app
```

### Preview existing Docker resources

```bash
docker ps -a
docker images
docker volume ls
docker network ls
docker compose ls -a
```

### Build and start the full stack

```bash
docker compose up -d --build
```

Watch the initial service state:

```bash
docker compose ps -a
```

Show startup logs from every service:

```bash
docker compose logs --tail=200
```

### Verify images, containers, volumes, and network

```bash
docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}'
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker volume ls --format 'table {{.Driver}}\t{{.Name}}'
docker network ls --format 'table {{.ID}}\t{{.Name}}\t{{.Driver}}'
```

Inspect each CAMS container:

```bash
docker inspect CAMS
docker inspect CAMS-MongoDB
docker inspect CAMS-Mosquitto
docker inspect CAMS-MQTT-Config
```

Inspect persistent storage and the Compose network:

```bash
docker volume inspect cams-api_cams-mongodb-data
docker volume inspect cams-api_cams-mongodb-config
docker volume inspect cams-api_cams-mqtt-data
docker volume inspect cams-api_cams-mqtt-secrets
docker volume inspect cams-api_cams-mqtt-log
docker network inspect cams-api_default
```

### Check individual service logs

```bash
docker compose logs --tail=100 mongodb
docker compose logs --tail=100 mqtt-config
docker compose logs --tail=100 mqtt
docker compose logs --tail=100 app
```

Follow logs continuously:

```bash
docker compose logs -f app mqtt
```

Press `Control+C` to leave the log view without stopping the containers.

### Check service health

```bash
docker compose ps -a
curl -sS http://localhost:3100/api/health
```

Show only the HTTP response headers for the dashboard:

```bash
curl -I http://localhost:3100/
```

Open the dashboard from Terminal:

```bash
open http://localhost:3100
```

### Register CAMS machines

Create or update the initial `CAMS-01` machine record:

```bash
docker compose exec app npm run seed-machines
```

Confirm the machine record directly in MongoDB:

```bash
docker compose exec mongodb mongosh cams_local --quiet --eval \
  'db.machines.find({}, {_id:0, siteId:1, machineId:1, name:1, status:1}).toArray()'
```

### Create the dashboard owner safely

Enter account values interactively so the password is not saved as part of the command in shell history:

```bash
read -r "CAMS_OWNER_EMAIL?Owner email: "
read -r "CAMS_OWNER_USERNAME?Owner username: "
read -r "CAMS_OWNER_DISPLAY_NAME?Owner display name: "
read -rs "CAMS_OWNER_PASSWORD?Owner password: "
echo
```

Create or rotate the owner account:

```bash
docker compose exec \
  -e CAMS_ADMIN_EMAIL="$CAMS_OWNER_EMAIL" \
  -e CAMS_ADMIN_USERNAME="$CAMS_OWNER_USERNAME" \
  -e CAMS_ADMIN_DISPLAY_NAME="$CAMS_OWNER_DISPLAY_NAME" \
  -e CAMS_ADMIN_PASSWORD="$CAMS_OWNER_PASSWORD" \
  app npm run create-admin
```

Remove the temporary shell variables:

```bash
unset CAMS_OWNER_EMAIL CAMS_OWNER_USERNAME CAMS_OWNER_DISPLAY_NAME CAMS_OWNER_PASSWORD
```

Confirm that the owner exists without displaying the password hash:

```bash
docker compose exec mongodb mongosh cams_local --quiet --eval \
  'db.users.find({}, {_id:0, email:1, username:1, displayName:1, role:1, active:1}).toArray()'
```

### Publish a controlled MQTT test reading

```bash
docker compose run --rm --no-deps --entrypoint /bin/sh mqtt-config -c '
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
seq="$(date +%s)"
payload="{\"timestamp\":\"${now}\",\"sequence\":${seq},\"status\":\"running\",\"source\":\"esp32-s3-rs485\",\"metrics\":{\"flowLpm\":2.3,\"pressureBar\":6.5,\"suctionKpa\":5.1}}"
mosquitto_pub -h mqtt -p 1883 \
  -u "$MQTT_DEVICE_USERNAME" \
  -P "$MQTT_DEVICE_PASSWORD" \
  -t "cams/plant-01/CAMS-01/telemetry" \
  -q 1 \
  -m "$payload"
'
```

Check whether CAMS accepted or rejected the message:

```bash
docker compose logs --since=2m app
```

Check MQTT broker diagnostics:

```bash
docker compose logs --since=2m mqtt
```

### Inspect MongoDB telemetry

Open an interactive MongoDB shell:

```bash
docker compose exec mongodb mongosh cams_local
```

Useful commands inside `mongosh`:

```javascript
show collections
db.telemetry.countDocuments()
db.telemetry.find().sort({ observedAt: -1 }).limit(5).toArray()
db.latestTelemetry.find().toArray()
db.machines.find().toArray()
db.telemetryReceipts.countDocuments()
exit
```

Run the same checks without opening an interactive shell:

```bash
docker compose exec mongodb mongosh cams_local --quiet --eval \
  'db.telemetry.countDocuments()'
```

```bash
docker compose exec mongodb mongosh cams_local --quiet --eval \
  'db.telemetry.find({}, {_id:0, series:1, hierarchy:1, metrics:1, observedAt:1}).sort({observedAt:-1}).limit(5).toArray()'
```

```bash
docker compose exec mongodb mongosh cams_local --quiet --eval \
  'db.latestTelemetry.find({}, {_id:0, siteId:1, machineId:1, hierarchy:1, metrics:1, status:1}).toArray()'
```

### Open container shells

Open the CAMS application container:

```bash
docker compose exec app /bin/sh
```

Open the MongoDB container:

```bash
docker compose exec mongodb /bin/sh
```

Open the Mosquitto container:

```bash
docker compose exec mqtt /bin/sh
```

Type `exit` to leave a container shell.

### Monitor container processes and resource usage

```bash
docker compose top
docker stats CAMS CAMS-MongoDB CAMS-Mosquitto
```

Press `Control+C` to leave `docker stats`.

Display current filesystem usage:

```bash
docker system df
docker builder du
```

### Find the Mac LAN address for the ESP32

```bash
ipconfig getifaddr en0
```

If that command returns nothing, list the active interfaces:

```bash
ifconfig
```

Use the active private LAN address as `MQTT_HOST`. Do not use `localhost`, `127.0.0.1`, or `mqtt` in the ESP32 configuration.

### Prepare the ESP32 PlatformIO project

Move to the firmware directory:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/esp32-rs485-gateway"
```

Create the private firmware secrets file only if it does not exist:

```bash
test -f include/secrets.h || cp include/secrets.example.h include/secrets.h
```

Edit the Wi-Fi and MQTT values:

```bash
nano include/secrets.h
```

Review the PLC serial settings, register offsets, word order, and GPIO assignments:

```bash
nano include/config.h
```

Install PlatformIO project dependencies:

```bash
pio pkg install
```

Build the firmware:

```bash
pio run
```

List connected serial devices:

```bash
pio device list
```

Upload to the automatically detected ESP32-S3:

```bash
pio run --target upload
```

If automatic detection fails, specify the detected port:

```bash
pio run --target upload --upload-port /dev/cu.usbmodemXXXX
```

Open the serial monitor:

```bash
pio device monitor
```

Or specify the port and configured speed:

```bash
pio device monitor --port /dev/cu.usbmodemXXXX --baud 115200
```

Press `Control+C` to close the serial monitor.

### Watch the complete pipeline during ESP32 testing

Terminal 1, follow application and MQTT logs:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/cams-api"
docker compose logs -f app mqtt
```

Terminal 2, watch the latest stored telemetry every two seconds:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/cams-api"
while true; do
  clear
  docker compose exec -T mongodb mongosh cams_local --quiet --eval \
    'db.telemetry.find({}, {_id:0, series:1, hierarchy:1, metrics:1, observedAt:1}).sort({observedAt:-1}).limit(3).toArray()'
  sleep 2
done
```

Press `Control+C` to stop the watch loop.

Terminal 3, run the ESP32 serial monitor:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/esp32-rs485-gateway"
pio device monitor --baud 115200
```

### Stop, start, and restart services

Stop all services without deleting containers or data:

```bash
docker compose stop
```

Start the existing containers:

```bash
docker compose start
```

Restart every service:

```bash
docker compose restart
```

Restart only the CAMS application:

```bash
docker compose restart app
```

Restart only Mosquitto:

```bash
docker compose restart mqtt
```

### Rebuild after code changes

Rebuild and recreate the CAMS application while preserving volumes:

```bash
docker compose up -d --build --remove-orphans
```

Force a completely fresh application-image build:

```bash
docker compose build --no-cache app
docker compose up -d app
```

Check health and logs after rebuilding:

```bash
docker compose ps -a
curl -sS http://localhost:3100/api/health
docker compose logs --tail=100 app
```

### Back up MongoDB

Move to the directory where the backup file should be saved:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage/cams-api"
```

Create a timestamped compressed archive:

```bash
CAMS_BACKUP_FILE="cams-local-$(date +%Y%m%d-%H%M%S).archive.gz"
docker exec CAMS-MongoDB mongodump \
  --db cams_local \
  --archive \
  --gzip > "$CAMS_BACKUP_FILE"
ls -lh "$CAMS_BACKUP_FILE"
```

Remember the printed backup filename before opening a new Terminal window.

### Restore MongoDB from a backup

Set the exact backup filename:

```bash
CAMS_RESTORE_FILE="cams-local-YYYYMMDD-HHMMSS.archive.gz"
test -s "$CAMS_RESTORE_FILE" && echo "Backup file is ready"
```

Restore it into the running MongoDB container:

```bash
docker exec -i CAMS-MongoDB mongorestore \
  --archive \
  --gzip < "$CAMS_RESTORE_FILE"
```

Verify restored collections:

```bash
docker compose exec mongodb mongosh cams_local --quiet --eval \
  '({machines:db.machines.countDocuments(),telemetry:db.telemetry.countDocuments(),users:db.users.countDocuments()})'
```

### Remove containers while preserving data

```bash
docker compose down
```

The named volumes remain. Recreate the containers with:

```bash
docker compose up -d --build
```

### Permanently remove the CAMS Docker stack

The following command is destructive. It deletes the Compose containers, application image, network, MongoDB data, MQTT data, and generated MQTT credentials:

```bash
docker compose down -v --rmi all --remove-orphans
```

Verify what remains:

```bash
docker ps -a
docker images
docker volume ls
docker network ls
docker builder du
```

Docker's built-in `bridge`, `host`, and `none` networks should remain.

## Validate the Compose configuration

Validate the file and environment substitutions before creating resources:

```bash
docker compose config --quiet
docker compose config --services
```

The services should be:

```text
mongodb
mqtt-config
mqtt
app
```

If validation reports a missing MQTT variable, correct `.env` before continuing.

## Create the complete Docker stack

Run one command from `cams-webpage/cams-api`:

```bash
docker compose up -d --build
```

Docker Compose performs these actions automatically:

1. Pulls `mongo:7.0.43`.
2. Pulls `eclipse-mosquitto:2.0.22`.
3. Builds `cams-api-app:latest` from the local source.
4. Creates the MongoDB and MQTT volumes.
5. Creates the Compose network.
6. Starts MongoDB and waits for its health check.
7. Runs the MQTT configuration container to create users and permissions.
8. Starts Mosquitto after MQTT configuration succeeds.
9. Starts CAMS after MongoDB is healthy and Mosquitto is available.

Do not manually create images, volumes, networks, or containers before running this command.

## Verify the created resources

Check service state:

```bash
docker compose ps -a
```

Expected state:

```text
CAMS                 running and healthy
CAMS-MongoDB         running and healthy
CAMS-Mosquitto       running
CAMS-MQTT-Config     exited with code 0
```

List all created resources:

```bash
docker images
docker ps -a
docker volume ls
docker network ls
```

Check startup logs:

```bash
docker compose logs --tail=100 mongodb
docker compose logs --tail=100 mqtt-config
docker compose logs --tail=100 mqtt
docker compose logs --tail=100 app
```

Follow live CAMS logs:

```bash
docker compose logs -f app
```

Press `Ctrl+C` to stop following logs. This does not stop the container.

## Verify API and MQTT health

Check the API:

```bash
curl http://localhost:3100/api/health
```

The JSON response should report `status: "ok"` and show MQTT as enabled and connected.

Open the dashboard:

```text
http://localhost:3100
```

If the API is healthy but MQTT is disconnected, inspect both broker and application logs:

```bash
docker compose logs --tail=200 mqtt app
```

## Initialize the CAMS application

Register the initial machine:

```bash
docker compose exec app npm run seed-machines
```

This creates the initial machine record:

```text
Site: plant-01
Machine: CAMS-01
Name: Compressor 01
```

Create the dashboard owner account:

```bash
docker compose exec \
  -e CAMS_ADMIN_EMAIL="owner@example.com" \
  -e CAMS_ADMIN_USERNAME="plant-owner" \
  -e CAMS_ADMIN_DISPLAY_NAME="Plant Owner" \
  -e CAMS_ADMIN_PASSWORD="<strong-dashboard-password>" \
  app npm run create-admin
```

Replace all example account values. Avoid placing a real password in shared terminal logs or documentation. Remove `CAMS_ADMIN_PASSWORD` from `.env` after the account is successfully created if it is no longer required for account rotation.

## Test MQTT without the ESP32

The following one-time command publishes a valid test reading through the same authenticated device account used by the ESP32:

```bash
docker compose run --rm --no-deps --entrypoint /bin/sh mqtt-config -c '
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
seq="$(date +%s)"
payload="{\"timestamp\":\"${now}\",\"sequence\":${seq},\"status\":\"running\",\"source\":\"esp32-s3-rs485\",\"metrics\":{\"flowLpm\":2.3,\"pressureBar\":6.5,\"suctionKpa\":5.1}}"
mosquitto_pub -h mqtt -p 1883 \
  -u "$MQTT_DEVICE_USERNAME" \
  -P "$MQTT_DEVICE_PASSWORD" \
  -t "cams/plant-01/CAMS-01/telemetry" \
  -q 1 \
  -m "$payload"
'
```

Confirm that the API accepted the message:

```bash
docker compose logs --tail=100 app
```

Inspect the latest MongoDB telemetry record:

```bash
docker exec CAMS-MongoDB mongosh cams_local --quiet --eval \
  'db.telemetry.find().sort({observedAt:-1}).limit(1).toArray()'
```

If the configured database name is not `cams_local`, replace it in the command.

## Required MongoDB hierarchy

The dashboard and tree API must present telemetry in this logical structure:

```text
CAMS
├── CAMS-01
│   └── YYYY-MM-DD
│       └── HH-mm-ss
│           ├── flow
│           ├── pressure
│           └── suction
├── CAMS-02
└── CAMS-03
```

Example response:

```json
{
  "CAMS": {
    "CAMS-01": {
      "2026-04-06": {
        "00-05-30": {
          "flow": 2.3,
          "pressure": 18.5,
          "suction": 5.1
        }
      }
    }
  }
}
```

MongoDB should continue to store one time-series document per sample. This avoids an indefinitely growing nested document and supports efficient time-range queries. Each record carries the hierarchy information required to reconstruct the Firebase-style tree.

The value mapping is:

| ESP32 MQTT field | Tree field |
| --- | --- |
| `metrics.flowLpm` | `flow` |
| `metrics.pressureBar` | `pressure` |
| `metrics.suctionKpa` | `suction` |

Dates and times use `Asia/Kolkata`. Duplicate ESP32 sequence numbers are ignored. The strict three-value tree format is implemented in the stored hierarchy, tree API, and dashboard Live Data view.

## Configure the ESP32 MQTT connection

The ESP32 configuration must match the Docker environment:

```cpp
#define MQTT_HOST "<Mac-LAN-IP>"
#define MQTT_PORT 1884
#define MQTT_USERNAME "cams-esp32-001"
#define MQTT_PASSWORD "<same value as MQTT_DEVICE_PASSWORD>"
```

The telemetry and status topics are:

```text
cams/plant-01/CAMS-01/telemetry
cams/plant-01/CAMS-01/status
```

The ESP32 must not use any of these values as its broker address:

```text
localhost
127.0.0.1
mqtt
```

`localhost` and `127.0.0.1` refer to the ESP32 itself. `mqtt` is only resolvable inside the Docker network.

Find the Mac's Wi-Fi address with:

```bash
ipconfig getifaddr en0
```

If the Mac uses another network interface, obtain the active LAN address from macOS network settings.

## Expected runtime data flow

1. The PLC exposes process values through RS485 Modbus RTU or CAN.
2. The ESP32 reads the PLC values.
3. The ESP32 converts the raw values into flow, pressure, and suction engineering values.
4. The ESP32 connects to `<Mac LAN IP>:1884` using its device credentials.
5. The ESP32 publishes QoS 1 JSON to `cams/plant-01/CAMS-01/telemetry`.
6. Mosquitto authenticates the ESP32 and checks its topic permission.
7. CAMS subscribes to `cams/+/+/telemetry` through the internal Docker network.
8. CAMS validates the topic, timestamp, sequence, source, status, and metric ranges.
9. CAMS rejects duplicates and stores accepted readings in MongoDB.
10. The API sends live events to authenticated dashboard sessions.
11. The dashboard displays the current reading, history, charts, and the CAMS machine/date/time tree.

## Normal operation commands

Start previously created containers:

```bash
docker compose start
```

Stop containers without removing them:

```bash
docker compose stop
```

Restart all services:

```bash
docker compose restart
```

Restart one service:

```bash
docker compose restart app
```

Rebuild the application after source-code changes:

```bash
docker compose up -d --build --remove-orphans
```

Show service status:

```bash
docker compose ps -a
```

## Safe shutdown and removal

Stop and remove containers and the Compose network while preserving database and MQTT volumes:

```bash
docker compose down
```

Recreate the same stack later with:

```bash
docker compose up -d --build
```

Permanently delete the stack and all stored MongoDB and MQTT data:

```bash
docker compose down -v --rmi all --remove-orphans
```

The last command is destructive. Use it only when permanent deletion of telemetry, user accounts, sessions, MQTT credentials, images, containers, and volumes is intended.

## Backup before destructive operations

Create a compressed MongoDB archive:

```bash
docker exec CAMS-MongoDB mongodump \
  --db cams_local \
  --archive \
  --gzip > cams-local-backup.archive.gz
```

Confirm the backup file exists and is not empty before deleting a volume:

```bash
ls -lh cams-local-backup.archive.gz
```

Restore the archive into a running MongoDB container:

```bash
docker exec -i CAMS-MongoDB mongorestore \
  --archive \
  --gzip < cams-local-backup.archive.gz
```

## Troubleshooting

### Docker engine is unavailable

Symptoms include `Cannot connect to the Docker daemon` or a Docker socket error.

1. Start Docker Desktop.
2. Wait until the engine reports that it is running.
3. Run `docker context show` and `docker version` again.

### A port is already allocated

Check the three host ports:

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN
lsof -nP -iTCP:27018 -sTCP:LISTEN
lsof -nP -iTCP:1884 -sTCP:LISTEN
```

Stop the conflicting application or deliberately change the host-side port in `docker-compose.yml`.

### MQTT configuration exits

`CAMS-MQTT-Config` exiting with code 0 is normal. Any other exit code indicates a configuration error. Check:

```bash
docker compose logs mqtt-config
```

The most common cause is a missing MQTT variable in `.env`.

### Mosquitto does not start

Check both the one-time configuration and broker logs:

```bash
docker compose logs --tail=200 mqtt-config mqtt
```

Recreating only the MQTT configuration volume will also erase the generated password and ACL files, so do not remove it casually.

### CAMS cannot connect to MQTT

Check that the backend username and password in `.env` are correct, then inspect:

```bash
docker compose logs --tail=200 app mqtt
```

If credentials changed after the MQTT secret volume was created, recreate the MQTT configuration data deliberately so password hashes can be regenerated.

### ESP32 cannot connect to MQTT

Verify all of the following:

- The ESP32 and Mac are on the same network.
- The ESP32 uses the Mac's current LAN IP.
- The ESP32 uses port `1884`.
- The ESP32 username equals `MQTT_DEVICE_USERNAME`.
- The ESP32 password equals `MQTT_DEVICE_PASSWORD`.
- The topic is `cams/plant-01/CAMS-01/telemetry`.
- The macOS firewall permits the local MQTT connection.
- The broker container is running.

Follow broker logs while the ESP32 attempts to connect:

```bash
docker compose logs -f mqtt
```

### MQTT connects but no MongoDB record appears

Check the application logs for rejected telemetry:

```bash
docker compose logs --tail=200 app
```

The API rejects invalid JSON, stale timestamps, duplicate sequences, invalid status values, out-of-range measurements, incorrect topics, and payloads whose source is not `esp32-s3-rs485`.

### The dashboard shows no data

1. Confirm that the API health endpoint works.
2. Confirm that the owner can sign in.
3. Confirm that `CAMS-01` has been seeded.
4. Confirm that MongoDB contains a recent telemetry record.
5. Confirm that the browser's live event connection is active.
6. Inspect the browser console and application logs.

## Local commissioning security

- The local broker uses authenticated plaintext MQTT on a trusted LAN.
- Do not expose host port `1884` directly to the internet.
- Use unique credentials for every physical device.
- Use MQTT over TLS for production or any untrusted network.
- Store production secrets in a managed secret store, not `.env` committed to source control.
- Use HTTPS and secure cookies for a production dashboard.
- Keep MongoDB private; do not publish its port to an untrusted network.
- Back up telemetry before changing or deleting persistent volumes.

## Completion checklist

The local Docker environment is complete only when all of these checks pass:

- [ ] Docker Desktop is running.
- [ ] `.env` contains unique local secrets.
- [ ] Telemetry retention has been chosen.
- [ ] `docker compose config --quiet` succeeds.
- [ ] All three expected images exist.
- [ ] `CAMS`, `CAMS-MongoDB`, and `CAMS-Mosquitto` are running.
- [ ] `CAMS-MQTT-Config` exited with code 0.
- [ ] All five expected named volumes exist.
- [ ] The Compose network exists.
- [ ] The API health endpoint reports success.
- [ ] MQTT reports connected in the API health response.
- [ ] `CAMS-01` is registered.
- [ ] The owner account can sign in.
- [ ] A test MQTT message is accepted.
- [ ] The reading appears in MongoDB.
- [ ] The dashboard displays the reading.
- [ ] The tree view follows `CAMS -> machine -> date -> time -> flow/pressure/suction`.
- [ ] The ESP32 can connect using the Mac LAN IP and port `1884`.
- [ ] A real ESP32 reading reaches the dashboard.

## Authorized implementation sequence

When implementation is authorized, use this order:

1. Review `.env` without exposing its secret values.
2. Confirm the required telemetry retention period.
3. Apply and test the strict CAMS machine/date/time database-tree output.
4. Validate the Compose configuration.
5. Build and start the complete stack.
6. Verify containers, images, volumes, network, and health checks.
7. Seed `CAMS-01` and create the owner account.
8. Publish a controlled MQTT test message.
9. Verify MongoDB persistence and the required tree representation.
10. Verify dashboard login and live telemetry.
11. Configure and test the ESP32 on the commissioning LAN.
12. Record the final verified settings without recording passwords.
