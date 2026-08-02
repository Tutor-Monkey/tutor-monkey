import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPABASE_AUTH_STORAGE_KEY } from "@/lib/supabase/client";

/**
 * OAuth callback — exchanges the Google (PKCE) authorization code for a
 * session, persists it in a cookie (shared with the browser client), and
 * redirects to the Teachers dashboard.
 *
 * On any failure the user is sent back to /teachers/sign-in with a safe,
 * generic error param — never with raw Supabase error details.
 */

export const dynamic = "force-dynamic";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const fail = (error: string) =>
    NextResponse.redirect(
      new URL(`/teachers/sign-in?error=${encodeURIComponent(error)}`, origin),
    );

  if (!code) {
    return fail("missing_code");
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return fail("not_configured");
  }

  try {
    // Public (anon) key only — exchange the code for a session.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { session },
      error,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !session) {
      return fail("auth_callback_failed");
    }

    const cookieStore = cookies();
    cookieStore.set(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(session), {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });

    return NextResponse.redirect(new URL("/teachers/dashboard", origin));
  } catch {
    return fail("auth_callback_failed");
  }
}
