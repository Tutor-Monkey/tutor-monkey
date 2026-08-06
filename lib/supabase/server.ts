import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server Supabase client for TutorMonkey Teachers — official @supabase/ssr
 * `createServerClient`, wired to Next.js `cookies()`.
 *
 * Uses only the public, browser-safe env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * No service-role key. The session and PKCE code verifier cookies written by
 * the browser client (lib/supabase/client.ts) are read here, and any session
 * the server obtains (e.g. in /auth/callback) is written back to the same
 * cookies — this shared cookie storage is what makes the OAuth PKCE flow work
 * across the sign-in page → Google → /auth/callback redirect chain.
 *
 * IMPORTANT: create a fresh client per request — never cache it across
 * requests, because each request has its own cookie store.
 */
export function createClient(
  cookieOptions?: CookieOptions,
): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: false,
      persistSession: true,
    },
    cookieOptions: {
      sameSite: "lax",
      // Callers may pass e.g. { secure: true } for HTTPS requests; do not set
      // `secure` by default so session cookies survive plain-HTTP hosts too.
      ...cookieOptions,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `cookies().set` throws outside Route Handlers / Server Actions
          // (e.g. in Server Components). Callers in those contexts must not
          // depend on cookie writes here.
        }
      },
    },
  });
}
