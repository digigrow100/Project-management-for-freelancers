import { request as httpRequest, type IncomingMessage } from 'node:http';
import { createWriteStream, mkdirSync, readFileSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { appNameOk, type Framework } from './validate.ts';
import { measureTree } from './state.ts';
type Target = {
    socketPath?: string;
    host?: string;
    port?: number;
};
export function dockerTarget(value = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock'): Target {
    if (value.startsWith('unix://'))
        return { socketPath: value.slice(7) };
    const u = new URL(value);
    if (u.protocol !== 'tcp:')
        throw Error('invalid_docker_host');
    return { host: u.hostname, port: Number(u.port || 2375) };
}
export class DockerClient {
    constructor(privateTarget: Target = dockerTarget()) { this.target = privateTarget; }
    private target: Target;
    private response(method: string, path: string, body?: Buffer | NodeJS.ReadableStream, headers: Record<string, string> = {}) {
        return new Promise<IncomingMessage>((resolve, reject) => {
            const req = httpRequest({ ...this.target, method, path, headers, timeout: 600000 }, resolve);
            req.on('error', reject);
            req.on('timeout', () => req.destroy(Error('docker_timeout')));
            if (!body)
                req.end();
            else if (Buffer.isBuffer(body))
                req.end(body);
            else
                body.pipe(req);
        });
    }
    private async call(method: string, path: string, value?: unknown) {
        const payload = value === undefined ? undefined : Buffer.from(JSON.stringify(value));
        const res = await this.response(method, path, payload, { 'content-type': 'application/json' });
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of res) {
            size += chunk.length;
            if (size > 2000000) {
                res.destroy();
                throw Error('docker_response_too_large');
            }
            chunks.push(chunk);
        }
        if ((res.statusCode ?? 500) >= 300)
            throw Error('docker_rejected');
        const text = Buffer.concat(chunks).toString();
        return text ? JSON.parse(text) : {};
    }
    async remove(name: string) {
        if (!/^hms-(?:w-|build-|fetch-)/.test(name))
            throw Error('invalid_container');
        const r = await this.response('DELETE', `/containers/${encodeURIComponent(name)}?force=1`);
        r.resume();
    }
    async action(name: string, action: 'start' | 'stop' | 'restart') {
        if (!/^hms-w-[a-f0-9]{32}-[a-f0-9]{8}$/.test(name))
            throw Error('invalid_container');
        const current = await this.call('GET', `/containers/${name}/json`);
        if ((action === 'start' && current.State?.Running) || (action === 'stop' && !current.State?.Running))
            return;
        await this.call('POST', `/containers/${name}/${action}${action === 'start' ? '' : '?t=15'}`);
    }
    private limits(memory: number, network: string, tmpfs: Record<string, string> = {}) { return { Memory: memory, MemorySwap: memory, NanoCpus: 1e9, PidsLimit: 256, ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], NetworkMode: network, Tmpfs: tmpfs, LogConfig: { Type: 'json-file', Config: { 'max-size': '5m', 'max-file': '2' } } }; }
    private async wait(name: string, timeout = 600000) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const result = await Promise.race([this.call('POST', `/containers/${name}/wait?condition=not-running`), new Promise<never>((_, reject) => { timer = setTimeout(() => { void this.remove(name); reject(Error('build_timeout')); }, timeout); })]);
            if (result.StatusCode !== 0)
                throw Error('build_failed');
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    private async extract(name: string, path: string, dest: string, limit: number, mode: 'source' | 'artifact') {
        const archive = dest + '.tar', res = await this.response('GET', `/containers/${name}/archive?path=${encodeURIComponent(path)}`);
        if (res.statusCode !== 200) {
            res.resume();
            throw Error('artifact_unavailable');
        }
        let size = 0;
        const bounded = new Transform({ transform(chunk, _encoding, callback) {
                size += chunk.length;
                if (size > limit + 50000000)
                    callback(Error('storage_limit_exceeded'));
                else
                    callback(null, chunk);
            } });
        try {
            await pipeline(res, bounded, createWriteStream(archive, { flags: 'wx', mode: 0o600 }));
            await unpack('tar', archive, dest, limit, mode);
        }
        finally {
            rmSync(archive, { force: true });
        }
    }
    private capacity(memory: number) {
        const match = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'));
        if (!match || Number(match[1]) * 1024 < memory)
            throw Error('server_capacity_unavailable');
    }
    async fetchRepository(name: string, source: {
        url: string;
        ref?: string;
        token?: string;
    }, dest: string, limit: number) {
        this.capacity(1750000000);
        const worker = `hms-fetch-${name.slice(2)}-${Date.now()}`;
        const script = 'git -c credential.helper= -c http.followRedirects=false -c protocol.file.allow=never clone --depth 1 --branch "$HMS_REF" -- "$HMS_REPO" /work/source && rm -rf /work/source/.git';
        try {
            await this.call('POST', `/containers/create?name=${worker}`, { Image: process.env.BUILDER_IMAGE || 'hms-website-builder:1', User: '1000:1000', WorkingDir: '/work', Cmd: ['sh', '-ec', script], Env: [`HMS_REPO=${source.url}`, `HMS_REF=${source.ref || 'main'}`, `HMS_REPO_TOKEN=${source.token || ''}`, 'GIT_ASKPASS=/usr/local/bin/hms-git-askpass', 'GIT_TERMINAL_PROMPT=0', 'GIT_CONFIG_NOSYSTEM=1', 'GIT_CONFIG_GLOBAL=/dev/null', 'HOME=/work'], Labels: { 'hms.website-worker': 'fetch' }, HostConfig: this.limits(1500000000, process.env.BUILD_NETWORK || 'hms-build', { '/work': `rw,nosuid,nodev,size=${limit},uid=1000,gid=1000,mode=0700` }) });
            await this.call('POST', `/containers/${worker}/start`);
            await this.wait(worker, 120000);
            await this.extract(worker, '/work/source', dest, limit, 'source');
        }
        finally {
            await this.remove(worker).catch(() => { });
        }
    }
    async build(source: string, tag: string, framework: Framework, limit: number, env: {
        name: string;
        value: string;
    }[] = []) {
        const context = source + '-runtime', artifact = join(context, 'artifact');
        mkdirSync(context, { recursive: false, mode: 0o700 });
        if (framework === 'static') {
            // Source is already bounded, regular files only. Copy without interpreting repo Dockerfiles.
            const { cpSync } = await import('node:fs');
            cpSync(source, artifact, { recursive: true });
        }
        else {
            this.capacity(4500000000);
            const worker = `hms-build-${Date.now()}`;
            const collect = framework === 'react' || framework === 'vue' ? 'if [ -d dist ]; then cp -R dist/. /output/; elif [ -d build ]; then cp -R build/. /output/; else exit 3; fi' : framework === 'nuxt' ? 'cp -R .output/. /output/' : 'mkdir -p /output/app; cp -R node_modules package.json /output/app/; if [ -d .next ]; then cp -R .next /output/app/; rm -rf /output/app/.next/cache; fi; if [ -d public ]; then cp -R public /output/app/; fi; if [ "$HMS_PRESET" = node ]; then find . -maxdepth 1 -type f ! -name ".env*" ! -name "Dockerfile*" -exec cp {} /output/app/ \\; ; if [ -d src ]; then cp -R src /output/app/; fi; if [ -d dist ]; then cp -R dist /output/app/; fi; fi';
            const build = framework === 'node' ? '' : 'npm run build;';
            try {
                await this.call('POST', `/containers/create?name=${worker}`, { Image: process.env.BUILDER_IMAGE || 'hms-website-builder:1', User: '1000:1000', WorkingDir: '/work', Cmd: ['sh', '-ec', `cp -R /input/. /work/; npm ci --no-audit --no-fund; ${build} npm prune --omit=dev --ignore-scripts --no-audit --no-fund; ${collect}`], Env: [...env.map(v => `${v.name}=${v.value}`), 'HOME=/work', 'npm_config_cache=/work/.npm-cache', 'NEXT_TELEMETRY_DISABLED=1', `HMS_PRESET=${framework}`], Labels: { 'hms.website-worker': 'build' }, HostConfig: { ...this.limits(4000000000, process.env.BUILD_NETWORK || 'hms-build', { '/work': 'rw,nosuid,nodev,size=2500000000,uid=1000,gid=1000,mode=0700', '/output': `rw,nosuid,nodev,size=${limit},uid=1000,gid=1000,mode=0700`, '/tmp': 'rw,nosuid,nodev,size=64000000,uid=1000,gid=1000' }), Binds: [`${source}:/input:ro`] } });
                await this.call('POST', `/containers/${worker}/start`);
                await this.wait(worker);
                await this.extract(worker, '/output', artifact, limit, 'artifact');
            }
            finally {
                await this.remove(worker).catch(() => { });
            }
        }
        const used = measureTree(artifact, limit);
        if (framework === 'static' && !readable(join(artifact, 'index.html')))
            throw Error('index_html_required');
        const staticSite = ['static', 'react', 'vue'].includes(framework);
        const dockerfile = staticSite ? 'FROM nginxinc/nginx-unprivileged:stable-alpine\nCOPY artifact/ /usr/share/nginx/html/\nUSER 1000:1000\nEXPOSE 8080\n' : framework === 'nuxt' ? 'FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY --chown=1000:1000 artifact/ /app/\nENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NITRO_HOST=0.0.0.0\nUSER 1000:1000\nCMD ["node","server/index.mjs"]\n' : 'FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY --chown=1000:1000 artifact/app/ /app/\nENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0\nUSER 1000:1000\nCMD ["npm","start"]\n';
        writeFileSync(join(context, 'Dockerfile'), dockerfile, { mode: 0o600 });
        const tar = spawn('tar', ['-C', context, '-cf', '-', '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
        const result = await this.response('POST', `/build?t=${encodeURIComponent(tag)}&dockerfile=Dockerfile&rm=1&networkmode=none`, tar.stdout, { 'content-type': 'application/x-tar' });
        let log = '';
        for await (const chunk of result) {
            log = (log + chunk.toString()).slice(-100000);
        }
        if ((result.statusCode ?? 500) >= 300 || /"error"/.test(log))
            throw Error('runtime_image_failed');
        return used;
    }
    async run(spec: {
        name: string;
        image: string;
        env: string[];
        port: number;
        cpu: number;
        memoryMb: number;
        labels?: Record<string, string>;
    }) {
        if (!/^hms-w-[a-f0-9]{32}-[a-f0-9]{8}$/.test(spec.name))
            throw Error('invalid_container');
        await this.call('POST', `/containers/create?name=${spec.name}`, { Image: spec.image, User: '1000:1000', Env: [...spec.env, 'NODE_ENV=production', 'HOSTNAME=0.0.0.0', 'HOME=/tmp', `PORT=${spec.port}`], Labels: { 'hms.managed': 'true', 'hms.website-container': spec.name, ...spec.labels }, Healthcheck: { Test: ['CMD-SHELL', spec.port === 8080 ? 'wget -q -O /dev/null http://127.0.0.1:8080/' : "node -e \"require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))\""], Interval: 5000000000, Timeout: 3000000000, Retries: 3, StartPeriod: 10000000000 }, ExposedPorts: { [`${spec.port}/tcp`]: {} }, HostConfig: { ...this.limits(spec.memoryMb * 1000000, process.env.TRAEFIK_NETWORK || 'hms-runtime', { '/tmp': 'rw,nosuid,nodev,size=64000000,uid=1000,gid=1000,mode=1777', '/app/.next/cache': 'rw,nosuid,nodev,size=64000000,uid=1000,gid=1000,mode=0700' }), RestartPolicy: { Name: 'no' } } });
        await this.call('POST', `/containers/${spec.name}/start`);
    }
    async ready(name: string, port: number) {
        for (let attempt = 0; attempt < 45; attempt++) {
            try {
                const inspected = await this.call('GET', `/containers/${name}/json`);
                if (inspected.State?.Health?.Status !== 'healthy') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                const r = await fetch(`http://${name}:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
                await r.body?.cancel();
                if (r.status >= 200 && r.status < 400)
                    return true;
            }
            catch { }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return false;
    }
    async logs(name: string) {
        const r = await this.response('GET', `/containers/${name}/logs?stdout=1&stderr=1&tail=100`);
        let text = '';
        for await (const c of r) {
            text = (text + c.toString()).slice(-20000);
        }
        return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    }
}
function readable(path: string) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
export async function unpack(kind: 'zip' | 'tar', archive: string, dest: string, limit: number, mode: 'source' | 'artifact' = 'source') { return new Promise<number>((resolve, reject) => { const child = spawn('python3', [new URL('./archive.py', import.meta.url).pathname, kind, archive, dest, String(limit), mode], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', error = ''; child.stdout.on('data', c => out += c.toString()); child.stderr.on('data', c => { error = (error + c.toString()).slice(-1000); }); const timer = setTimeout(() => { child.kill('SIGKILL'); }, 120000); child.on('error', () => { clearTimeout(timer); reject(Error('extractor_unavailable')); }); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Number(out.trim())) : reject(Error(/^[a-z_]+$/.test(error.trim()) ? error.trim() : 'archive_rejected')); }); }); }
