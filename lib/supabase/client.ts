import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for TutorMonkey Teachers — official @supabase/ssr
 * `createBrowserClient`.
 *
 * Uses only the public, browser-safe env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * No service-role key, no database writes — this module is purely for auth
 * (Google OAuth PKCE) session handling in the browser.
 *
 * The session and the in-flight PKCE code verifier are persisted in cookies
 * (SameSite=Lax so they are sent on the top-level navigation back from Google;
 * no `secure` flag so they also work over plain-HTTP Tailscale hostnames like
 * http://old-mac.tail91d4de.ts.net:3789). The /auth/callback server route reads
 * the same cookies, which is what lets it find the code verifier and exchange
 * the authorization code for a session.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns a browser Supabase client, or null when the public env vars are
 * missing (so callers can degrade gracefully instead of crashing).
 *
 * Safe to call during SSR: `createBrowserClient` only touches `document.cookie`
 * when auth storage methods are actually invoked, and this app only invokes
 * them from client-side event handlers / effects (sign-in button, dashboard
 * session read).
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    cookieOptions: {
      sameSite: "lax",
      // Match the protocol actually in use: mark cookies Secure on HTTPS only.
      // A `secure` cookie would be silently dropped by the browser when the app
      // is served over plain HTTP (e.g. the Tailscale hostname above).
      ...(typeof window !== "undefined" && window.location.protocol === "https:"
        ? { secure: true }
        : {}),
    },
  });
}
