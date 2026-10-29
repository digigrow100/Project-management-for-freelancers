import {clientPackages,clientPlanAssignments} from '@/lib/hosting/store';
import {PackageCatalog,PackageLimits} from '@/components/hosting/PackageCatalog';
import {packageSnapshot} from '@/lib/hosting/packageLimits';
import type {HostingService} from '@/lib/hosting/types';
import {PageTitle,Pagination} from '@/components/hosting/ui';
export const dynamic='force-dynamic';
export default async function PlansPage({searchParams}:{searchParams:{page?:string}}){const [packages,services]=await Promise.all([clientPackages(),clientPlanAssignments(Number(searchParams.page)||1)]);return <div className="space-y-8"><PageTitle title="Your plan & limits" description="Your assigned limits and the available App Hosting plans."/>{(services.records as HostingService[]).map(s=>{const parsed=packageSnapshot.safeParse(s.package_snapshot);return parsed.success?<section key={s.id} className="space-y-3"><h2 className="font-semibold">{s.primary_domain||s.name}</h2><PackageLimits snapshot={parsed.data}/></section>:null;})}<Pagination path="/client/plans" page={services.page} total={services.total}/><PackageCatalog packages={packages}/></div>;}
