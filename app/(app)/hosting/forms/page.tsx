import {FormsServicePanel} from "@/components/hosting/FormsServicePanel";
import {serviceScope} from "@/lib/hosting/managed";
export const dynamic="force-dynamic";
export default async function Page(){const context=await serviceScope(true);return <div className="space-y-5"><h1 className="text-2xl font-semibold">Form email API</h1><FormsServicePanel scope="owner" readOnly={context.readOnly}/></div>;}
