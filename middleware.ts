import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/share", "/api/site-config", "/api/extension", "/auth"];

export async function middleware(request: NextRequest) {
  // Supabase can fall back to the configured Site URL and append a PKCE
  // recovery `code` there (for example "/?code=..."). Normalize that shape
  // into our auth confirmation route so the code is exchanged for a session
  // before the user reaches the reset-password form.
  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    url.searchParams.set("next", "/login/reset-password");
    return NextResponse.redirect(url);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  // Fail open rather than 500ing every request (including /login itself) when
  // Supabase isn't configured yet — each page already throws its own clear
  // setup error the moment it tries to reach the database.
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
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
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
