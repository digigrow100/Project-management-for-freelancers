export type Workspace = "team" | "hosting";

export function workspaceForPath(pathname: string): Workspace {
  return pathname === "/hosting" || pathname.startsWith("/hosting/")
    ? "hosting"
    : "team";
}

export function canAccessHosting(profile: { role: string } | null): boolean {
  return profile?.role === "admin";
}

export const HOSTING_SECTIONS = [
  { key: "servers", label: "Servers", description: "Register servers and their declared capacity." },
  { key: "packages", label: "Packages", description: "Create hosting plans and choose their allowed servers." },
  { key: "services", label: "Hosting Services", description: "Assign plans to clients and record service status." },
  { key: "clients", label: "Clients", description: "Manage hosting customers and portal access." },
  { key: "billing", label: "Billing Overview", description: "Review hosting cash flow and outstanding invoices." },
  { key: "invoices", label: "Invoices", description: "Issue hosting invoices and track their payments." },
  { key: "payments", label: "Payments & Refunds", description: "View immutable payment and refund entries. Record them from an invoice." },
  { key: "expenses", label: "Expenses", description: "Record server and hosting operating costs." },
  { key: "submissions", label: "Payment References", description: "Review client payment claims before recording money received." },
  { key: "domains", label: "Domains & SSL", description: "Track domain renewals and verify DNS and certificates." },
  { key: "tickets", label: "Support Tickets", description: "Reply to hosting customers and track support work." },
  { key: "operations", label: "Server Operations", description: "Review requests waiting for a connected server operator." },
  { key: "activity", label: "Activity", description: "Review hosting administration and billing events." },
  { key: "settings", label: "Settings", description: "Set business details, invoice terms and renewal preferences." },
] as const;

export type HostingSection = (typeof HOSTING_SECTIONS)[number];
