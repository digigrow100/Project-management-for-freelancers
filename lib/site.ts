import { headers } from "next/headers";

/**
 * Best-effort canonical origin for absolute URLs such as password-reset links.
 *
 * Priority:
 * 1. APP_URL / NEXT_PUBLIC_SITE_URL when explicitly configured.
 * 2. Vercel's production-domain environment variable, so recovery emails
 *    generated from a Preview deployment still land on Production.
 * 3. The current request host (useful locally and outside Vercel).
 */
export function getSiteOrigin(): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) return `https://${vercelProduction.replace(/\/+$/, "")}`;

  const headersList = headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
