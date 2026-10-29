import {clientPackages,clientPlanAssignments,clientAppAccounts} from '@/lib/hosting/store';
import {AppAccountSummary} from '@/components/hosting/AppAccountSummary';
import {PackageCatalog,PackageLimits} from '@/components/hosting/PackageCatalog';
import {packageSnapshot} from '@/lib/hosting/packageLimits';
import type {HostingService} from '@/lib/hosting/types';
import {PageTitle,Pagination} from '@/components/hosting/ui';
export const dynamic='force-dynamic';
export default async function PlansPage({searchParams}:{searchParams:{page?:string}}){const [packages,services,accounts]=await Promise.all([clientPackages(),clientPlanAssignments(Number(searchParams.page)||1),clientAppAccounts()]);return <div className="space-y-8"><PageTitle title="Your plan & limits" description="Your assigned limits and the available App Hosting plans."/>{(services.records as HostingService[]).map(s=>{const parsed=packageSnapshot.safeParse(s.package_snapshot);return parsed.success?<section key={s.id} className="space-y-3"><h2 className="font-semibold">{s.primary_domain||s.name}</h2><PackageLimits snapshot={parsed.data}/><AppAccountSummary account={accounts.find(a=>a.service_id===s.id)}/></section>:null;})}<Pagination path="/client/plans" page={services.page} total={services.total}/><PackageCatalog packages={packages}/></div>;}
