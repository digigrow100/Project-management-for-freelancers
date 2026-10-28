import {WebsiteSourcePanel} from "@/components/hosting/WebsiteSourcePanel";
import {serviceScope} from "@/lib/hosting/managed";
export const dynamic="force-dynamic";
export default async function Page(){const context=await serviceScope(true);return <div className="space-y-5"><h1 className="text-2xl font-semibold">Website source</h1><WebsiteSourcePanel scope="owner" services={[...context.sites].map(([id,row])=>({id,name:row.name}))} readOnly={context.readOnly} uploadEnabled={process.env.HOSTING_SOURCES_UPLOAD_ENABLED==='approved'} publishingEnabled={process.env.HOSTING_PUBLISHING_ENABLED==='approved'}/></div>;}
