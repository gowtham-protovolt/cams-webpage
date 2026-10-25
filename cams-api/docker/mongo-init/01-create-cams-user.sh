#!/bin/sh
set -eu

mongosh --quiet "${MONGO_INITDB_DATABASE}" --eval "
  db.createRole({
    role: 'camsTelemetryRetention',
    privileges: [{
      resource: { db: '${MONGO_INITDB_DATABASE}', collection: 'telemetry' },
      actions: ['collMod']
    }],
    roles: []
  });
  db.createUser({
    user: '${MONGODB_APP_USERNAME}',
    pwd: '${MONGODB_APP_PASSWORD}',
    roles: [
      { role: 'readWrite', db: '${MONGO_INITDB_DATABASE}' },
      { role: 'camsTelemetryRetention', db: '${MONGO_INITDB_DATABASE}' }
    ]
  });
"
