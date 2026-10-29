import {clientPackages,clientRecords} from '@/lib/hosting/store';
import {PackageCatalog,PackageLimits} from '@/components/hosting/PackageCatalog';
import {packageSnapshot} from '@/lib/hosting/packageLimits';
import type {HostingService} from '@/lib/hosting/types';
import {PageTitle} from '@/components/hosting/ui';
export const dynamic='force-dynamic';
export default async function PlansPage(){const [packages,services]=await Promise.all([clientPackages(),clientRecords('services')]);return <div className="space-y-8"><PageTitle title="Your plan & limits" description="Your assigned limits and the available App Hosting plans."/>{(services.records as HostingService[]).map(s=>{const parsed=packageSnapshot.safeParse(s.package_snapshot);return parsed.success?<section key={s.id} className="space-y-3"><h2 className="font-semibold">{s.primary_domain||s.name}</h2><PackageLimits snapshot={parsed.data}/></section>:null;})}<PackageCatalog packages={packages}/></div>;}
