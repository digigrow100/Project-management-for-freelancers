import { domainOk } from './validate.ts';
export function routeLabels(container: string, port: number, domains: {
    host: string;
}[], priority = Date.now()) {
    if (!/^hms-w-[a-f0-9]{32}-[a-f0-9]{8}$/.test(container) || domains.some(d => !domainOk(d.host)))
        throw Error('invalid_route');
    const entry = process.env.TRAEFIK_ENTRYPOINT || 'websecure', resolver = process.env.TRAEFIK_CERT_RESOLVER || 'le', network = process.env.TRAEFIK_NETWORK || 'hms-runtime';
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(entry) || !/^[A-Za-z0-9_-]{1,40}$/.test(resolver))
        throw Error('invalid_traefik_settings');
    const labels: Record<string, string> = { 'traefik.enable': domains.length ? 'true' : 'false', 'traefik.docker.network': network };
    if (!domains.length)
        return labels;
    labels[`traefik.http.routers.${container}.rule`] = domains.map(d => `Host(\`${d.host}\`)`).join(' || ');
    labels[`traefik.http.routers.${container}.entrypoints`] = entry;
    labels[`traefik.http.routers.${container}.tls.certresolver`] = resolver;
    labels[`traefik.http.routers.${container}.priority`] = String(priority);
    labels[`traefik.http.routers.${container}.service`] = container;
    labels[`traefik.http.services.${container}.loadbalancer.server.port`] = String(port);
    const middlewares = process.env.TRAEFIK_MIDDLEWARES || '';
    if (middlewares) {
        if (!/^[A-Za-z0-9_@.,-]{1,200}$/.test(middlewares))
            throw Error('invalid_middleware');
        labels[`traefik.http.routers.${container}.middlewares`] = middlewares;
    }
    return labels;
}
