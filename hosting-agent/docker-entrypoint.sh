#!/bin/sh
# Runs as root only long enough to make the mounted data directories writable
# by the node user, then drops privileges. A fresh named volume is root-owned
# until this runs.
set -eu
mkdir -p /var/lib/hms-agent /var/log/hms-agent /opt/stacks/sites
chown node:node /var/lib/hms-agent /var/log/hms-agent /opt/stacks/sites
chmod 700 /var/lib/hms-agent /var/log/hms-agent
exec runuser -u node -- node --experimental-strip-types /app/src/index.ts
