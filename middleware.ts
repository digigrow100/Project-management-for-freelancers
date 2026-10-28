import {adminNetworkAllowed,isAdminOnlyPath} from "./lib/security/adminNetworkPolicy";
import { secureAuthCookie } from "./lib/security/cookies";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HOSTING_ROBOTS_TAG, isHostingPortalHost, isHostingProbePath } from "./lib/hosting/portalHost";

const PUBLIC_PATHS = ["/login", "/share", "/api/site-config", "/api/extension", "/api/whatsapp-bridge", "/auth"];

export async function middleware(request: NextRequest) {
  const hosting = isHostingPortalHost(request.headers.get("host"));
  function finish(result: NextResponse) {
    if (hosting) {
      result.headers.set("X-Robots-Tag", HOSTING_ROBOTS_TAG);
      result.headers.set("Cache-Control", "private, no-store, max-age=0");
    }
    return result;
  }
  // Crawler/probe responses must not perform Supabase authentication or database reads.
  if (hosting && request.nextUrl.pathname === "/robots.txt") {
    return finish(new NextResponse("User-agent: *\nDisallow: /\n", {status:200,headers:{"Content-Type":"text/plain; charset=utf-8"}}));
  }
  if (hosting && (request.nextUrl.pathname === "/sitemap.xml" || isHostingProbePath(request.nextUrl.pathname))) {
    return finish(new NextResponse("Not found", {status:404}));
  }
  if(request.nextUrl.pathname === "/login/network-check") {
    const env={VERCEL:process.env.VERCEL,ADMIN_ALLOWED_IPS:process.env.ADMIN_ALLOWED_IPS};
    return finish(NextResponse.json({clientIp:env.VERCEL==='1'?request.headers.get('x-forwarded-for'):null,trustedRuntime:env.VERCEL==='1',policyConfigured:!!env.ADMIN_ALLOWED_IPS,allowed:adminNetworkAllowed(request.headers,env)},{headers:{"Cache-Control":"private, no-store","X-Robots-Tag":HOSTING_ROBOTS_TAG}}));
  }
  if(isAdminOnlyPath(request.nextUrl.pathname) && !adminNetworkAllowed(request.headers,{VERCEL:process.env.VERCEL,ADMIN_ALLOWED_IPS:process.env.ADMIN_ALLOWED_IPS})) {
    return finish(new NextResponse("Admin access is restricted to approved networks.", {status:403,headers:{"Cache-Control":"private, no-store"}}));
  }
  // Supabase can fall back to the configured Site URL and append a PKCE
  // recovery `code` there (for example "/?code=..."). Normalize that shape
  // into our auth confirmation route so the code is exchanged for a session
  // before the user reaches the reset-password form.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    url.searchParams.set("next", "/login/reset-password");
    return finish(NextResponse.redirect(url));
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  // Missing authentication configuration must never expose protected routes.
  if (!supabaseUrl || !supabaseAnonKey) {
    return finish(new NextResponse("Sign-in is temporarily unavailable.", {status:503,headers:{"Cache-Control":"no-store"}}));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, secureAuthCookie(options));
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  function redirectWithCookies(url:URL) {
    const target=NextResponse.redirect(url);
    for(const cookie of response.cookies.getAll())target.cookies.set(cookie);
    return finish(target);
  }

  const isPublic = request.nextUrl.pathname === "/api/hosting-operator" || request.nextUrl.pathname === "/api/cron/hosting-renewals" || PUBLIC_PATHS.some((path) => request.nextUrl.pathname===path || request.nextUrl.pathname.startsWith(path+"/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return redirectWithCookies(url);
  }

  return finish(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
