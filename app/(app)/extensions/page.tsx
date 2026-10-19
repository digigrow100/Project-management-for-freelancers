import Link from "next/link";
import {requireProfile} from "@/lib/auth";
import {ExtensionConnectCard} from "@/components/ExtensionConnectCard";
import {ExtensionDevices} from "@/components/ExtensionDevices";
import {WhatsAppBridgeAdminCard} from "@/components/WhatsAppBridgeAdminCard";
import {getWhatsAppBridgeHealth} from "@/lib/whatsappBridge";
export const dynamic="force-dynamic";
export default async function ExtensionsPage(){
 const profile=await requireProfile();
 const health=profile.role==="admin"?await getWhatsAppBridgeHealth():null;
 return <div className="space-y-5"><div><h1 className="text-2xl font-semibold text-neutral-100">Extensions</h1><p className="mt-1 text-sm text-neutral-500">Download, connect or add another browser profile. Each installation uses its own one-time code.</p></div><ExtensionConnectCard/><ExtensionDevices/>{health&&<><WhatsAppBridgeAdminCard initialHealth={health}/><Link href="/admin/whatsapp-bridge" className="inline-block rounded-lg border border-emerald-500/30 px-4 py-2 text-sm text-emerald-300">Connect or add another WhatsApp browser</Link></>}</div>;
}
