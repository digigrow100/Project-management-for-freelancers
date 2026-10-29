"""Test-only: real responses from the automation repo's backup chain (synthetic data), for the portal to validate."""
import json
import sys
import time
sys.path.insert(0, sys.argv[1] + '/tests')
sys.path.insert(0, sys.argv[1] + '/scripts/signer')
import test_backup_service as chain


class Fixture(chain.PortalControls):
    START = int(time.time()) - 200 * 86400

    def runTest(self):
        pass


case = Fixture()
case.setUp()
out = {}
out['policy'] = case.call({'action': 'policy'})
plan = case.call({'action': 'plan_scope', 'scope': {'type': 'client', 'client': 'client-a'}})
out['plan'] = plan
case.call({'action': 'stage', 'job': plan['job'], 'digest': plan['digest']})
signer = chain.hms_signer.Signer(case.owner_key, lambda text, code: True, clock=lambda: case.now)
approval = signer.sign('restore-approval', {'job': plan['job'], 'digest': plan['digest'], 'plan': plan['plan'], 'seconds': 300})['approval']
out['approval'] = approval
out['apply'] = case.call({'action': 'apply', 'job': plan['job'], 'approval': approval})
case.tearDown()
print(json.dumps(out))
