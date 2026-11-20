import { notFound } from 'next/navigation';
import { websiteAccess } from '@/lib/hosting/websites/access';
import { listDeployments, listDomains, listEnvNames } from './store';
import { AppDetail } from '@/components/hosting/dashboard/present';
import { AppForms } from '@/components/hosting/dashboard/AppForms';
import { agentConfigured, agentLogs } from '@/lib/hosting/agent-client';
export async function renderApp(base: '/hosting/apps' | '/client/apps', id: string, tab: string, options: {
    clientId: string | null;
    readOnly: boolean;
    clients?: {
        id: string;
        name: string;
    }[];
    notice?: string;
}) {
    let access: Awaited<ReturnType<typeof websiteAccess>>;
    try {
        access = await websiteAccess(base, id);
    }
    catch {
        notFound();
    }
    const { app } = access;
    const [domains, deployments, envNames] = await Promise.all([listDomains(app.id), listDeployments(app.id), listEnvNames(app.id)]);
    let logs: {
        build?: string;
        runtime?: string;
    } | undefined;
    if (agentConfigured() && tab === 'logs') {
        try {
            logs = await agentLogs(app.name) as typeof logs;
        }
        catch {
            logs = undefined;
        }
    }
    return <AppDetail base={base} app={app} tab={tab} domains={domains} deployments={deployments} envNames={envNames} logs={logs} notice={options.notice}><AppForms base={base} app={app} tab={tab} domains={domains} envNames={envNames} activeDeployment={deployments.find(d => d.id === app.active_deployment_id)} readOnly={options.readOnly || access.actor.readOnly}/></AppDetail>;
}
export { requireHostingAdmin as adminActor } from '@/lib/hosting/auth';
export function notice(code?: string) { return code ? 'That action could not be completed. Check the website status and try again.' : undefined; }
