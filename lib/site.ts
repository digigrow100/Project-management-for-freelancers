import { headers } from "next/headers";
import { HOSTING_PORTAL_ORIGIN, isHostingPortalHost } from "./hosting/portalHost";

/**
 * Best-effort canonical origin for absolute URLs such as password-reset links.
 *
 * Priority:
 * 1. The explicit HouseMySite hosting origin, only for its exact request host.
 * 2. APP_URL / NEXT_PUBLIC_SITE_URL for the legacy/shared app.
 * 3. Vercel's production-domain environment variable, so recovery emails
 *    generated from a Preview deployment still land on Production.
 * 4. The current request host (useful locally and outside Vercel).
 */
export function getSiteOrigin(): string {
  // Hosting has its own explicit origin while the shared legacy app retains APP_URL.
  // Neither request Origin nor an arbitrary x-forwarded-host can expand this allowlist.
  if (isHostingPortalHost(headers().get("host"))) return HOSTING_PORTAL_ORIGIN;
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) return `https://${vercelProduction.replace(/\/+$/, "")}`;

  if(process.env.NODE_ENV==="production") throw new Error("Set APP_URL before generating account recovery links.");
  const headersList = headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
