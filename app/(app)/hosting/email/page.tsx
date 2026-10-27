import {ManagedServicePanel} from "@/components/hosting/ManagedServicePanel";
import {serviceScope} from "@/lib/hosting/managed";
export const dynamic="force-dynamic";
export default async function Page(){const context=await serviceScope(true);return <div className="space-y-5"><h1 className="text-2xl font-semibold">Email accounts</h1><ManagedServicePanel kind="email" scope="owner" services={[...context.sites].map(([id,row])=>({id,name:row.name}))} readOnly={context.readOnly}/></div>;}
