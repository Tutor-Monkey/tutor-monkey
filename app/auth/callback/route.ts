import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback — exchanges the Google (PKCE) authorization code for a
 * session and persists it in the shared cookie storage (so the browser client
 * on /teachers/dashboard sees it), then redirects to the Teachers dashboard.
 *
 * The server client reads the same cookies the browser client wrote during
 * sign-in, including the in-flight PKCE code verifier, which is what makes
 * `exchangeCodeForSession` succeed.
 *
 * On any failure the user is sent back to
 * /teachers/sign-in?error=auth_callback_failed — a generic error, never raw
 * Supabase details.
 */

export const dynamic = "force-dynamic";

const ERROR_REDIRECT = "/teachers/sign-in?error=auth_callback_failed";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  const fail = () => NextResponse.redirect(new URL(ERROR_REDIRECT, origin));

  if (!code) {
    return fail();
  }

  const supabase = createClient({
    // Match the flag the browser client used: Secure cookies only over HTTPS,
    // so the session survives plain-HTTP hosts (e.g. Tailscale hostnames).
    secure: requestUrl.protocol === "https:",
  });

  if (!supabase) {
    return fail();
  }

  try {
    // Public (anon) key only — no service-role key involved.
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error(
        "TutorMonkey auth callback: code exchange failed",
        error.message,
      );
      return fail();
    }

    return NextResponse.redirect(new URL("/teachers/dashboard", origin));
  } catch (err) {
    console.error("TutorMonkey auth callback: unexpected error", err);
    return fail();
  }
}
