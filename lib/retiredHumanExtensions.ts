/** Removed human-monitoring and WhatsApp bridge surfaces. Keep SEO bot routes separate. */
const RETIRED_PREFIXES = [
  "/extensions", "/client-chat",
  "/admin/time-tracking", "/admin/employee-activity", "/admin/whatsapp-bridge",
  "/api/extension", "/api/whatsapp-bridge", "/api/client-chat", "/api/presence",
  "/api/admin/employee-activity", "/api/admin/activity-settings",
  "/api/admin/project-domain-mappings", "/api/admin/screen-share", "/api/admin/whatsapp-bridge",
  "/api/cron/activity-retention",
];
const RETIRED_DOWNLOADS = new Set([
  "/downloads/freelance-hq-chrome-extension.zip",
  "/downloads/freelance-hq-whatsapp-bridge.zip",
]);

export function isRetiredHumanExtensionPath(pathname: string): boolean {
  return RETIRED_DOWNLOADS.has(pathname) || RETIRED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
