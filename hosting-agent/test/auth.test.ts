import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { canonicalRequest } from '../src/canonical.ts';
import { createAgentServer } from '../src/server.ts';
import { NonceStore, authorize } from '../src/auth.ts';
import { readState, writeState } from '../src/state.ts';
const { privateKey, publicKey } = generateKeyPairSync('ed25519'), token = randomBytes(32).toString('hex');
const appId = '11111111-1111-4111-8111-111111111111', clientId = '22222222-2222-4222-8222-222222222222', deploymentId = '33333333-3333-4333-8333-333333333333', name = `w-${appId.replaceAll('-', '')}`;
const spec = { name, appId, clientId, deploymentId, framework: 'static', storageLimitBytes: 1000000000, env: [], domains: [] };
function signed(method: string, path: string, body = '') {
    const timestamp = String(Date.now()), nonce = randomBytes(16).toString('hex');
    return { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-hms-timestamp': timestamp, 'x-hms-nonce': nonce, 'x-hms-signature': sign(null, Buffer.from(canonicalRequest(method, path, timestamp, nonce, Buffer.from(body))), privateKey).toString('base64') };
}
async function fixture(run: (base: string, root: string, calls: string[]) => Promise<void>) {
    const root = mkdtempSync(join(tmpdir(), 'hms-checkout-agent-')), calls: string[] = [];
    const docker = { async fetchRepository(_name: string, _source: unknown, dest: string) { calls.push('fetch'); mkdirSync(dest, { recursive: true }); writeFileSync(join(dest, 'index.html'), 'fixture'); }, async build() { calls.push('build'); return 7; }, async run() { calls.push('run'); }, async ready() { return true; }, async remove() { calls.push('remove'); }, async action() { calls.push('action'); }, async logs() { return 'fixture'; } };
    const server = createAgentServer({ token, publicKey, sitesDir: root, dataDir: join(root, 'data'), routeDir: join(root, 'routes'), auditFile: join(root, 'audit'), docker, inline: true, minFreeBytes: 0, portalOrigins: ['https://portal.fixture.invalid'] });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    assert(addr && typeof addr === 'object');
    try {
        await run(`http://127.0.0.1:${addr.port}`, root, calls);
    }
    finally {
        await new Promise<void>(r => server.close(() => r()));
        rmSync(root, { recursive: true, force: true });
    }
}
test('agent accepts a signed GitHub deployment once and binds the immutable client/site identity', async () => {
    await fixture(async (base, root, calls) => {
        const body = JSON.stringify({ ...spec, source: { kind: 'git', url: 'https://github.com/fixture/site', ref: 'main' } }), headers = signed('POST', '/v1/apps', body);
        assert.equal((await fetch(base + '/v1/apps', { method: 'POST', headers, body })).status, 202);
        assert.deepEqual(calls, ['fetch', 'build', 'run']);
        assert.equal(readState(join(root, 'data'), name)?.status, 'running');
        assert.equal((await fetch(base + '/v1/apps', { method: 'POST', headers, body })).status, 401);
        const retry = await fetch(base + '/v1/apps', { method: 'POST', headers: signed('POST', '/v1/apps', body), body });
        assert.equal(retry.status, 202);
        assert.deepEqual(calls, ['fetch', 'build', 'run']);
        const state = await (await fetch(base + `/v1/apps/${name}`, { headers: signed('GET', `/v1/apps/${name}`) })).json();
        assert.equal(state.usedBytes, 7);
        assert.equal(state.clientId, clientId);
        assert(state.domains.some((d:{host:string})=>d.host===`${name}.deploy.housemysite.com`));
        assert(!('env' in state));
    });
});
test('direct file upload streams with one scoped ticket, checks origin/size, and commits one healthy deployment', async () => {
    await fixture(async (base, root, calls) => {
        const body = JSON.stringify({ ...spec, kind: 'files', files: [{ path: 'index.html', size: 7 }] }), path = '/v1/uploads';
        const registration = await fetch(base + path, { method: 'POST', headers: signed('POST', path, body), body });
        assert.equal(registration.status, 200);
        const ticket = await registration.json();
        const headers = { Authorization: `Upload ${ticket.token}`, Origin: 'https://portal.fixture.invalid', 'Content-Type': 'application/octet-stream' };
        assert.equal((await fetch(base + `/v1/uploads/${ticket.id}/0`, { method: 'PUT', headers: { ...headers, Origin: 'https://unknown.fixture.invalid' }, body: 'fixture' })).status, 403);
        assert.equal((await fetch(base + `/v1/uploads/${ticket.id}/0`, { method: 'PUT', headers, body: 'fixture' })).status, 200);
        const finish = await fetch(base + `/v1/uploads/${ticket.id}/complete`, { method: 'POST', headers });
        assert.equal(finish.status, 202);
        assert.deepEqual(calls, ['build', 'run']);
        assert.equal(readState(join(root, 'data'), name)?.status, 'running');
        assert.equal((await fetch(base + `/v1/uploads/${ticket.id}/complete`, { method: 'POST', headers })).status, 202);
        assert.deepEqual(calls, ['build', 'run']);
    });
});
test('over-limit registration and unsigned mutations never reach the worker', async () => {
    await fixture(async (base, _root, calls) => {
        assert.equal((await fetch(base + '/health')).status, 200);
        assert.equal((await fetch(base + '/v1/apps', { method: 'POST', body: '{}' })).status, 401);
        const body = JSON.stringify({ ...spec, kind: 'files', files: [{ path: 'index.html', size: 1000000001 }] });
        const response = await fetch(base + '/v1/uploads', { method: 'POST', headers: signed('POST', '/v1/uploads', body), body });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error, 'upload_limit_exceeded');
        assert.deepEqual(calls, []);
    });
});
test('nonce replay protection survives an agent process restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'hms-nonces-'));
    try {
        const file = join(root, 'nonces.json'), timestamp = String(Date.now()), nonce = randomBytes(16).toString('hex'), path = '/v1/apps', body = Buffer.from('{}');
        const headers = { authorization: `Bearer ${token}`, 'x-hms-timestamp': timestamp, 'x-hms-nonce': nonce, 'x-hms-signature': sign(null, Buffer.from(canonicalRequest('POST', path, timestamp, nonce, body)), privateKey).toString('base64') };
        assert.equal(authorize({ headers, method: 'POST', path, body, token, publicKey, now: Date.now(), nonces: new NonceStore(file) }).ok, true);
        assert.equal(authorize({ headers, method: 'POST', path, body, token, publicKey, now: Date.now(), nonces: new NonceStore(file) }).ok, false);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the agent rejects another website preview and preserves its own preview when custom domains change', async()=>{
 await fixture(async(base,root,calls)=>{
  const foreign='w-'+ 'f'.repeat(32)+'.deploy.housemysite.com';
  let body=JSON.stringify({...spec,domains:[{host:foreign,token:'a'.repeat(48)}],source:{kind:'git',url:'https://github.com/fixture/site',ref:'main'}});
  assert.equal((await fetch(base+'/v1/apps',{method:'POST',headers:signed('POST','/v1/apps',body),body})).status,400);
  assert.deepEqual(calls,[]);
  body=JSON.stringify({...spec,source:{kind:'git',url:'https://github.com/fixture/site',ref:'main'}});
  assert.equal((await fetch(base+'/v1/apps',{method:'POST',headers:signed('POST','/v1/apps',body),body})).status,202);
  const path=`/v1/apps/${name}/domains`;
  body=JSON.stringify({domains:[{host:'example.com',token:'a'.repeat(48)}]});
  assert.equal((await fetch(base+path,{method:'POST',headers:signed('POST',path,body),body})).status,200);
  const state=readState(join(root,'data'),name);
  assert(state?.domains.some(d=>d.host===`${name}.deploy.housemysite.com`));
  assert(state?.domains.some(d=>d.host==='example.com'));
  body=JSON.stringify({domains:[{host:foreign,token:'a'.repeat(48)}]});
  assert.equal((await fetch(base+path,{method:'POST',headers:signed('POST',path,body),body})).status,400);
 });
});
