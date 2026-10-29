import {ManagedServicePanel} from "@/components/hosting/ManagedServicePanel";
import {serviceScope} from "@/lib/hosting/managed";
import {PanelGuide,SetupRequired} from "@/components/hosting/PanelGuide";
import {panelFeatureState} from "@/lib/hosting/panelCatalog";
import {requireHostingAdmin} from "@/lib/hosting/auth";
export const dynamic="force-dynamic";
export default async function Page(){await requireHostingAdmin();if(!panelFeatureState('services',process.env).enabled)return <div className="space-y-5"><h1 className="text-2xl font-semibold">Databases</h1><PanelGuide section="databases"/><SetupRequired section="databases"/></div>;const context=await serviceScope(true);return <div className="space-y-5"><h1 className="text-2xl font-semibold">Databases</h1><PanelGuide section="databases"/><ManagedServicePanel kind="database" scope="owner" services={[...context.sites].map(([id,row])=>({id,name:row.name}))} readOnly={context.readOnly}/></div>;}

