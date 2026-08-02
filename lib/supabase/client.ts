import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";

/**
 * Browser Supabase client for TutorMonkey Teachers.
 *
 * Uses only the public, browser-safe env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * No service-role key, no database writes — this module is purely for
 * auth (Google OAuth) session handling in the browser.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cookie used to share the session between the /auth/callback server route
 * (which exchanges the OAuth code) and browser clients (sign-in page,
 * dashboard). Kept in a cookie so the session survives full-page redirects
 * without any auth helper library.
 */
export const SUPABASE_AUTH_STORAGE_KEY = "tutormonkey-teachers-auth-token";

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function readCookie(key: string): string | null {
  if (!isBrowser) return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${key}=`));
  return match ? decodeURIComponent(match.slice(key.length + 1)) : null;
}

function writeCookie(key: string, value: string): void {
  if (!isBrowser) return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
}

function clearCookie(key: string): void {
  if (!isBrowser) return;
  document.cookie = `${key}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Cookie-backed storage adapter so the session set by the /auth/callback
 * route handler is visible to the browser client (and vice versa for
 * sign-out). All methods are no-ops during server-side prerendering.
 */
const cookieStorage: SupportedStorage = {
  getItem: (key: string) => readCookie(key),
  setItem: (key: string, value: string) => writeCookie(key, value),
  removeItem: (key: string) => clearCookie(key),
};

let cachedClient: SupabaseClient | null | undefined;

/**
 * Returns a memoized browser Supabase client, or null when the public env
 * vars are missing (so callers can degrade gracefully instead of crashing).
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  if (!supabaseUrl || !supabaseAnonKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
      storage: cookieStorage,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
    },
  });

  return cachedClient;
}
