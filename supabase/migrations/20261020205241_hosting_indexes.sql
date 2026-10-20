-- Cover hosting ownership and audit foreign keys without changing access rules.
create index on public.freelance_hq_hosting_settings(automation_actor);
create index on public.freelance_hq_hosting_audit_logs(actor_id);
create index on public.freelance_hq_hosting_domains(service_id,client_id);
create index on public.freelance_hq_hosting_invoice_items(invoice_id);
create index on public.freelance_hq_hosting_invoices(service_id,client_id);
create index on public.freelance_hq_hosting_jobs(requested_by);
create index on public.freelance_hq_hosting_payment_submissions(invoice_id,client_id);
create index on public.freelance_hq_hosting_payment_submissions(client_id);
create index on public.freelance_hq_hosting_payment_submissions(payment_id);
create index on public.freelance_hq_hosting_payment_submissions(reviewed_by);
create index on public.freelance_hq_hosting_payments(client_id);
create index on public.freelance_hq_hosting_payments(invoice_id,client_id);
create index on public.freelance_hq_hosting_services(package_id,server_id);
create index on public.freelance_hq_hosting_ticket_messages(author_id);
create index on public.freelance_hq_hosting_tickets(service_id,client_id);
