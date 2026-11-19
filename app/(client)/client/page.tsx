import {requireHostingClient} from '@/lib/hosting/auth';
import {listApps,recentDeployments} from '@/lib/hosting/apps/store';
import type {HostingApp,HostingDeployment} from '@/lib/hosting/apps/types';
import {clientCheckout} from '@/lib/hosting/websites/store';
import {ClientDashboard} from '@/components/hosting/dashboard/ClientDashboard';
export const dynamic='force-dynamic';
export default async function ClientHome(){
 const session=await requireHostingClient();let apps:HostingApp[]=[],deployments:HostingDeployment[]=[],checkout:Awaited<ReturnType<typeof clientCheckout>>|null=null,note='';
 try{[apps,deployments,checkout]=await Promise.all([listApps(session.clientId),recentDeployments(session.clientId),clientCheckout(session.clientId)]);}catch{note='Website setup is not available yet. Your existing services and invoices are still available from the menu.';}
 return <ClientDashboard name={session.client.name} apps={apps} deployments={deployments} settings={checkout?.settings??null} credits={checkout?.credits.length??0} pending={checkout?.requests.some(r=>r.status==='pending')??false} readOnly={session.adminView||session.client.status!=='active'} note={note}/>;
}
