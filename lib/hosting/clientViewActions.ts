"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireHostingAdmin } from "./auth";
import { getSupabase } from "@/lib/supabaseClient";
import { checked, hostingTable } from "./store";
import { uuid } from "./validation";
import { HOSTING_CLIENT_VIEW_COOKIE,HOSTING_CLIENT_VIEW_SECONDS,signClientView,readClientView } from "./clientView";
export async function startHostingClientView(form:FormData){
 const actor=await requireHostingAdmin();
 const clientId=uuid.parse(String(form.get("client_id")??""));
 const client=checked<{id:string;status:string}|null>(await getSupabase().from(hostingTable("clients")).select("id,status").eq("id",clientId).maybeSingle());
 if(!client||client.status==="closed")throw new Error("Choose an existing, non-closed hosting client.");
 const signed=signClientView(actor.id,clientId);
 checked(await getSupabase().from(hostingTable("audit_logs")).insert({actor_id:actor.id,event:"admin_client_view_started",entity:"clients",entity_id:clientId}));
 cookies().set(HOSTING_CLIENT_VIEW_COOKIE,signed,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:HOSTING_CLIENT_VIEW_SECONDS});
 redirect("/client");
}
export async function stopHostingClientView(){
 const actor=await requireHostingAdmin();
 const clientId=readClientView(cookies().get(HOSTING_CLIENT_VIEW_COOKIE)?.value,actor.id);
 if(clientId)checked(await getSupabase().from(hostingTable("audit_logs")).insert({actor_id:actor.id,event:"admin_client_view_ended",entity:"clients",entity_id:clientId}));
 cookies().delete(HOSTING_CLIENT_VIEW_COOKIE);
 redirect("/hosting/clients");
}
