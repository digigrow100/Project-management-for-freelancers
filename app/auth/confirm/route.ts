import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

// Handles both Supabase recovery-link styles:
// - token_hash + type=recovery (custom email templates)
// - code (default PKCE email flow)
// In both cases the auth session is written to cookies before redirecting to
// the password form.
function sanitizeNextPath(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  try {
    const supabase = createAuthClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, request.url));
      }
    }

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) {
        return NextResponse.redirect(new URL(next, request.url));
      }
    }
  } catch {
    // Falls through to the error redirect below.
  }

  const errorUrl = new URL("/login/forgot-password", request.url);
  errorUrl.searchParams.set("error", "That reset link is invalid or has expired. Please request a new one.");
  return NextResponse.redirect(errorUrl);
}
