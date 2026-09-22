import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Auth-only Supabase client for Server Components / Server Actions, using the
 * anon key and the request's cookies. This is used exclusively for `.auth.*`
 * calls (sign in, sign out, get session) — never to query app data. Every
 * table has RLS enabled with no policies, so this client has zero access to
 * projects/tasks/etc. even if misused; all real data access continues to go
 * through the service-role client in lib/supabaseClient.ts.
 *
 * This app never calls Supabase auth from client-side ("use client") code —
 * only from Server Actions and edge middleware — so these env vars are kept
 * server-only rather than exposed to the browser via NEXT_PUBLIC_.
 */
export function createAuthClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render, which can't set cookies.
            // Session refresh already happens in middleware, so this is safe to ignore.
          }
        },
      },
    },
  );
}
