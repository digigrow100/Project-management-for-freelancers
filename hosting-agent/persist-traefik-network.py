#!/usr/bin/env python3
"""Create an additive network-only override. Never print resolved Compose secrets."""
import json,pathlib,shlex,subprocess,sys
name=sys.argv[1]
item=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
labels=item['Config'].get('Labels') or {}
service=labels.get('com.docker.compose.service');work=labels.get('com.docker.compose.project.working_dir')
files=(labels.get('com.docker.compose.project.config_files') or '').split(',')
if not service or not work or not all(files):sys.exit('This Traefik container is not linked to a Compose project. Preserve the hms-runtime attachment in its existing deployment method manually.')
args=['docker','compose','--project-directory',work]
for file in files:args+=['-f',file]
config=json.loads(subprocess.check_output(args+['config','--format','json'],cwd=work,text=True))
networks=dict(config['services'][service].get('networks') or {})
networks['hms-runtime']={'ipv4_address':'172.31.240.2'}
output=pathlib.Path('/opt/stacks/hosting-agent/traefik-network.override.yml')
output.write_text(json.dumps({'services':{service:{'networks':networks}},'networks':{'hms-runtime':{'external':True}}},indent=2)+'\n');output.chmod(0o644)
print('Saved network-only override. Existing Traefik config and containers were not replaced.')
print('For future Traefik recreation, include this exact command:')
print(shlex.join(args+['-f',str(output),'up','-d',service]))
