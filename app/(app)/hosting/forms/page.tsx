import {FormsServicePanel} from "@/components/hosting/FormsServicePanel";
import {serviceScope} from "@/lib/hosting/managed";
import {PanelGuide,SetupRequired} from "@/components/hosting/PanelGuide";
import {panelFeatureState} from "@/lib/hosting/panelCatalog";
import {requireHostingAdmin} from "@/lib/hosting/auth";
export const dynamic="force-dynamic";
export default async function Page(){await requireHostingAdmin();if(!panelFeatureState('services',process.env).enabled)return <div className="space-y-5"><h1 className="text-2xl font-semibold">Form email API</h1><PanelGuide section="forms"/><SetupRequired section="forms"/></div>;const context=await serviceScope(true);return <div className="space-y-5"><h1 className="text-2xl font-semibold">Form email API</h1><PanelGuide section="forms"/><FormsServicePanel scope="owner" readOnly={context.readOnly}/></div>;}

