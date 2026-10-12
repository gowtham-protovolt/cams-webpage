#!/bin/sh
set -eu

mongosh --quiet "${MONGO_INITDB_DATABASE}" --eval '
  db.createUser({
    user: process.env.MONGODB_APP_USERNAME,
    pwd: process.env.MONGODB_APP_PASSWORD,
    roles: [{ role: "readWrite", db: process.env.MONGO_INITDB_DATABASE }]
  });
'
