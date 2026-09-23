import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

// Verifies the token_hash from a Supabase auth email link (password recovery,
// invite, etc.), establishing a session via cookies, then redirects to `next`.
// See "Resetting a password" > PKCE flow in the Supabase Auth docs.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    try {
      const supabase = createAuthClient();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      if (!error) {
        return NextResponse.redirect(new URL(next, request.url));
      }
    } catch {
      // Falls through to the error redirect below.
    }
  }

  const errorUrl = new URL("/login", request.url);
  errorUrl.searchParams.set("error", "That link is invalid or has expired. Please request a new one.");
  return NextResponse.redirect(errorUrl);
}
