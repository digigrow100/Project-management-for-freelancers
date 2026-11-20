import {requireHostingClient} from '@/lib/hosting/auth';
import {listApps,recentDeployments,listDomains} from '@/lib/hosting/apps/store';
import type {HostingApp,HostingDeployment} from '@/lib/hosting/apps/types';
import {clientCheckout} from '@/lib/hosting/websites/store';
import {ClientDashboard} from '@/components/hosting/dashboard/ClientDashboard';
export const dynamic='force-dynamic';
export default async function ClientHome(){
 const session=await requireHostingClient();let apps:HostingApp[]=[],deployments:HostingDeployment[]=[],checkout:Awaited<ReturnType<typeof clientCheckout>>|null=null,note='';
 try{[apps,deployments,checkout]=await Promise.all([listApps(session.clientId),recentDeployments(session.clientId),clientCheckout(session.clientId)]);}catch{note='Website setup is not available yet. Your existing services and invoices are still available from the menu.';}
 const domains=Object.fromEntries(await Promise.all(apps.map(async app=>{const rows=await listDomains(app.id);return [app.id,(rows.find(d=>d.is_primary)??rows.find(d=>d.is_preview)??rows[0])?.hostname??''];})));
 return <ClientDashboard domains={domains} name={session.client.name} apps={apps} deployments={deployments} settings={checkout?.settings??null} credits={checkout?.credits.length??0} pending={checkout?.requests.some(r=>r.status==='pending')??false} readOnly={session.adminView||session.client.status!=='active'} note={note}/>;
}
