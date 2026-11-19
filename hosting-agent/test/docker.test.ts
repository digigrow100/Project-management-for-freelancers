import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { DockerClient } from '../src/docker.ts';
import { uploadManifest, MAX_UPLOAD } from '../shared/uploadPolicy.ts';
import { routeLabels } from '../src/files.ts';
test('runtime requests enforce read-only roots, health-gated routing and fixed CPU/memory/cache limits', async () => {
    let payload: Record<string, any> | null = null;
    const server = createServer(async (req, res) => {
        let text = '';
        for await (const c of req)
            text += c;
        if (req.url?.startsWith('/containers/create'))
            payload = JSON.parse(text);
        res.setHeader('content-type', 'application/json');
        res.end('{}');
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    assert(address && typeof address === 'object');
    try {
        const name = 'hms-w-11111111111141118111111111111111-12345678', client = new DockerClient({ host: '127.0.0.1', port: address.port });
        await client.run({ name, image: 'fixture-only', env: [], port: 8080, cpu: 1, memoryMb: 512, labels: routeLabels(name, 8080, [{ host: 'fixture.example.com' }]) });
        const value = payload as unknown as Record<string, any>;
        assert.equal(value.User, '1000:1000');
        assert.equal(value.HostConfig.ReadonlyRootfs, true);
        assert.deepEqual(value.HostConfig.CapDrop, ['ALL']);
        assert.equal(value.HostConfig.NanoCpus, 1e9);
        assert.equal(value.HostConfig.MemorySwap, value.HostConfig.Memory);
        assert.equal(value.HostConfig.NetworkMode, 'hms-runtime');
        assert.equal(value.HostConfig.RestartPolicy.Name, 'no');
        assert(value.Healthcheck);
        assert.equal(value.Labels['traefik.enable'], 'true');
        assert.equal(value.HostConfig.Binds, undefined);
    }
    finally {
        await new Promise<void>(r => server.close(() => r()));
    }
});
test('exact decimal upload limit is enforced across all files without buffering payloads', () => {
    assert.equal(uploadManifest([{ path: 'index.html', size: MAX_UPLOAD }]).total, MAX_UPLOAD);
    assert.throws(() => uploadManifest([{ path: 'index.html', size: MAX_UPLOAD }, { path: 'asset.css', size: 1 }]), /upload_limit/);
    assert.throws(() => uploadManifest([{ path: '.env', size: 1 }]), /manifest/);
});
