"""Fixed-destination HTTPS relay. No provider secret, redirects or automatic retries."""
import argparse
import hashlib
import hmac
import http.client
import http.server
import json
import os
import re
import socket
import sqlite3
import ssl
import threading
import time
import uuid
from pathlib import Path

PREFIX = b'hms:dynadot-relay:v1:'
MAX_REQUEST = 32768
MAX_RESPONSE = 2000000
HOSTS = {'production': 'api.dynadot.com', 'sandbox': 'api-sandbox.dynadot.com'}
DOMAIN = r'(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
BASE = '/restful/v2/domains'


def validate(p, now):
    if not isinstance(p, dict) or p.get('schema') != 1 or type(p.get('expires')) is not int or not now <= p['expires'] <= now + 90:
        raise ValueError('packet')
    if str(uuid.UUID(p['nonce'])) != p['nonce'] or p.get('mode') not in HOSTS:
        raise ValueError('identity')
    common = {'schema', 'nonce', 'expires', 'mode'}
    if p.get('action') == 'health' and set(p) == common | {'action'}:
        return
    if set(p) != common | {'method', 'path', 'key', 'signature', 'request_id', 'body'}:
        raise ValueError('fields')
    for k, pattern in [('key', r'[A-Za-z0-9_-]{8,1024}'), ('signature', r'[A-Za-z0-9+/]{43}='), ('request_id', r'[a-f0-9-]{36}')]:
        if not isinstance(p[k], str) or not re.fullmatch(pattern, p[k]):
            raise ValueError('header')
    if str(uuid.UUID(p['request_id'])) != p['request_id'] or not isinstance(p['body'], str):
        raise ValueError('body')
    method, path = p['method'], p['path']
    if not isinstance(path, str) or len(path) > 1024:
        raise ValueError('path')
    if method == 'GET':
        patterns = [BASE + r'\?page=[1-9][0-9]{0,5}&page_size=100', BASE + '/' + DOMAIN,
                    BASE + '/' + DOMAIN + r'/search\?show_price=true&currency=(usd|gbp|eur)']
        if p['body'] or not any(re.fullmatch(v, path) for v in patterns):
            raise ValueError('read')
    else:
        suffix = {'PUT': '(domain_lock|renew_option|nameservers)', 'POST': '(records|renew)', 'DELETE': 'records'}.get(method)
        if not suffix or not re.fullmatch(BASE + '/' + DOMAIN + '/' + suffix, path):
            raise ValueError('write')
        body = json.loads(p['body'])
        if not isinstance(body, dict) or not body:
            raise ValueError('json')


class Ledger:
    def __init__(self, path):
        self.path = path
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS mutations (request_id TEXT PRIMARY KEY)')
    def claim(self, nonce, expires, now, mutation_id=None):
        with sqlite3.connect(self.path, timeout=3) as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM nonces WHERE expires < ?', (now - 120,))
            if db.execute('SELECT count(*) FROM nonces').fetchone()[0] >= 1000:
                raise ValueError('capacity')
            # Durable BEFORE sending. Crashes/lost replies never replay upstream.
            db.execute('INSERT INTO nonces VALUES (?,?)', (nonce, expires))
            if mutation_id is not None:
                if db.execute('SELECT count(*) FROM mutations').fetchone()[0] >= 100000:
                    raise ValueError('mutation_capacity')
                # Retain mutation IDs permanently: a fresh envelope must not resend a purchase.
                db.execute('INSERT INTO mutations VALUES (?)', (mutation_id,))


class IPv4TLS(http.client.HTTPSConnection):
    def connect(self):
        addresses = socket.getaddrinfo(self.host, 443, socket.AF_INET, socket.SOCK_STREAM)
        # One attempt only; no retry even on an uncertain connection failure.
        family, kind, protocol, _, address = addresses[0]
        raw = socket.socket(family, kind, protocol)
        raw.settimeout(self.timeout)
        try:
            raw.connect(address)
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def forward(p):
    host = HOSTS[p['mode']]
    connection = IPv4TLS(host, timeout=15, context=ssl.create_default_context())
    try:
        connection.connect()
        source = connection.sock.getsockname()[0]
        if p.get('action') == 'health':
            return 200, json.dumps({'relay': 'ready', 'upstream_tls': True, 'connection_source_ipv4': source, 'provider_authenticated': False}).encode()
        headers = {'Authorization': 'Bearer ' + p['key'], 'Content-Type': 'application/json', 'Accept': 'application/json',
                   'X-Request-ID': p['request_id'], 'X-Signature': p['signature']}
        connection.request(p['method'], p['path'], body=p['body'].encode() if p['body'] else None, headers=headers)
        response = connection.getresponse()
        if response.status < 200 or response.status >= 300 and response.status < 400:
            raise ValueError('redirect')
        data = response.read(MAX_RESPONSE + 1)
        if len(data) > MAX_RESPONSE:
            raise ValueError('response_size')
        value = json.loads(data)
        if not isinstance(value, dict) or type(value.get('code')) is not int:
            raise ValueError('response')
        # Forward only the provider envelope; no response headers or cookies.
        return response.status, data
    finally:
        connection.close()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'
    def log_message(self, *_):
        pass  # Never log request headers, bodies, paths or provider replies.
    def setup(self):
        super().setup()
        self.connection.settimeout(5)
    def handle(self):
        def expire():
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        deadline = threading.Timer(25, expire)
        deadline.daemon = True
        deadline.start()
        try:
            super().handle()
        finally:
            deadline.cancel()
    def reply(self, status, data=b'{"error":"relay_unavailable"}', forwarded=False):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        if forwarded:
            self.send_header('X-HMS-Dynadot-Forwarded', '1')
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        self.reply(405)
    def do_POST(self):
        if not self.server.slots.acquire(blocking=False):
            self.reply(503)
            return
        try:
            if self.path != '/v1/dynadot-relay':
                self.reply(404)
                return
            lengths = self.headers.get_all('Content-Length', [])
            signatures = self.headers.get_all('X-HMS-Dynadot-Signature', [])
            if (len(lengths) != 1 or not re.fullmatch(r'[0-9]{1,5}', lengths[0]) or not 0 < int(lengths[0]) <= MAX_REQUEST
                or self.headers.get('Transfer-Encoding') is not None or self.headers.get('Content-Type') != 'application/json'
                or len(signatures) != 1 or not re.fullmatch(r'[a-f0-9]{64}', signatures[0])):
                self.reply(403)
                return
            raw = self.rfile.read(int(lengths[0]))
            if len(raw) != int(lengths[0]) or not hmac.compare_digest(signatures[0], hmac.new(self.server.key, PREFIX + raw, hashlib.sha256).hexdigest()):
                self.reply(403)
                return
            packet = json.loads(raw)
            now = int(time.time())
            validate(packet, now)
            mutation = packet.get('request_id') if packet.get('method') in ('PUT', 'POST', 'DELETE') else None
            self.server.ledger.claim(packet['nonce'], packet['expires'], now, mutation)
            status, data = forward(packet)
            self.reply(status, data, forwarded=True)
        except (ValueError, KeyError, TypeError, sqlite3.IntegrityError):
            self.reply(409)
        except Exception:
            # The portal treats every unmarked failure as unknown; no fallback/retry.
            self.reply(502)
        finally:
            self.server.slots.release()


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8
    def process_request(self, request, address):
        # Bound threads even when clients stall before sending authenticated bodies.
        if not self.connections.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.connections.release()
            raise
    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.connections.release()
    def handle_error(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    private = Path('/etc/housemysite-services')
    key = (private / 'portal.key').read_bytes()
    if not 32 <= len(key) <= 4096:
        raise ValueError('key')
    server = Server(('127.0.0.1', 18444), Handler, bind_and_activate=False)
    server.connections = threading.BoundedSemaphore(8)
    server.slots = threading.BoundedSemaphore(4)
    server.key = key
    server.ledger = Ledger(str(Path(args.state) / 'nonces.sqlite'))
    server.server_bind()
    server.server_activate()
    # TLS handshake occurs in a bounded worker, not in the single accept loop.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(str(private / 'internal.crt'), str(private / 'internal.key'))
    original = server.finish_request
    def finish(request, address):
        request.settimeout(5)
        with context.wrap_socket(request, server_side=True) as secure:
            original(secure, address)
    server.finish_request = finish
    server.serve_forever()


if __name__ == '__main__':
    main()
