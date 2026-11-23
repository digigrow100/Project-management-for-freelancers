import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { hostingSessionStatus } from "@/lib/security/mfa";
import { requireAdminNetworkForUser } from "@/lib/security/adminNetwork";
import { secureAuthCookie } from "@/lib/security/cookies";
import { MEMBER_VIEW_COOKIE } from "@/lib/memberView";

export const dynamic = "force-dynamic";

function unavailable() {
  return new NextResponse("Session verification is temporarily unavailable. Please try again.", {
    status: 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: NextRequest) {
  const store = await cookies();
  const project = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
  const authCookie = `sb-${project}-auth-token`;
  const flowPrefix = `${authCookie}-flow-`;
  // Auth teardown also removes pending PKCE verifiers. Keep only this
  // project's verifier, flow index and per-flow slots (including SSR chunks).
  const pendingRecovery = store.getAll().filter(cookie => {
    const key = cookie.name.replace(/\.\d+$/, "");
    return cookie.value !== "" && (
      key === `${authCookie}-code-verifier`
      || key === `${authCookie}-flows-code-verifier`
      || (key.startsWith(flowPrefix) && /^[A-Za-z0-9_-]{8,64}-code-verifier$/.test(key.slice(flowPrefix.length)))
    );
  });
  const auth = await createAuthClient();
  const { data: { user }, error } = await auth.auth.getUser();
  // Do not turn an Auth outage into a logout. A genuinely invalid/expired
  // token can be cleared; an active session must survive a stale expiry URL.
  if (error && ![400, 401, 403].includes(error.status ?? 0)) return unavailable();
  if (user) {
    await requireAdminNetworkForUser(user.id);
    const status = await hostingSessionStatus(auth, user.id);
    if (status === "unavailable") return unavailable();
    if (status === "active") {
      return NextResponse.redirect(new URL("/", request.url), { status: 303, headers: { "Cache-Control": "private, no-store" } });
    }
  }

  // Local scope never revokes this account's sessions on other devices.
  await auth.auth.signOut({ scope: "local" }).catch(() => undefined);
  // Also clear chunked Auth cookies if the provider cannot process signOut.
  // Match only this project's session cookie.
  for (const cookie of store.getAll()) {
    if (cookie.name === authCookie || cookie.name.startsWith(`${authCookie}.`)) {
      store.set(cookie.name, "", secureAuthCookie({ maxAge: 0 }));
    }
  }
  const remaining = new Map(store.getAll().map(cookie => [cookie.name, cookie.value]));
  for (const cookie of pendingRecovery) {
    if (remaining.get(cookie.name) !== cookie.value) {
      // Request cookies contain no original expiry metadata. Bound restored
      // verifier cookies to one hour; the provider still enforces link expiry.
      store.set(cookie.name, cookie.value, secureAuthCookie({ maxAge: 60 * 60 }));
    }
  }
  store.delete(MEMBER_VIEW_COOKIE);
  store.delete("fhq_hosting_client_view");
  return NextResponse.redirect(new URL("/login?expired=1", request.url), {
    status: 303,
    headers: { "Cache-Control": "private, no-store" },
  });
}

// An expired protected API request can arrive here via a 307 redirect. Finish
// with a 303 so its POST body is never replayed to the sign-in page.
export async function POST(request: NextRequest) {
  return GET(request);
}
