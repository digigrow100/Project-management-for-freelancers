#!/usr/bin/env python3
"""Read-only VPS inventory. Prints names/settings, never credentials or full environment."""
import json,subprocess,sys

def run(*args):return subprocess.check_output(args,text=True)
containers=[json.loads(line) for line in run('docker','ps','--format','{{json .}}').splitlines()]
traefik=[c for c in containers if 'traefik' in c.get('Image','').lower()]
if len(traefik)!=1:sys.exit('Expected one Traefik container; inspect manually before installation.')
item=json.loads(run('docker','inspect',traefik[0]['ID']))[0]
args=item.get('Config',{}).get('Cmd',[]) or []
labels=item.get('Config',{}).get('Labels',{}) or {}
safe={'traefik_container':item['Name'].lstrip('/'),'image':item['Config']['Image'],'compose_service':labels.get('com.docker.compose.service'),'compose_directory':labels.get('com.docker.compose.project.working_dir'),'networks':list(item['NetworkSettings']['Networks']),'traefik_public_settings':[a for a in args if a.startswith('--entrypoints.') or (a.startswith('--certificatesresolvers.') and '.acme.' not in a) or a.startswith('--providers.docker.')], 'resolver_names':sorted({a.split('.')[1] for a in args if a.startswith('--certificatesresolvers.')})}
print(json.dumps(safe,indent=2))
print('Memory:',run('free','-h').strip())
print('Disk:',run('df','-h','/opt/stacks').strip())
print('Docker networks:',run('docker','network','ls','--format','{{.Name}}').strip())
print('Check resolver/entrypoint names against the static Traefik config if they are not CLI flags. Do not paste config secrets into chat.')
