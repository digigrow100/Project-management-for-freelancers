import { mkdirSync, readFileSync, writeFileSync, renameSync, statfsSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { appNameOk } from './validate.ts';
export type AppState = {
    name: string;
    appId: string;
    clientId: string;
    deploymentId: string;
    status: 'uploading' | 'building' | 'running' | 'stopped' | 'failed' | 'uncertain';
    framework: string;
    port: number;
    cpu: number;
    memoryMb: number;
    storageLimitBytes: number;
    usedBytes: number | null;
    deployedAt: string | null;
    container: string | null;
    image: string;
    domains: {
        host: string;
        token: string;
    }[];
    error: string | null;
    updatedAt: string;
};
export function appDir(root: string, name: string) {
    if (!appNameOk(name))
        throw Error('invalid_name');
    const p = join(root, name);
    mkdirSync(p, { recursive: true, mode: 0o700 });
    return p;
}
export function atomicJson(path: string, value: unknown) { const temp = path + '.tmp'; writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); renameSync(temp, path); }
export function readState(root: string, name: string): AppState | null {
    if (!appNameOk(name))
        return null;
    try {
        return JSON.parse(readFileSync(join(root, name, 'state.json'), 'utf8'));
    }
    catch {
        return null;
    }
}
export function writeState(root: string, state: AppState) { atomicJson(join(appDir(root, state.name), 'state.json'), { ...state, updatedAt: new Date().toISOString() }); }
export function readBuildLog(root: string, name: string) {
    try {
        return readFileSync(join(appDir(root, name), 'build.log'), 'utf8').slice(-20000);
    }
    catch {
        return '';
    }
}
export function writeBuildLog(root: string, name: string, text: string) { writeFileSync(join(appDir(root, name), 'build.log'), text.slice(-100000), { mode: 0o600 }); }
export function measureTree(root: string, limit: number): number {
    let bytes = 0, count = 0;
    function walk(dir: string) {
        for (const name of readdirSync(dir)) {
            const file = join(dir, name), s = lstatSync(file);
            if (s.isSymbolicLink()) {
                const resolved = realpathSync(file);
                if (!file.includes('/.bin/') || !resolved.startsWith(root + '/') || !lstatSync(resolved).isFile())
                    throw Error('archive_links_forbidden');
                continue;
            }
            if (s.isDirectory())
                walk(file);
            else if (s.isFile()) {
                bytes += s.size;
                if (++count > 100000 || bytes > limit)
                    throw Error('storage_limit_exceeded');
            }
            else
                throw Error('special_file_forbidden');
        }
    }
    walk(root);
    return bytes;
}
export function availableDisk(path: string) { const s = statfsSync(path); return s.bavail * s.bsize; }
