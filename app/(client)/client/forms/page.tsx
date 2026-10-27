import {requireClientFeature} from '@/lib/hosting/clientReleaseServer';
import {FormsServicePanel} from "@/components/hosting/FormsServicePanel";
import {serviceScope} from "@/lib/hosting/managed";
export const dynamic="force-dynamic";
export default async function Page(){const context=await serviceScope(false);requireClientFeature('forms');return <div className="space-y-5"><h1 className="text-2xl font-semibold">Form email API</h1><FormsServicePanel scope="client" readOnly={context.readOnly}/></div>;}
