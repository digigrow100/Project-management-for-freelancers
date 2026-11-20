#!/usr/bin/env python3
"""Create an additive network-only override. Never print resolved Compose secrets."""
import json,pathlib,shlex,subprocess,sys
name=sys.argv[1]
item=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
labels=(item.get('Config') or {}).get('Labels') or {}
service=labels.get('com.docker.compose.service');work=labels.get('com.docker.compose.project.working_dir')
files=(labels.get('com.docker.compose.project.config_files') or '').split(',')
if not service or not work or not all(files):sys.exit('This Traefik container is not linked to a Compose project. Preserve the hms-runtime attachment in its existing deployment method manually.')
args=['docker','compose','--project-directory',work]
for file in files:args+=['-f',file]
config=json.loads(subprocess.check_output(args+['config','--format','json'],cwd=work,text=True)) or {}
service_config=(config.get('services') or {}).get(service)
if not isinstance(service_config,dict):sys.exit('The Traefik service is missing from resolved Compose config. No override was written.')
if service_config.get('network_mode'):sys.exit('Traefik uses network_mode; review network attachment manually. No override was written.')
attached=service_config.get('networks')
# No explicit networks means Compose's implicit default, which must be retained.
if attached is None or attached=={} or attached==[]:attached={'default':{}}
if isinstance(attached,list):
 if not all(isinstance(network,str) and network for network in attached):sys.exit('Invalid Traefik networks. No override was written.')
 attached={network:{} for network in attached}
if not isinstance(attached,dict):sys.exit('Invalid Traefik networks. No override was written.')
networks=dict(attached)
networks['hms-runtime']={'ipv4_address':'172.31.240.2'}
output=pathlib.Path('/opt/stacks/hosting-agent/traefik-network.override.yml')
output.write_text(json.dumps({'services':{service:{'networks':networks}},'networks':{'hms-runtime':{'external':True}}},indent=2)+'\n');output.chmod(0o644)
print('Saved network-only override. Existing Traefik config and containers were not replaced.')
print('For future Traefik recreation, include this exact command:')
print(shlex.join(args+['-f',str(output),'up','-d',service]))
