import "server-only";
import { notFound } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { requireHostingAdmin, requireHostingClient } from "./auth";
import { date, uuid, hostingToday } from "./validation";
import type { HostingAccess, HostingAudit, HostingClient, HostingDomain, HostingExpense, HostingFinance, HostingInvoice, HostingInvoiceItem, HostingJob, HostingLookups, HostingMessage, HostingPackage, HostingPayment, HostingServer, HostingService, HostingSettings, HostingSubmission, HostingTicket } from "./types";
export const hostingTable = (name: string) => `freelance_hq_hosting_${name}`;
export function checked<T>(result: {data: unknown;error: unknown}): T {
  if (result.error) throw new Error("Hosting data could not be saved or loaded. Check the values and try again.");
  return result.data as T;
}
async function rows<T>(name: string, select = "*") {
  return checked<T[]>(await getSupabase().from(hostingTable(name)).select(select).order("created_at",{ascending:false}).limit(2000));
}
async function settings() {
  return checked<HostingSettings>(await getSupabase().from(hostingTable("settings")).select("*").eq("id",true).single());
}
export async function adminLookups(): Promise<HostingLookups> {
  await requireHostingAdmin();
  const [clients, packages, servers, services] = await Promise.all([rows<HostingClient>("clients"), rows<HostingPackage>("packages"), rows<HostingServer>("servers"), rows<HostingService>("services")]);
  return {clients,packages,servers,services};
}
export async function adminSettings() { await requireHostingAdmin(); return settings(); }
const sectionTables = { servers:"servers",packages:"packages",clients:"clients",services:"services",domains:"domains",invoices:"invoices",payments:"payments",expenses:"expenses",tickets:"tickets",operations:"jobs",activity:"audit_logs",submissions:"payment_submissions" } as const;
export type HostingSectionKey = keyof typeof sectionTables;
export type HostingRecord = HostingServer | HostingPackage | HostingClient | HostingService | HostingDomain | HostingInvoice | HostingPayment | HostingExpense | HostingTicket | HostingJob | HostingAudit | HostingSubmission;
export async function adminRecords(section: HostingSectionKey, page: number) {
  await requireHostingAdmin();
  const index = Math.max(1,Math.min(100000,Math.floor(page)||1));
  const result = await getSupabase().from(hostingTable(sectionTables[section])).select("*",{count:"exact"}).order("created_at",{ascending:false}).range((index-1)*25,index*25-1);
  let records = checked<HostingRecord[]>(result);
  if(section==='submissions' && records.length) {
    const ids=records.map(r=>(r as HostingSubmission).invoice_id);
    const invoices=checked<{id:string;number:string;currency:string}[]>(await getSupabase().from(hostingTable("invoices")).select("id,number,currency").in("id",ids));
    records=(records as HostingSubmission[]).map(r=>{const i=invoices.find(i=>i.id===(r as HostingSubmission).invoice_id);return {...r,currency:i?.currency,invoice_number:i?.number};});
  }
  return {records,total:result.count??0,page:index};
}
export async function adminOverview(start?: string,end?: string) {
  const actor = await requireHostingAdmin();
  const today = hostingToday();
  const from = date.parse(start || today.slice(0,7)+"-01");
  const to = date.parse(end || today);
  if (from>to) throw new Error("The start date must come before the end date.");
  const [finance,counts] = await Promise.all([
    getSupabase().rpc("freelance_hq_hosting_finance_summary",{p_actor:actor.id,p_start:from,p_end:to}),
    Promise.all(["servers","clients","services","tickets","jobs"].map(async name => {
      let query = getSupabase().from(hostingTable(name)).select("id",{count:"exact",head:true});
      if (name === "tickets") query=query.in("status",["open","pending_customer"]);
      if (name === "jobs") query=query.eq("status","awaiting_connection");
      const r=await query; checked(r); return [name,r.count??0] as const;
    })),
  ]);
  return {finance:checked<HostingFinance>(finance),counts:Object.fromEntries(counts) as Record<string,number>,from,to};
}
export async function adminEditRecord(section: HostingSectionKey,id: string) {
  await requireHostingAdmin();
  uuid.parse(id);
  const result = await getSupabase().from(hostingTable(sectionTables[section])).select("*").eq("id",id).maybeSingle();
  const record = checked<HostingRecord | null>(result);
  if (!record) notFound();
  return record;
}
export async function adminAccess() { await requireHostingAdmin(); return rows<HostingAccess>("client_access"); }
export async function adminPackageServers() {
  await requireHostingAdmin();
  return checked<{package_id:string;server_id:string}[]>(await getSupabase().from(hostingTable("package_servers")).select("package_id,server_id"));
}
export async function agencyClients() {
  await requireHostingAdmin();
  return checked<{id:string;name:string}[]>(await getSupabase().from("freelance_hq_clients").select("id,name").order("name").limit(2000));
}
async function invoiceDetails(id: string, clientId?: string) {
  uuid.parse(id);
  let query = getSupabase().from(hostingTable("invoices")).select("id,number,client_id,service_id,currency,status,subtotal_minor,tax_minor,total_minor,issued_on,due_on,period_start,notes,terms").eq("id",id);
  if (clientId) query=query.eq("client_id",clientId);
  const invoice=checked<HostingInvoice | null>(await query.maybeSingle());
  if (!invoice) notFound();
  const [items,payments,client,config,submissions]=await Promise.all([
    getSupabase().from(hostingTable("invoice_items")).select("id,invoice_id,description,quantity,unit_minor,line_minor").eq("invoice_id",id).order("position"),
    getSupabase().from(hostingTable("payments")).select("id,client_id,invoice_id,amount_minor,currency,direction,refund_of,method,reference,paid_on").eq("invoice_id",id).eq("client_id",invoice.client_id).order("created_at"),
    getSupabase().from(hostingTable("clients")).select("id,name,email,address,company").eq("id",invoice.client_id).single(),
    settings(),
    getSupabase().from(hostingTable("payment_submissions")).select("id,reference,amount_minor,status,created_at").eq("invoice_id",id).eq("client_id",invoice.client_id).order("created_at",{ascending:false}),
  ]);
  return {invoice,submissions:checked<{id:string;reference:string;amount_minor:number;status:string}[]>(submissions),items:checked<HostingInvoiceItem[]>(items),payments:checked<HostingPayment[]>(payments),client:checked<{id:string;name:string;email:string;address:string;company:string}>(client),config};
}
export async function adminInvoice(id: string) { await requireHostingAdmin(); return invoiceDetails(id); }
export async function clientInvoice(id: string) { const session=await requireHostingClient(); return invoiceDetails(id,session.clientId); }
async function ticketDetails(id: string, clientId?: string) {
  uuid.parse(id);
  let q=getSupabase().from(hostingTable("tickets")).select("*").eq("id",id);
  if(clientId) q=q.eq("client_id",clientId);
  const ticket=checked<HostingTicket | null>(await q.maybeSingle());
  if(!ticket) notFound();
  let messages=getSupabase().from(hostingTable("ticket_messages")).select("id,ticket_id,body,is_internal,author_role,created_at").eq("ticket_id",id).order("created_at");
  if(clientId) messages=messages.eq("is_internal",false);
  return {ticket,messages:checked<HostingMessage[]>(await messages)};
}
export async function adminTicket(id: string) { await requireHostingAdmin(); return ticketDetails(id); }
export async function clientTicket(id: string) { const s=await requireHostingClient();return ticketDetails(id,s.clientId); }
const clientColumns = {
  services:"id,client_id,package_id,server_id,name,primary_domain,status,price_minor,currency,billing_cycle,next_due_date,auto_invoice",
  invoices:"id,number,client_id,service_id,currency,status,subtotal_minor,tax_minor,total_minor,issued_on,due_on,period_start,notes,terms",
  domains:"id,client_id,service_id,hostname,dns_status,dns_checked_at,ssl_status,ssl_checked_at,ssl_expires_at,expires_on,auto_renew",
  payments:"id,client_id,invoice_id,amount_minor,currency,direction,refund_of,method,reference,paid_on",
  tickets:"id,client_id,service_id,subject,priority,status,created_at",
} as const;
export type ClientSection = keyof typeof clientColumns;
export async function clientRecords(section: ClientSection,page=1) {
  const s=await requireHostingClient();
  const index=Math.max(1,Math.min(100000,Math.floor(page)||1));
  const result=await getSupabase().from(hostingTable(section)).select(String(clientColumns[section]),{count:"exact"}).eq("client_id",s.clientId).order("created_at",{ascending:false}).range((index-1)*25,index*25-1);
  return {records:checked<HostingRecord[]>(result),total:result.count??0,page:index};
}
export async function clientOverview() {
  const s=await requireHostingClient();
  const [summary,config]=await Promise.all([getSupabase().rpc("freelance_hq_hosting_client_summary",{p_user:s.userId,p_client:s.clientId}),settings()]);
  return {...checked<{services:number;tickets:number;outstanding:{currency:string;outstanding_minor:number}[]}>(summary),config};
}
