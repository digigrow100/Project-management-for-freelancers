"""Synthetic cross-language test only. No external network or customer data."""
import json
import os
import sys
import time
from pathlib import Path
root=Path(os.environ['HMS_RECOVERY_SOURCE']).resolve()
sys.path[:0]=[str(root),str(root/'tests')]
from test_backup_catalog import CatalogTests
from modules.backups.portal_gateway import PortalRecovery
from modules.backups.restore_worker import RestoreWorker
fixture=CatalogTests();fixture.setUp();fixture.now=int(time.time());fixture.commit('a','p')
worker=RestoreWorker(fixture.catalog,stage=lambda spec:None,verify=lambda *args:True)
gateway=PortalRecovery(fixture.catalog,worker,key='k'*32,bindings={'a':{'site':'a','client':'ca'}})
try:
    for line in sys.stdin:
        item=json.loads(line)
        try: result={'status':200,'body':gateway.handle(item['body'].encode(),item['signature'])}
        except Exception: result={'status':403,'body':{'error':'denied'}}
        print(json.dumps(result),flush=True)
finally: fixture.tearDown()
