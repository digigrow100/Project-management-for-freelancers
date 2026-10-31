#!/usr/bin/env python3
"""HouseMySite local signing companion. Runs on the OWNER'S OWN computer, never on the VPS or any server.

The owner's encrypted Ed25519 private key stays in a file on this computer and is decrypted in this process only. The portal page
(in the owner's browser) asks this program on 127.0.0.1 to sign one specific request. This program

  * re-derives what it is asked to sign from the request itself (the job digest must equal the SHA-256 of the full intent shown
    to you; policy bounds are re-checked; the lifetime, nonce and issue time are chosen here, not by the portal),
  * shows you the request in THIS terminal, and signs only after you type the confirmation code printed with it,
  * answers only the exact portal origin, only on loopback, only with the pairing token printed at start-up,
  * signs nothing else: the only two message types are a plan-bound source approval and an auto-deploy policy.

Without a browser (or if the browser blocks loopback requests) use:   hms_signer.py sign-file request.json > approval.json

Dependencies: Python 3.9+ and `cryptography`.  Nothing is sent anywhere by this program.
"""
import argparse
import base64
import getpass
import hashlib
import http.server
import json
import os
import re
import secrets
import sys
import threading
import time
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

VERSION = 1
APPROVAL_PREFIX = b'hms-source-approval-v2\n'
POLICY_PREFIX = b'hms-autodeploy-policy-v1\n'
MANAGED_PREFIX = b'hms-managed-approval-v1\n'
RESTORE_PREFIX = b'hms-restore-approval-v1\n'
MANAGED_OPERATIONS = ('create', 'password', 'quota', 'enable', 'disable', 'delete', 'domain_create', 'enroll', 'limits', 'controls', 'alias', 'alias_delete', 'forward', 'autoreply', 'backup', 'restore', 'migrate')
MAX_BODY = 262144
PLANNED = ('publish', 'rollback', 'export')
OPERATIONS = ('deploy', 'export', 'publish', 'rollback', 'recover')
IDENT = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}')
HEX64 = re.compile(r'[a-f0-9]{64}')
POLICY_RUNTIMES = ('static', 'php', 'nextjs')
MAX_POLICY_LIFETIME = 30 * 86400


class Refused(ValueError):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def fingerprint(public):
    return hashlib.sha256(public.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()


def load_key(path, passphrase=None):
    with open(path, 'rb') as stream:
        data = stream.read()
    try:
        return serialization.load_pem_private_key(data, password=None)
    except TypeError:
        if passphrase is None:
            passphrase = getpass.getpass('Owner key passphrase (stays on this computer): ')
        return serialization.load_pem_private_key(data, password=passphrase.encode())


def code_for(*parts):
    return hashlib.sha256('|'.join(parts).encode()).hexdigest()[:6]


# --- what each request means, derived from the request itself ------------------------------------------------------------
def describe_approval(payload):
    if not isinstance(payload, dict) or set(payload) - {'job', 'digest', 'intent', 'plan', 'seconds'}:
        raise Refused('Unexpected fields in the approval request')
    job, digest, intent, plan = payload.get('job'), payload.get('digest'), payload.get('intent'), payload.get('plan')
    if not isinstance(job, str) or not IDENT.fullmatch(job) or not isinstance(digest, str) or not HEX64.fullmatch(digest) or not isinstance(intent, dict):
        raise Refused('Malformed approval request')
    if hashlib.sha256(canonical(intent)).hexdigest() != digest:
        raise Refused('The request details shown do not match the digest being signed')
    operation = intent.get('operation')
    if operation not in OPERATIONS or 'auto' in intent:
        raise Refused('This operation cannot be signed here')
    plan_digest = None
    if operation in PLANNED:
        if not isinstance(plan, dict) or not isinstance(plan.get('digest'), str) or not HEX64.fullmatch(plan['digest']):
            raise Refused('A reviewed plan is required for this operation')
        plan_digest = plan['digest']
    elif plan is not None:
        raise Refused('This operation has no plan')
    seconds = payload.get('seconds', 300)
    if type(seconds) is not int or not 60 <= seconds <= 600:
        raise Refused('Lifetime must be between 60 and 600 seconds')
    lines = ['Approve %s' % operation.upper(), '  website (service): %s' % intent.get('service'), '  client: %s' % intent.get('client'), '  domain: %s' % intent.get('domain', '-'),
             '  request: %s' % job, '  request digest (covers everything below and above): %s' % digest]
    for key in ('tree', 'runtime', 'build', 'artifact_sha256', 'live_tree', 'secrets_version', 'subject', 'repository_id', 'full_name', 'branch'):
        if key in intent and intent[key] is not None:
            lines.append('  %s: %s' % (key.replace('_', ' '), intent[key]))
    if plan_digest:
        lines.append('  reviewed plan digest: %s' % plan_digest)
        counts = (plan.get('counts') or {}) if isinstance(plan.get('counts'), dict) else {}
        if counts:
            lines.append('  plan summary REPORTED BY THE PORTAL (not verifiable here): ' + ', '.join('%s=%s' % (k, v) for k, v in sorted(counts.items())[:12]))
    lines.append('  valid for %d seconds, single use' % seconds)
    return job, digest, plan_digest, seconds, '\n'.join(lines)


def describe_managed(payload):
    """A mailbox, mail domain or database change. The digest is recomputed here from the whole request, so nothing shown can differ from what is signed."""
    if not isinstance(payload, dict) or set(payload) - {'job', 'digest', 'intent', 'target', 'seconds'}:
        raise Refused('Unexpected fields in the approval request')
    job, digest, intent = payload.get('job'), payload.get('digest'), payload.get('intent')
    if not isinstance(job, str) or not re.fullmatch('[a-f0-9]{32}', job) or not isinstance(digest, str) or not HEX64.fullmatch(digest) or not isinstance(intent, dict):
        raise Refused('Malformed approval request')
    if set(intent) != {'actor', 'service', 'kind', 'request_key', 'command'} or not isinstance(intent['command'], dict):
        raise Refused('Unexpected request layout')
    if hashlib.sha256(canonical(intent)).hexdigest() != digest:
        raise Refused('The request details shown do not match the digest being signed')
    command, kind = intent['command'], intent['kind']
    if kind not in ('email', 'database') or command.get('operation') not in MANAGED_OPERATIONS:
        raise Refused('This operation cannot be signed here')
    if kind == 'database' and command['operation'] not in ('create','password','quota','enable','disable','delete'):
        raise Refused('Mail-only operation')
    seconds = payload.get('seconds', 300)
    if type(seconds) is not int or not 60 <= seconds <= 600:
        raise Refused('Lifetime must be between 60 and 600 seconds')
    target = payload.get('target')
    lines = ['Approve %s %s change' % (kind.upper(), command['operation'].upper()), '  website (service): %s   requested by: %s' % (intent['service'], intent['actor']), '  request: %s' % job,
             '  request digest (covers everything below and above): %s' % digest]
    for key in ('domain', 'target', 'alias_target', 'alias', 'name', 'resource', 'quota_mb', 'limits', 'sending', 'receiving', 'login', 'destination', 'keep_copy', 'enabled', 'subject', 'text', 'point', 'source_host', 'source_user', 'confirm'):
        if key in command:
            lines.append('  %s: %s' % (key.replace('_', ' '), json.dumps(command[key], ensure_ascii=True)))
    if target:
        lines.append('  account name REPORTED BY THE SERVER (not part of the signature): %s' % str(target)[:120])
    if 'sealed' in command:
        lines.append('  a new password sealed to the server (hidden from everyone, including you)')
    lines.append('  valid for %d seconds, single use' % seconds)
    return job, digest, seconds, '\n'.join(lines)


def describe_restore(payload, now):
    """Replacing live data from a restore point. The digest is recomputed from the whole plan, so what is shown is what is signed."""
    if not isinstance(payload, dict) or set(payload) - {'job', 'digest', 'plan', 'seconds'}:
        raise Refused('Unexpected fields in the restore approval request')
    job, digest, plan = payload.get('job'), payload.get('digest'), payload.get('plan')
    if not isinstance(job, str) or not re.fullmatch('[a-f0-9]{32}', job) or not isinstance(digest, str) or not HEX64.fullmatch(digest) or not isinstance(plan, dict):
        raise Refused('Malformed restore approval request')
    if set(plan) != {'schema', 'sites', 'expires'} or plan['schema'] != 1 or not isinstance(plan['sites'], list) or not 1 <= len(plan['sites']) <= 100:
        raise Refused('Unexpected plan layout')
    if hashlib.sha256(canonical(plan)).hexdigest() != digest:
        raise Refused('The plan shown does not match the digest being signed')
    if type(plan['expires']) is not int or plan['expires'] <= now:
        raise Refused('The plan has expired; ask for a new one')
    seconds = payload.get('seconds', 300)
    if type(seconds) is not int or not 60 <= seconds <= 600:
        raise Refused('Lifetime must be between 60 and 600 seconds')
    lines = ['Approve RESTORE onto the LIVE websites below', '  request: %s' % job, '  plan digest (covers everything below): %s' % digest,
             '  a safety copy of what is replaced is taken first; a failed restore is rolled back for that website']
    for item in plan['sites']:
        if not isinstance(item, dict) or set(item) != {'site', 'tenant', 'point', 'captured', 'revision', 'resources_digest', 'components'}:
            raise Refused('Unexpected site entry in the plan')
        when = time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(item['captured']))
        lines.append('  website %s (client %s): restore point %s from %s -> replaces %s' % (item['site'], item['tenant'], item['point'], when, ', '.join(item['components'])))
    lines.append('  valid for %d seconds, single use' % seconds)
    return job, digest, seconds, '\n'.join(lines)


def describe_policy(payload, now):
    needed = {'service', 'client', 'actor', 'repository_id', 'branch', 'allow_activation', 'runtimes', 'max_per_day', 'days'}
    if not isinstance(payload, dict) or set(payload) != needed:
        raise Refused('Exact policy proposal required')
    for key in ('service', 'client', 'actor'):
        if not isinstance(payload[key], str) or not IDENT.fullmatch(payload[key]):
            raise Refused('Invalid ' + key)
    if (type(payload['repository_id']) is not int or payload['repository_id'] <= 0 or type(payload['allow_activation']) is not bool or not isinstance(payload['branch'], str)
            or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/-]{0,199}', payload['branch']) or '..' in payload['branch'] or payload['branch'].endswith(('/', '.', '.lock')) or '//' in payload['branch']):
        raise Refused('Invalid repository or branch')
    runtimes = payload['runtimes']
    if (not isinstance(runtimes, list) or not runtimes or len(set(runtimes)) != len(runtimes) or not set(runtimes) <= set(POLICY_RUNTIMES) or type(payload['max_per_day']) is not int
            or not 1 <= payload['max_per_day'] <= 10 or type(payload['days']) is not int or not 1 <= payload['days'] <= 30):
        raise Refused('Policy bounds are outside the allowed range')
    document = {'schema': 1, 'id': secrets.token_hex(16), 'service': payload['service'], 'client': payload['client'], 'actor': payload['actor'], 'repository_id': payload['repository_id'],
                'branch': payload['branch'], 'allow_activation': payload['allow_activation'], 'runtimes': sorted(runtimes), 'max_per_day': payload['max_per_day'], 'issued': now,
                'expires': now + payload['days'] * 86400}
    lines = ['Approve AUTOMATIC DEPLOYMENT POLICY', '  website (service): %s   client: %s' % (document['service'], document['client']), '  repository id: %d   branch: %s' % (document['repository_id'], document['branch']),
             '  every push to that branch will be staged' + (' and then ACTIVATED on the live website' if document['allow_activation'] else ' only (activation stays manual)'),
             '  runtimes allowed: %s   at most %d activations per day' % (', '.join(document['runtimes']), document['max_per_day']),
             '  expires in %d days; stops on failure, uncertainty or revoked access; never rolls back, exports or recovers' % payload['days']]
    return document, '\n'.join(lines)


class Signer:
    def __init__(self, key, confirm, clock=time.time):
        self.key, self.confirm, self.clock = key, confirm, clock
        self.fingerprint = fingerprint(key.public_key())
        self.lock = threading.Lock()

    def sign(self, kind, payload):
        with self.lock:  # one request is shown to the human at a time
            if kind == 'source-approval':
                job, digest, plan, seconds, text = describe_approval(payload)
                if not self.confirm(text, code_for(job, digest, plan or '')):
                    raise Refused('Declined')
                issued = int(self.clock()) - 30
                body = {'job': job, 'digest': digest, 'nonce': secrets.token_hex(16), 'issued': issued, 'expires': issued + 30 + seconds, 'plan': plan}
                body['signature'] = base64.b64encode(self.key.sign(APPROVAL_PREFIX + canonical(body))).decode()
                return {'approval': body}
            if kind == 'managed-approval':
                job, digest, seconds, text = describe_managed(payload)
                if not self.confirm(text, code_for(job, digest, 'managed')):
                    raise Refused('Declined')
                issued = int(self.clock()) - 30
                body = {'job': job, 'digest': digest, 'nonce': secrets.token_hex(16), 'issued': issued, 'expires': issued + 30 + seconds}
                body['signature'] = base64.b64encode(self.key.sign(MANAGED_PREFIX + canonical(body))).decode()
                return {'approval': body}
            if kind == 'restore-approval':
                job, digest, seconds, text = describe_restore(payload, int(self.clock()))
                if not self.confirm(text, code_for(job, digest, 'restore')):
                    raise Refused('Declined')
                issued = int(self.clock()) - 30
                body = {'job': job, 'digest': digest, 'nonce': secrets.token_hex(16), 'issued': issued, 'expires': issued + 30 + seconds}
                body['signature'] = base64.b64encode(self.key.sign(RESTORE_PREFIX + canonical(body))).decode()
                return {'approval': body}
            if kind == 'autodeploy-policy':
                document, text = describe_policy(payload, int(self.clock()))
                if not self.confirm(text, code_for(document['id'], document['service'], str(document['repository_id']), document['branch'])):
                    raise Refused('Declined')
                return {'policy': document, 'signature': base64.b64encode(self.key.sign(POLICY_PREFIX + canonical(document))).decode()}
            raise Refused('Unsupported request type')


def terminal_confirm(text, code):
    print('\n' + '=' * 78 + '\n' + text + '\n' + '=' * 78)
    answer = input('Type %s to approve, anything else to refuse: ' % code).strip()
    return answer == code


def make_handler(signer, origin, token):
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.0'
        timeout = 330

        def log_message(self, *args):
            pass

        def host_ok(self):
            host = self.headers.get('Host', '')
            return host in ('127.0.0.1:%d' % self.server.server_address[1], 'localhost:%d' % self.server.server_address[1])

        def reply(self, code, value):
            data = json.dumps(value, allow_nan=False).encode()
            self.send_response(code)
            for k, v in {'Content-Type': 'application/json', 'Content-Length': str(len(data)), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
                         'Access-Control-Allow-Headers': 'Content-Type, X-HMS-Signer-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Private-Network': 'true'}.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def allowed(self):
            return self.host_ok() and self.headers.get('Origin') == origin

        def do_OPTIONS(self):
            self.reply(204 if self.allowed() else 403, {})

        def do_GET(self):
            if not self.allowed() or self.path != '/v1/hello':
                return self.reply(403, {'error': 'denied'})
            self.reply(200, {'signer': 'hms-signer', 'version': VERSION, 'fingerprint': signer.fingerprint})

        def do_POST(self):
            if not self.allowed() or self.path != '/v1/sign' or not secrets.compare_digest(self.headers.get('X-HMS-Signer-Token', ''), token):
                return self.reply(403, {'error': 'denied'})
            lengths = self.headers.get_all('Content-Length', [])
            if len(lengths) != 1 or not lengths[0].isdigit() or not 0 < int(lengths[0]) <= MAX_BODY or self.headers.get('Content-Type') != 'application/json':
                return self.reply(400, {'error': 'bad_request'})
            try:
                request = json.loads(self.rfile.read(int(lengths[0])))
                if not isinstance(request, dict) or set(request) != {'kind', 'payload'}:
                    raise Refused('Exact request required')
                self.reply(200, signer.sign(request['kind'], request['payload']))
            except Refused as error:
                self.reply(422, {'error': str(error)})
            except (ValueError, KeyError, TypeError):
                self.reply(400, {'error': 'bad_request'})
    return Handler


def serve(key, origin, port, token=None, confirm=terminal_confirm):
    if not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::\d{1,5})?', origin):
        raise SystemExit('The portal origin must be an exact https:// origin')
    token = token or secrets.token_urlsafe(9)
    signer = Signer(key, confirm)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), make_handler(signer, origin, token))
    server.daemon_threads = True
    return server, signer, token


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    run = commands.add_parser('serve')
    run.add_argument('--key', required=True)
    run.add_argument('--origin', required=True)
    run.add_argument('--port', type=int, default=47419)
    offline = commands.add_parser('sign-file')
    offline.add_argument('request')
    offline.add_argument('--key', required=True)
    args = parser.parse_args(argv)
    key = load_key(args.key)
    if not isinstance(key, Ed25519PrivateKey):
        raise SystemExit('An Ed25519 owner key is required')
    if args.command == 'sign-file':
        request = json.load(open(args.request))
        print(json.dumps(Signer(key, terminal_confirm).sign(request['kind'], request['payload']), indent=1))
        return
    server, signer, token = serve(key, args.origin, args.port)
    print('Signer ready on http://127.0.0.1:%d for %s\nPublic key fingerprint: %s\nPairing token (enter it once in the portal page): %s' % (args.port, args.origin, signer.fingerprint, token))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
