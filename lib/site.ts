import { headers } from "next/headers";

/**
 * Best-effort origin for building absolute URLs (e.g. auth email redirect
 * links) from a Server Action or Route Handler, where there's no request
 * object to read `req.url` from. Trusts the Host header, which is fine here
 * since it only ever feeds a link into our own email, not a redirect target
 * chosen by the request.
 */
export function getSiteOrigin(): string {
  const headersList = headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
