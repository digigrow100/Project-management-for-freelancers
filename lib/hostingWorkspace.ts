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
  { key: "servers", label: "Servers", description: "Connect hosting servers and review their availability." },
  { key: "packages", label: "Packages", description: "Define hosting plans, prices and included resources." },
  { key: "services", label: "Hosting Services", description: "Manage the hosting services assigned to each client." },
  { key: "clients", label: "Clients", description: "Manage hosting customers and their portal access." },
  { key: "billing", label: "Billing", description: "Manage hosting invoices, payments and renewals." },
  { key: "domains", label: "Domains & SSL", description: "Manage hosting domains, routing and certificates." },
  { key: "settings", label: "Settings", description: "Configure hosting preferences and server connections." },
] as const;

export type HostingSection = (typeof HOSTING_SECTIONS)[number];
