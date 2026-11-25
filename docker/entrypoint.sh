#!/bin/sh
# Starts as root only to make the data volume writable, then drops to the unprivileged "node" user.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
    chown -R node:node "$DATA_DIR"
  fi
  exec su-exec node "$@"
fi
exec "$@"
