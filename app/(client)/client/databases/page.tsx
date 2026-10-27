import {requireClientFeature} from '@/lib/hosting/clientReleaseServer';
import {ManagedServicePanel} from "@/components/hosting/ManagedServicePanel";
import {serviceScope} from "@/lib/hosting/managed";
export const dynamic="force-dynamic";
export default async function Page(){const context=await serviceScope(false);requireClientFeature('databases');return <div className="space-y-5"><h1 className="text-2xl font-semibold">Databases</h1><ManagedServicePanel kind="database" scope="client" services={[...context.sites].map(([id,row])=>({id,name:row.name}))} readOnly={context.readOnly}/></div>;}
