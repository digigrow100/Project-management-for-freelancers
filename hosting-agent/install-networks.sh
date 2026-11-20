#!/bin/sh
# Run as root after reviewing preflight. No existing network/rule is flushed.
set -eu
command -v docker >/dev/null
command -v iptables >/dev/null
[ "$(cat /proc/sys/net/bridge/bridge-nf-call-iptables 2>/dev/null)" = 1 ] || { echo "Bridge netfilter must be enabled before enrollment." >&2; exit 1; }
TRAEFIK_CONTAINER=${1:?Pass the exact Traefik container name from preflight}
# Refuse collisions with another Docker subnet.
python3 - <<'PY'
import ipaddress,json,subprocess,sys
ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
items=json.loads(subprocess.check_output(['docker','network','inspect',*ids],text=True)) if ids else []
for desired,name in [('172.31.240.0/24','hms-runtime'),('172.31.241.0/24','hms-build')]:
 for n in items:
  # Docker's built-in host/none networks have Config=null; IPAM may also be null.
  for c in ((n.get('IPAM') or {}).get('Config') or []):
   subnet=(c or {}).get('Subnet')
   if subnet and ipaddress.ip_network(subnet).version==4 and ipaddress.ip_network(subnet).overlaps(ipaddress.ip_network(desired)) and not(n['Name']==name and subnet==desired):sys.exit('Network overlap detected. Choose and review different subnets before proceeding.')
PY
docker network inspect hms-runtime >/dev/null 2>&1 || docker network create --subnet 172.31.240.0/24 --opt com.docker.network.bridge.name=br-hms-runtime hms-runtime
docker network inspect hms-build >/dev/null 2>&1 || docker network create --subnet 172.31.241.0/24 --opt com.docker.network.bridge.name=br-hms-build hms-build
# Joining an existing container to an extra network does not restart Traefik.
if ! docker inspect --format '{{with index .NetworkSettings.Networks "hms-runtime"}}{{.IPAddress}}{{end}}' "$TRAEFIK_CONTAINER" | grep -q '^172\.31\.240\.2$'; then
 docker network connect --ip 172.31.240.2 hms-runtime "$TRAEFIK_CONTAINER"
fi
# Scope egress protections to the new website/build subnets. Existing stacks are untouched.
iptables -N HMS-WEBSITES 2>/dev/null || true
iptables -C DOCKER-USER -s 172.31.240.0/23 -j HMS-WEBSITES 2>/dev/null || iptables -I DOCKER-USER 1 -s 172.31.240.0/23 -j HMS-WEBSITES
iptables -C HMS-WEBSITES -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN 2>/dev/null || iptables -A HMS-WEBSITES -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
for trusted in 172.31.240.2 172.31.240.3; do
 iptables -C HMS-WEBSITES -s "$trusted" -j RETURN 2>/dev/null || iptables -A HMS-WEBSITES -s "$trusted" -j RETURN
done
for blocked in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 62.171.130.156/32 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4; do
 iptables -C HMS-WEBSITES -d "$blocked" -j REJECT 2>/dev/null || iptables -A HMS-WEBSITES -d "$blocked" -j REJECT
done
iptables -C HMS-WEBSITES -j RETURN 2>/dev/null || iptables -A HMS-WEBSITES -j RETURN
printf '%s\n' 'New isolated networks and scoped rules installed. Persist them with the existing firewall system; do not flush CrowdSec/UFW rules.'

# A root-owned, boot-bound readiness record. Contains no credentials.
install -d -m 755 /opt/stacks/hosting-agent/runtime-enrollment
python3 - <<'PYREADY'
import json,pathlib
p=pathlib.Path('/opt/stacks/hosting-agent/runtime-enrollment/ready.json')
p.write_text(json.dumps({'version':1,'bootId':pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'runtimeNetwork':'hms-runtime','buildNetwork':'hms-build'}))
p.chmod(0o644)
PYREADY
