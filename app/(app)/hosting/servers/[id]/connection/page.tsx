import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireHostingAdmin } from '@/lib/hosting/auth';
import { getSupabase } from '@/lib/supabaseClient';
import { PageTitle,cardClass } from '@/components/hosting/ui';
import { ConnectionForm } from './ConnectionForm';
export const dynamic='force-dynamic';
export const maxDuration=60;
export default async function ConnectionPage({params}:{params:{id:string}}){
 await requireHostingAdmin();
 if(!z.string().uuid().safeParse(params.id).success)notFound();
 const result=await getSupabase().from('freelance_hq_hosting_servers').select('id,name,hostname,ipv4').eq('id',params.id).single();
 if(result.error||!result.data||result.data.hostname!=='server1.housemysite.com'||result.data.ipv4!=='62.171.130.156')notFound();
 const server=result.data;
 return <div className="mx-auto max-w-3xl space-y-6"><Link href="/hosting/servers" className="text-sm text-blue-400">← Servers</Link><PageTitle title={`${server.name}: connection`} description={`${server.hostname} · ${server.ipv4}`}/><section className={cardClass}><h2 className="font-medium">Existing management bridge</h2><p className="mb-5 mt-2 text-sm leading-6 text-neutral-400">Read reports from the restricted Windows/SSH bridge. The Windows computer must be awake and signed in, with its existing scheduled task and SSH agent available. Checking here reads published reports; it does not run a new server audit.</p><ConnectionForm serverId={server.id} configured={!!process.env.HOSTING_BRIDGE_GITHUB_TOKEN}/></section><section className={cardClass}><h2 className="font-medium">Private connection setup</h2><ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-neutral-400"><li>In GitHub, create a fine-grained token under the existing digigrow100 account. Select only housemysite-server-automation and grant Issues: Read-only. Keep other permissions unselected.</li><li>Open the <a className="text-blue-400" href="https://vercel.com/hamzafarooq5060-9321s-projects/project-management-for-freelancers/settings/environment-variables" target="_blank" rel="noreferrer">Vercel environment settings</a>. Add <code>HOSTING_BRIDGE_GITHUB_TOKEN</code> to Production as a sensitive variable. Enter the value there privately.</li><li>Redeploy the app, then use Check management reports above. Keep the token, SSH private keys and signing passphrases out of chat.</li></ol></section><section className={cardClass}><h2 className="font-medium">Website management: awaiting production setup</h2><p className="mt-2 text-sm leading-6 text-neutral-400">Server registration and bridge reports do not enable provisioning. The last recorded acceptance is 0/26: production operator, independent evidence enrollment and permanent storage limits remain pending. Automatic deployments stay off. Existing websites and email stay under their existing management.</p><a className="mt-4 inline-block text-sm text-blue-400" href="https://github.com/digigrow100/housemysite-server-automation/blob/main/HANDOVER_FOR_NEXT_CHAT.md" target="_blank" rel="noreferrer">View the current server handover →</a></section></div>;
}
