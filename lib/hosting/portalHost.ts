/** Exact public hosting hostname. Never trust arbitrary forwarded hosts or Origin. */
export const HOSTING_PORTAL_HOST = "web.housemysite.com";
export const HOSTING_PORTAL_ORIGIN = `https://${HOSTING_PORTAL_HOST}`;
export const HOSTING_ROBOTS_TAG = "noindex, nofollow, noarchive, nosnippet, noimageindex";

export function isHostingPortalHost(host: string | null | undefined): boolean {
  const value = host?.toLowerCase();
  return value === HOSTING_PORTAL_HOST || value === `${HOSTING_PORTAL_HOST}:443`;
}

export function isHostingProbePath(path: string): boolean {
  const value = path.toLowerCase();
  return ["/.git", "/.svn", "/wp-admin", "/phpmyadmin"].some(
    prefix => value === prefix || value.startsWith(`${prefix}/`),
  ) || value === "/.env" || value.startsWith("/.env.") ||
    value === "/wp-login.php" || value === "/xmlrpc.php";
}
