import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual, randomBytes, type KeyObject } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, createWriteStream, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { authorize, NonceStore, tokensMatch } from './auth.ts';
import { deliverReceipt } from './receipts.ts';
import { writeAudit } from './audit.ts';
import { DockerClient, unpack } from './docker.ts';
import { routeLabels } from './files.ts';
import { enqueue, hasQueueCapacity } from './jobs.ts';
import { RateLimiter } from './rateLimit.ts';
import { appDir, atomicJson, readState, writeState, readBuildLog, writeBuildLog, measureTree, availableDisk, type AppState } from './state.ts';
import { appNameOk, domainOk, previewHost, isPreviewHost, envNameOk, envValueOk, frameworkOk, gitUrlOk, gitRefOk } from './validate.ts';
import { uploadManifest, type UploadFile, MAX_UPLOAD } from '../shared/uploadPolicy.ts';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
type Spec = AppState & {
    env: {
        name: string;
        value: string;
    }[];
};
type Upload = {
    id: string;
    spec: Spec;
    kind: 'zip' | 'files';
    files: UploadFile[];
    expiresAt: number;
    complete: boolean;
    cancelled: boolean;
};
type Worker = Pick<DockerClient, 'fetchRepository' | 'build' | 'run' | 'ready' | 'remove' | 'action' | 'logs'>;
export type AgentDeps = {
    token: string;
    publicKey: KeyObject;
    sitesDir: string;
    dataDir: string;
    routeDir?: string;
    auditFile: string;
    docker?: Worker;
    now?: () => number;
    inline?: boolean;
    nonces?: NonceStore;
    limiter?: RateLimiter;
    minFreeBytes?: number;
    portalOrigins?: string[];
};
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); }
function parseSpec(value: Record<string, unknown>): Spec {
    const name = String(value.name ?? ''), appId = String(value.appId ?? ''), clientId = String(value.clientId ?? ''), deploymentId = String(value.deploymentId ?? ''), framework = String(value.framework ?? ''), limit = Number(value.storageLimitBytes);
    if (!UUID.test(appId) || !UUID.test(clientId) || !UUID.test(deploymentId) || name !== `w-${appId.replaceAll('-', '')}` || !appNameOk(name) || !frameworkOk(framework))
        throw Error('invalid_website');
    if (!Number.isSafeInteger(limit) || limit < 1000000000 || limit > Number(process.env.MAX_SITE_BYTES || 2000000000))
        throw Error('invalid_storage_limit');
    const env = value.env ?? [];
    if (!Array.isArray(env) || env.length > 64)
        throw Error('invalid_env');
    const pairs = env.map(item => {
        if (!item || typeof item.name !== 'string' || typeof item.value !== 'string' || !envNameOk(item.name) || !envValueOk(item.value))
            throw Error('invalid_env');
        return { name: item.name, value: item.value };
    });
    const domains = value.domains ?? [];
    if (!Array.isArray(domains) || domains.length > 11)
        throw Error('invalid_domain');
    const checked = domains.filter(d => d?.host !== previewHost(name)).map(d => {
        if (!d || !domainOk(String(d.host)) || (isPreviewHost(String(d.host)) && d.host !== previewHost(name)) || !/^[a-f0-9]{48}$/.test(String(d.token)))
            throw Error('invalid_domain');
        return { host: String(d.host), token: String(d.token) };
    });
    checked.push({host: previewHost(name), token: '0'.repeat(48)});
    return { name, appId, clientId, deploymentId, framework, port: ['static', 'react', 'vue'].includes(framework) ? 8080 : 3000, cpu: 1, memoryMb: 512, storageLimitBytes: limit, env: pairs, status: 'building', usedBytes: null, deployedAt: null, container: null, image: `hms-websites/${name}:${deploymentId}`, domains: checked, error: null, updatedAt: new Date().toISOString() };
}
async function body(req: IncomingMessage, limit: number) {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limit)
            throw Error('request_too_large');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
export function createAgentServer(deps: AgentDeps) {
    const now = deps.now ?? Date.now, docker = deps.docker ?? new DockerClient(), limiter = deps.limiter ?? new RateLimiter(), nonces = deps.nonces ?? new NonceStore(join(deps.dataDir, 'nonces.json'));
    const locks = new Set<string>(), origins = deps.portalOrigins ?? (process.env.PORTAL_ORIGINS || 'https://web.housemysite.com').split(',').map(s => s.trim());
    const uploadRoot = join(deps.dataDir, 'uploads'), cancelRoot = join(deps.dataDir, 'cancelled');
    mkdirSync(uploadRoot, { recursive: true, mode: 0o700 });
    mkdirSync(cancelRoot, { recursive: true, mode: 0o700 });
    function cleanupExpiredUploads() {
        for (const id of readdirSync(uploadRoot)) {
            try {
                const u = readUpload(id);
                if (!u.complete && !u.cancelled && u.expiresAt < now() && !locks.has(id) && ![...locks].some(k => k.startsWith(id + '/'))) {
                    u.cancelled = true;
                    writeUpload(u);
                    for (let i = 0; i < u.files.length; i++)
                        rmSync(join(uploadRoot, id, `${i}.bin`), { force: true });
                }
            }
            catch { }
        }
    }
    function disk() {
        if (availableDisk(deps.dataDir) < (deps.minFreeBytes ?? 10000000000))
            throw Error('server_capacity_unavailable');
    }
    function readUpload(id: string): Upload {
        if (!UUID.test(id))
            throw Error('invalid_upload');
        try {
            return JSON.parse(readFileSync(join(uploadRoot, id, 'upload.json'), 'utf8'));
        }
        catch {
            throw Error('upload_not_found');
        }
    }
    function writeUpload(u: Upload) { const dir = join(uploadRoot, u.id); mkdirSync(dir, { recursive: true, mode: 0o700 }); atomicJson(join(dir, 'upload.json'), u); }
    function token(u: Upload) { const payload = `${u.id}.${u.expiresAt}`; return `${payload}.${createHmac('sha256', deps.token).update(payload).digest('hex')}`; }
    function uploadAuth(req: IncomingMessage, id: string) {
        const u = readUpload(id), value = String(req.headers.authorization ?? '').replace(/^Upload /, '');
        const expected = Buffer.from(token(u)), got = Buffer.from(value);
        if (expected.length !== got.length || !timingSafeEqual(expected, got) || u.expiresAt < now() || u.cancelled)
            throw Error('upload_expired_or_denied');
        return u;
    }
    function existing(spec: Spec) {
        const prior = readState(deps.dataDir, spec.name);
        if (prior && (prior.appId !== spec.appId || prior.clientId !== spec.clientId))
            throw Error('website_ownership_mismatch');
        if (prior && ['building', 'uploading', 'uncertain'].includes(prior.status) && prior.deploymentId !== spec.deploymentId)
            throw Error('deployment_pending');
        return prior;
    }
    function initial(spec: Spec, status: AppState['status']) { const prior = existing(spec); return { ...spec, status, container: prior?.container ?? null, usedBytes: prior?.usedBytes ?? null, deployedAt: prior?.deployedAt ?? null }; }
    async function deploy(spec: Spec, source: string, fetchSource?: {
        url: string;
        ref?: string;
        token?: string;
    }) {
        const prior = readState(deps.dataDir, spec.name), candidate = `hms-${spec.name}-${spec.deploymentId.replaceAll('-', '').slice(0, 8)}`;
        let routed = false;
        const log = (line: string) => writeBuildLog(deps.dataDir, spec.name, readBuildLog(deps.dataDir, spec.name) + line + '\n');
        try {
            disk();
            log('Preparing isolated website source.');
            if (fetchSource)
                await docker.fetchRepository(spec.name, fetchSource, source, MAX_UPLOAD);
            measureTree(source, spec.storageLimitBytes);
            log('Building in a bounded, unprivileged container.');
            const used = await docker.build(source, spec.image, spec.framework as Parameters<Worker['build']>[2], spec.storageLimitBytes, spec.env);
            if (!Number.isSafeInteger(used) || used < 0 || used > spec.storageLimitBytes)
                throw Error('storage_limit_exceeded');
            await docker.run({ name: candidate, image: spec.image, port: spec.port, cpu: 1, memoryMb: 512, env: spec.env.map(e => `${e.name}=${e.value}`), labels: routeLabels(candidate, spec.port, spec.domains) });
            if (!await docker.ready(candidate, spec.port))
                throw Error('website_health_check_failed');
            // The old container/route is kept until this candidate has passed readiness.
            routed = true;
            const ready: AppState = { ...spec, status: 'running', usedBytes: used, deployedAt: new Date(now()).toISOString(), container: candidate, error: null };
            writeState(deps.dataDir, ready);
            await deliverReceipt(deps.dataDir, ready, deps.token);
            log('Deployment passed its health check. Domain/HTTPS checks are separate.');
            if (prior?.container && prior.container !== candidate)
                await docker.action(prior.container, 'stop').catch(() => { });
        }
        catch (e) {
            const code = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'deployment_failed';
            log(code);
            const failed: AppState = { ...spec, status: routed ? 'uncertain' : 'failed', container: prior?.container ?? null, usedBytes: prior?.usedBytes ?? null, deployedAt: prior?.deployedAt ?? null, error: code };
            writeState(deps.dataDir, failed);
            await deliverReceipt(deps.dataDir, failed, deps.token);
            if (!routed)
                await docker.remove(candidate).catch(() => { });
        }
        finally {
            rmSync(source, { recursive: true, force: true });
            rmSync(source + '-runtime', { recursive: true, force: true });
        }
    }
    async function schedule(spec: Spec, source: string, fetchSource?: {
        url: string;
        ref?: string;
        token?: string;
    }) {
        if (!deps.inline && !hasQueueCapacity())
            throw Error('server_busy');
        writeState(deps.dataDir, initial(spec, 'building'));
        if (deps.inline)
            await deploy(spec, source, fetchSource);
        else
            enqueue(() => deploy(spec, source, fetchSource));
    }
    async function streamUpload(req: IncomingMessage, res: ServerResponse, id: string, index: number, u: Upload) {
        if (u.complete)
            throw Error('upload_already_complete');
        const file = u.files[index];
        if (!file)
            throw Error('invalid_file');
        const key = `${id}/${index}`;
        if (locks.has(key) || locks.has(id))
            throw Error('upload_busy');
        locks.add(key);
        const path = join(uploadRoot, id, `${index}.bin`), temp = path + '.part';
        try {
            disk();
            if (req.headers['content-length'] !== undefined && Number(req.headers['content-length']) !== file.size)
                throw Error('invalid_file_size');
            rmSync(temp, { force: true });
            let size = 0;
            const bounded = new Transform({ transform(chunk, _enc, callback) {
                    size += chunk.length;
                    if (size > file.size || size > MAX_UPLOAD)
                        callback(Error('upload_limit_exceeded'));
                    else
                        callback(null, chunk);
                } });
            await pipeline(req, bounded, createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
            if (size !== file.size)
                throw Error('invalid_file_size');
            const { renameSync } = await import('node:fs');
            renameSync(temp, path);
            json(res, 200, { received: index, bytes: size });
        }
        finally {
            locks.delete(key);
            rmSync(temp, { force: true });
        }
    }
    async function direct(req: IncomingMessage, res: ServerResponse, path: string) {
        const origin = String(req.headers.origin ?? '');
        if (!origins.includes(origin)) {
            json(res, 403, { error: 'origin_denied' });
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'PUT, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const match = /^\/v1\/uploads\/([a-f0-9-]{36})\/(\d{1,4}|complete)$/.exec(path);
        if (!match)
            throw Error('invalid_upload');
        const id = match[1], u = uploadAuth(req, id);
        if (req.method === 'PUT' && match[2] !== 'complete') {
            await streamUpload(req, res, id, Number(match[2]), u);
            return;
        }
        if (req.method !== 'POST' || match[2] !== 'complete')
            throw Error('invalid_upload_method');
        if (u.complete) {
            json(res, 202, { accepted: true, id });
            return;
        }
        if (locks.has(id) || [...locks].some(k => k.startsWith(id + '/')))
            throw Error('upload_busy');
        locks.add(id);
        const source = join(appDir(deps.dataDir, u.spec.name), `source-${u.id}`);
        try {
            for (let i = 0; i < u.files.length; i++)
                if (statSync(join(uploadRoot, id, `${i}.bin`)).size !== u.files[i].size)
                    throw Error('upload_incomplete');
            if (u.kind === 'zip')
                await unpack('zip', join(uploadRoot, id, '0.bin'), source, u.spec.storageLimitBytes, 'source');
            else {
                mkdirSync(source, { recursive: false, mode: 0o700 });
                for (let i = 0; i < u.files.length; i++) {
                    const target = join(source, u.files[i].path);
                    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
                    copyFileSync(join(uploadRoot, id, `${i}.bin`), target);
                }
            }
            measureTree(source, u.spec.storageLimitBytes);
            await schedule(u.spec, source);
            u.complete = true;
            writeUpload(u);
            // Only temporary upload chunks are removed; the successful live image is retained.
            for (let i = 0; i < u.files.length; i++)
                rmSync(join(uploadRoot, id, `${i}.bin`), { force: true });
            json(res, 202, { accepted: true, id });
        }
        catch (e) {
            rmSync(source, { recursive: true, force: true });
            throw e;
        }
        finally {
            locks.delete(id);
        }
    }
    async function control(method: string, path: string, data: Record<string, unknown>) {
        if (method === 'GET' && path === '/v1/ready')
            return { status: 200, value: { version: 'website-checkout-v1', uploadLimitBytes: MAX_UPLOAD, maxSiteBytes: Number(process.env.MAX_SITE_BYTES || 2000000000) } };
        if (method === 'POST' && path === '/v1/uploads') {
            cleanupExpiredUploads();
            disk();
            const spec = parseSpec(data), prior = existing(spec), kind = data.kind;
            if (kind !== 'zip' && kind !== 'files')
                throw Error('invalid_upload');
            try {
                readFileSync(join(cancelRoot, spec.deploymentId));
                throw Error('upload_cancelled');
            }
            catch (e) {
                if (!(e instanceof Error) || !('code' in e) || e.code !== 'ENOENT')
                    throw e;
            }
            const manifest = uploadManifest(data.files);
            if (kind === 'zip' && (manifest.files.length !== 1 || !manifest.files[0].path.toLowerCase().endsWith('.zip')))
                throw Error('invalid_zip');
            try {
                const old = readUpload(spec.deploymentId);
                if (JSON.stringify(old.files) !== JSON.stringify(manifest.files) || old.kind !== kind || old.spec.appId !== spec.appId)
                    throw Error('upload_retry_mismatch');
                if (old.expiresAt < now() || old.cancelled)
                    throw Error('upload_expired_or_denied');
                return { status: 200, value: { id: old.id, token: token(old), expiresAt: old.expiresAt } };
            }
            catch (e) {
                if (!(e instanceof Error) || e.message !== 'upload_not_found')
                    throw e;
            }
            if (prior?.deploymentId === spec.deploymentId && prior.status !== 'uploading')
                throw Error('deployment_already_submitted');
            let reserved = 0;
            for (const name of readdirSync(uploadRoot)) {
                try {
                    const v = readUpload(name);
                    if (!v.complete && !v.cancelled && v.expiresAt > now())
                        reserved += v.spec.storageLimitBytes * 2 + v.files.reduce((n, f) => n + f.size, 0);
                }
                catch { }
            }
            if (reserved + spec.storageLimitBytes * 2 + manifest.total > Number(process.env.STAGING_BUDGET_BYTES || 6000000000))
                throw Error('server_capacity_unavailable');
            const u: Upload = { id: spec.deploymentId, spec, kind, files: manifest.files, expiresAt: now() + 1800000, complete: false, cancelled: false };
            writeUpload(u);
            writeState(deps.dataDir, initial(spec, 'uploading'));
            return { status: 200, value: { id: u.id, token: token(u), expiresAt: u.expiresAt } };
        }
        if (method === 'POST' && path === '/v1/apps') {
            disk();
            const spec = parseSpec(data), prior = existing(spec), source = data.source as Record<string, unknown>;
            if (prior?.deploymentId === spec.deploymentId)
                return { status: 202, value: { accepted: true, deploymentId: spec.deploymentId } };
            if (!source || source.kind !== 'git' || !gitUrlOk(String(source.url)) || !gitRefOk(String(source.ref || 'main')) || (source.token !== undefined && (typeof source.token !== 'string' || source.token.length > 300 || /[\r\n\0]/.test(source.token))))
                throw Error('invalid_source');
            const work = join(appDir(deps.dataDir, spec.name), `source-${spec.deploymentId}`);
            await schedule(spec, work, { url: String(source.url), ref: String(source.ref || 'main'), token: source.token as string | undefined });
            return { status: 202, value: { accepted: true, deploymentId: spec.deploymentId } };
        }
        const route = /^\/v1\/apps\/(w-[a-f0-9]{32})(?:\/(logs|domains|start|stop|restart|cancel-upload))?$/.exec(path);
        if (!route)
            throw Error('not_found');
        const name = route[1], action = route[2], state = readState(deps.dataDir, name);
        if (method === 'POST' && action === 'cancel-upload') {
            const id = String(data.deploymentId ?? '');
            if (!UUID.test(id))
                throw Error('invalid_upload');
            let u: Upload;
            try {
                u = readUpload(id);
            }
            catch (e) {
                if (!(e instanceof Error) || e.message !== 'upload_not_found')
                    throw e;
                if (state?.deploymentId === id && state.status !== 'uploading')
                    throw Error('deployment_pending');
                writeFileSync(join(cancelRoot, id), 'cancelled', { mode: 0o600 });
                return { status: 200, value: { cancelled: true } };
            }
            if (u.spec.name !== name || u.complete || locks.has(id) || [...locks].some(k => k.startsWith(id + '/')))
                throw Error('upload_already_submitted');
            u.cancelled = true;
            writeUpload(u);
            writeFileSync(join(cancelRoot, id), 'cancelled', { mode: 0o600 });
            for (let i = 0; i < u.files.length; i++)
                rmSync(join(uploadRoot, id, `${i}.bin`), { force: true });
            if (state?.deploymentId === id)
                writeState(deps.dataDir, { ...state, status: 'failed', error: 'upload_cancelled' });
            return { status: 200, value: { cancelled: true } };
        }
        if (!state)
            throw Error('not_found');
        if (method === 'GET' && !action) {
            const { env, ...safe } = state as AppState & {
                env?: unknown;
            };
            return { status: 200, value: safe };
        }
        if (method === 'GET' && action === 'logs')
            return { status: 200, value: { build: readBuildLog(deps.dataDir, name), runtime: state.container ? await docker.logs(state.container) : '' } };
        if (method === 'POST' && action === 'domains') {
            if (state.status !== 'running' || !state.container)
                throw Error('website_not_running');
            const requested = data.domains;
            if (!Array.isArray(requested)) throw Error('invalid_domain');
            const domains = [...requested.filter(d => d?.host !== previewHost(name)), {host: previewHost(name), token: '0'.repeat(48)}];
            if (!Array.isArray(domains) || domains.length > 11 || domains.some(d => !domainOk(String(d.host)) || (isPreviewHost(String(d.host)) && d.host !== previewHost(name)) || !/^[a-f0-9]{48}$/.test(String(d.token))))
                throw Error('invalid_domain');
            // Portal has verified per-site DNS TXT proof; the signed list is authoritative.
            const candidate = `hms-${name}-${randomBytes(4).toString('hex')}`, env = (state as Spec).env ?? [];
            await docker.run({ name: candidate, image: state.image, port: state.port, cpu: 1, memoryMb: 512, env: env.map(e => `${e.name}=${e.value}`), labels: routeLabels(candidate, state.port, domains) });
            if (!await docker.ready(candidate, state.port)) {
                await docker.remove(candidate);
                throw Error('website_health_check_failed');
            }
            writeState(deps.dataDir, { ...state, container: candidate, domains });
            await docker.action(state.container, 'stop').catch(() => { });
            return { status: 200, value: { name, domains: domains.map(d => d.host) } };
        }
        if (method === 'POST' && ['start', 'stop', 'restart'].includes(action || '')) {
            if (!state.container || ['uploading', 'building', 'uncertain'].includes(state.status))
                throw Error('deployment_pending');
            await docker.action(state.container, action as 'start' | 'stop' | 'restart');
            const status = action === 'stop' ? 'stopped' : await docker.ready(state.container, state.port) ? 'running' : 'failed';
            writeState(deps.dataDir, { ...state, status });
            return { status: 200, value: { name, status } };
        }
        throw Error('not_found');
    }
    const server = createServer((req, res) => {
        void (async () => {
            const path = req.url ?? '/', method = req.method ?? 'GET';
            if (path.length > 300)
                throw Error('invalid_path');
            if (method === 'GET' && path === '/health') {
                json(res, 200, { ok: true, version: 'website-checkout-v1' });
                return;
            }
            if (path.startsWith('/v1/uploads/') && (String(req.headers.authorization ?? '').startsWith('Upload ') || method === 'OPTIONS')) {
                await direct(req, res, path);
                return;
            }
            if (!limiter.allow(req.socket.remoteAddress ?? 'unknown', 180, 60000, now())) {
                json(res, 429, { error: 'rate_limited' });
                return;
            }
            if (!tokensMatch(deps.token, String(req.headers.authorization ?? '').replace(/^Bearer /, ''))) {
                json(res, 401, { error: 'unauthorized' });
                return;
            }
            const bytes = await body(req, 600000), decision = authorize({ headers: req.headers, method, path, body: bytes, token: deps.token, publicKey: deps.publicKey, now: now(), nonces });
            if (!decision.ok) {
                json(res, decision.status, { error: decision.code });
                return;
            }
            const data = bytes.length ? JSON.parse(bytes.toString()) : {};
            if (!data || typeof data !== 'object' || Array.isArray(data))
                throw Error('invalid_json');
            const result = await control(method, path, data);
            writeAudit(deps.auditFile, { method, path, ok: true });
            json(res, result.status, result.value);
        })().catch(e => {
            const code = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : 'request_failed';
            if (!res.headersSent && !res.destroyed)
                json(res, code === 'not_found' ? 404 : code.includes('denied') ? 403 : 400, { error: code });
        });
    });
    server.requestTimeout = 900000;
    server.headersTimeout = 15000;
    server.maxHeadersCount = 40;
    return server;
}
