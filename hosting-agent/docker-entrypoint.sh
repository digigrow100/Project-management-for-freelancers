#!/bin/sh
# Volume ownership is prepared explicitly on the host. Never chown existing sites.
set -eu
exec node --experimental-strip-types /app/src/index.ts
