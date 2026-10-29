import type {ResourceLimits,PackageSnapshot} from "./packageLimits";
export type Currency = "PKR" | "GBP" | "USD";
export type Cycle = "monthly" | "quarterly" | "yearly" | "one_time";
export interface HostingSettings { id: boolean; portal_name: string; business_name: string; business_email: string; business_address: string; default_currency: Currency; invoice_prefix: string; payment_instructions: string; invoice_terms: string; renewal_lead_days: number; invoice_due_days: number; renewal_automation: boolean; automation_actor: string | null; }
export interface HostingServer { id: string; name: string; hostname: string; ipv4: string; ipv6: string; provider: string; region: string; status: string; disk_mb: number; memory_mb: number; notes: string; }
export interface HostingPackage { product_kind?:"standard"|"app_hosting"; catalog_key?:string|null; resource_limits?:ResourceLimits|null; limits_version?:number; pricing_ready?:boolean; id: string; name: string; description: string; price_minor: number; currency: Currency; billing_cycle: Cycle; disk_mb: number; inode_limit: number | null; memory_mb: number; cpu_percent: number; domain_limit: number; email_limit: number; is_active: boolean; }
export interface HostingClient { id: string; agency_client_id: string | null; name: string; company: string; email: string; phone: string; address: string; status: string; notes: string; }
export interface HostingAccess { id: string; client_id: string; auth_user_id: string | null; email: string; enabled: boolean; invited_at: string | null; }
export interface HostingService { package_snapshot?:PackageSnapshot|null; id: string; client_id: string; package_id: string; server_id: string | null; name: string; primary_domain: string; status: string; price_minor: number; currency: Currency; billing_cycle: Cycle; next_due_date: string; auto_invoice: boolean; notes: string; }
export interface HostingDomain { id: string; client_id: string; service_id: string | null; hostname: string; dns_status: string; dns_checked_at: string | null; ssl_status: string; ssl_checked_at: string | null; ssl_expires_at: string | null; expires_on: string | null; auto_renew: boolean; notes: string; }
export interface HostingInvoice { id: string; number: string; client_id: string; service_id: string | null; currency: Currency; status: string; subtotal_minor: number; tax_minor: number; total_minor: number; issued_on: string; due_on: string; period_start: string | null; notes: string; terms: string; }
export interface HostingInvoiceItem { id: string; invoice_id: string; description: string; quantity: number; unit_minor: number; line_minor: number; }
export interface HostingPayment { id: string; client_id: string; invoice_id: string; amount_minor: number; currency: Currency; direction: string; refund_of: string | null; method: string; reference: string; paid_on: string; }
export interface HostingExpense { id: string; server_id: string | null; vendor: string; category: string; amount_minor: number; currency: Currency; incurred_on: string; notes: string; }
export interface HostingSubmission { id: string; client_id: string; invoice_id: string; amount_minor: number; reference: string; notes: string; status: string; }
export interface HostingTicket { id: string; client_id: string; service_id: string | null; subject: string; priority: string; status: string; created_at: string; }
export interface HostingMessage { id: string; ticket_id: string; body: string; is_internal: boolean; author_role: string; created_at: string; }
export interface HostingJob { id: string; service_id: string; kind: string; status: string; note: string; created_at: string; }
export interface HostingAudit { id: string; event: string; entity: string; entity_id: string | null; created_at: string; }
export interface HostingFinance { cash: {currency: Currency; incoming_minor: number; refunds_minor: number}[]; expenses: {currency: Currency; expense_minor: number}[]; outstanding: {currency: Currency; outstanding_minor: number}[]; }
export interface HostingLookups { clients: HostingClient[]; packages: HostingPackage[]; servers: HostingServer[]; services: HostingService[]; }
